import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import {
  User, Restaurant, FoodItem, Cart, Order, Payment, Delivery, Address,
  Review, Coupon, Notification, Settlement, SupportTicket, AuditLog, Favorite, Reservation, GroceryProduct, GroceryOrder, Membership, PickupRequest, Experience, ExperienceBooking
} from "./models.js";
import { protect, allow, asyncHandler } from "./middleware.js";
import { config } from "./config.js";
import engagementRoutes, { applyReferralOnSignup, optionalUserId, publicCoupon } from "./engagement.js";
import paymentRoutes, {
  CHECKOUT_METHODS, activeGateway, abortCheckout, announceOrders, cancelUnpaidCheckout, checkoutResponse, expireIfDue,
  hashCheckoutRequest, paymentEvent, paymentForOrder, publicPayment, pushEvent, readIdempotencyKey, recordCashCollected,
  refundGroceryOrder, replayCheckout, restockGrocery, settleCancelledOrder
} from "./payments.js";

const router = express.Router();
router.use(paymentRoutes);
router.use(engagementRoutes);
// Public campaign coupons, plus the caller's own unused prizes when a customer token is sent.
const usableCouponQuery = (code, userId) => ({ code, isActive: true, usedAt: null, $or: [{ owner: null }, ...(userId ? [{ owner: userId }] : [])] });
// Online orders stay hidden from the kitchen until they're paid. Legacy orders have no payment link.
const visibleToRestaurant = { $or: [{ placedAt: { $ne: null } }, { payment: null }] };
const hasActivePlus = userId => Membership.exists({ user: userId, status: "active", expiresAt: { $gt: new Date() } });
const rupees = amount => `₹${Math.round(Number(amount || 0) * 100) / 100}`;
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, profileImage: user.profileImage, isAvailable: user.isAvailable });
const tokenFor = user => jwt.sign({ sub: user._id, role: user.role }, config.accessSecret, { expiresIn: config.accessExpires });
const notify = async (user, title, message, type="info", data={}) => {
  const n = await Notification.create({ user, title, message, type, data });
  return n;
};
const emit = (req, room, event, payload) => req.app.get("io")?.to(room).emit(event, payload);

router.post("/chatbot", asyncHandler(async (req, res) => {
  if (!config.chatbotApiKey) return res.status(503).json({ message: "The AI assistant is not configured. Add CHATBOT_API_KEY to the server environment and restart the API." });
  if (!Array.isArray(req.body.messages) || req.body.messages.length === 0) return res.status(400).json({ message: "Send at least one chat message." });
  if (!["gemini", "openai-compatible"].includes(config.chatbotProvider)) {
    return res.status(503).json({ message: "Unsupported chatbot provider. Set CHATBOT_PROVIDER to gemini or openai-compatible." });
  }

  const messages = req.body.messages.slice(-12).map(message => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return null;
    const content = message.content.trim();
    return content && content.length <= 2000 ? { role: message.role, content } : null;
  });
  if (messages.some(message => !message) || messages.at(-1)?.role !== "user") {
    return res.status(400).json({ message: "Chat messages must be valid and end with a user message of at most 2,000 characters." });
  }

  const systemPrompt = "You are GoFoode's concise customer support assistant. Help with ordering, delivery, account navigation, reservations, and offers. Do not claim to access private account data or place/cancel orders. Direct account-specific requests to sign in and use the relevant dashboard. For health, allergy, or food-safety questions, advise the user to contact the restaurant or a qualified professional.";
  const isGemini = config.chatbotProvider === "gemini";
  const apiUrl = isGemini
    ? `${config.chatbotApiUrl.replace(/\/+$/, "")}/${encodeURIComponent(config.chatbotModel)}:generateContent`
    : config.chatbotApiUrl;
  const headers = isGemini
    ? { "Content-Type": "application/json", "x-goog-api-key": config.chatbotApiKey }
    : { Authorization: `Bearer ${config.chatbotApiKey}`, "Content-Type": "application/json" };
  const body = isGemini
    ? {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(message => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 }
      }
    : {
        model: config.chatbotModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      };

  let upstream;
  try {
    upstream = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const errorCode = error?.cause?.code;
    console.error(`Chatbot provider request ${timedOut ? "timed out" : "failed"}${errorCode ? ` (${errorCode})` : ""}.`);
    return res.status(502).json({
      message: timedOut
        ? "Gemini took too long to respond. Please try again shortly."
        : "The AI assistant could not connect to Gemini. Check the server's internet connection and try again."
    });
  }
  if (!upstream.ok) {
    let errorData;
    try {
      errorData = await upstream.json();
    } catch {
      return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}). Check the API key and chatbot model configuration.` });
    }
    let detail = errorData?.error?.message || errorData?.message || "";
    if (typeof detail === "string" && detail) {
      detail = detail.replaceAll(config.chatbotApiKey, "[redacted]").slice(0, 300);
      return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}): ${detail}` });
    }
    return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}). Check the API key and chatbot model configuration.` });
  }
  let data;
  try { data = await upstream.json(); }
  catch { return res.status(502).json({ message: "The AI provider returned an unreadable response. Please try again." }); }
  const reply = isGemini
    ? data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("")
    : data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) return res.status(502).json({ message: "The AI provider returned an empty reply. Please try again." });
  res.json({ reply: reply.trim() });
}));

router.post("/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Name, email and password (8+ characters) are required" });
  if (role && role !== "customer") return res.status(403).json({ message: "Use the relevant onboarding process for this role" });
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 12), role: "customer" });
  let welcomeCoupon = null;
  if (req.body.referralCode) welcomeCoupon = await applyReferralOnSignup(user, req.body.referralCode).catch(error => { console.error("[rewards] referral signup failed:", error.message); return null; });
  res.status(201).json({ user: safeUser(user), accessToken: tokenFor(user), welcomeCoupon: welcomeCoupon ? publicCoupon(welcomeCoupon) : null });
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || "").toLowerCase() }).select("+password");
  if (!user || !user.isActive || !(await bcrypt.compare(password || "", user.password))) return res.status(401).json({ message: "Invalid email or password" });
  res.json({ user: safeUser(user), accessToken: tokenFor(user) });
}));
router.get("/auth/me", protect, (req, res) => res.json({ user: safeUser(req.user) }));
router.patch("/profile", protect, asyncHandler(async (req, res) => {
  const { profileImage } = req.body;
  if (typeof profileImage !== "string" || profileImage.length > 950000) {
    return res.status(400).json({ message: "Choose an image smaller than 680 KB." });
  }
  if (profileImage && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(profileImage)) {
    return res.status(400).json({ message: "Profile photos must be a JPEG, PNG or WebP image." });
  }
  req.user.profileImage = profileImage;
  await req.user.save();
  res.json({ user: safeUser(req.user) });
}));

router.post("/auth/onboard", asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!["restaurant_owner", "delivery_partner"].includes(role)) return res.status(400).json({ message: "Invalid onboarding role" });
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Complete all required fields" });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name, email, phone, role, password: await bcrypt.hash(password, 12) });
  res.status(201).json({ user: safeUser(user), accessToken: tokenFor(user) });
}));

router.get("/restaurants", asyncHandler(async (req, res) => {
  const { search, cuisine } = req.query;
  const query = { status: "approved", isOpen: true, name: { $not: /^DineFlow Demo\b/i } };
  if (search) query.$or = [{ name: new RegExp(String(search), "i") }, { cuisine: new RegExp(String(search), "i") }];
  if (cuisine) query.cuisine = new RegExp(String(cuisine), "i");
  const rows = await Restaurant.find(query).sort({ rating: -1, createdAt: -1 }).limit(100);
  res.json(rows);
}));
router.get("/restaurants/:id", asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, status: "approved", isOpen: true, name: { $not: /^DineFlow Demo\b/i } });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  const menu = await FoodItem.find({ restaurant: restaurant._id, isAvailable: true });
  res.json({ restaurant, menu });
}));
router.get("/food-items", asyncHandler(async (req, res) => {
  const query = { isAvailable: true };
  if (req.query.search) query.name = new RegExp(String(req.query.search), "i");
  if (req.query.restaurant) query.restaurant = req.query.restaurant;
  const items = await FoodItem.find(query).populate("restaurant", "name rating deliveryTime status cuisine isOpen").limit(100);
  res.json(items.filter(x => x.restaurant?.status === "approved" && x.restaurant?.isOpen && !/^DineFlow Demo\b/i.test(x.restaurant.name)));
}));

router.post("/restaurants", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const { name, description, cuisine, street, city, state, postalCode } = req.body;
  if (!name || !city) return res.status(400).json({ message: "Restaurant name and city are required" });
  const restaurant = await Restaurant.create({
    owner: req.user._id, name, description,
    cuisine: Array.isArray(cuisine) ? cuisine : String(cuisine || "").split(",").map(x => x.trim()).filter(Boolean),
    address: { street, city, state, postalCode }
  });
  await AuditLog.create({ actor: req.user._id, action: "restaurant.created", entityType: "Restaurant", entityId: restaurant._id });
  res.status(201).json(restaurant);
}));
router.get("/restaurant/mine", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  res.json(await Restaurant.find({ owner: req.user._id }).sort({ createdAt: -1 }));
}));
router.patch("/restaurant/:id/availability", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  if (typeof req.body.isOpen !== "boolean") return res.status(400).json({ message: "isOpen must be true or false." });
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, status: "approved" },
    { isOpen: req.body.isOpen },
    { new: true }
  );
  if (!restaurant) return res.status(404).json({ message: "Approved restaurant not found." });
  res.json(restaurant);
}));
router.get("/restaurant/reviews", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await Review.find({ restaurant: { $in: restaurants.map(restaurant => restaurant._id) } })
    .populate("user", "name profileImage")
    .populate("restaurant", "name")
    .sort({ createdAt: -1 })
    .limit(200));
}));
router.get("/restaurant/dashboard", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).select("_id name status isOpen coverImage cuisine");
  const ids = restaurants.map(r => r._id);
  const [orders, recentOrders, menuItems] = await Promise.all([
    Order.find({ restaurant: { $in: ids }, ...visibleToRestaurant }),
    Order.find({ restaurant: { $in: ids }, ...visibleToRestaurant }).populate("customer", "name").populate("restaurant", "name").sort({ createdAt: -1 }).limit(6),
    FoodItem.countDocuments({ restaurant: { $in: ids } })
  ]);
  const revenue = orders.filter(o => o.paymentStatus === "paid" || o.orderStatus === "delivered").reduce((s,o) => s + o.totalAmount, 0);
  res.json({ restaurants, totalOrders: orders.length, pendingOrders: orders.filter(o => ["placed","accepted","preparing","ready"].includes(o.orderStatus)).length, completedOrders: orders.filter(o => o.orderStatus === "delivered").length, revenue, menuItems, recentOrders });
}));
router.post("/restaurant/menu", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const { restaurant, name, description, price, discountPrice, image, foodType, category, dietaryTags, calories, spiceLevel, ingredients, allergens, portionSize, preparationTime, isBestseller } = req.body;
  const owned = await Restaurant.findOne({ _id: restaurant, owner: req.user._id, status: "approved" });
  if (!owned) return res.status(403).json({ message: "Approved restaurant ownership required" });
  if (!String(name||"").trim() || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ message: "Valid name and price are required" });
  if (discountPrice !== undefined && discountPrice !== null && discountPrice !== "" && (!Number.isFinite(Number(discountPrice)) || Number(discountPrice) < 0 || Number(discountPrice) > Number(price))) return res.status(400).json({ message: "Offer price must be a valid amount no greater than the menu price." });
  res.status(201).json(await FoodItem.create({ restaurant, name:String(name).trim(), description, price:Number(price), discountPrice:discountPrice===""?null:discountPrice, image, foodType, category:category||null, dietaryTags, calories, spiceLevel, ingredients, allergens, portionSize, preparationTime, isBestseller }));
}));
router.get("/restaurant/menu", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const owned = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await FoodItem.find({ restaurant: { $in: owned.map(x => x._id) } }).populate("restaurant", "name"));
}));
router.patch("/restaurant/menu/:id", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const item = await FoodItem.findById(req.params.id).populate("restaurant");
  if (!item || String(item.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Menu item not found" });
  const allowed = ["name","description","price","image","foodType","isAvailable","discountPrice","preparationTime","calories","spiceLevel","ingredients","allergens","isBestseller","portionSize","dietaryTags"];
  allowed.forEach(k => { if (req.body[k] !== undefined) item[k] = req.body[k]; });
  if (!String(item.name||"").trim() || !Number.isFinite(Number(item.price)) || Number(item.price)<0 || (item.discountPrice!=null && Number(item.discountPrice)>Number(item.price))) return res.status(400).json({message:"Enter a valid item name and price. An offer price cannot exceed the menu price."});
  await item.save(); res.json(item);
}));
router.delete("/restaurant/menu/:id", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const item = await FoodItem.findById(req.params.id).populate("restaurant");
  if (!item || String(item.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Menu item not found" });
  await item.deleteOne(); res.json({ message: "Menu item deleted" });
}));
router.get("/restaurant/orders", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const owned = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await Order.find({ restaurant: { $in: owned.map(x => x._id) }, ...visibleToRestaurant }).populate("customer", "name phone").populate("restaurant", "name").sort({ createdAt: -1 }));
}));
router.patch("/restaurant/orders/:id/status", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("restaurant");
  if (!order || String(order.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Order not found" });
  const transitions = { placed: ["accepted","rejected"], accepted: ["preparing"], preparing: ["ready"], ready: [] };
  const next = req.body.status;
  if (!(transitions[order.orderStatus] || []).includes(next)) return res.status(400).json({ message: "Invalid order status transition" });
  const changes = { orderStatus: next };
  if (next === "rejected") Object.assign(changes, { cancelledAt: new Date(), cancelledBy: "restaurant", cancellationReason: String(req.body.reason || "").trim().slice(0, 200) || "The restaurant couldn't accept this order" });
  // Conditional on the status we validated, so a simultaneous customer cancellation can't be overwritten.
  const updated = await Order.findOneAndUpdate({ _id: order._id, orderStatus: order.orderStatus }, { $set: changes }, { new: true });
  if (!updated) return res.status(409).json({ message: "This order was just updated. Refresh to see its latest status." });
  let refundNote = "";
  if (next === "rejected") {
    const { refund } = await settleCancelledOrder(updated, { reason: "Order rejected by the restaurant", source: "restaurant", actor: req.user._id }, { io: req.app.get("io") });
    if (refund) refundNote = ` A refund of ${rupees(refund.amount)} has been ${refund.status === "processed" ? "processed" : "initiated"} to your original payment method.`;
  }
  await notify(order.customer, "Order update", `Your order ${order.orderNumber} is ${next}.${refundNote}`, "order", { orderId: order._id });
  emit(req, `user:${order.customer}`, "order:updated", { orderId: order._id, status: next });
  if (next === "ready") {
    const delivery = await Delivery.findOneAndUpdate({ order: order._id }, { $setOnInsert: { order: order._id, pickupLocation: order.restaurant.address, dropLocation: order.deliveryAddress } }, { upsert: true, new: true });
    await Order.updateOne({ _id: order._id }, { $set: { delivery: delivery._id } });
    updated.delivery = delivery._id;
    const availablePartners = await User.find({ role: "delivery_partner", isActive: true, isAvailable: true }).select("_id");
    await Promise.all(availablePartners.map(partner => notify(partner._id, "Delivery available", `Order ${order.orderNumber} is ready for pickup from ${order.restaurant.name}.`, "delivery", { orderId: order._id, deliveryId: delivery._id })));
    emit(req, "role:delivery_partner", "delivery:available", { orderId: order._id, deliveryId: delivery._id, orderNumber: order.orderNumber });
  }
  res.json(updated);
}));

router.get("/cart", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.foodItem").populate("items.restaurant");
  res.json(cart || { user: req.user._id, items: [] });
}));
router.post("/cart/items", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { foodItemId, quantity = 1 } = req.body;
  const food = await FoodItem.findById(foodItemId).populate("restaurant");
  if (!food || !food.isAvailable || food.restaurant.status !== "approved" || !food.restaurant.isOpen) return res.status(404).json({ message: "Food item unavailable" });
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
  const existing = cart.items.find(i => String(i.foodItem) === String(food._id));
  if (existing) existing.quantity += Math.max(1, Number(quantity));
  else cart.items.push({ foodItem: food._id, restaurant: food.restaurant._id, quantity: Math.max(1, Number(quantity)) });
  await cart.save();
  res.json(await Cart.findById(cart._id).populate("items.foodItem").populate("items.restaurant"));
}));
router.patch("/cart/items/:foodId", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });
  const item = cart.items.find(i => String(i.foodItem) === req.params.foodId);
  if (!item) return res.status(404).json({ message: "Cart item not found" });
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ message: "Quantity must be between 1 and 20" });
  item.quantity = quantity; await cart.save();
  res.json(await Cart.findById(cart._id).populate("items.foodItem").populate("items.restaurant"));
}));
router.delete("/cart/items/:foodId", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) { cart.items = cart.items.filter(i => String(i.foodItem) !== req.params.foodId); await cart.save(); }
  res.json(cart || { items: [] });
}));

const CHECKOUT_ADDRESS_FIELDS = ["name", "phone", "street", "city", "state", "postalCode", "instructions"];
function cleanDeliveryAddress(address = {}) {
  const clean = {};
  for (const field of CHECKOUT_ADDRESS_FIELDS) if (address?.[field] != null) clean[field] = String(address[field]).trim().slice(0, 300);
  for (const field of ["latitude", "longitude"]) {
    const value = address?.[field];
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) clean[field] = Number(value);
  }
  return clean;
}
const round2 = value => Math.round(Number(value || 0) * 100) / 100;

// Checkout is idempotent: the client sends an Idempotency-Key, and a retried request (double click, flaky
// network, timeout) gets the original result back instead of creating duplicate orders.
router.post("/checkout", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { paymentMethod = "cod", couponCode = "", expectedTotal } = req.body;
  const deliveryAddress = cleanDeliveryAddress(req.body.deliveryAddress);
  if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.phone) return res.status(400).json({ message: "A complete delivery address is required" });
  if (!CHECKOUT_METHODS.includes(paymentMethod)) return res.status(400).json({ message: "Unsupported payment method" });
  const online = paymentMethod !== "cod";
  const gateway = online ? activeGateway() : null;
  if (online && !gateway) return res.status(503).json({ code: "GATEWAY_UNAVAILABLE", message: "Online payments are unavailable right now. Choose cash on delivery to place your order." });
  const idempotencyKey = readIdempotencyKey(req);
  if (idempotencyKey === false) return res.status(400).json({ code: "INVALID_IDEMPOTENCY_KEY", message: "Invalid checkout request key. Refresh the page and try again." });
  const code = String(couponCode || "").trim().toUpperCase();
  const expected = expectedTotal === undefined || expectedTotal === null || expectedTotal === "" ? null : Number(expectedTotal);
  const requestHash = hashCheckoutRequest({ deliveryAddress, paymentMethod, couponCode: code, expectedTotal: expected });
  if (idempotencyKey) {
    const existing = await Payment.findOne({ customer: req.user._id, idempotencyKey });
    if (existing) return replayCheckout(existing, requestHash, res);
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate("items.foodItem").populate("items.restaurant");
  if (!cart?.items?.length) {
    // A concurrent request with this key may have just claimed the cart; answer with its result instead.
    if (idempotencyKey) {
      const existing = await Payment.findOne({ customer: req.user._id, idempotencyKey });
      if (existing) return replayCheckout(existing, requestHash, res);
    }
    return res.status(400).json({ code: "CART_EMPTY", message: "Your cart is empty" });
  }
  const grouped = new Map();
  for (const line of cart.items) {
    if (!line.foodItem || !line.foodItem.isAvailable || !line.restaurant || line.restaurant.status !== "approved" || !line.restaurant.isOpen) return res.status(400).json({ code: "ITEM_UNAVAILABLE", message: "A cart item is no longer available" });
    const key = String(line.restaurant._id);
    if (!grouped.has(key)) grouped.set(key, { restaurant: line.restaurant, items: [] });
    const price = line.foodItem.discountPrice ?? line.foodItem.price;
    grouped.get(key).items.push({ foodItem: line.foodItem._id, name: line.foodItem.name, quantity: line.quantity, unitPrice: price, subtotal: price * line.quantity });
  }
  let coupon = null;
  if (code) {
    coupon = await Coupon.findOne(usableCouponQuery(code, req.user._id));
    if (!coupon || (coupon.expiresAt && coupon.expiresAt < new Date())) return res.status(400).json({ code: "COUPON_INVALID", message: "This coupon is invalid, expired or already used" });
  }
  const cartSubtotal = cart.items.reduce((sum,line) => sum + (line.foodItem.discountPrice ?? line.foodItem.price) * line.quantity, 0);
  if (coupon && cartSubtotal < coupon.minOrder) return res.status(400).json({ code: "COUPON_MINIMUM", message: `Coupon requires a minimum order of ₹${coupon.minOrder}` });

  // Work out the whole bill before writing anything. GoFoode Plus members never pay a delivery fee.
  const plusMember = await hasActivePlus(req.user._id);
  const plans = [];
  for (const group of grouped.values()) {
    const subtotal = group.items.reduce((s,i) => s + i.subtotal, 0);
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const deliveryFee = plusMember ? 0 : 35;
    const eligibleDiscount = coupon && plans.length === 0
      ? Math.min(coupon.discountType === "percentage" ? cartSubtotal * coupon.discountValue / 100 : coupon.discountValue, coupon.maxDiscount || cartSubtotal, subtotal + tax + deliveryFee)
      : 0;
    const discount = Math.round(eligibleDiscount * 100) / 100;
    plans.push({ restaurant: group.restaurant._id, items: group.items, subtotal, tax, deliveryFee, discount, totalAmount: round2(Math.max(0, subtotal + tax + deliveryFee - discount)) });
  }
  const total = round2(plans.reduce((s, plan) => s + plan.totalAmount, 0));
  // Never charge an amount the customer didn't see: prices may have changed since the bill was shown.
  if (expected !== null && (!Number.isFinite(expected) || Math.abs(expected - total) >= 1)) {
    return res.status(409).json({ code: "PRICE_CHANGED", totalAmount: total, message: `Prices in your cart changed. Your new total is ${rupees(total)}. Check the bill and place your order again.` });
  }
  if (online && total < 1) return res.status(400).json({ code: "AMOUNT_TOO_LOW", message: "Orders under ₹1 can't be paid online. Choose cash on delivery." });

  const groupOrderId = `GF-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const windowMinutes = config.payments.windowMinutes;
  // The payment record doubles as the idempotency lock: a concurrent duplicate fails on the unique key.
  let payment;
  try {
    payment = await Payment.create({
      groupOrderId, customer: req.user._id, amount: total, method: paymentMethod, gateway: online ? gateway.name : "cash",
      status: "created", idempotencyKey: idempotencyKey || undefined, requestHash,
      cartSnapshot: cart.items.map(line => ({ foodItem: line.foodItem._id, restaurant: line.restaurant._id, quantity: line.quantity })),
      events: [paymentEvent("checkout.started", `Checkout started for ${rupees(total)}.`, "customer")]
    });
  } catch (error) {
    if (error.code === 11000 && idempotencyKey) {
      const existing = await Payment.findOne({ customer: req.user._id, idempotencyKey });
      if (existing) return replayCheckout(existing, requestHash, res);
    }
    throw error;
  }

  // Claim exactly the cart lines being ordered. If another tab changed the cart meanwhile, stop rather than order stale items.
  const claimed = await Cart.collection.updateOne(
    { _id: cart._id, items: { $all: cart.items.map(line => ({ $elemMatch: { _id: line._id, quantity: line.quantity } })) } },
    { $pull: { items: { _id: { $in: cart.items.map(line => line._id) } } }, $set: { updatedAt: new Date() } }
  );
  if (!claimed.modifiedCount) {
    await abortCheckout(payment, "The cart changed while the order was being placed.", { restoreCart: false });
    return res.status(409).json({ code: "CART_CHANGED", message: "Your cart changed while we were placing the order. Check it and try again." });
  }
  // A personal prize coupon can be spent once: reserve it atomically for this checkout.
  if (coupon?.owner) {
    const reserved = await Coupon.findOneAndUpdate({ _id: coupon._id, owner: req.user._id, usedAt: null }, { $set: { usedAt: new Date(), usedFor: groupOrderId } });
    if (!reserved) {
      await abortCheckout(payment, "The coupon was already used.");
      return res.status(409).json({ code: "COUPON_USED", message: "That reward coupon was just used on another order. Remove it and try again." });
    }
  }

  let orders;
  try {
    orders = await Order.insertMany(plans.map((plan, index) => ({
      ...plan, groupOrderId, orderNumber: `${groupOrderId}-${index + 1}`, customer: req.user._id, deliveryAddress,
      payment: payment._id, paymentMethod, paymentStatus: "pending",
      orderStatus: online ? "awaiting_payment" : "placed", placedAt: online ? null : new Date()
    })));
    const finalized = await Payment.findOneAndUpdate(
      { _id: payment._id, status: "created" },
      {
        $set: { status: "pending", orders: orders.map(order => order._id), expiresAt: online ? new Date(Date.now() + windowMinutes * 60000) : null },
        $push: pushEvent(paymentEvent("checkout.created", `${orders.length} ${orders.length === 1 ? "order" : "orders"} created. ${online ? `Waiting up to ${windowMinutes} minutes for payment.` : "Pay cash on delivery."}`))
      },
      { new: true }
    );
    if (!finalized) throw new Error("Checkout was interrupted. Please try again.");
    payment = finalized;
  } catch (error) {
    await abortCheckout(payment, `Checkout failed: ${error.message}`).catch(abortError => console.error("[payments] checkout rollback failed:", abortError.message));
    throw error;
  }

  // The order is committed. Everything below is best-effort and must not fail the response.
  if (coupon && orders.some(order => order.discount > 0)) await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } }).catch(() => {});
  if (!online) await announceOrders(orders, req.app.get("io")).catch(error => console.error("[orders] restaurant notification failed:", error.message));
  res.status(201).json(checkoutResponse(payment, orders));
}));
router.get("/orders/my-orders", protect, allow("customer"), asyncHandler(async (req, res) => {
  res.json(await Order.find({ customer: req.user._id }).populate("restaurant", "name logo address coverImage cuisine").populate("delivery").sort({ createdAt: -1 }));
}));
const loadOrderForViewer = id => Order.findById(id).populate("restaurant", "name address owner").populate("customer", "name phone").populate({ path: "delivery", populate: { path: "deliveryPartner", select: "name phone profileImage" } });
router.get("/orders/:id", protect, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Order not found" });
  let order = await loadOrderForViewer(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });
  const permitted = req.user.role === "admin" || String(order.customer?._id || order.customer) === String(req.user._id) || (req.user.role === "restaurant_owner" && String(order.restaurant?.owner) === String(req.user._id));
  if (!permitted) return res.status(403).json({ message: "Forbidden" });
  // Expire an overdue payment on read, so the page never offers to pay for a checkout that has closed.
  let payment = await paymentForOrder(order);
  if (payment) {
    const before = payment.status;
    payment = await expireIfDue(payment, { io: req.app.get("io"), source: "system" });
    if (payment?.status !== before) order = await loadOrderForViewer(req.params.id);
  }
  const customerReview = req.user.role === "customer" ? await Review.findOne({ order: order._id, user: req.user._id }) : null;
  const paymentView = req.user.role === "restaurant_owner"
    ? (payment ? { status: payment.status, method: payment.method } : null)
    : publicPayment(payment, { admin: req.user.role === "admin" });
  res.json({ ...order.toObject(), customerReview, payment: paymentView });
}));
// Customers can cancel until the restaurant accepts. Paid orders are refunded automatically.
router.patch("/orders/:id/cancel", protect, allow("customer"), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Order not found" });
  const reason = String(req.body.reason || "").trim().slice(0, 200) || "Cancelled by customer";
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  const ctx = { io: req.app.get("io"), source: "customer" };
  if (order.orderStatus === "awaiting_payment") {
    const { payment, restored } = await cancelUnpaidCheckout(order.payment, req.user, { reason }, ctx);
    return res.json({ message: `Checkout cancelled. Nothing was charged.${restored ? " Your items are back in your cart." : ""}`, payment: publicPayment(payment) });
  }
  const cancelled = await Order.findOneAndUpdate(
    { _id: order._id, customer: req.user._id, orderStatus: "placed" },
    { $set: { orderStatus: "cancelled", cancelledAt: new Date(), cancelledBy: "customer", cancellationReason: reason } },
    { new: true }
  ).populate("restaurant", "owner name");
  if (!cancelled) return res.status(409).json({ code: "NOT_CANCELLABLE", message: "The restaurant has already started on this order, so it can't be cancelled here. Contact support if you need help." });
  const { refund, error } = await settleCancelledOrder(cancelled, { reason, source: "customer", actor: req.user._id }, ctx);
  if (cancelled.restaurant?.owner) {
    await notify(cancelled.restaurant.owner, "Order cancelled", `Order ${cancelled.orderNumber} was cancelled by the customer.`, "order", { orderId: cancelled._id });
    emit(req, `user:${cancelled.restaurant.owner}`, "order:updated", { orderId: cancelled._id, status: "cancelled" });
  }
  const message = refund
    ? `Order cancelled. A refund of ${rupees(refund.amount)} has been ${refund.status === "processed" ? "processed" : "initiated"} to your original payment method.`
    : error ? "Order cancelled. Your refund couldn't start automatically, so our team has been alerted and will process it." : "Order cancelled.";
  res.json({ message, refund });
}));

router.get("/delivery/assignments", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  res.json(await Delivery.find({ $or: [{ deliveryPartner: req.user._id }, { deliveryPartner: null }] }).populate({ path: "order", populate: [{ path: "restaurant", select: "name address" }, { path: "customer", select: "name phone" }] }).sort({ createdAt: -1 }));
}));
router.get("/delivery/genie-requests", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  res.json(await PickupRequest.find({$or:[{deliveryPartner:req.user._id},{deliveryPartner:null}],status:{$in:["requested","accepted","picked_up","on_the_way"]}})
    .populate("user","name phone")
    .populate("deliveryPartner","name phone")
    .sort({createdAt:-1})
    .limit(100));
}));
router.patch("/delivery/genie-requests/:id/accept", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const driver=await User.findOneAndUpdate({_id:req.user._id,isAvailable:true},{isAvailable:false},{new:true});
  if(!driver) return res.status(409).json({message:"Go online before accepting a pickup request."});
  const request=await PickupRequest.findOneAndUpdate(
    {_id:req.params.id,status:"requested",deliveryPartner:null},
    {deliveryPartner:req.user._id,status:"accepted"},
    {new:true}
  ).populate("user","name phone").populate("deliveryPartner","name phone");
  if(!request){
    await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
    return res.status(409).json({message:"This pickup request is no longer available."});
  }
  await notify(request.user._id,"Pickup request accepted","A delivery partner accepted your pickup and drop request.","delivery",{requestId:request._id});
  res.json(request);
}));
router.patch("/delivery/genie-requests/:id/status", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const request=await PickupRequest.findOne({_id:req.params.id,deliveryPartner:req.user._id});
  if(!request) return res.status(404).json({message:"Pickup request not found."});
  const next=req.body.status;
  const transitions={accepted:"picked_up",picked_up:"on_the_way",on_the_way:"delivered"};
  if(transitions[request.status]!==next) return res.status(400).json({message:"Pickup requests must progress from accepted to picked up, on the way, and delivered."});
  request.status=next;
  await request.save();
  await notify(request.user,"Pickup delivery update",`Your pickup and drop request is ${next.replaceAll("_"," ")}.`,"delivery",{requestId:request._id});
  if(next==="delivered") await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
  res.json(request);
}));
router.post("/delivery/genie-location", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const {requestId,longitude,latitude}=req.body;
  if(!mongoose.isValidObjectId(requestId)||!Number.isFinite(Number(longitude))||!Number.isFinite(Number(latitude))||Math.abs(Number(longitude))>180||Math.abs(Number(latitude))>90) return res.status(400).json({message:"Valid pickup request ID and GPS coordinates are required."});
  const request=await PickupRequest.findOne({_id:requestId,deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}});
  if(!request) return res.status(404).json({message:"Active pickup request not found."});
  request.currentLocation={type:"Point",coordinates:[Number(longitude),Number(latitude)]};
  await request.save();
  res.json({message:"Pickup delivery location updated."});
}));
router.get("/delivery/availability", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const activeDelivery = await Delivery.exists({
    deliveryPartner: req.user._id,
    status: { $in: ["accepted", "picked_up", "on_the_way"] }
  });
  const activePickup=await PickupRequest.exists({deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}});
  res.json({ isAvailable: req.user.isAvailable, hasActiveDelivery: Boolean(activeDelivery||activePickup) });
}));
router.patch("/delivery/availability", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  if (typeof req.body.isAvailable !== "boolean") return res.status(400).json({ message: "isAvailable must be true or false." });
  if (!req.body.isAvailable && (await Delivery.exists({
    deliveryPartner: req.user._id,
    status: { $in: ["accepted", "picked_up", "on_the_way"] }
  }) || await PickupRequest.exists({deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}}))) return res.status(409).json({ message: "Complete your active delivery before going offline." });
  const user = await User.findByIdAndUpdate(req.user._id, { isAvailable: req.body.isAvailable }, { new: true }).select("isAvailable");
  res.json({ isAvailable: user.isAvailable });
}));
router.patch("/delivery/assignments/:id/accept", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const driver=await User.findOneAndUpdate({_id:req.user._id,isAvailable:true},{isAvailable:false},{new:true});
  if (!driver) return res.status(409).json({ message: "Go online before accepting a delivery." });
  const delivery = await Delivery.findOneAndUpdate({ _id: req.params.id, deliveryPartner: null }, { deliveryPartner: req.user._id, status: "accepted" }, { new: true });
  if (!delivery) {
    await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
    return res.status(409).json({ message: "Assignment is no longer available" });
  }
  const order = await Order.findById(delivery.order).populate("restaurant", "owner name");
  if (order) {
    await notify(order.customer, "Delivery partner assigned", `A delivery partner accepted order ${order.orderNumber}. You can follow updates and shared GPS on the order tracking page.`, "delivery", { orderId: order._id });
    await notify(order.restaurant.owner, "Delivery partner assigned", `A delivery partner accepted order ${order.orderNumber}.`, "delivery", { orderId: order._id });
    emit(req, `user:${order.customer}`, "delivery:updated", { orderId: order._id, status: "accepted" });
  }
  res.json(delivery);
}));
router.patch("/delivery/assignments/:id/status", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const delivery = await Delivery.findOne({ _id: req.params.id, deliveryPartner: req.user._id });
  if (!delivery) return res.status(404).json({ message: "Delivery not found" });
  const transitions = { accepted: ["picked_up"], picked_up: ["on_the_way"], on_the_way: ["delivered"] };
  const next = req.body.status;
  if (!(transitions[delivery.status] || []).includes(next)) return res.status(400).json({ message: "Invalid delivery transition" });
  delivery.status = next;
  if (next === "delivered") delivery.actualDeliveryTime = new Date();
  await delivery.save();
  const order = await Order.findById(delivery.order);
  const collectsCash = next === "delivered" && order.paymentMethod === "cod";
  order.orderStatus = next; if (collectsCash) order.paymentStatus = "paid";
  await order.save();
  if (collectsCash) await recordCashCollected(order).catch(error => console.error("[payments] cash collection not recorded:", error.message));
  if (next === "delivered") await User.findByIdAndUpdate(req.user._id, { isAvailable: true });
  await notify(order.customer, "Delivery update", `Your order is ${next.replace("_"," ")}.`, "delivery", { orderId: order._id });
  emit(req, `user:${order.customer}`, "delivery:updated", { orderId: order._id, status: next });
  res.json(delivery);
}));
router.post("/delivery/location", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const { deliveryId, longitude, latitude } = req.body;
  if (!deliveryId || !Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude)) || Math.abs(Number(longitude)) > 180 || Math.abs(Number(latitude)) > 90) return res.status(400).json({ message: "Valid delivery ID and GPS coordinates are required" });
  const delivery = await Delivery.findOne({ _id: deliveryId, deliveryPartner: req.user._id, status: { $in: ["accepted","picked_up","on_the_way"] } });
  if (!delivery) return res.status(404).json({ message: "Delivery not found" });
  delivery.currentLocation = { type: "Point", coordinates: [Number(longitude), Number(latitude)] };
  await delivery.save();
  const order = await Order.findById(delivery.order);
  emit(req, `user:${order.customer}`, "delivery:location", { orderId: order._id, coordinates: delivery.currentLocation.coordinates, updatedAt: new Date() });
  res.json({ message: "Location updated" });
}));
router.get("/delivery/earnings", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const deliveries = await Delivery.find({ deliveryPartner: req.user._id, status: "delivered" }).populate({ path: "order", populate: { path: "restaurant", select: "name" } }).sort({ actualDeliveryTime: -1 }).limit(200);
  res.json({ completed: deliveries.length, estimatedEarnings: deliveries.length * 35, deliveries });
}));

router.get("/reviews/featured", asyncHandler(async (_req, res) => {
  const reviews = await Review.find({ comment: { $regex: /\S/ } })
    .populate("user", "name profileImage")
    .populate("restaurant", "name")
    .sort({ createdAt: -1 })
    .limit(6);
  res.json(reviews);
}));
router.post("/reviews", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { restaurantId, orderId, rating, comment } = req.body;
  if (!mongoose.isValidObjectId(restaurantId) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || typeof comment !== "string" || comment.trim().length > 1000) return res.status(400).json({ message: "Choose a restaurant, a rating from 1 to 5, and a comment of up to 1,000 characters." });
  if (orderId) {
    const order = await Order.findOne({ _id: orderId, customer: req.user._id, orderStatus: "delivered", restaurant: restaurantId });
    if (!order) return res.status(403).json({ message: "Only completed orders can be reviewed for that restaurant." });
    if (await Review.exists({ order: order._id, user: req.user._id })) return res.status(409).json({ message: "You already reviewed this order." });
  }
  const review = await Review.create({ user: req.user._id, restaurant: restaurantId, order: orderId, rating: Number(rating), comment: comment.trim() });
  const stats = await Review.aggregate([{ $match: { restaurant: review.restaurant } }, { $group: { _id: "$restaurant", average: { $avg: "$rating" } } }]);
  if (stats[0]) await Restaurant.findByIdAndUpdate(restaurantId, { rating: Math.round(stats[0].average * 10) / 10 });
  res.status(201).json(review);
}));
router.get("/notifications", protect, asyncHandler(async (req, res) => res.json(await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50))));
router.patch("/notifications/:id/read", protect, asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { readAt: new Date() }, { new: true });
  if (!n) return res.status(404).json({ message: "Notification not found" });
  res.json(n);
}));
router.post("/support", protect, asyncHandler(async (req, res) => res.status(201).json(await SupportTicket.create({ user: req.user._id, subject: req.body.subject, message: req.body.message }))));


// Customer convenience features: saved places, favourites, reservations, offers and membership.
router.get("/addresses", protect, allow("customer"), asyncHandler(async (req,res) =>
  res.json(await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 }))
));
router.post("/addresses", protect, allow("customer"), asyncHandler(async (req,res) => {
  const { label="Home", name, phone, street, city, state, postalCode, isDefault=false } = req.body;
  if (!name || !phone || !street || !city) return res.status(400).json({message:"Name, phone, street and city are required"});
  if (isDefault) await Address.updateMany({user:req.user._id},{isDefault:false});
  res.status(201).json(await Address.create({user:req.user._id,label,name,phone,street,city,state,postalCode,isDefault}));
}));
router.patch("/addresses/:id", protect, allow("customer"), asyncHandler(async (req,res) => {
  const address=await Address.findOne({_id:req.params.id,user:req.user._id});
  if(!address) return res.status(404).json({message:"Address not found"});
  if(req.body.isDefault) await Address.updateMany({user:req.user._id},{isDefault:false});
  ["label","name","phone","street","city","state","postalCode","isDefault"].forEach(k=>{if(req.body[k]!==undefined)address[k]=req.body[k]});
  await address.save(); res.json(address);
}));
router.delete("/addresses/:id", protect, allow("customer"), asyncHandler(async(req,res)=>{
  await Address.deleteOne({_id:req.params.id,user:req.user._id}); res.json({message:"Address deleted"});
}));

router.get("/favorites", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await Favorite.find({user:req.user._id}).populate("restaurant").sort({createdAt:-1}))
));
router.post("/favorites/:restaurantId", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const restaurant=await Restaurant.findOne({_id:req.params.restaurantId,status:"approved"});
  if(!restaurant) return res.status(404).json({message:"Restaurant not found"});
  await Favorite.updateOne({user:req.user._id,restaurant:restaurant._id},{$setOnInsert:{user:req.user._id,restaurant:restaurant._id}},{upsert:true});
  res.json({message:"Saved to favourites"});
}));
router.delete("/favorites/:restaurantId", protect, allow("customer"), asyncHandler(async(req,res)=>{
  await Favorite.deleteOne({user:req.user._id,restaurant:req.params.restaurantId}); res.json({message:"Removed from favourites"});
}));

router.get("/reservations/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await Reservation.find({user:req.user._id}).populate("restaurant","name address coverImage").sort({date:1}))
));
router.post("/reservations", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const {restaurantId,date,time}=req.body;
  const guests=Math.floor(Number(req.body.guests??2));
  const occasion=String(req.body.occasion||"").trim().slice(0,60), notes=String(req.body.notes||"").trim().slice(0,300);
  if(!mongoose.isValidObjectId(restaurantId)) return res.status(400).json({message:"Choose a restaurant"});
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time||""))) return res.status(400).json({message:"Choose a time for your table"});
  if(!Number.isInteger(guests)||guests<1||guests>20) return res.status(400).json({message:"Tables can be booked for 1 to 20 guests"});
  const restaurant=await Restaurant.findOne({_id:restaurantId,status:"approved"});
  if(!restaurant) return res.status(404).json({message:"Restaurant not found"});
  const when=new Date(date);
  const today=new Date(new Date().setHours(0,0,0,0));
  if(Number.isNaN(when.getTime()) || when < today) return res.status(400).json({message:"Choose a future date"});
  if(when > new Date(today.getTime()+60*86400000)) return res.status(400).json({message:"Tables can be requested up to 60 days ahead"});
  // A double-tap or a second tab shouldn't send the restaurant two identical requests.
  const duplicate=await Reservation.exists({user:req.user._id,restaurant:restaurant._id,date:when,time,status:{$in:["requested","confirmed"]}});
  if(duplicate) return res.status(409).json({message:"You already have a request for this table at that time."});
  const reservation=await Reservation.create({user:req.user._id,restaurant:restaurant._id,date:when,time,guests,occasion,notes});
  await notify(restaurant.owner,"New table reservation",`A table request for ${guests} guest(s) on ${when.toISOString().slice(0,10)} at ${time} has been received.`,"reservation",{reservationId:reservation._id});
  res.status(201).json(await reservation.populate("restaurant","name address coverImage cuisine"));
}));
router.patch("/reservations/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const row=await Reservation.findOneAndUpdate({_id:req.params.id,user:req.user._id,status:"requested"},{status:"cancelled"},{new:true});
  if(!row) return res.status(404).json({message:"Reservation cannot be cancelled"});
  res.json(row);
}));

router.get("/offers", asyncHandler(async(req,res)=>{
  const userId=optionalUserId(req);
  const live={isActive:true,$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]};
  const [campaigns,mine]=await Promise.all([
    Coupon.find({...live,owner:null}).select("code discountType discountValue minOrder maxDiscount expiresAt").sort({createdAt:-1}),
    userId&&mongoose.isValidObjectId(userId)?Coupon.find({...live,owner:userId,usedAt:null}).sort({expiresAt:1}):[]
  ]);
  res.json([...mine.map(publicCoupon),...campaigns]);
}));
router.post("/coupons/validate", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const coupon=await Coupon.findOne(usableCouponQuery(String(req.body.code||"").trim().toUpperCase(),req.user._id));
  if(!coupon || (coupon.expiresAt && coupon.expiresAt<new Date())) return res.status(404).json({valid:false,message:"Coupon is invalid, expired or already used"});
  const cart=await Cart.findOne({user:req.user._id}).populate("items.foodItem");
  const subtotal=(cart?.items||[]).reduce((sum,line)=>sum+(line.foodItem?.discountPrice??line.foodItem?.price??0)*line.quantity,0);
  if(subtotal<coupon.minOrder) return res.status(400).json({valid:false,message:`Minimum order is ₹${coupon.minOrder}`});
  const discount=Math.min(coupon.discountType==="percentage"?subtotal*coupon.discountValue/100:coupon.discountValue,coupon.maxDiscount||subtotal);
  res.json({valid:true,code:coupon.code,discount:Math.round(discount),message:`Coupon applied. You save ₹${Math.round(discount)}.`});
}));

router.get("/grocery/products", asyncHandler(async(req,res)=>{
  const query={isActive:true};
  if(req.query.search) query.name=new RegExp(String(req.query.search),"i");
  if(req.query.category) query.category=new RegExp(String(req.query.category),"i");
  res.json(await GroceryProduct.find(query).sort({category:1,name:1}).limit(150));
}));
// ---- GoFoode Mart checkout ------------------------------------------------------------------------------
const GROCERY_FREE_DELIVERY = 299, GROCERY_DELIVERY_FEE = 25;
const GROCERY_METHODS = ["cod", "upi", "card", "netbanking"];
const GROCERY_SLOT_STARTS = [8, 10, 12, 14, 16, 18, 20];
const istParts = date => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false }).formatToParts(date).map(part => [part.type, part.value]));
const istLabel = (date, options) => date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...options });
// Express runs 7:00 AM to 10:30 PM India time; scheduled windows are two hours long and start on the hours above.
function grocerySlot(slot = {}) {
  const now = new Date();
  if (!slot || slot.kind === "express" || !slot.kind) {
    const { hour, minute } = istParts(now);
    const minutes = Number(hour) * 60 + Number(minute);
    if (minutes < 7 * 60 || minutes > 22 * 60 + 30) return { error: "Express delivery runs from 7 AM to 10:30 PM. Pick a scheduled slot instead." };
    return { kind: "express", label: "Express · 15–20 min", start: now, end: new Date(now.getTime() + 20 * 60000) };
  }
  if (slot.kind !== "scheduled") return { error: "Choose express delivery or a delivery slot." };
  const start = new Date(slot.start);
  if (Number.isNaN(start.getTime())) return { error: "Choose a delivery slot." };
  const { hour, minute } = istParts(start);
  if (minute !== "00" || !GROCERY_SLOT_STARTS.includes(Number(hour))) return { error: "That delivery slot isn't available. Pick another one." };
  if (start.getTime() < now.getTime() + 30 * 60000) return { error: "That slot is about to start. Pick a later one." };
  if (start.getTime() > now.getTime() + 3 * 86400000) return { error: "Slots can be booked up to two days ahead." };
  const end = new Date(start.getTime() + 2 * 3600000);
  const day = istParts(start).day === istParts(now).day ? "Today" : istLabel(start, { weekday: "short", day: "numeric", month: "short" });
  return { kind: "scheduled", label: `${day} · ${istLabel(start, { hour: "numeric", minute: "2-digit" })} – ${istLabel(end, { hour: "numeric", minute: "2-digit" })}`, start, end };
}
// Orders placed before line photos were stored borrow them from the current catalogue.
async function withLinePhotos(orders) {
  const missing = new Set();
  orders.forEach(order => (order.items || []).forEach(line => { if (line.product && (!line.image || !line.unit)) missing.add(String(line.product)); }));
  if (!missing.size) return orders;
  const products = new Map((await GroceryProduct.find({ _id: { $in: [...missing] } }).select("image unit mrp")).map(product => [String(product._id), product]));
  return orders.map(order => ({ ...order, items: (order.items || []).map(line => { const product = products.get(String(line.product)); return product ? { ...line, image: line.image || product.image, unit: line.unit || product.unit, mrp: line.mrp || product.mrp || line.price } : line; }) }));
}
async function groceryResponse(order) {
  const payment = order.payment ? await Payment.findById(order.payment) : null;
  const [plain] = await withLinePhotos([order.toObject ? order.toObject() : order]);
  const cancellable = plain.status === "awaiting_payment" || plain.status === "placed";
  return { ...plain, payment: publicPayment(payment, { timeline: false }), canCancel: cancellable };
}

router.post("/grocery/orders", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const idempotencyKey=readIdempotencyKey(req);
  if(idempotencyKey===false) return res.status(400).json({code:"INVALID_IDEMPOTENCY_KEY",message:"Invalid checkout request key. Refresh the page and try again."});
  const {items=[],address,paymentMethod="cod",slot,substitution="call"}=req.body;
  const instructions=String(req.body.instructions||"").trim().slice(0,300);
  const tip=Math.round(Number(req.body.tip||0));
  const expected=req.body.expectedTotal==null?null:Number(req.body.expectedTotal);
  const requestHash=hashCheckoutRequest({items,address,paymentMethod,slot,substitution,instructions,tip});
  // A retry of the same checkout returns the order it already created instead of making a second one.
  if(idempotencyKey){
    const existing=await GroceryOrder.findOne({user:req.user._id,idempotencyKey});
    if(existing){
      if(existing.requestHash&&existing.requestHash!==requestHash) return res.status(409).json({code:"IDEMPOTENCY_CONFLICT",message:"This checkout was already submitted with different details. Refresh and try again."});
      return res.status(200).json({...await groceryResponse(existing),replayed:true});
    }
  }
  if(!Array.isArray(items) || !items.length) return res.status(400).json({message:"Your basket is empty."});
  if(!address?.name?.trim() || !address?.street?.trim() || !address?.city?.trim() || !address?.phone?.trim()) return res.status(400).json({message:"Add a complete delivery address with your name and phone number."});
  if(!/^[+\d][\d\s-]{6,17}$/.test(String(address.phone).trim())) return res.status(400).json({message:"Enter a valid phone number so the delivery partner can reach you."});
  if(!GROCERY_METHODS.includes(paymentMethod)) return res.status(400).json({message:"Choose UPI, card, net banking or cash on delivery."});
  if(!["call","similar","remove"].includes(substitution)) return res.status(400).json({message:"Choose what we should do if an item is unavailable."});
  if(!Number.isInteger(tip) || tip<0 || tip>200) return res.status(400).json({message:"Tips can be from ₹0 to ₹200."});
  const deliverySlot=grocerySlot(slot);
  if(deliverySlot.error) return res.status(400).json({code:"SLOT_UNAVAILABLE",message:deliverySlot.error});
  const online=paymentMethod!=="cod";
  const gateway=online?activeGateway():null;
  if(online&&!gateway) return res.status(400).json({code:"GATEWAY_UNAVAILABLE",message:"Online payment isn't available right now. Choose cash on delivery."});
  const requested=new Map();
  for(const line of items){
    const quantity=Number(line?.quantity);
    if(!mongoose.isValidObjectId(line?.product) || !Number.isInteger(quantity) || quantity<1 || quantity>20) return res.status(400).json({message:"Each item must have a valid product and a quantity from 1 to 20"});
    requested.set(String(line.product),(requested.get(String(line.product))||0)+quantity);
  }
  if([...requested.values()].some(quantity=>quantity>20)) return res.status(400).json({message:"You can order up to 20 of each product"});
  const products=await GroceryProduct.find({_id:{$in:[...requested.keys()]},isActive:true});
  if(products.length!==requested.size) return res.status(409).json({code:"ITEM_UNAVAILABLE",message:"A product is no longer available. Refresh your basket and try again."});
  const lines=products.map(product=>({product:product._id,name:product.name,quantity:requested.get(String(product._id)),price:product.price,mrp:product.mrp||product.price,unit:product.unit||"",image:product.image||""}));
  const subtotal=lines.reduce((sum,line)=>sum+line.price*line.quantity,0);
  const deliveryFee=subtotal>=GROCERY_FREE_DELIVERY?0:GROCERY_DELIVERY_FEE;
  const totalAmount=subtotal+deliveryFee+tip;
  // Never charge a total the customer didn't see.
  if(expected!==null && (!Number.isFinite(expected) || Math.abs(expected-totalAmount)>=1)) return res.status(409).json({code:"PRICE_CHANGED",totalAmount,message:`Prices changed while you were checking out. Your new total is ₹${totalAmount}. Review your basket and place the order again.`});
  const decremented=[];
  const restoreStock=async()=>{ await restockGrocery(decremented); decremented.length=0; };
  let order;
  try{
    for(const line of lines){
      const updated=await GroceryProduct.findOneAndUpdate({_id:line.product,isActive:true,stock:{$gte:line.quantity}},{$inc:{stock:-line.quantity}},{new:true});
      if(!updated){
        await restoreStock();
        return res.status(409).json({code:"OUT_OF_STOCK",message:`${line.name} just sold out. Remove it or lower the quantity and try again.`});
      }
      decremented.push({product:line.product,quantity:line.quantity});
    }
    const now=new Date();
    order=await GroceryOrder.create({
      orderNumber:`GFG-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      user:req.user._id,items:lines,
      address:{label:String(address.label||"").slice(0,20),name:address.name.trim(),phone:String(address.phone).trim(),street:address.street.trim(),city:address.city.trim(),state:String(address.state||"").trim(),postalCode:String(address.postalCode||"").trim()},
      subtotal,deliveryFee,tip,totalAmount,deliverySlot,instructions,substitution,paymentMethod,paymentStatus:"pending",
      status:online?"awaiting_payment":"placed",placedAt:online?undefined:now,
      idempotencyKey:idempotencyKey||undefined,requestHash
    });
  }catch(error){
    await restoreStock();
    // Two identical requests raced: the other one won, so return its order.
    if(error.code===11000&&idempotencyKey){ const existing=await GroceryOrder.findOne({user:req.user._id,idempotencyKey}); if(existing) return res.status(200).json({...await groceryResponse(existing),replayed:true}); }
    throw error;
  }
  if(online){
    try{
      const payment=await Payment.create({
        kind:"grocery",groceryOrder:order._id,groupOrderId:order.orderNumber,customer:req.user._id,amount:totalAmount,method:paymentMethod,gateway:gateway.name,status:"pending",
        expiresAt:new Date(Date.now()+config.payments.windowMinutes*60000),
        events:[paymentEvent("checkout.started",`Grocery checkout started for ₹${totalAmount}.`,"customer")]
      });
      order.payment=payment._id; await order.save();
    }catch(error){
      await GroceryOrder.updateOne({_id:order._id},{$set:{status:"cancelled",paymentStatus:"cancelled",cancelledAt:new Date(),cancelledBy:"system",cancellationReason:"Payment couldn't be set up"}});
      await restockGrocery(order.items);
      throw error;
    }
  }else{
    await notify(req.user._id,"Grocery order confirmed",`Order ${order.orderNumber} is confirmed. Pay ₹${totalAmount} in cash when it arrives.`,"order",{groceryOrderId:order._id});
  }
  res.status(201).json(await groceryResponse(order));
}));
// "/mine" must be registered before "/:id", or Express would treat "mine" as an order id.
router.get("/grocery/orders/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await withLinePhotos(await GroceryOrder.find({user:req.user._id}).sort({createdAt:-1}).lean()))
));
router.get("/grocery/orders/:id", protect, allow("customer"), asyncHandler(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({message:"Order not found"});
  let order=await GroceryOrder.findOne({_id:req.params.id,user:req.user._id});
  if(!order) return res.status(404).json({message:"Order not found"});
  // An unpaid checkout past its payment window closes the moment anyone looks at it.
  if(order.payment&&order.status==="awaiting_payment"){ const payment=await Payment.findById(order.payment); await expireIfDue(payment,{io:req.app.get("io"),source:"system"}); order=await GroceryOrder.findById(order._id); }
  res.json(await groceryResponse(order));
}));
router.patch("/grocery/orders/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({message:"Order not found"});
  const reason=String(req.body?.reason||"Cancelled by customer").slice(0,200);
  const order=await GroceryOrder.findOne({_id:req.params.id,user:req.user._id});
  if(!order) return res.status(404).json({message:"Order not found"});
  if(order.status==="awaiting_payment"&&order.payment){
    await cancelUnpaidCheckout(order.payment,req.user,{reason},{io:req.app.get("io")});
    return res.json({...await groceryResponse(await GroceryOrder.findById(order._id)),message:"Order cancelled. Nothing was charged."});
  }
  const cancelled=await GroceryOrder.findOneAndUpdate({_id:order._id,status:"placed"},{$set:{status:"cancelled",cancelledAt:new Date(),cancelledBy:"customer",cancellationReason:reason}},{new:true});
  if(!cancelled) return res.status(409).json({code:"NOT_CANCELLABLE",message:order.status==="cancelled"?"This order is already cancelled.":"Your order is already being packed, so it can't be cancelled here."});
  await restockGrocery(cancelled.items);
  let message="Order cancelled.";
  if(cancelled.paymentStatus==="paid"&&cancelled.payment){
    try{ const { amount }=await refundGroceryOrder(cancelled,{reason,source:"customer",actor:req.user._id},{io:req.app.get("io")}); message=`Order cancelled. A refund of ₹${amount} is on its way to your original payment method.`; }
    catch(error){ console.error(`[grocery] refund for ${cancelled.orderNumber} couldn't start:`,error.message); await AuditLog.create({action:"payment.refund_needs_attention",entityType:"GroceryOrder",entityId:String(cancelled._id),metadata:{reason:error.message}}); message="Order cancelled. Your refund is being arranged by our team."; }
  }else await GroceryOrder.updateOne({_id:cancelled._id,paymentStatus:"pending"},{$set:{paymentStatus:"cancelled"}});
  res.json({...await groceryResponse(await GroceryOrder.findById(cancelled._id)),message});
}));

router.get("/membership", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const membership=await Membership.findOne({user:req.user._id});
  const active=Boolean(membership&&membership.status==="active"&&membership.expiresAt>new Date());
  res.json({membership,active,plans:[{id:"gofoode_plus",name:"GoFoode Plus",price:299,period:"3 months",benefits:["Free delivery on every food order","Exclusive member-only offers","Priority customer support","Special dining-out perks"]}]});
}));
router.post("/membership/subscribe", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const current=await Membership.findOne({user:req.user._id});
  if(current&&current.status==="active"&&current.expiresAt>new Date()) return res.status(409).json({code:"ALREADY_MEMBER",membership:current,active:true,message:`You're already a Plus member until ${current.expiresAt.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}.`});
  const expiresAt=new Date(); expiresAt.setDate(expiresAt.getDate()+90);
  const membership=await Membership.findOneAndUpdate({user:req.user._id},{user:req.user._id,plan:"gofoode_plus",status:"active",startedAt:new Date(),expiresAt,amount:299},{upsert:true,new:true});
  res.status(201).json({membership,active:true,message:"GoFoode Plus demo membership activated. Configure a payment provider before collecting real payments."});
}));


router.get("/restaurant/reservations", protect, allow("restaurant_owner"), asyncHandler(async(req,res)=>{
  const owned=await Restaurant.find({owner:req.user._id}).select("_id");
  res.json(await Reservation.find({restaurant:{$in:owned.map(x=>x._id)}}).populate("restaurant","name").populate("user","name phone").sort({date:1}));
}));
router.patch("/restaurant/reservations/:id", protect, allow("restaurant_owner"), asyncHandler(async(req,res)=>{
  const row=await Reservation.findById(req.params.id).populate("restaurant");
  if(!row || String(row.restaurant.owner)!==String(req.user._id)) return res.status(404).json({message:"Reservation not found"});
  if(!["confirmed","cancelled","completed"].includes(req.body.status)) return res.status(400).json({message:"Invalid reservation status"});
  row.status=req.body.status; await row.save();
  await notify(row.user,"Reservation update",`Your table reservation is ${row.status}.`,"reservation",{reservationId:row._id});
  res.json(row);
}));
// Moves a grocery order along: placed → packed → out_for_delivery → delivered. Cash is marked collected on delivery.
const GROCERY_NEXT={placed:"packed",packed:"out_for_delivery",out_for_delivery:"delivered"};
router.patch("/admin/grocery-orders/:id", protect, allow("admin"), asyncHandler(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({message:"Order not found"});
  const current=await GroceryOrder.findById(req.params.id);
  if(!current) return res.status(404).json({message:"Order not found"});
  const next=GROCERY_NEXT[current.status];
  if(!next||req.body.status!==next) return res.status(409).json({message:`This order can't move from ${current.status.replaceAll("_"," ")} to ${String(req.body.status||"").replaceAll("_"," ")}.`});
  const set={status:next}; if(next==="delivered"&&current.paymentMethod==="cod") set.paymentStatus="paid";
  const order=await GroceryOrder.findOneAndUpdate({_id:current._id,status:current.status},{$set:set},{new:true});
  if(!order) return res.status(409).json({message:"This order was just updated. Refresh and try again."});
  const words={packed:"is packed and ready",out_for_delivery:"is out for delivery",delivered:"was delivered. Enjoy!"};
  await notify(order.user,"Grocery order update",`Order ${order.orderNumber} ${words[next]}.`,"order",{groceryOrderId:order._id});
  await AuditLog.create({action:"grocery.status_changed",actor:req.user._id,entityType:"GroceryOrder",entityId:String(order._id),metadata:{from:current.status,to:next}});
  res.json(order);
}));
router.get("/admin/grocery-orders", protect, allow("admin"), asyncHandler(async(req,res)=>
  res.json(await GroceryOrder.find().populate("user","name phone email").sort({createdAt:-1}).limit(300))
));
router.get("/admin/reservations", protect, allow("admin"), asyncHandler(async(req,res)=>
  res.json(await Reservation.find().populate("user","name phone").populate("restaurant","name").sort({date:-1}).limit(300))
));

router.post("/genie/requests", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const {pickup,drop,itemDescription,instructions=""}=req.body;
  if(!pickup?.name||!pickup?.phone||!pickup?.address||!drop?.name||!drop?.phone||!drop?.address||!itemDescription) return res.status(400).json({message:"Complete pickup, drop and item details"});
  const request=await PickupRequest.create({user:req.user._id,pickup,drop,itemDescription,instructions,fee:49});
  res.status(201).json(request);
}));
router.get("/genie/requests/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await PickupRequest.find({user:req.user._id}).populate("deliveryPartner","name phone").sort({createdAt:-1}))
));
router.patch("/genie/requests/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const request=await PickupRequest.findOneAndUpdate({_id:req.params.id,user:req.user._id,status:"requested"},{status:"cancelled"},{new:true});
  if(!request) return res.status(409).json({message:"Only unassigned pickup requests can be cancelled."});
  res.json(request);
}));
const startOfToday = () => new Date(new Date().setHours(0,0,0,0));
const upcomingExperience = () => ({ isActive:true, $or:[{date:null},{date:{$gte:startOfToday()}}] });
async function seatsTaken(ids){
  const rows=await ExperienceBooking.aggregate([{$match:{experience:{$in:ids},status:"confirmed"}},{$group:{_id:"$experience",total:{$sum:"$tickets"}}}]);
  return new Map(rows.map(row=>[String(row._id),row.total]));
}
router.get("/experiences", asyncHandler(async(req,res)=>{
  const events=await Experience.find(upcomingExperience()).sort({date:1}).lean();
  const taken=await seatsTaken(events.map(event=>event._id));
  res.json(events.map(event=>{ const booked=taken.get(String(event._id))||0; return {...event,booked,spotsLeft:Math.max(0,(event.capacity||0)-booked)}; }));
}));
router.post("/experiences/:id/book", protect, allow("customer"), asyncHandler(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({message:"Experience not found"});
  const tickets=Math.max(1,Math.min(10,Math.floor(Number(req.body.tickets))||1));
  const live={_id:req.params.id,...upcomingExperience()};
  const experience=await Experience.findOne(live);
  if(!experience) return res.status(404).json({message:"This event is no longer taking bookings"});
  // Events created before the seat counter existed start it from their confirmed bookings, exactly once.
  if(experience.booked==null){
    const taken=(await seatsTaken([experience._id])).get(String(experience._id))||0;
    await Experience.updateOne({_id:experience._id,booked:{$exists:false}},{$set:{booked:taken}});
  }
  // Claim the seats atomically: the update only matches while enough seats remain.
  const claimed=await Experience.findOneAndUpdate({...live,$expr:{$lte:[{$add:["$booked",tickets]},"$capacity"]}},{$inc:{booked:tickets}},{new:true});
  if(!claimed){
    const left=Math.max(0,experience.capacity-((await seatsTaken([experience._id])).get(String(experience._id))||0));
    return res.status(409).json({message:left?`Only ${left} spot${left===1?"":"s"} left for this event.`:"This event is sold out.",spotsLeft:left});
  }
  try{
    const booking=await ExperienceBooking.create({user:req.user._id,experience:experience._id,tickets,amount:tickets*experience.price});
    res.status(201).json(await booking.populate("experience"));
  }catch(error){
    await Experience.updateOne({_id:experience._id},{$inc:{booked:-tickets}});
    throw error;
  }
}));
router.get("/experiences/bookings/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await ExperienceBooking.find({user:req.user._id}).populate("experience").sort({createdAt:-1}))
));
router.patch("/experiences/bookings/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({message:"Booking not found"});
  const current=await ExperienceBooking.findOne({_id:req.params.id,user:req.user._id}).populate("experience","date");
  if(!current||current.status!=="confirmed") return res.status(404).json({message:"This booking is already cancelled."});
  if(current.experience?.date && current.experience.date < new Date()) return res.status(409).json({message:"This event has already started, so the booking can't be cancelled."});
  const booking=await ExperienceBooking.findOneAndUpdate({_id:current._id,status:"confirmed"},{status:"cancelled"},{new:true});
  if(!booking) return res.status(409).json({message:"This booking is already cancelled."});
  await Experience.updateOne({_id:booking.experience,booked:{$gte:booking.tickets}},{$inc:{booked:-booking.tickets}});
  res.json(await booking.populate("experience"));
}));
router.get("/admin/dashboard", protect, allow("admin"), asyncHandler(async (req, res) => {
  const [users, restaurants, orders, revenue] = await Promise.all([
    User.countDocuments(), Restaurant.countDocuments(), Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: { $in: ["paid", "partially_refunded"] } } }, { $group: { _id: null, total: { $sum: { $subtract: ["$totalAmount", { $ifNull: ["$refundedAmount", 0] }] } } } }])
  ]);
  const byStatus = await Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]);
  res.json({ users, restaurants, orders, revenue: revenue[0]?.total || 0, byStatus });
}));
router.get("/admin/audit-logs", protect, allow("admin"), asyncHandler(async (req, res) => {
  res.json(await AuditLog.find()
    .populate("actor", "name email role")
    .sort({ createdAt: -1 })
    .limit(200));
}));
router.get("/admin/users", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await User.find().sort({ createdAt: -1 }).limit(200))));
router.patch("/admin/users/:id/status", protect, allow("admin"), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: Boolean(req.body.isActive) }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(safeUser(user));
}));
router.get("/admin/restaurants", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Restaurant.find().populate("owner", "name email").sort({ createdAt: -1 }))));
router.patch("/admin/restaurants/:id/status", protect, allow("admin"), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!["approved","rejected","suspended","pending"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  await notify(restaurant.owner, "Restaurant application update", `Your restaurant is ${status}.`, "system");
  await AuditLog.create({ actor: req.user._id, action: `restaurant.${status}`, entityType: "Restaurant", entityId: restaurant._id });
  res.json(restaurant);
}));
router.get("/admin/orders", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Order.find().populate("customer", "name email").populate("restaurant", "name").sort({ createdAt: -1 }).limit(300))));
router.get("/admin/transactions", protect, allow("admin"), asyncHandler(async (req, res) => {
  const rows = await Payment.find().populate("customer", "name email").sort({ createdAt: -1 }).limit(300);
  res.json(rows.map(row => ({ _id: row._id, ...publicPayment(row, { admin: true, timeline: false }) })));
}));
router.post("/admin/coupons", protect, allow("admin"), asyncHandler(async (req, res) => {
  const coupon = await Coupon.create({ code: req.body.code?.toUpperCase(), discountType: req.body.discountType, discountValue: req.body.discountValue, minOrder: req.body.minOrder || 0, maxDiscount: req.body.maxDiscount, expiresAt: req.body.expiresAt });
  res.status(201).json(coupon);
}));
router.get("/admin/coupons", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Coupon.find().sort({ createdAt: -1 }))));
router.get("/admin/reviews", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Review.find().populate("user", "name").populate("restaurant", "name").sort({ createdAt: -1 }))));
router.get("/admin/support", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await SupportTicket.find().populate("user", "name email").sort({ createdAt: -1 }))));
router.patch("/admin/support/:id", protect, allow("admin"), asyncHandler(async (req, res) => {
  if (!["open", "in_progress", "resolved"].includes(req.body.status)) return res.status(400).json({ message: "Invalid support ticket status." });
  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!ticket) return res.status(404).json({ message: "Support ticket not found." });
  await AuditLog.create({ actor: req.user._id, action: `support.${ticket.status}`, entityType: "SupportTicket", entityId: ticket._id });
  res.json(ticket);
}));

export default router;
