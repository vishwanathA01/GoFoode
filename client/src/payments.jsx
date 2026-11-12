// Client side of the payment flow: the gateway window (Razorpay, or the built-in test gateway),
// safe retries, and the payment cards shown on the order page.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, CreditCard, Hourglass, Landmark, Lock, Receipt, RotateCcw, ShieldCheck, Smartphone, Timer, Undo2, Wallet, X } from "lucide-react";
import api from "./api";

// Payment amounts are shown to the paisa: the button must say exactly what will be charged.
export const exactMoney = n => { const value = Math.round(Number(n || 0) * 100) / 100; return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`; };
const money = exactMoney;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const ONLINE_METHODS = ["upi", "card", "netbanking"];
export const paymentMethodLabel = method => ({ cod: "Cash on delivery", upi: "UPI", card: "Card", netbanking: "Net banking", razorpay: "Online payment" }[method] || method || "—");
export const paymentStatusLabel = status => ({
  created: "Processing", pending: "Pending", authorized: "Authorised", paid: "Paid", failed: "Failed", expired: "Expired",
  cancelled: "Not charged", refund_pending: "Refund in progress", partially_refunded: "Partly refunded", refunded: "Refunded"
}[status] || status || "—");
export const onlineMethodOptions = [
  { id: "upi", title: "UPI", detail: "Google Pay, PhonePe, Paytm or any UPI app", icon: Smartphone },
  { id: "card", title: "Credit or debit card", detail: "Visa, Mastercard, RuPay", icon: CreditCard },
  { id: "netbanking", title: "Net banking", detail: "All major Indian banks", icon: Landmark }
];

// A retry is only safe when the server never answered, or answered with a temporary error.
export const isRetryableError = error => !error?.response || error.response.status >= 500 || error.response.status === 429 || Boolean(error.response.data?.retryable);
export async function withRetry(run, { retries = 2, baseDelay = 700, shouldRetry = isRetryableError } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await run(attempt); }
    catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
    }
  }
}
export const errorMessage = (error, fallback) => error?.response?.data?.message || (error?.response ? fallback : "We couldn't reach GoFoode. Check your connection and try again.");

// crypto.randomUUID needs a secure context; getRandomValues also works over plain http on a LAN address.
export function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

let razorpayScript = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  razorpayScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error("The secure payment window is unavailable."));
    script.onerror = () => { razorpayScript = null; script.remove(); reject(new Error("We couldn't load the secure payment window. Check your connection and try again.")); };
    document.body.appendChild(script);
  });
  return razorpayScript;
}

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  return now;
}
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// Opens the gateway's checkout window and resolves with what happened in it.
export function usePaymentGateway() {
  const [sheet, setSheet] = useState(null);
  const open = useCallback(session => new Promise(resolve => {
    if (session.gateway === "mock") { setSheet({ session, resolve }); return; }
    loadRazorpay().then(Razorpay => {
      let settled = false;
      const finish = result => { if (!settled) { settled = true; resolve(result); } };
      const secondsLeft = session.expiresAt ? Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000) : 0;
      const checkout = new Razorpay({
        key: session.keyId,
        order_id: session.providerOrderId,
        amount: session.amount,
        currency: session.currency,
        name: session.name,
        description: session.description,
        prefill: { ...session.prefill, method: session.method },
        notes: { groupOrderId: session.groupOrderId },
        theme: { color: "#ff6a13" },
        retry: { enabled: true, max_count: 3 },
        ...(secondsLeft > 60 ? { timeout: secondsLeft } : {}),
        handler: response => finish({ status: "success", response }),
        modal: { ondismiss: () => finish({ status: "dismissed" }), confirm_close: true }
      });
      // Razorpay keeps its window open after a failed try so the customer can retry; record each failure.
      checkout.on("payment.failed", event => session.onAttemptFailed?.(event.error));
      checkout.open();
    }).catch(error => resolve({ status: "error", message: error.message }));
  }), []);
  const element = sheet ? <TestPaymentSheet session={sheet.session} onDone={result => { sheet.resolve(result); setSheet(null); }}/> : null;
  return { open, element };
}

// Runs one online payment end to end. Resolves with paid | confirming | failed | dismissed | late | error.
export async function completeOnlinePayment({ paymentId, method, gateway, onPhase = () => {} }) {
  onPhase("opening");
  let session;
  try { ({ data: session } = await withRetry(() => api.post(`/payments/${paymentId}/session`, { method }))); }
  catch (error) { return { status: "error", code: error.response?.data?.code, message: errorMessage(error, "We couldn't open the payment window. Please try again.") }; }
  const reportFailure = failure => api.post(`/payments/${paymentId}/failure`, {
    providerPaymentId: failure?.metadata?.payment_id, code: failure?.code, reason: failure?.description || failure?.reason
  }).catch(() => {});
  const result = await gateway.open({ ...session, onAttemptFailed: reportFailure });
  if (result.status === "success") {
    onPhase("confirming");
    try {
      // Verification is idempotent on the server, so retrying through a flaky connection is safe.
      const { data } = await withRetry(() => api.post(`/payments/${paymentId}/verify`, {
        providerOrderId: result.response.razorpay_order_id,
        providerPaymentId: result.response.razorpay_payment_id,
        signature: result.response.razorpay_signature,
        method: result.method
      }), { retries: 4 });
      return data.outcome === "late_capture" ? { status: "late", message: data.message } : { status: "paid", payment: data.payment };
    } catch (error) {
      // The money may have moved even if we can't confirm it from here; the server settles it from the gateway.
      if (isRetryableError(error)) return { status: "confirming" };
      return { status: "failed", message: errorMessage(error, "We couldn't verify this payment.") };
    }
  }
  if (result.status === "failed") { await reportFailure(result.error); return { status: "failed", message: result.error?.description || "The payment was declined." }; }
  if (result.status === "dismissed") { api.post(`/payments/${paymentId}/failure`, { dismissed: true }).catch(() => {}); return { status: "dismissed" }; }
  return result;
}

export function describePaymentOutcome(outcome) {
  switch (outcome?.status) {
    case "paid": return { tone: "success", text: "Payment successful. Your order is on its way to the kitchen." };
    case "confirming": return { tone: "info", text: "We're confirming your payment with the bank. This page updates on its own; you won't be charged twice." };
    case "failed": return { tone: "error", text: `Payment didn't go through: ${outcome.message} Your order is still reserved, so you can try again.` };
    case "dismissed": return { tone: "info", text: "Payment wasn't completed. Your order is reserved for a few minutes, so you can pay below." };
    case "late": return { tone: "info", text: outcome.message };
    case "error": return { tone: "error", text: outcome.message };
    default: return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Built-in test gateway window
// ---------------------------------------------------------------------------------------------------------
const testBanks = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra", "Yes Bank"];
function TestPaymentSheet({ session, onDone }) {
  const [method, setMethod] = useState(ONLINE_METHODS.includes(session.method) ? session.method : "upi");
  const [vpa, setVpa] = useState("success@okgofoode");
  const [card, setCard] = useState({ number: "4111 1111 1111 1111", expiry: "12/30", cvv: "123" });
  const [bank, setBank] = useState(testBanks[0]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const ref = useRef(null);
  const busyRef = useRef("");
  busyRef.current = busy;
  const now = useNow();
  const secondsLeft = session.expiresAt ? Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - now) / 1000)) : null;
  const close = () => { if (!busyRef.current) onDone({ status: "dismissed" }); };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus({ preventScroll: true });
    const onKey = event => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.({ preventScroll: true }); };
  }, []);

  const digits = card.number.replace(/\D/g, "");
  const valid = method === "upi" ? /^[\w.-]{2,}@[a-z]{2,}$/i.test(vpa.trim())
    : method === "card" ? digits.length >= 15 && digits.length <= 16 && /^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry) && /^\d{3,4}$/.test(card.cvv)
    : Boolean(bank);
  const run = async outcome => {
    setBusy(outcome); setError("");
    await sleep(800); // a real gateway takes a moment; this keeps the test flow honest about loading states
    try {
      const { data } = await api.post(`/payments/${session.paymentId}/simulate`, { outcome, method });
      if (outcome === "failure") onDone({ status: "failed", error: data.error });
      else if (outcome === "disconnect") onDone({ status: "confirming" });
      else onDone({ status: "success", method, response: data });
    } catch (err) {
      setError(errorMessage(err, "The test gateway didn't respond. Try again."));
      setBusy("");
    }
  };
  const formatCard = value => value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

  return <div className="fd-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="pay-sheet" role="dialog" aria-modal="true" aria-labelledby="pay-sheet-title" tabIndex={-1} ref={ref}>
      <header className="pay-sheet-head">
        <span className="pay-sheet-lock" aria-hidden="true"><Lock size={18}/></span>
        <div><small>GoFoode secure checkout</small><b id="pay-sheet-title">Pay {money(session.displayAmount)}</b></div>
        <span className="pay-test-badge">Test mode</span>
        <button type="button" className="fd-close pay-sheet-close" aria-label="Close payment window" disabled={Boolean(busy)} onClick={close}><X size={18}/></button>
      </header>
      <div className="pay-sheet-meta"><span>{session.description}</span>{secondsLeft !== null && <span className={secondsLeft < 120 ? "warn" : ""}><Timer size={14}/>{clock(secondsLeft)} left</span>}</div>
      <div className="pay-tabs" role="tablist" aria-label="Payment method">
        {onlineMethodOptions.map(({ id, title, icon: Icon }) => <button type="button" role="tab" aria-selected={method === id} key={id} className={method === id ? "on" : ""} disabled={Boolean(busy)} onClick={() => setMethod(id)}><Icon size={16}/>{id === "card" ? "Card" : title}</button>)}
      </div>
      <div className="pay-sheet-body" role="tabpanel">
        {method === "upi" && <label className="pay-field">UPI ID<input value={vpa} onChange={event => setVpa(event.target.value)} autoComplete="off" spellCheck={false} placeholder="name@bank"/><small>Any UPI ID in the name@bank format works in test mode.</small></label>}
        {method === "card" && <div className="pay-card-grid">
          <label className="pay-field wide">Card number<input inputMode="numeric" autoComplete="off" value={card.number} onChange={event => setCard({ ...card, number: formatCard(event.target.value) })}/></label>
          <label className="pay-field">Expiry<input inputMode="numeric" placeholder="MM/YY" value={card.expiry} onChange={event => setCard({ ...card, expiry: event.target.value.replace(/[^\d/]/g, "").slice(0, 5) })}/></label>
          <label className="pay-field">CVV<input inputMode="numeric" type="password" autoComplete="off" value={card.cvv} onChange={event => setCard({ ...card, cvv: event.target.value.replace(/\D/g, "").slice(0, 4) })}/></label>
          <small className="wide">Test card details are filled in for you.</small>
        </div>}
        {method === "netbanking" && <div className="pay-banks" role="radiogroup" aria-label="Choose your bank">
          {testBanks.map(name => <button type="button" role="radio" aria-checked={bank === name} key={name} className={bank === name ? "on" : ""} onClick={() => setBank(name)}><Landmark size={15}/>{name}{bank === name && <Check className="pay-bank-check" size={14} strokeWidth={3}/>}</button>)}
        </div>}
      </div>
      {error && <p className="fd-note error pay-sheet-error" role="alert">{error}</p>}
      <div className="pay-sheet-actions">
        <button type="button" className="btn btn-primary btn-full" disabled={!valid || Boolean(busy)} onClick={() => run("success")}>{busy === "success" ? <><span className="fd-spin light" aria-hidden="true"/> Processing payment…</> : <>Pay {money(session.displayAmount)}</>}</button>
        <div className="pay-sim-row"><span>Test other outcomes</span>
          <button type="button" disabled={Boolean(busy)} onClick={() => run("failure")}>{busy === "failure" ? "Declining…" : "Bank declines"}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => run("disconnect")} title="Money is taken but the app never hears back. The server still confirms it.">{busy === "disconnect" ? "Paying…" : "Paid, app loses signal"}</button>
        </div>
      </div>
      <p className="pay-sheet-fine"><ShieldCheck size={14}/> This is GoFoode's built-in test gateway. No real money moves. Add Razorpay keys on the server to take real payments.</p>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------------------------------------
// Order page cards
// ---------------------------------------------------------------------------------------------------------
// Shown while an online checkout is waiting for money: pay (again), switch to cash, or cancel.
const foodPaymentCopy = {
  title: "Complete your payment",
  text: "Your order is reserved. It goes to the kitchen as soon as your payment succeeds.",
  paid: "Payment successful. Your order is on its way to the kitchen.",
  cancelConfirm: "Cancel this checkout? Nothing has been charged, and your items go back to your cart."
};
// `copy` lets other checkouts (like GoFoode Mart) reuse this card with their own wording.
export function PaymentActionCard({ payment, now, onChanged, notify, copy = foodPaymentCopy }) {
  const gateway = usePaymentGateway();
  const [method, setMethod] = useState(ONLINE_METHODS.includes(payment.method) ? payment.method : "upi");
  const [phase, setPhase] = useState("");
  const [note, setNote] = useState(null);
  const secondsLeft = payment.expiresAt ? Math.max(0, Math.floor((new Date(payment.expiresAt).getTime() - now) / 1000)) : null;
  const expired = secondsLeft === 0;
  const busy = Boolean(phase);

  const pay = async () => {
    setNote(null);
    const outcome = await completeOnlinePayment({ paymentId: payment.id, method, gateway, onPhase: setPhase });
    setPhase("");
    if (outcome.status === "paid") notify(copy.paid);
    else setNote(describePaymentOutcome(outcome));
    onChanged();
  };
  const switchToCash = async () => {
    if (!window.confirm(`Pay ${money(payment.amount)} in cash when your order arrives instead?`)) return;
    setPhase("switching"); setNote(null);
    try { const { data } = await withRetry(() => api.post(`/payments/${payment.id}/switch-to-cod`)); notify(data.message); }
    catch (error) { setNote({ tone: "error", text: errorMessage(error, "We couldn't switch this order to cash on delivery.") }); }
    finally { setPhase(""); onChanged(); }
  };
  const cancel = async () => {
    if (!window.confirm(copy.cancelConfirm)) return;
    setPhase("cancelling"); setNote(null);
    try { const { data } = await api.post(`/payments/${payment.id}/cancel`); notify(data.message); }
    catch (error) { setNote({ tone: "error", text: errorMessage(error, "We couldn't cancel this checkout.") }); }
    finally { setPhase(""); onChanged(); }
  };

  return <section className="fd-panel pay-action" aria-labelledby="pay-action-title">
    <div className="pay-action-head">
      <span className="pay-action-icon" aria-hidden="true"><Hourglass size={20}/></span>
      <div><h2 id="pay-action-title">{copy.title}</h2><p>{copy.text}</p></div>
      {secondsLeft !== null && <span className={`pay-countdown ${secondsLeft < 120 ? "warn" : ""}`} role="timer" aria-live="off"><Timer size={15}/>{expired ? "Closing…" : `${clock(secondsLeft)} left`}</span>}
    </div>
    {payment.lastError && <p className="fd-note error"><AlertTriangle size={15}/> Last attempt failed: {payment.lastError}</p>}
    {note && <p className={`fd-note ${note.tone}`} role="status">{note.text}</p>}
    {!payment.canPay && !expired && <p className="fd-note info">Online payment is locked after {payment.failedAttempts} unsuccessful attempts. You can still pay in cash on delivery.</p>}
    {payment.canPay && <div className="pay-methods" role="radiogroup" aria-label="Pay with">
      {onlineMethodOptions.map(({ id, title, icon: Icon }) => <button type="button" role="radio" aria-checked={method === id} key={id} className={method === id ? "on" : ""} disabled={busy} onClick={() => setMethod(id)}><Icon size={16}/>{id === "card" ? "Card" : title}</button>)}
    </div>}
    <div className="pay-action-buttons">
      {payment.canPay && <button type="button" className="btn btn-primary" disabled={busy || expired} onClick={pay}>{phase === "opening" ? <><span className="fd-spin light" aria-hidden="true"/> Opening secure payment…</> : phase === "confirming" ? <><span className="fd-spin light" aria-hidden="true"/> Confirming payment…</> : <><Lock size={15}/> {payment.failedAttempts ? "Try again" : "Pay"} {money(payment.amount)}</>}</button>}
      {payment.canSwitchToCod && <button type="button" className="btn btn-outline" disabled={busy || expired} onClick={switchToCash}><Wallet size={15}/>{phase === "switching" ? "Switching…" : "Pay cash on delivery instead"}</button>}
      {payment.canCancel && <button type="button" className="fd-link pay-cancel" disabled={busy || expired} onClick={cancel}>{phase === "cancelling" ? "Cancelling…" : "Cancel checkout"}</button>}
    </div>
    {payment.testMode && <p className="pay-fine"><ShieldCheck size={14}/> Test mode: payments use GoFoode's built-in test gateway and no real money moves.</p>}
    {gateway.element}
  </section>;
}

const eventTime = value => new Date(value).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const refundStatusLabel = status => ({ pending: "In progress", processed: "Processed", failed: "Failed, retrying" }[status] || status);

// Sidebar summary: what was paid, how, refunds and the full activity trail.
export function PaymentDetailsCard({ payment }) {
  const [copied, setCopied] = useState(false);
  if (!payment) return null;
  const refunds = payment.refunds || [];
  const events = [...(payment.events || [])].reverse();
  const copy = () => navigator.clipboard?.writeText(payment.providerPaymentId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  return <div className="fd-panel pay-details">
    <div className="pay-details-head"><h3><Receipt size={16}/> Payment</h3><em className={`fd-pay-status ${payment.status}`}>{paymentStatusLabel(payment.status)}</em></div>
    <dl className="pay-facts">
      <div><dt>Method</dt><dd>{paymentMethodLabel(payment.method)}{payment.testMode && payment.method !== "cod" && <span className="pay-test-badge sm">Test</span>}</dd></div>
      <div><dt>Checkout total</dt><dd>{money(payment.amount)}</dd></div>
      {payment.amountPaid > 0 && <div><dt>{payment.method === "cod" ? "Collected" : "Paid"}</dt><dd>{money(payment.amountPaid)}{payment.paidAt && <small>{eventTime(payment.paidAt)}</small>}</dd></div>}
      {payment.amountRefunded > 0 && <div><dt>Refunded</dt><dd className="pay-refunded">{money(payment.amountRefunded)}</dd></div>}
      {payment.providerPaymentId && <div><dt>Transaction ID</dt><dd><button type="button" className="pay-txn" onClick={copy} title="Copy transaction ID">{payment.providerPaymentId}{copied ? <Check size={13} strokeWidth={3}/> : null}</button></dd></div>}
    </dl>
    {refunds.length > 0 && <ul className="pay-refunds">{refunds.map(refund => <li key={refund.id}>
      <span className={`pay-refund-icon ${refund.status}`}>{refund.status === "processed" ? <CheckCircle2 size={15}/> : refund.status === "failed" ? <RotateCcw size={15}/> : <Undo2 size={15}/>}</span>
      <span><b>{money(refund.amount)} refund · {refundStatusLabel(refund.status)}</b><small>{refund.reason}{refund.status === "processed" ? " · 5–7 working days to reach your account" : ""}</small></span>
    </li>)}</ul>}
    {events.length > 0 && <details className="pay-timeline">
      <summary>Payment activity <span>{events.length}</span><ChevronDown size={15}/></summary>
      <ol>{events.map((entry, index) => <li key={`${entry.type}-${index}`} className={entry.type.split(".")[1] || ""}><b>{entry.message}</b><small>{eventTime(entry.at)}{entry.source && entry.source !== "system" ? ` · ${entry.source}` : ""}</small></li>)}</ol>
    </details>}
  </div>;
}

// ---------------------------------------------------------------------------------------------------------
// Admin: payment health tiles for the transactions page
// ---------------------------------------------------------------------------------------------------------
export function PaymentHealth({ refreshKey }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.get("/admin/payments/summary").then(response => setSummary(response.data)).catch(() => setSummary(null)); }, [refreshKey]);
  if (!summary) return null;
  const awaiting = summary.awaitingOnline ?? 0;
  return <>
    <div className="stats-grid pay-health">
      <div className="stat-card"><span className="stat-icon green"><Wallet size={17}/></span><span>Collected</span><strong>{money(summary.collected)}</strong><small>Online and cash, all time</small></div>
      <div className="stat-card"><span className="stat-icon"><Undo2 size={17}/></span><span>Refunded</span><strong>{money(summary.refunded)}</strong><small>{summary.pendingRefunds ? `${summary.pendingRefunds} refund${summary.pendingRefunds === 1 ? "" : "s"} in progress` : "No refunds in progress"}</small></div>
      <div className="stat-card"><span className="stat-icon blue"><CheckCircle2 size={17}/></span><span>Online success rate · 7 days</span><strong>{summary.successRate7d === null ? "—" : `${summary.successRate7d}%`}</strong><small>{summary.onlineCheckouts7d} completed online checkout{summary.onlineCheckouts7d === 1 ? "" : "s"}</small></div>
      <div className="stat-card"><span className="stat-icon purple"><Hourglass size={17}/></span><span>Awaiting payment</span><strong>{awaiting}</strong><small>{summary.failedRefunds ? `${summary.failedRefunds} with a failed refund attempt` : "Online checkouts still open"}</small></div>
    </div>
    <p className="pay-gateway-line"><ShieldCheck size={14}/> Gateway: <b>{summary.gateway === "razorpay" ? `Razorpay${summary.testMode ? " (test keys)" : ""}` : summary.gateway === "mock" ? "Built-in test gateway (no real money)" : "Disabled: cash on delivery only"}</b></p>
  </>;
}
