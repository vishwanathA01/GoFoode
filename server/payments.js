// Payment orchestration for food checkouts.
//
// Reliability rules this module follows:
// - Every state change is a conditional, atomic update ("only if the payment is still X"), so a webhook,
//   a browser confirmation and the reconciliation sweep can all race safely and exactly one of them wins.
// - Money that arrives after a checkout has closed (expired, cancelled or switched to cash) is refunded
//   automatically instead of being lost.
// - Nothing is cancelled for non-payment without first asking the gateway whether the customer paid.
// - Refunds are reserved in the ledger before the gateway is called, so they can never exceed what was paid,
//   and a refund whose outcome is unknown is looked up later rather than sent twice.
import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { Payment, Order, Cart, FoodItem, Restaurant, Notification, AuditLog, WebhookEvent, GroceryOrder, GroceryProduct } from "./models.js";
import { protect, allow, asyncHandler } from "./middleware.js";
import { config } from "./config.js";
import { releaseCouponFor, rewardReferrerOnFirstOrder } from "./engagement.js";

export const ONLINE_METHODS = ["upi", "card", "netbanking"];
export const CHECKOUT_METHODS = ["cod", ...ONLINE_METHODS];
const PAYABLE = ["pending", "failed"];
const CAPTURED = ["paid", "partially_refunded", "refunded"];
const EPSILON = 0.005;
const MAX_ATTEMPTS_STORED = 30;

const round2 = value => Math.round(Number(value || 0) * 100) / 100;
export const toPaise = amount => Math.round(round2(amount) * 100);
const fromPaise = paise => round2(Number(paise || 0) / 100);
const rupees = amount => `₹${round2(amount).toFixed(2).replace(/\.00$/, "")}`;
const methodLabel = method => ({ cod: "cash on delivery", upi: "UPI", card: "card", netbanking: "net banking", razorpay: "online payment" }[method] || method);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isOnline = payment => payment.method !== "cod";
const normalizeMethod = (method, fallback) => ONLINE_METHODS.includes(method) ? method : fallback;
const sum = rows => round2(rows.reduce((total, row) => total + Number(row.amount ?? row.totalAmount ?? 0), 0));

export class PaymentError extends Error {
  constructor(message, { status = 400, code = "PAYMENT_ERROR", retryable = false, details } = {}) {
    super(message);
    Object.assign(this, { status, code, retryable, details, expose: true });
  }
}
class GatewayError extends Error {
  constructor(message, { status = 502, code = "GATEWAY_ERROR", retryable = false, ambiguous = false } = {}) {
    super(message);
    Object.assign(this, { status, code, retryable, ambiguous, expose: true });
  }
}

export const paymentEvent = (type, message, source = "system", data) => ({ type, message, source, at: new Date(), ...(data ? { data } : {}) });
// Keeps the timeline bounded no matter how many retries or webhooks a payment sees.
export const pushEvent = (...events) => ({ events: { $each: events, $slice: -100 } });

const emit = (io, room, name, payload) => io?.to(room).emit(name, payload);
const notify = (user, title, message, type = "payment", data = {}) =>
  Notification.create({ user, title, message, type, data }).catch(error => console.error("[payments] notification failed:", error.message));

// ---------------------------------------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------------------------------------
const hmacHex = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || "")), right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
};
export const checkoutSignature = (secret, providerOrderId, providerPaymentId) => hmacHex(secret, `${providerOrderId}|${providerPaymentId}`);

function createRazorpayGateway() {
  const { razorpayKeyId: keyId, razorpayKeySecret: keySecret } = config.payments;
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
  const id = value => encodeURIComponent(value);
  async function call(method, path, body, { retries = 0 } = {}) {
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await fetch(`https://api.razorpay.com/v1${path}`, {
          method,
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(12000)
        });
      } catch {
        // Network failure or timeout: the request may or may not have reached Razorpay.
        if (attempt < retries) { await sleep(400 * 3 ** attempt); continue; }
        throw new GatewayError("We couldn't reach the payment gateway. Please try again in a moment.", { status: 503, code: "GATEWAY_UNREACHABLE", retryable: true, ambiguous: true });
      }
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const retryable = response.status >= 500 || response.status === 429;
      if (retryable && attempt < retries) { await sleep(400 * 3 ** attempt); continue; }
      throw new GatewayError(data?.error?.description || `The payment gateway returned an error (${response.status}).`, { status: retryable ? 503 : 502, code: data?.error?.code || "GATEWAY_ERROR", retryable });
    }
  }
  return {
    name: "razorpay",
    keyId,
    signingSecret: keySecret,
    testMode: keyId.startsWith("rzp_test_"),
    createOrder: ({ amount, currency, receipt, notes }) => call("POST", "/orders", { amount, currency, receipt, notes }, { retries: 2 }),
    orderPayments: async orderId => (await call("GET", `/orders/${id(orderId)}/payments`, null, { retries: 2 })).items || [],
    fetchPayment: paymentId => call("GET", `/payments/${id(paymentId)}`, null, { retries: 2 }),
    capture: (paymentId, amount, currency) => call("POST", `/payments/${id(paymentId)}/capture`, { amount, currency }),
    // Never retried automatically: a timed-out refund may already exist, so reconciliation looks it up instead.
    refund: (paymentId, amount, notes) => call("POST", `/payments/${id(paymentId)}/refund`, { amount, notes, speed: "normal" }),
    paymentRefunds: async paymentId => (await call("GET", `/payments/${id(paymentId)}/refunds`, null, { retries: 2 })).items || []
  };
}

// A local stand-in for Razorpay used in development. It signs payments exactly like Razorpay does, so the
// verification path is the same one production uses.
function createTestGateway() {
  const id = prefix => `${prefix}_test${crypto.randomBytes(7).toString("hex")}`;
  return {
    name: "mock",
    keyId: "gofoode_test",
    signingSecret: hmacHex(config.accessSecret, "gofoode-test-gateway"),
    testMode: true,
    createOrder: async ({ amount, currency }) => ({ id: id("order"), amount, currency, status: "created" }),
    orderPayments: async () => [],
    fetchPayment: async () => null,
    capture: async () => null,
    refund: async (_paymentId, amount) => ({ id: id("rfnd"), amount, status: "processed" }),
    paymentRefunds: async () => []
  };
}

const gateways = {};
export function gatewayFor(name) {
  if (name === "razorpay") return config.payments.razorpayKeyId && config.payments.razorpayKeySecret ? (gateways.razorpay ??= createRazorpayGateway()) : null;
  if (name === "mock") return (gateways.mock ??= createTestGateway());
  return null;
}
export const activeGateway = () => gatewayFor(config.payments.gateway);

// ---------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------
export function publicPayment(payment, { admin = false, timeline = true } = {}) {
  if (!payment) return null;
  const online = isOnline(payment);
  const open = online && PAYABLE.includes(payment.status) && (!payment.expiresAt || payment.expiresAt.getTime() > Date.now());
  const failures = payment.attempts.filter(attempt => attempt.status === "failed");
  return {
    id: payment._id,
    groupOrderId: payment.groupOrderId,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    gateway: payment.gateway,
    testMode: payment.gateway === "mock",
    status: payment.status,
    amountPaid: payment.amountPaid || 0,
    amountRefunded: payment.amountRefunded || 0,
    expiresAt: payment.expiresAt,
    paidAt: payment.paidAt || null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    providerPaymentId: payment.providerPaymentId || null,
    ...(admin ? { providerOrderId: payment.providerOrderId || null, customer: payment.customer, orders: payment.orders } : {}),
    attempts: payment.attempts.length,
    failedAttempts: failures.length,
    lastError: open ? (failures.at(-1)?.errorReason || payment.lastError || "") : "",
    canPay: open && failures.length < config.payments.maxFailedAttempts,
    canSwitchToCod: open,
    canCancel: open,
    refunds: payment.refunds.map(refund => ({
      id: refund._id, order: refund.order, amount: refund.amount, reason: refund.reason, kind: refund.kind, status: refund.status,
      providerRefundId: refund.providerRefundId || null, createdAt: refund.createdAt, processedAt: refund.processedAt || null,
      ...(admin ? { failureReason: refund.failureReason || "" } : {})
    })),
    ...(timeline ? { events: payment.events.slice(-40).map(entry => ({ type: entry.type, message: entry.message, source: entry.source, at: entry.at })) } : {})
  };
}

export async function paymentForOrder(order) {
  if (order.payment) return Payment.findById(order.payment._id || order.payment);
  return Payment.findOne({ groupOrderId: order.groupOrderId });
}

async function loadOwnPayment(paymentId, user) {
  if (!mongoose.isValidObjectId(paymentId)) throw new PaymentError("Payment not found.", { status: 404, code: "NOT_FOUND" });
  const payment = await Payment.findOne(user.role === "admin" ? { _id: paymentId } : { _id: paymentId, customer: user._id });
  if (!payment) throw new PaymentError("Payment not found.", { status: 404, code: "NOT_FOUND" });
  return payment;
}

function assertPayable(payment) {
  if (!isOnline(payment)) throw new PaymentError("This order is paid with cash on delivery.", { status: 409, code: "CASH_PAYMENT" });
  if (CAPTURED.includes(payment.status)) throw new PaymentError("This order has already been paid.", { status: 409, code: "ALREADY_PAID" });
  if (payment.status === "expired") throw new PaymentError("The payment window for this order closed, so the order was cancelled. Your items are back in your cart.", { status: 410, code: "PAYMENT_EXPIRED" });
  if (!PAYABLE.includes(payment.status)) throw new PaymentError("This payment can no longer be completed.", { status: 409, code: "NOT_PAYABLE" });
  const failed = payment.attempts.filter(attempt => attempt.status === "failed").length;
  if (failed >= config.payments.maxFailedAttempts || payment.attempts.length >= MAX_ATTEMPTS_STORED) {
    throw new PaymentError("Too many unsuccessful payment attempts. Switch to cash on delivery or cancel this checkout.", { status: 429, code: "TOO_MANY_ATTEMPTS" });
  }
}

// Puts lines back in the customer's cart. Merging keeps the larger quantity, so running it twice is harmless.
async function restoreCart(customer, lines = []) {
  const usable = (lines || []).filter(line => line?.foodItem && Number(line.quantity) > 0);
  if (!usable.length) return 0;
  const available = await FoodItem.find({ _id: { $in: usable.map(line => line.foodItem) }, isAvailable: true }).select("_id restaurant");
  const byId = new Map(available.map(item => [String(item._id), item]));
  const cart = await Cart.findOneAndUpdate({ user: customer }, { $setOnInsert: { user: customer, items: [] } }, { upsert: true, new: true });
  let restored = 0;
  for (const line of usable) {
    const food = byId.get(String(line.foodItem));
    if (!food) continue;
    const quantity = Math.min(20, Math.max(1, Number(line.quantity) || 1));
    const existing = cart.items.find(item => String(item.foodItem) === String(food._id));
    if (existing) existing.quantity = Math.max(existing.quantity, quantity);
    else cart.items.push({ foodItem: food._id, restaurant: food.restaurant, quantity });
    restored += 1;
  }
  await cart.save();
  return restored;
}

// Tells each restaurant about orders it can now see.
export async function announceOrders(orders, io) {
  const restaurants = await Restaurant.find({ _id: { $in: orders.map(order => order.restaurant?._id || order.restaurant) } }).select("owner");
  const owners = new Map(restaurants.map(restaurant => [String(restaurant._id), restaurant.owner]));
  await Promise.all(orders.map(async order => {
    const owner = owners.get(String(order.restaurant?._id || order.restaurant));
    if (!owner) return;
    await notify(owner, "New order received", `New order ${order.orderNumber} has arrived.`, "order", { orderId: order._id });
    emit(io, `user:${owner}`, "order:new", { orderId: order._id, orderNumber: order.orderNumber });
  }));
  // An order that reaches a kitchen counts as the customer's first order for refer & earn.
  if (orders[0]?.customer) await rewardReferrerOnFirstOrder(orders[0].customer).catch(error => console.error("[rewards] referral reward failed:", error.message));
}

// ---- Grocery checkouts share the payment engine; these are the only grocery-specific steps. ----
export const isGroceryPayment = payment => payment?.kind === "grocery";
export async function restockGrocery(items = []) {
  for (const line of items) if (line?.product && line.quantity > 0) await GroceryProduct.updateOne({ _id: line.product }, { $inc: { stock: line.quantity } });
}
// Cancels a grocery order that never got paid and puts its reserved stock back. Only the call that wins the
// status change restocks, so running it twice (sweeper + customer) can't double the stock.
async function closeUnpaidGrocery(payment, { paymentStatus, by, reason }) {
  const order = await GroceryOrder.findOneAndUpdate(
    { _id: payment.groceryOrder, status: "awaiting_payment" },
    { $set: { status: "cancelled", paymentStatus, cancelledAt: new Date(), cancelledBy: by, cancellationReason: reason } },
    { new: true }
  );
  if (order) await restockGrocery(order.items);
  return order;
}
async function releaseGrocery(payment, { paymentStatus }) {
  const order = await GroceryOrder.findOneAndUpdate(
    { _id: payment.groceryOrder, status: "awaiting_payment" },
    { $set: { status: "placed", placedAt: new Date(), paymentStatus, paymentMethod: payment.method } },
    { new: true }
  );
  if (order) notify(order.user, "Grocery order confirmed", `Order ${order.orderNumber} is confirmed and will be packed shortly.`, "order", { groceryOrderId: order._id });
  return order ? [order] : [];
}

async function releaseOrders(payment, { paymentStatus, io }) {
  if (isGroceryPayment(payment)) return releaseGrocery(payment, { paymentStatus });
  const waiting = await Order.find({ payment: payment._id, orderStatus: "awaiting_payment" });
  if (!waiting.length) return [];
  await Order.updateMany(
    { _id: { $in: waiting.map(order => order._id) }, orderStatus: "awaiting_payment" },
    { $set: { orderStatus: "placed", placedAt: new Date(), paymentStatus, paymentMethod: payment.method } }
  );
  await announceOrders(waiting, io);
  return waiting;
}

// ---------------------------------------------------------------------------------------------------------
// Checkout support (used by POST /checkout in routes.js)
// ---------------------------------------------------------------------------------------------------------
export function readIdempotencyKey(req) {
  const raw = req.get("Idempotency-Key") ?? req.body?.idempotencyKey;
  if (raw == null || raw === "") return null;
  const key = String(raw).trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(key) ? key : false;
}

export const hashCheckoutRequest = payload => crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export function checkoutResponse(payment, orders, extra = {}) {
  return {
    groupOrderId: payment.groupOrderId,
    orders,
    totalAmount: payment.amount,
    paymentMethod: payment.method,
    paymentStatus: payment.status,
    payment: publicPayment(payment),
    message: isOnline(payment)
      ? `Order created. Complete the ${rupees(payment.amount)} payment within ${config.payments.windowMinutes} minutes to send it to the kitchen.`
      : "Order placed. Pay cash on delivery.",
    ...extra
  };
}

// Answers a retried checkout request with the original result instead of creating a second order.
export async function replayCheckout(existing, requestHash, res) {
  if (existing.requestHash && existing.requestHash !== requestHash) {
    return res.status(422).json({ code: "IDEMPOTENCY_KEY_REUSED", message: "This checkout attempt was already used for a different order. Refresh the page and try again." });
  }
  if (existing.status === "created") {
    return res.status(409).json({ code: "CHECKOUT_IN_PROGRESS", retryable: true, message: "Your order is still being placed. Please wait a moment." });
  }
  const orders = await Order.find({ payment: existing._id }).sort({ orderNumber: 1 });
  return res.status(200).json(checkoutResponse(existing, orders, { replayed: true }));
}

// Undoes a checkout that failed part-way. It also frees the idempotency key so the customer can retry.
export async function abortCheckout(payment, reason, { restoreCart: restore = true } = {}) {
  const aborted = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "created" },
    { $set: { status: "cancelled" }, $unset: { idempotencyKey: 1 }, $push: pushEvent(paymentEvent("checkout.aborted", reason)) },
    { new: true }
  );
  if (!aborted) return null;
  await Order.deleteMany({ payment: aborted._id });
  await releaseCouponFor(aborted.groupOrderId).catch(() => {});
  if (restore) await restoreCart(aborted.customer, aborted.cartSnapshot).catch(error => console.error("[payments] cart restore failed:", error.message));
  return aborted;
}

// ---------------------------------------------------------------------------------------------------------
// Capturing money
// ---------------------------------------------------------------------------------------------------------
export async function capturePayment(paymentId, { providerPaymentId, signature, amount, method, source = "gateway" }, ctx = {}) {
  const now = new Date();
  const update = {
    $set: {
      status: "paid", amountPaid: round2(amount), providerPaymentId, paidAt: now, lastError: "",
      "attempts.$[open].status": "captured", "attempts.$[open].providerPaymentId": providerPaymentId, "attempts.$[open].completedAt": now
    },
    $push: pushEvent(paymentEvent("payment.captured", `${rupees(amount)} received by ${methodLabel(method)}.`, source, { providerPaymentId }))
  };
  if (signature) update.$set.providerSignature = signature;
  if (ONLINE_METHODS.includes(method)) update.$set.method = method;
  const captured = await Payment.findOneAndUpdate(
    { _id: paymentId, method: { $ne: "cod" }, status: { $in: [...PAYABLE, "authorized"] } },
    update,
    { new: true, arrayFilters: [{ "open.status": "started" }] }
  );
  if (captured) {
    await releaseOrders(captured, { paymentStatus: "paid", io: ctx.io });
    notify(captured.customer, "Payment successful", `We received ${rupees(amount)} for ${isGroceryPayment(captured) ? "grocery order" : "checkout"} ${captured.groupOrderId}. ${isGroceryPayment(captured) ? "Your groceries are being packed." : "Your order is on its way to the kitchen."}`, "payment", { groupOrderId: captured.groupOrderId, paymentId: captured._id });
    emit(ctx.io, `user:${captured.customer}`, "payment:updated", { paymentId: captured._id, status: captured.status });
    return { payment: captured, outcome: "captured" };
  }
  const current = await Payment.findById(paymentId);
  if (!current) throw new PaymentError("Payment not found.", { status: 404, code: "NOT_FOUND" });
  const alreadyRecorded = (current.providerPaymentId === providerPaymentId && CAPTURED.includes(current.status))
    || current.refunds.some(refund => refund.kind === "late_capture" && refund.providerPaymentId === providerPaymentId);
  if (alreadyRecorded) return { payment: current, outcome: "duplicate" };
  if (current.status === "created") throw new PaymentError("The checkout is still being set up.", { status: 409, code: "CHECKOUT_IN_PROGRESS", retryable: true });
  // The checkout already closed, or this is a second successful payment for the same order.
  return { payment: await refundLateCapture(current, { providerPaymentId, amount, source }, ctx), outcome: "late_capture" };
}

async function refundLateCapture(payment, { providerPaymentId, amount, source }, ctx) {
  const refundId = new mongoose.Types.ObjectId();
  const reason = CAPTURED.includes(payment.status)
    ? "Duplicate payment for an order that was already paid"
    : payment.method === "cod" ? "Payment arrived after switching to cash on delivery" : `Payment arrived after the checkout was ${payment.status}`;
  const now = new Date();
  const reserved = await Payment.findOneAndUpdate(
    { _id: payment._id, providerPaymentId: { $ne: providerPaymentId }, "refunds.providerPaymentId": { $ne: providerPaymentId } },
    { $push: {
      refunds: { _id: refundId, kind: "late_capture", amount: round2(amount), reason, status: "pending", providerPaymentId, createdAt: now, updatedAt: now },
      ...pushEvent(paymentEvent("payment.late_capture", `${rupees(amount)} was received but can't be used (${reason.toLowerCase()}). Refunding it automatically.`, source, { providerPaymentId }))
    } },
    { new: true }
  );
  if (!reserved) return Payment.findById(payment._id);
  notify(reserved.customer, "Refund on the way", `We received an extra ${rupees(amount)} for checkout ${reserved.groupOrderId} that we can't use, so it's being refunded to your original payment method.`, "payment", { groupOrderId: reserved.groupOrderId });
  return executeRefund(reserved._id, refundId, ctx);
}

// Razorpay can leave a payment "authorized"; capture it so the money is actually collected.
async function settleRazorpayPayment(gateway, providerPaymentId, payment) {
  let entity = await gateway.fetchPayment(providerPaymentId);
  if (entity.order_id !== payment.providerOrderId) throw new PaymentError("This payment doesn't belong to this order.", { status: 400, code: "ORDER_MISMATCH" });
  if (entity.currency !== payment.currency || Number(entity.amount) !== toPaise(payment.amount)) {
    await Payment.updateOne({ _id: payment._id }, { $push: pushEvent(paymentEvent("payment.amount_mismatch", `Gateway reported ${rupees(fromPaise(entity.amount))} ${entity.currency}; expected ${rupees(payment.amount)}.`, "gateway", { providerPaymentId })) });
    throw new PaymentError("The amount paid doesn't match this order. Our team will review it and refund any difference.", { status: 409, code: "AMOUNT_MISMATCH" });
  }
  if (entity.status === "authorized") {
    try { entity = await gateway.capture(providerPaymentId, entity.amount, entity.currency); }
    catch { entity = await gateway.fetchPayment(providerPaymentId); } // it may have been captured concurrently
  }
  if (entity.status !== "captured") {
    const failed = entity.status === "failed";
    throw new PaymentError(failed ? (entity.error_description || "The payment failed.") : "Your bank hasn't confirmed this payment yet. We'll update your order as soon as it does.", { status: 409, code: failed ? "PAYMENT_FAILED" : "NOT_CAPTURED", retryable: !failed });
  }
  return entity;
}

// Asks the gateway which payments were made against this checkout and records any we missed.
async function syncGatewayCaptures(payment, ctx) {
  const gateway = gatewayFor(payment.gateway);
  if (!gateway || !payment.providerOrderId) return [];
  const results = [];
  for (const item of await gateway.orderPayments(payment.providerOrderId)) {
    if (!["captured", "authorized"].includes(item.status)) continue;
    if (Number(item.amount) !== toPaise(payment.amount) || item.currency !== payment.currency) { results.push({ providerPaymentId: item.id, outcome: "amount_mismatch" }); continue; }
    let entity = item;
    if (item.status === "authorized") {
      const fresh = await Payment.findById(payment._id);
      // For a closed checkout, let the authorisation lapse: the bank releases it without a refund.
      if (!fresh || !PAYABLE.includes(fresh.status)) { results.push({ providerPaymentId: item.id, outcome: "authorization_ignored" }); continue; }
      try { entity = await gateway.capture(item.id, item.amount, item.currency); } catch { entity = await gateway.fetchPayment(item.id); }
      if (entity?.status !== "captured") continue;
    }
    const { outcome } = await capturePayment(payment._id, { providerPaymentId: entity.id, amount: fromPaise(entity.amount), method: normalizeMethod(entity.method, payment.method), source: "reconciliation" }, ctx);
    results.push({ providerPaymentId: entity.id, outcome });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------------------
// Customer-facing payment actions
// ---------------------------------------------------------------------------------------------------------
export async function startPaymentSession(paymentId, user, { method } = {}, ctx = {}) {
  let payment = await expireIfDue(await loadOwnPayment(paymentId, user), ctx);
  assertPayable(payment);
  const gateway = gatewayFor(payment.gateway);
  if (!gateway) throw new PaymentError("Online payments are unavailable right now. Switch to cash on delivery instead.", { status: 503, code: "GATEWAY_UNAVAILABLE" });
  if (!payment.providerOrderId) {
    // One gateway order per checkout; retries reuse it, so the customer can never be charged for two.
    const providerOrder = await gateway.createOrder({ amount: toPaise(payment.amount), currency: payment.currency, receipt: payment.groupOrderId, notes: { paymentId: String(payment._id), groupOrderId: payment.groupOrderId } });
    payment = await Payment.findOneAndUpdate(
      { _id: payment._id, providerOrderId: null },
      { $set: { providerOrderId: providerOrder.id }, $push: pushEvent(paymentEvent("gateway.order_created", "Secure payment session created.", "system", { providerOrderId: providerOrder.id })) },
      { new: true }
    ) || await Payment.findById(payment._id);
  }
  const preferred = normalizeMethod(method, payment.method);
  const now = new Date();
  // Close any earlier session so exactly one attempt is "started" at a time.
  await Payment.updateOne({ _id: payment._id }, { $set: { "attempts.$[open].status": "dismissed", "attempts.$[open].completedAt": now } }, { arrayFilters: [{ "open.status": "started" }] });
  const started = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: PAYABLE } },
    { $set: { method: preferred }, $push: { attempts: { status: "started", method: preferred, startedAt: now }, ...pushEvent(paymentEvent("attempt.started", `Payment started with ${methodLabel(preferred)}.`, "customer")) } },
    { new: true }
  );
  if (!started) { assertPayable(await Payment.findById(payment._id)); throw new PaymentError("This payment can no longer be completed.", { status: 409, code: "NOT_PAYABLE" }); }
  if (preferred !== payment.method) {
    if (isGroceryPayment(started)) await GroceryOrder.updateOne({ _id: started.groceryOrder, status: "awaiting_payment" }, { $set: { paymentMethod: preferred } });
    else await Order.updateMany({ payment: started._id, orderStatus: "awaiting_payment" }, { $set: { paymentMethod: preferred } });
  }
  return {
    paymentId: started._id,
    gateway: gateway.name,
    testMode: Boolean(gateway.testMode),
    keyId: gateway.keyId,
    providerOrderId: started.providerOrderId,
    amount: toPaise(started.amount),
    displayAmount: started.amount,
    currency: started.currency,
    method: preferred,
    expiresAt: started.expiresAt,
    groupOrderId: started.groupOrderId,
    name: "GoFoode",
    description: `${isGroceryPayment(started) ? "Grocery" : "Food"} order ${started.groupOrderId}`,
    prefill: { name: user.name || "", email: user.email || "", contact: user.phone || "" }
  };
}

export async function verifyPayment(paymentId, user, { providerOrderId, providerPaymentId, signature, method }, ctx = {}) {
  const payment = await loadOwnPayment(paymentId, user);
  if (![providerOrderId, providerPaymentId, signature].every(value => typeof value === "string" && value.length > 0 && value.length < 200)) {
    throw new PaymentError("Payment confirmation details are missing.", { status: 400, code: "INVALID_REQUEST" });
  }
  if (payment.providerPaymentId === providerPaymentId && CAPTURED.includes(payment.status)) return { payment, outcome: "duplicate" };
  if (!payment.providerOrderId || payment.providerOrderId !== providerOrderId) throw new PaymentError("This payment doesn't belong to this order.", { status: 400, code: "ORDER_MISMATCH" });
  const gateway = gatewayFor(payment.gateway);
  if (!gateway) throw new PaymentError("The payment gateway for this order isn't available.", { status: 503, code: "GATEWAY_UNAVAILABLE", retryable: true });
  if (!safeEqual(checkoutSignature(gateway.signingSecret, providerOrderId, providerPaymentId), signature)) {
    await Payment.updateOne({ _id: payment._id }, { $push: pushEvent(paymentEvent("signature.invalid", "A payment confirmation failed signature verification.", "customer", { providerPaymentId })) });
    throw new PaymentError("We couldn't verify this payment. If money was debited, it will be confirmed or refunded automatically.", { status: 400, code: "INVALID_SIGNATURE" });
  }
  let amount = payment.amount;
  let paidWith = gateway.name === "mock" ? normalizeMethod(method, payment.method) : payment.method;
  if (gateway.name === "razorpay") {
    const entity = await settleRazorpayPayment(gateway, providerPaymentId, payment);
    amount = fromPaise(entity.amount);
    paidWith = normalizeMethod(entity.method, payment.method);
  }
  return capturePayment(payment._id, { providerPaymentId, signature, amount, method: paidWith, source: "customer" }, ctx);
}

async function markAttemptFailed(payment, { providerPaymentId, code, reason, source }) {
  const now = new Date();
  const message = String(reason || "The payment was declined.").slice(0, 300);
  const paymentRef = typeof providerPaymentId === "string" && providerPaymentId ? providerPaymentId.slice(0, 100) : undefined;
  const filter = { _id: payment._id, status: { $in: PAYABLE }, [`attempts.${MAX_ATTEMPTS_STORED}`]: { $exists: false } };
  if (paymentRef) filter["attempts.providerPaymentId"] = { $ne: paymentRef }; // each gateway failure counts once
  await Payment.updateOne(filter, {
    $set: { status: "failed", lastError: message },
    $push: {
      attempts: { status: "failed", method: payment.method, providerPaymentId: paymentRef, errorCode: String(code || "").slice(0, 60), errorReason: message, startedAt: now, completedAt: now },
      ...pushEvent(paymentEvent("payment.failed", message, source, paymentRef ? { providerPaymentId: paymentRef } : undefined))
    }
  });
}

export async function recordPaymentFailure(paymentId, user, { providerPaymentId, code, reason, dismissed }) {
  const payment = await loadOwnPayment(paymentId, user);
  if (dismissed) {
    const now = new Date();
    await Payment.updateOne(
      { _id: payment._id, status: { $in: PAYABLE }, "attempts.status": "started" },
      { $set: { "attempts.$[open].status": "dismissed", "attempts.$[open].completedAt": now }, $push: pushEvent(paymentEvent("attempt.closed", "Payment window closed before the payment was completed.", "customer")) },
      { arrayFilters: [{ "open.status": "started" }] }
    );
  } else {
    await markAttemptFailed(payment, { providerPaymentId, code, reason, source: "gateway" });
  }
  return Payment.findById(payment._id);
}

export async function switchToCash(paymentId, user, ctx = {}) {
  const payment = await expireIfDue(await loadOwnPayment(paymentId, user), ctx);
  if (!isOnline(payment)) return payment;
  const now = new Date();
  const switched = await Payment.findOneAndUpdate(
    { _id: payment._id, method: { $ne: "cod" }, status: { $in: PAYABLE }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    {
      $set: { method: "cod", status: "pending", expiresAt: null, lastError: "", "attempts.$[open].status": "dismissed", "attempts.$[open].completedAt": now },
      $push: pushEvent(paymentEvent("method.switched", "Switched to cash on delivery. Any online payment that still completes will be refunded automatically.", "customer"))
    },
    { new: true, arrayFilters: [{ "open.status": "started" }] }
  );
  if (!switched) {
    const current = await Payment.findById(payment._id);
    if (CAPTURED.includes(current.status)) throw new PaymentError("This order was just paid online, so there's nothing to pay on delivery.", { status: 409, code: "ALREADY_PAID" });
    assertPayable(current);
    throw new PaymentError("This payment can no longer be changed.", { status: 409, code: "NOT_PAYABLE" });
  }
  await releaseOrders(switched, { paymentStatus: "pending", io: ctx.io });
  emit(ctx.io, `user:${switched.customer}`, "payment:updated", { paymentId: switched._id, status: switched.status });
  return switched;
}

export async function cancelUnpaidCheckout(paymentId, user, { reason = "Cancelled by customer" } = {}, ctx = {}) {
  const payment = await loadOwnPayment(paymentId, user);
  const now = new Date();
  const cancelled = await Payment.findOneAndUpdate(
    { _id: payment._id, method: { $ne: "cod" }, status: { $in: PAYABLE } },
    { $set: { status: "cancelled", expiresAt: null, "attempts.$[open].status": "dismissed", "attempts.$[open].completedAt": now }, $push: pushEvent(paymentEvent("checkout.cancelled", reason, "customer")) },
    { new: true, arrayFilters: [{ "open.status": "started" }] }
  );
  if (!cancelled) {
    const current = await Payment.findById(payment._id);
    if (CAPTURED.includes(current.status)) throw new PaymentError("This order has already been paid. Cancel it from the order page to get a refund.", { status: 409, code: "ALREADY_PAID" });
    if (["cancelled", "expired"].includes(current.status)) return { payment: current, restored: 0 };
    throw new PaymentError("This checkout can no longer be cancelled.", { status: 409, code: "NOT_CANCELLABLE" });
  }
  if (isGroceryPayment(cancelled)) {
    const order = await closeUnpaidGrocery(cancelled, { paymentStatus: "cancelled", by: "customer", reason });
    emit(ctx.io, `user:${cancelled.customer}`, "payment:updated", { paymentId: cancelled._id, status: cancelled.status });
    return { payment: cancelled, restored: order?.items.length || 0 };
  }
  await Order.updateMany(
    { payment: cancelled._id, orderStatus: "awaiting_payment" },
    { $set: { orderStatus: "cancelled", paymentStatus: "cancelled", cancelledAt: now, cancelledBy: "customer", cancellationReason: reason } }
  );
  const restored = await restoreCart(cancelled.customer, cancelled.cartSnapshot).catch(() => 0);
  await releaseCouponFor(cancelled.groupOrderId).catch(() => {});
  emit(ctx.io, `user:${cancelled.customer}`, "payment:updated", { paymentId: cancelled._id, status: cancelled.status });
  return { payment: cancelled, restored };
}

// ---------------------------------------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------------------------------------
export async function expirePayment(payment, ctx = {}) {
  // A missed webhook must never cancel an order the customer actually paid for, so ask the gateway first.
  if (payment.gateway === "razorpay" && payment.providerOrderId) {
    try { await syncGatewayCaptures(payment, ctx); }
    catch (error) { console.warn(`[payments] couldn't reach the gateway before expiring ${payment._id}; will retry:`, error.message); return payment; }
    payment = await Payment.findById(payment._id);
    if (!payment || !PAYABLE.includes(payment.status)) return payment;
  }
  const now = new Date();
  const expired = await Payment.findOneAndUpdate(
    { _id: payment._id, method: { $ne: "cod" }, status: { $in: PAYABLE }, expiresAt: { $lte: now } },
    {
      $set: { status: "expired", "attempts.$[open].status": "dismissed", "attempts.$[open].completedAt": now },
      $push: pushEvent(paymentEvent("payment.expired", `Payment wasn't completed within ${config.payments.windowMinutes} minutes, so the order was cancelled.`))
    },
    { new: true, arrayFilters: [{ "open.status": "started" }] }
  );
  if (!expired) return Payment.findById(payment._id);
  if (isGroceryPayment(expired)) {
    const order = await closeUnpaidGrocery(expired, { paymentStatus: "cancelled", by: "system", reason: "Payment wasn't completed in time" });
    notify(expired.customer, "Payment window closed", `Grocery order ${expired.groupOrderId} was cancelled because payment wasn't completed in time.${order ? " Nothing was charged." : ""}`, "payment", { groupOrderId: expired.groupOrderId });
    emit(ctx.io, `user:${expired.customer}`, "payment:updated", { paymentId: expired._id, status: "expired" });
    return expired;
  }
  await Order.updateMany(
    { payment: expired._id, orderStatus: "awaiting_payment" },
    { $set: { orderStatus: "cancelled", paymentStatus: "cancelled", cancelledAt: now, cancelledBy: "system", cancellationReason: "Payment wasn't completed in time" } }
  );
  const restored = await restoreCart(expired.customer, expired.cartSnapshot).catch(error => { console.error("[payments] cart restore failed:", error.message); return 0; });
  await releaseCouponFor(expired.groupOrderId).catch(() => {});
  notify(expired.customer, "Payment window closed", `Checkout ${expired.groupOrderId} was cancelled because payment wasn't completed in time.${restored ? " Your items are back in your cart." : ""}`, "payment", { groupOrderId: expired.groupOrderId });
  emit(ctx.io, `user:${expired.customer}`, "payment:updated", { paymentId: expired._id, status: "expired" });
  return expired;
}

export const expireIfDue = async (payment, ctx = {}) =>
  payment && isOnline(payment) && PAYABLE.includes(payment.status) && payment.expiresAt && payment.expiresAt <= new Date()
    ? expirePayment(payment, ctx)
    : payment;

// ---------------------------------------------------------------------------------------------------------
// Cash on delivery and cancellations
// ---------------------------------------------------------------------------------------------------------
// Derives a COD payment's state from its orders: paid once every live order has been collected.
export async function refreshCashSettlement(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment || payment.method !== "cod" || !["pending", "paid", "cancelled"].includes(payment.status)) return payment;
  const orders = await Order.find(payment.orders?.length ? { _id: { $in: payment.orders } } : { groupOrderId: payment.groupOrderId }).select("orderStatus paymentStatus totalAmount");
  const live = orders.filter(order => !["rejected", "cancelled"].includes(order.orderStatus));
  const collected = sum(orders.filter(order => order.paymentStatus === "paid"));
  const status = live.some(order => order.paymentStatus !== "paid") ? "pending" : collected > 0 ? "paid" : "cancelled";
  if (status !== payment.status || collected !== round2(payment.amountPaid)) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status, amountPaid: collected, ...(status === "paid" && !payment.paidAt ? { paidAt: new Date() } : {}) } });
  }
  return Payment.findById(payment._id);
}

export async function recordCashCollected(order) {
  const payment = await paymentForOrder(order);
  if (!payment) return null;
  await Payment.updateOne({ _id: payment._id }, { $push: pushEvent(paymentEvent("cash.collected", `${rupees(order.totalAmount)} collected in cash for order ${order.orderNumber}.`, "delivery", { orderId: order._id })) });
  return refreshCashSettlement(payment._id);
}

// Call after an order has moved to rejected/cancelled: refunds it if it was paid online, otherwise voids it.
export async function settleCancelledOrder(order, { reason, source = "system", actor = null } = {}, ctx = {}) {
  const payment = await paymentForOrder(order);
  if (!payment) return { refund: null };
  if (isOnline(payment) && ["paid", "partially_refunded"].includes(order.paymentStatus)) {
    try {
      const { refund } = await refundOrder(order._id, { reason, source, actor }, ctx);
      return { refund };
    } catch (error) {
      // The cancellation stands; a failed refund is flagged for the admin team rather than undoing it.
      console.error(`[payments] automatic refund failed for order ${order._id}:`, error.message);
      await Payment.updateOne({ _id: payment._id }, { $push: pushEvent(paymentEvent("refund.needs_attention", `Automatic refund for order ${order.orderNumber} couldn't start: ${error.message}`, "system", { orderId: order._id })) });
      await AuditLog.create({ action: "payment.refund_needs_attention", entityType: "Order", entityId: String(order._id), metadata: { reason: error.message } });
      return { refund: null, error: error.message };
    }
  }
  await Order.updateOne({ _id: order._id, paymentStatus: { $in: ["pending", "failed"] } }, { $set: { paymentStatus: "cancelled" } });
  await refreshCashSettlement(payment._id);
  return { refund: null };
}

// ---------------------------------------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------------------------------------
const refundedForOrderExpr = orderId => ({
  $sum: { $map: {
    input: { $filter: { input: "$refunds", as: "r", cond: { $and: [{ $eq: ["$$r.order", orderId] }, { $ne: ["$$r.status", "failed"] }] } } },
    as: "r", in: "$$r.amount"
  } }
});

export async function refundOrder(orderId, { amount = null, reason = "", kind = "order", actor = null, source = "system" } = {}, ctx = {}) {
  const order = await Order.findById(orderId);
  if (!order) throw new PaymentError("Order not found.", { status: 404, code: "NOT_FOUND" });
  const payment = await paymentForOrder(order);
  if (!payment || !isOnline(payment) || !["paid", "partially_refunded"].includes(payment.status)) {
    throw new PaymentError("Only orders that were paid online can be refunded.", { status: 409, code: "NOT_REFUNDABLE" });
  }
  const alreadyRefunded = sum(payment.refunds.filter(refund => String(refund.order) === String(order._id) && refund.status !== "failed"));
  const refundable = round2(Math.min(order.totalAmount - alreadyRefunded, payment.amountPaid - payment.amountRefunded));
  if (!(refundable > 0)) throw new PaymentError("This order has already been refunded in full.", { status: 409, code: "ALREADY_REFUNDED" });
  const value = amount == null ? refundable : round2(amount);
  if (!(value > 0) || value > refundable + EPSILON) throw new PaymentError(`Enter a refund amount up to ${rupees(refundable)}.`, { status: 400, code: "INVALID_REFUND_AMOUNT" });

  // Reserve the refund in the ledger first. The $expr guard makes over-refunding impossible even under races.
  const refundId = new mongoose.Types.ObjectId();
  const now = new Date();
  const reserved = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: { $in: ["paid", "partially_refunded"] },
      $expr: { $and: [
        { $lte: [{ $add: ["$amountRefunded", value] }, { $add: ["$amountPaid", EPSILON] }] },
        { $lte: [{ $add: [refundedForOrderExpr(order._id), value] }, order.totalAmount + EPSILON] }
      ] }
    },
    {
      $inc: { amountRefunded: value },
      $push: {
        refunds: { _id: refundId, order: order._id, amount: value, reason: reason || "Refund", kind, status: "pending", providerPaymentId: payment.providerPaymentId, initiatedBy: actor, createdAt: now, updatedAt: now },
        ...pushEvent(paymentEvent("refund.requested", `Refund of ${rupees(value)} requested for order ${order.orderNumber}${reason ? `: ${reason}` : ""}.`, source, { orderId: order._id, refundId }))
      }
    },
    { new: true }
  );
  if (!reserved) throw new PaymentError("Another refund for this order is already being processed. Refresh and try again.", { status: 409, code: "REFUND_CONFLICT" });
  await syncRefundState(reserved._id);
  notify(order.customer, "Refund initiated", `A refund of ${rupees(value)} for order ${order.orderNumber} has been initiated to your original payment method.`, "payment", { orderId: order._id });
  const result = await executeRefund(reserved._id, refundId, ctx);
  return { payment: result, refund: result?.refunds.id(refundId) || null };
}

async function executeRefund(paymentId, refundId, ctx = {}) {
  const payment = await Payment.findById(paymentId);
  const refund = payment?.refunds.id(refundId);
  if (!refund || refund.status !== "pending") return payment;
  const gateway = gatewayFor(payment.gateway);
  if (!gateway) return failRefund(paymentId, refundId, "The payment gateway for this transaction isn't configured.");
  let result;
  try {
    result = await gateway.refund(refund.providerPaymentId, toPaise(refund.amount), { refundRef: String(refundId), groupOrderId: payment.groupOrderId });
  } catch (error) {
    if (error.ambiguous) {
      await Payment.updateOne({ _id: paymentId }, { $push: pushEvent(paymentEvent("refund.unconfirmed", "The gateway didn't respond to the refund request. It will be checked again automatically.", "system", { refundId })) });
      return Payment.findById(paymentId);
    }
    return failRefund(paymentId, refundId, error.message);
  }
  const status = result.status === "processed" ? "processed" : result.status === "failed" ? "failed" : "pending";
  return applyRefundResult(paymentId, refundId, { providerRefundId: result.id, status }, "gateway", ctx);
}

async function applyRefundResult(paymentId, refundId, { providerRefundId, status, failureReason = "The gateway reported the refund as failed." }, source) {
  if (status === "failed") return failRefund(paymentId, refundId, failureReason);
  const payment = await Payment.findById(paymentId);
  const refund = payment?.refunds.id(refundId);
  if (!refund || refund.status !== "pending") return payment;
  const now = new Date();
  const set = { "refunds.$.updatedAt": now };
  if (providerRefundId) set["refunds.$.providerRefundId"] = providerRefundId;
  if (status === "processed") Object.assign(set, { "refunds.$.status": "processed", "refunds.$.processedAt": now });
  const changed = status === "processed" || (providerRefundId && providerRefundId !== refund.providerRefundId);
  const updated = await Payment.findOneAndUpdate(
    { _id: paymentId, refunds: { $elemMatch: { _id: refundId, status: "pending" } } },
    { $set: set, ...(changed ? { $push: pushEvent(status === "processed"
      ? paymentEvent("refund.processed", `Refund of ${rupees(refund.amount)} processed. It can take 5–7 working days to reach the account.`, source, { refundId })
      : paymentEvent("refund.initiated", `Refund of ${rupees(refund.amount)} accepted by the gateway.`, source, { refundId })) } : {}) },
    { new: true }
  );
  if (!updated) return Payment.findById(paymentId);
  await syncRefundState(paymentId);
  if (status === "processed") notify(updated.customer, "Refund processed", `Your refund of ${rupees(refund.amount)} has been processed. It can take 5–7 working days to appear in your account.`, "payment", { groupOrderId: updated.groupOrderId });
  return Payment.findById(paymentId);
}

async function failRefund(paymentId, refundId, reason) {
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, refunds: { $elemMatch: { _id: refundId, status: "pending" } } },
    { $set: { "refunds.$.status": "failed", "refunds.$.failureReason": reason, "refunds.$.updatedAt": new Date() }, $push: pushEvent(paymentEvent("refund.failed", `Refund failed: ${reason}`, "gateway", { refundId })) },
    { new: true }
  );
  if (!payment) return Payment.findById(paymentId);
  const refund = payment.refunds.id(refundId);
  // Release the reservation so the refund can be retried.
  if (refund.kind !== "late_capture") await Payment.updateOne({ _id: paymentId }, { $inc: { amountRefunded: -refund.amount } });
  await syncRefundState(paymentId);
  await AuditLog.create({ action: "payment.refund_failed", entityType: "Payment", entityId: String(paymentId), metadata: { refundId: String(refundId), amount: refund.amount, reason } });
  notify(payment.customer, "Refund delayed", `We couldn't process your refund of ${rupees(refund.amount)} automatically. Our team has been alerted and will retry it.`, "payment", { groupOrderId: payment.groupOrderId });
  return Payment.findById(paymentId);
}

// Recomputes payment and order refund statuses from the refund ledger. Safe to call any number of times.
async function syncRefundState(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return null;
  const ledger = payment.refunds.filter(refund => refund.kind !== "late_capture" && refund.status !== "failed");
  const processed = sum(ledger.filter(refund => refund.status === "processed"));
  if (CAPTURED.includes(payment.status)) {
    const status = payment.amountPaid > 0 && processed >= payment.amountPaid - EPSILON ? "refunded" : processed > 0 ? "partially_refunded" : "paid";
    if (status !== payment.status) await Payment.updateOne({ _id: payment._id, status: payment.status }, { $set: { status } });
  }
  const orderIds = [...new Set(payment.refunds.filter(refund => refund.order).map(refund => String(refund.order)))];
  for (const orderId of orderIds) {
    const rows = ledger.filter(refund => String(refund.order) === orderId);
    const done = sum(rows.filter(refund => refund.status === "processed"));
    const order = await Order.findById(orderId).select("totalAmount");
    if (!order) continue;
    const paymentStatus = rows.some(refund => refund.status === "pending") ? "refund_pending" : done >= order.totalAmount - EPSILON ? "refunded" : done > 0 ? "partially_refunded" : "paid";
    await Order.updateOne({ _id: orderId }, { $set: { paymentStatus, refundedAmount: done } });
  }
  if (isGroceryPayment(payment) && payment.groceryOrder) {
    const done = sum(ledger.filter(refund => refund.status === "processed"));
    const paymentStatus = ledger.some(refund => refund.status === "pending") ? "refund_pending" : done > 0 && done >= payment.amountPaid - EPSILON ? "refunded" : done > 0 ? "partially_refunded" : null;
    if (paymentStatus) await GroceryOrder.updateOne({ _id: payment.groceryOrder }, { $set: { paymentStatus, refundedAmount: done } });
  }
  return payment;
}

// Refunds whatever is left of a paid grocery order to the original payment method.
export async function refundGroceryOrder(order, { reason = "", source = "system", actor = null } = {}, ctx = {}) {
  const payment = order.payment ? await Payment.findById(order.payment) : null;
  if (!payment || !isOnline(payment) || !["paid", "partially_refunded"].includes(payment.status)) throw new PaymentError("Only orders that were paid online can be refunded.", { status: 409, code: "NOT_REFUNDABLE" });
  const value = round2(payment.amountPaid - payment.amountRefunded);
  if (!(value > 0)) throw new PaymentError("This order has already been refunded in full.", { status: 409, code: "ALREADY_REFUNDED" });
  const refundId = new mongoose.Types.ObjectId();
  const now = new Date();
  const reserved = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["paid", "partially_refunded"] }, $expr: { $lte: [{ $add: ["$amountRefunded", value] }, { $add: ["$amountPaid", EPSILON] }] } },
    {
      $inc: { amountRefunded: value },
      $push: {
        refunds: { _id: refundId, order: order._id, amount: value, reason: reason || "Refund", kind: "order", status: "pending", providerPaymentId: payment.providerPaymentId, initiatedBy: actor, createdAt: now, updatedAt: now },
        ...pushEvent(paymentEvent("refund.requested", `Refund of ${rupees(value)} requested for grocery order ${order.orderNumber}${reason ? `: ${reason}` : ""}.`, source, { groceryOrderId: order._id, refundId }))
      }
    },
    { new: true }
  );
  if (!reserved) throw new PaymentError("A refund for this order is already being processed.", { status: 409, code: "REFUND_CONFLICT" });
  await syncRefundState(reserved._id);
  notify(order.user, "Refund initiated", `A refund of ${rupees(value)} for grocery order ${order.orderNumber} has been initiated to your original payment method.`, "payment", { groceryOrderId: order._id });
  const result = await executeRefund(reserved._id, refundId, ctx);
  return { payment: result, refund: result?.refunds.id(refundId) || null, amount: value };
}

async function syncRefund(payment, refund, gateway, ctx) {
  if (gateway.name === "mock") {
    if (!refund.providerRefundId) { await executeRefund(payment._id, refund._id, ctx); return "retried"; }
    await applyRefundResult(payment._id, refund._id, { status: "processed" }, "reconciliation");
    return "processed";
  }
  const remote = (await gateway.paymentRefunds(refund.providerPaymentId))
    .find(item => item.id === refund.providerRefundId || item.notes?.refundRef === String(refund._id));
  if (remote) {
    const status = remote.status === "processed" ? "processed" : remote.status === "failed" ? "failed" : "pending";
    await applyRefundResult(payment._id, refund._id, { providerRefundId: remote.id, status }, "reconciliation");
    if (status === "pending") await Payment.updateOne({ _id: payment._id, "refunds._id": refund._id }, { $set: { "refunds.$.updatedAt": new Date() } });
    return status;
  }
  // Not found at the gateway after ten minutes means the request never arrived, so sending it again is safe.
  if (!refund.providerRefundId && Date.now() - new Date(refund.createdAt).getTime() > 10 * 60000) {
    await executeRefund(payment._id, refund._id, ctx);
    return "retried";
  }
  await Payment.updateOne({ _id: payment._id, "refunds._id": refund._id }, { $set: { "refunds.$.updatedAt": new Date() } });
  return "pending";
}

// ---------------------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------------------
export async function reconcilePayment(paymentId, ctx = {}, { record = true } = {}) {
  let payment = await Payment.findById(paymentId);
  if (!payment) throw new PaymentError("Payment not found.", { status: 404, code: "NOT_FOUND" });
  const report = { captures: [], refunds: [] };
  const gateway = gatewayFor(payment.gateway);
  if (gateway) {
    if (payment.providerOrderId) report.captures = await syncGatewayCaptures(payment, ctx);
    payment = await Payment.findById(paymentId);
    for (const refund of payment.refunds.filter(entry => entry.status === "pending")) {
      report.refunds.push({ refundId: refund._id, amount: refund.amount, result: await syncRefund(payment, refund, gateway, ctx) });
    }
  }
  if (payment.method === "cod") await refreshCashSettlement(paymentId);
  payment = await expireIfDue(await Payment.findById(paymentId), ctx);
  if (record) {
    const summary = [
      report.captures.length ? `${report.captures.length} gateway payment(s) checked` : "No new gateway payments",
      report.refunds.length ? `${report.refunds.length} pending refund(s) checked` : null
    ].filter(Boolean).join(", ");
    await Payment.updateOne({ _id: paymentId }, { $push: pushEvent(paymentEvent("payment.reconciled", `Reconciled with the gateway. ${summary}.`, ctx.source || "admin", report)) });
  }
  return { payment: await Payment.findById(paymentId), report };
}

// ---------------------------------------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------------------------------------
async function handleRazorpayEvent(body, ctx) {
  const type = String(body?.event || "");
  const entity = body?.payload?.payment?.entity;
  if (["payment.captured", "payment.authorized", "payment.failed", "order.paid"].includes(type) && entity?.order_id) {
    const payment = await Payment.findOne({ gateway: "razorpay", providerOrderId: entity.order_id });
    if (!payment) return "ignored";
    if (type === "payment.failed") {
      await markAttemptFailed(payment, { providerPaymentId: entity.id, code: entity.error_code, reason: entity.error_description, source: "webhook" });
      return "failed";
    }
    if (Number(entity.amount) !== toPaise(payment.amount) || entity.currency !== payment.currency) {
      await Payment.updateOne({ _id: payment._id }, { $push: pushEvent(paymentEvent("payment.amount_mismatch", `Webhook reported ${rupees(fromPaise(entity.amount))} ${entity.currency}; expected ${rupees(payment.amount)}. Needs review.`, "webhook", { providerPaymentId: entity.id })) });
      return "amount_mismatch";
    }
    let captured = entity;
    if (entity.status === "authorized") {
      if (!PAYABLE.includes(payment.status)) return "authorization_ignored";
      const gateway = gatewayFor("razorpay");
      try { captured = await gateway.capture(entity.id, entity.amount, entity.currency); } catch { captured = await gateway.fetchPayment(entity.id); }
    }
    if (captured?.status !== "captured") return "not_captured";
    const { outcome } = await capturePayment(payment._id, { providerPaymentId: captured.id, amount: fromPaise(captured.amount), method: normalizeMethod(captured.method, payment.method), source: "webhook" }, ctx);
    return outcome;
  }
  const refund = body?.payload?.refund?.entity;
  if (type.startsWith("refund.") && refund?.id) {
    const ref = refund.notes?.refundRef;
    const payment = await Payment.findOne({ "refunds.providerRefundId": refund.id })
      || (mongoose.isValidObjectId(ref) ? await Payment.findOne({ "refunds._id": ref }) : null);
    const local = payment?.refunds.find(entry => entry.providerRefundId === refund.id || String(entry._id) === ref);
    if (!local) return "ignored";
    const status = type === "refund.processed" ? "processed" : type === "refund.failed" ? "failed" : "pending";
    await applyRefundResult(payment._id, local._id, { providerRefundId: refund.id, status }, "webhook");
    return status;
  }
  return "ignored";
}

// ---------------------------------------------------------------------------------------------------------
// Background maintenance: expire abandoned checkouts, clean up interrupted ones, chase pending refunds.
// ---------------------------------------------------------------------------------------------------------
export function startPaymentMaintenance(app) {
  let running = false;
  const sweep = async () => {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    const ctx = { io: app.get("io"), source: "system" };
    const now = Date.now();
    try {
      const due = await Payment.find({ method: { $ne: "cod" }, status: { $in: PAYABLE }, expiresAt: { $lte: new Date(now) } }).limit(50);
      for (const payment of due) await expirePayment(payment, ctx).catch(error => console.error(`[payments] couldn't expire ${payment._id}:`, error.message));
      const interrupted = await Payment.find({ status: "created", createdAt: { $lte: new Date(now - 2 * 60000) } }).limit(20);
      for (const payment of interrupted) await abortCheckout(payment, "Checkout was interrupted before it finished.").catch(error => console.error(`[payments] couldn't clean up ${payment._id}:`, error.message));
      const refunding = await Payment.find({ refunds: { $elemMatch: { status: "pending", updatedAt: { $lte: new Date(now - 2 * 60000) } } } }).limit(20);
      for (const payment of refunding) await reconcilePayment(payment._id, ctx, { record: false }).catch(error => console.error(`[payments] couldn't reconcile ${payment._id}:`, error.message));
    } catch (error) {
      console.error("[payments] maintenance sweep failed:", error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(sweep, config.payments.maintenanceIntervalMs);
  const first = setTimeout(sweep, 3000);
  timer.unref?.();
  first.unref?.();
  return () => { clearInterval(timer); clearTimeout(first); };
}

// ---------------------------------------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------------------------------------
const router = express.Router();
const ctxOf = (req, source) => ({ io: req.app.get("io"), source });
const testFailureReason = method => ({
  upi: "The UPI request was declined by the bank.",
  card: "The card was declined by the issuing bank.",
  netbanking: "The bank couldn't authorise this net banking payment."
}[method] || "The payment was declined.");

router.get("/payments/config", (_req, res) => {
  const gateway = activeGateway();
  res.json({
    gateway: gateway?.name || null,
    testMode: Boolean(gateway?.testMode),
    keyId: gateway?.keyId || null,
    methods: gateway ? CHECKOUT_METHODS : ["cod"],
    windowMinutes: config.payments.windowMinutes,
    maxFailedAttempts: config.payments.maxFailedAttempts,
    currency: config.payments.currency
  });
});

router.post("/payments/webhooks/razorpay", asyncHandler(async (req, res) => {
  const secret = config.payments.razorpayWebhookSecret;
  if (!secret) return res.status(503).json({ message: "Webhook secret is not configured." });
  if (!req.rawBody || !safeEqual(hmacHex(secret, req.rawBody), req.get("x-razorpay-signature"))) return res.status(400).json({ message: "Invalid webhook signature." });
  const eventId = req.get("x-razorpay-event-id") || crypto.createHash("sha256").update(req.rawBody).digest("hex");
  try {
    await WebhookEvent.create({ provider: "razorpay", eventId, type: req.body?.event });
  } catch (error) {
    if (error.code === 11000) return res.json({ received: true, duplicate: true });
    throw error;
  }
  try {
    const result = await handleRazorpayEvent(req.body, ctxOf(req, "webhook"));
    res.json({ received: true, result });
  } catch (error) {
    // Forget the event so Razorpay's retry is processed instead of being skipped as a duplicate.
    await WebhookEvent.deleteOne({ provider: "razorpay", eventId }).catch(() => {});
    throw error;
  }
}));

router.get("/payments/:id", protect, asyncHandler(async (req, res) => {
  const payment = await expireIfDue(await loadOwnPayment(req.params.id, req.user), ctxOf(req, "system"));
  res.json({ payment: publicPayment(payment, { admin: req.user.role === "admin" }) });
}));

router.post("/payments/:id/session", protect, allow("customer"), asyncHandler(async (req, res) => {
  res.json(await startPaymentSession(req.params.id, req.user, { method: req.body?.method }, ctxOf(req, "customer")));
}));

router.post("/payments/:id/verify", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { providerOrderId, providerPaymentId, signature, method } = req.body || {};
  const { payment, outcome } = await verifyPayment(req.params.id, req.user, { providerOrderId, providerPaymentId, signature, method }, ctxOf(req, "customer"));
  const message = outcome === "late_capture"
    ? "This checkout had already closed, so we're refunding the payment to you automatically."
    : "Payment successful. Your order has been sent to the kitchen.";
  res.json({ payment: publicPayment(payment), outcome, message });
}));

router.post("/payments/:id/failure", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { providerPaymentId, code, reason, dismissed } = req.body || {};
  const payment = await recordPaymentFailure(req.params.id, req.user, { providerPaymentId, code, reason, dismissed: Boolean(dismissed) });
  res.json({ payment: publicPayment(payment) });
}));

router.post("/payments/:id/switch-to-cod", protect, allow("customer"), asyncHandler(async (req, res) => {
  const payment = await switchToCash(req.params.id, req.user, ctxOf(req, "customer"));
  res.json({ payment: publicPayment(payment), message: "Switched to cash on delivery. Your order has been sent to the kitchen." });
}));

router.post("/payments/:id/cancel", protect, allow("customer"), asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || "").trim().slice(0, 200) || "Cancelled by customer";
  const { payment, restored } = await cancelUnpaidCheckout(req.params.id, req.user, { reason }, ctxOf(req, "customer"));
  res.json({ payment: publicPayment(payment), message: `Checkout cancelled. Nothing was charged.${restored ? " Your items are back in your cart." : ""}` });
}));

// Test gateway only: plays the part of the payment provider's checkout window.
router.post("/payments/:id/simulate", protect, allow("customer"), asyncHandler(async (req, res) => {
  const payment = await loadOwnPayment(req.params.id, req.user);
  if (payment.gateway !== "mock" || process.env.NODE_ENV === "production") throw new PaymentError("Test payments are only available in test mode.", { status: 404, code: "NOT_FOUND" });
  if (!payment.providerOrderId) throw new PaymentError("Start the payment before completing it.", { status: 409, code: "NO_SESSION" });
  const outcome = ["success", "failure", "disconnect"].includes(req.body?.outcome) ? req.body.outcome : "success";
  const method = normalizeMethod(req.body?.method, payment.method);
  const providerPaymentId = `pay_test${crypto.randomBytes(7).toString("hex")}`;
  if (outcome === "failure") {
    return res.json({ outcome, error: { code: "BAD_REQUEST_ERROR", description: testFailureReason(method), source: "bank", reason: "payment_failed", metadata: { order_id: payment.providerOrderId, payment_id: providerPaymentId } } });
  }
  if (outcome === "disconnect") {
    // The customer paid but the browser never reported back: only the gateway's webhook reaches the server.
    const { payment: result, outcome: captureOutcome } = await capturePayment(payment._id, { providerPaymentId, amount: payment.amount, method, source: "webhook" }, ctxOf(req, "webhook"));
    return res.json({ outcome, captureOutcome, payment: publicPayment(result) });
  }
  res.json({
    outcome,
    method,
    razorpay_order_id: payment.providerOrderId,
    razorpay_payment_id: providerPaymentId,
    razorpay_signature: checkoutSignature(gatewayFor("mock").signingSecret, payment.providerOrderId, providerPaymentId)
  });
}));

router.get("/admin/payments/summary", protect, allow("admin"), asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86400000);
  const [byStatus, totals, onlineOutcomes, pendingRefunds, failedRefunds, awaitingOnline] = await Promise.all([
    Payment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $group: { _id: null, collected: { $sum: "$amountPaid" }, refunded: { $sum: "$amountRefunded" } } }]),
    Payment.aggregate([
      { $match: { method: { $ne: "cod" }, createdAt: { $gte: since }, status: { $in: [...CAPTURED, "failed", "expired", "cancelled"] } } },
      { $group: { _id: { $in: ["$status", CAPTURED] }, count: { $sum: 1 } } }
    ]),
    Payment.countDocuments({ refunds: { $elemMatch: { status: "pending" } } }),
    Payment.countDocuments({ refunds: { $elemMatch: { status: "failed" } } }),
    Payment.countDocuments({ method: { $ne: "cod" }, status: { $in: PAYABLE } })
  ]);
  const succeeded = onlineOutcomes.find(row => row._id === true)?.count || 0;
  const unsuccessful = onlineOutcomes.find(row => row._id === false)?.count || 0;
  const gateway = activeGateway();
  res.json({
    gateway: gateway?.name || null,
    testMode: Boolean(gateway?.testMode),
    byStatus: Object.fromEntries(byStatus.map(row => [row._id, { count: row.count, amount: round2(row.amount) }])),
    collected: round2(totals[0]?.collected),
    refunded: round2(totals[0]?.refunded),
    onlineCheckouts7d: succeeded + unsuccessful,
    successRate7d: succeeded + unsuccessful ? Math.round(succeeded / (succeeded + unsuccessful) * 100) : null,
    pendingRefunds,
    failedRefunds,
    awaitingOnline
  });
}));

router.post("/admin/payments/:id/reconcile", protect, allow("admin"), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new PaymentError("Payment not found.", { status: 404, code: "NOT_FOUND" });
  const { payment, report } = await reconcilePayment(req.params.id, ctxOf(req, "admin"));
  await AuditLog.create({ actor: req.user._id, action: "payment.reconciled", entityType: "Payment", entityId: String(payment._id), metadata: report });
  res.json({ payment: publicPayment(payment, { admin: true }), report, message: "Payment reconciled with the gateway." });
}));

router.post("/admin/orders/:id/refund", protect, allow("admin"), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new PaymentError("Order not found.", { status: 404, code: "NOT_FOUND" });
  const raw = req.body?.amount;
  const amount = raw == null || raw === "" ? null : Number(raw);
  if (amount != null && !Number.isFinite(amount)) throw new PaymentError("Enter a valid refund amount.", { status: 400, code: "INVALID_REFUND_AMOUNT" });
  const reason = String(req.body?.reason || "").trim().slice(0, 200);
  if (!reason) throw new PaymentError("Add a reason for the refund.", { status: 400, code: "REASON_REQUIRED" });
  const { payment, refund } = await refundOrder(req.params.id, { amount, reason, kind: "manual", actor: req.user._id, source: "admin" }, ctxOf(req, "admin"));
  await AuditLog.create({ actor: req.user._id, action: "payment.refund", entityType: "Order", entityId: req.params.id, metadata: { amount: refund?.amount, reason, status: refund?.status } });
  res.status(201).json({
    payment: publicPayment(payment, { admin: true }),
    refund,
    message: refund?.status === "processed" ? `Refund of ${rupees(refund.amount)} processed.` : refund?.status === "failed" ? `Refund failed: ${refund.failureReason}` : `Refund of ${rupees(refund?.amount)} initiated.`
  });
}));

export default router;
