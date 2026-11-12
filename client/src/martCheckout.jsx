// GoFoode Mart checkout (basket → delivery → payment) and the live order page that follows it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BellOff, Bike, Briefcase, Building2, CalendarClock, Check, CheckCircle2, ChevronRight, Clock, CreditCard,
  DoorOpen, Home, Info, Landmark, Leaf, Loader2, Lock, MapPin, Minus, Package, PackageCheck, PartyPopper, Pencil, Phone, PhoneCall, Plus, Printer,
  Receipt, Repeat, RotateCcw, ShieldCheck, ShoppingBasket, Smartphone, Sparkles, Trash2, Truck, Wallet, XCircle, Zap
} from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";
import { PaymentActionCard, completeOnlinePayment, describePaymentOutcome, errorMessage, exactMoney, newIdempotencyKey, paymentMethodLabel, usePaymentGateway, withRetry } from "./payments";

export const MART_FREE_DELIVERY = 299, MART_DELIVERY_FEE = 25;
const money = n => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const fallbackImage = "/food-placeholder.svg";
const onImageError = event => { event.currentTarget.onerror = null; event.currentTarget.src = fallbackImage; };
const PHONE = /^[+\d][\d\s-]{6,17}$/;
const TIPS = [0, 10, 20, 30, 50];
const NOTE_CHIPS = [["Leave at the door", DoorOpen], ["Don't ring the bell", BellOff], ["Call when you arrive", PhoneCall], ["Hand it to security", Building2]];
const SUBSTITUTIONS = [["call", "Call me", "We'll ring you before replacing anything.", PhoneCall], ["similar", "Replace with similar", "A close match at the same or lower price.", Repeat], ["remove", "Remove it", "Skip the item and refund its price.", XCircle]];
const PAY_METHODS = [["upi", "UPI", "Pay with any UPI app", Smartphone], ["card", "Card", "Visa, Mastercard, RuPay", CreditCard], ["netbanking", "Net banking", "All major Indian banks", Landmark], ["cod", "Cash on delivery", "Pay when your order arrives", Wallet]];
const addressIcon = label => /work|office/i.test(label || "") ? Briefcase : /home/i.test(label || "") ? Home : Building2;

// Delivery windows are in India time, whatever the browser's own time zone.
const IST_OFFSET = 330 * 60000;
const istNow = () => new Date(Date.now() + IST_OFFSET);
const istDate = (year, month, day, hour) => new Date(Date.UTC(year, month, day, hour) - IST_OFFSET);
const istClock = date => date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const SLOT_STARTS = [8, 10, 12, 14, 16, 18, 20];
function deliveryOptions() {
  const now = istNow();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const express = minutes >= 7 * 60 && minutes <= 22 * 60 + 30;
  const days = [0, 1].map(offset => {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    const slots = SLOT_STARTS.map(hour => istDate(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour))
      .filter(start => start.getTime() >= Date.now() + 30 * 60000)
      .map(start => ({ start: start.toISOString(), label: `${istClock(start)} – ${istClock(new Date(start.getTime() + 2 * 3600000))}` }));
    return { label: offset === 0 ? "Today" : "Tomorrow", date: base.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }), slots };
  }).filter(day => day.slots.length);
  return { express, days };
}
const slotSummary = slot => {
  if (!slot || slot.kind === "express") return "Express · arrives in 15–20 min";
  const start = new Date(slot.start);
  const today = istNow().getUTCDate() === new Date(start.getTime() + IST_OFFSET).getUTCDate();
  return `${today ? "Today" : "Tomorrow"} · ${istClock(start)} – ${istClock(new Date(start.getTime() + 2 * 3600000))}`;
};

const readStore = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const writeStore = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

function Stepper({ step, onStep }) {
  const steps = [["Basket", ShoppingBasket], ["Delivery", MapPin], ["Payment", Lock]];
  return <ol className="mc-steps" aria-label="Checkout progress">{steps.map(([label, Icon], index) => {
    const number = index + 1, done = step > number;
    return <li key={label} className={`${done ? "done" : ""} ${step === number ? "on" : ""}`} aria-current={step === number ? "step" : undefined}>
      <button type="button" disabled={!done} onClick={() => onStep(number)}><span>{done ? <Check size={15} strokeWidth={3}/> : <Icon size={15}/>}</span><b>{label}</b></button>
    </li>;
  })}</ol>;
}

export function MartCheckout({ items, basket, products, changeQuantity, onBackToShop, onPlaced, onRefresh }) {
  const { user, location } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const saved = readStore("gofoode-mart-checkout-v2", {});
  const [step, setStep] = useState(saved.step || 1);
  const [addresses, setAddresses] = useState([]), [addressId, setAddressId] = useState(saved.addressId || ""), [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState(() => ({ label: "Home", name: user?.name || "", phone: user?.phone || "", street: "", city: location?.city || "", state: location?.state || "", postalCode: location?.postalCode || "", save: true, ...(saved.draft || {}) }));
  const [slot, setSlot] = useState(saved.slot || { kind: "express" });
  const [chips, setChips] = useState(saved.chips || []), [note, setNote] = useState(saved.note || ""), [substitution, setSubstitution] = useState(saved.substitution || "call");
  const [method, setMethod] = useState(saved.method || "upi"), [tip, setTip] = useState(saved.tip || 0);
  const [payConfig, setPayConfig] = useState(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState(null), [fieldError, setFieldError] = useState("");
  const gateway = usePaymentGateway();
  const keyRef = useRef(null), savedDraftRef = useRef(false);
  const options = useMemo(deliveryOptions, [step]);

  useEffect(() => { api.get("/payments/config").then(response => setPayConfig(response.data)).catch(() => setPayConfig({ gateway: null })); }, []);
  useEffect(() => {
    if (!isCustomer) { setAddresses([]); setAddingNew(true); return; }
    api.get("/addresses").then(response => {
      const rows = Array.isArray(response.data) ? response.data : [];
      setAddresses(rows);
      if (!rows.length) setAddingNew(true);
      else if (!rows.some(row => row._id === addressId)) setAddressId((rows.find(row => row.isDefault) || rows[0])._id);
    }).catch(() => setAddingNew(true));
  }, [isCustomer]);
  useEffect(() => { if (payConfig && !payConfig.gateway && method !== "cod") setMethod("cod"); }, [payConfig]);
  useEffect(() => { if (slot.kind === "express" && !options.express) setSlot(options.days[0]?.slots[0] ? { kind: "scheduled", start: options.days[0].slots[0].start } : slot); }, [options.express]);
  useEffect(() => { writeStore("gofoode-mart-checkout-v2", { step, addressId, draft, slot, chips, note, substitution, method, tip }); }, [step, addressId, draft, slot, chips, note, substitution, method, tip]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); setError(null); setFieldError(""); }, [step]);
  // A fixed field clears its warning straight away.
  useEffect(() => { setFieldError(""); }, [draft, addressId, addingNew]);

  const lines = items.map(product => ({ product, quantity: basket[product._id] || 0 })).filter(line => line.quantity > 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const mrpTotal = lines.reduce((sum, line) => sum + Math.max(line.product.mrp || 0, line.product.price) * line.quantity, 0);
  const savings = mrpTotal - subtotal;
  const deliveryFee = subtotal >= MART_FREE_DELIVERY ? 0 : MART_DELIVERY_FEE;
  const total = subtotal + deliveryFee + tip;
  const toFree = Math.max(0, MART_FREE_DELIVERY - subtotal);
  const topUps = useMemo(() => products.filter(product => !basket[product._id] && (product.stock ?? 1) > 0 && product.price <= Math.max(60, toFree + 40)).sort((a, b) => Math.abs(a.price - toFree) - Math.abs(b.price - toFree)).slice(0, 6), [products, basket, toFree]);
  const chosen = !addingNew && addresses.find(row => row._id === addressId);
  const address = chosen ? { label: chosen.label, name: chosen.name, phone: chosen.phone, street: chosen.street, city: chosen.city, state: chosen.state || "", postalCode: chosen.postalCode || "" } : { label: draft.label, name: draft.name.trim(), phone: draft.phone.trim(), street: draft.street.trim(), city: draft.city.trim(), state: draft.state.trim(), postalCode: draft.postalCode.trim() };
  const instructions = [...chips, note.trim()].filter(Boolean).join(". ");
  const online = method !== "cod";
  // A changed basket, address or payment choice is a new checkout and gets a new idempotency key.
  const payloadKey = JSON.stringify([lines.map(line => [line.product._id, line.quantity]), address, slot, instructions, substitution, method, tip]);
  useEffect(() => { keyRef.current = null; }, [payloadKey]);

  const addressProblem = () => {
    if (!address.name) return "Add the name of the person receiving the order.";
    if (!PHONE.test(address.phone)) return "Add a phone number the delivery partner can call.";
    if (!address.street) return "Add your flat, building and street.";
    if (!address.city) return "Add your city.";
    return "";
  };
  const goPayment = () => { const problem = addressProblem(); if (problem) { setFieldError(problem); return; } setStep(3); };
  const toggleChip = label => setChips(current => current.includes(label) ? current.filter(entry => entry !== label) : [...current, label]);

  const place = async () => {
    if (!user) { navigate("/login", { state: { from: "/instamart" } }); return; }
    if (!isCustomer) { setError({ tone: "error", text: "Grocery orders are placed from a customer account." }); return; }
    const problem = addressProblem();
    if (problem) { setStep(2); setFieldError(problem); return; }
    setBusy(true); setError(null); setPhase("placing");
    try {
      if (addingNew && draft.save && !savedDraftRef.current) {
        savedDraftRef.current = true;
        api.post("/addresses", { ...address, isDefault: !addresses.length }).catch(() => { savedDraftRef.current = false; });
      }
      keyRef.current ||= newIdempotencyKey();
      const payload = { items: lines.map(line => ({ product: line.product._id, quantity: line.quantity })), address, paymentMethod: method, slot, substitution, instructions, tip, expectedTotal: total };
      const { data } = await withRetry(() => api.post("/grocery/orders", payload, { headers: { "Idempotency-Key": keyRef.current } }));
      keyRef.current = null;
      sessionStorage.removeItem("gofoode-mart-checkout-v2");
      if (online && data.payment?.canPay) {
        const outcome = await completeOnlinePayment({ paymentId: data.payment.id, method, gateway, onPhase: setPhase });
        onPlaced(data, outcome);
      } else onPlaced(data, null);
    } catch (failure) {
      const code = failure.response?.data?.code;
      if (["PRICE_CHANGED", "ITEM_UNAVAILABLE", "OUT_OF_STOCK"].includes(code)) { keyRef.current = null; onRefresh?.(); }
      else if (failure.response && failure.response.status < 500) keyRef.current = null;
      if (code === "SLOT_UNAVAILABLE") setStep(2);
      setError({ tone: "error", text: !failure.response ? "We lost the connection while placing your order. Check Grocery orders before trying again, so you don't order twice." : errorMessage(failure, "We couldn't place your order. Please try again.") });
    } finally { setBusy(false); setPhase(""); }
  };

  const summary = <aside className="mc-summary" aria-label="Order summary">
    <div className="mc-card">
      <div className="mc-summary-head"><h3>Order summary</h3><span>{count} item{count === 1 ? "" : "s"}</span></div>
      <div className="mc-thumbs">{lines.slice(0, 5).map(line => <span key={line.product._id}><img src={line.product.image || fallbackImage} alt="" onError={onImageError}/>{line.quantity > 1 && <i>×{line.quantity}</i>}</span>)}{lines.length > 5 && <span className="more">+{lines.length - 5}</span>}</div>
      {subtotal > 0 && <div className={`mc-free ${toFree ? "" : "done"}`}>
        <div className="mc-free-bar"><i style={{ width: `${Math.min(100, (subtotal / MART_FREE_DELIVERY) * 100)}%` }}/></div>
        <small>{toFree ? <>Add <b>{money(toFree)}</b> more for free delivery</> : <><Truck size={14}/> You've unlocked free delivery</>}</small>
      </div>}
      <dl className="mc-bill">
        <div><dt>Item total {savings > 0 && <s>{money(mrpTotal)}</s>}</dt><dd>{money(subtotal)}</dd></div>
        <div><dt>Delivery fee</dt><dd className={deliveryFee ? "" : "free"}>{deliveryFee ? money(deliveryFee) : <><s>{money(MART_DELIVERY_FEE)}</s> FREE</>}</dd></div>
        {tip > 0 && <div><dt>Delivery partner tip</dt><dd>{money(tip)}</dd></div>}
        <div className="total"><dt>To pay</dt><dd>{money(total)}</dd></div>
      </dl>
      {savings > 0 && <p className="mc-saving"><Sparkles size={15}/> You're saving {money(savings)} on this order</p>}
    </div>
    <ul className="mc-trust"><li><ShieldCheck size={16}/> Secure, encrypted checkout</li><li><Leaf size={16}/> Freshness guaranteed or your money back</li><li><RotateCcw size={16}/> Cancel free until your order is packed</li></ul>
  </aside>;

  const cta = step === 1 ? <button type="button" className="btn btn-primary mc-cta" disabled={!count} onClick={() => setStep(2)}>Continue to delivery <ArrowRight size={17}/></button>
    : step === 2 ? <button type="button" className="btn btn-primary mc-cta" onClick={goPayment}>Continue to payment <ArrowRight size={17}/></button>
    : <button type="button" className="btn btn-primary mc-cta" disabled={busy || !count} onClick={place}>{busy ? <><Loader2 size={17} className="tb-spin"/>{phase === "opening" ? "Opening secure payment…" : phase === "confirming" ? "Confirming payment…" : "Placing your order…"}</> : !user ? <>Log in to place order <ArrowRight size={17}/></> : online ? <><Lock size={16}/> Pay {money(total)} securely</> : <>Place order · {money(total)} <ArrowRight size={17}/></>}</button>;

  return <div className="mc-page">
    <header className="mc-top">
      <div className="mc-wrap mc-top-row">
        <Link to="/" className="mc-logo" aria-label="GoFoode home"><img src="/gofoode-logo.png" alt="GoFoode"/></Link>
        <Stepper step={step} onStep={setStep}/>
        <span className="mc-secure"><Lock size={15}/> Secure checkout</span>
      </div>
    </header>
    <main className="mc-wrap mc-main">
      <button type="button" className="mc-back" onClick={step === 1 ? onBackToShop : () => setStep(step - 1)}><ArrowLeft size={16}/>{step === 1 ? "Back to shopping" : step === 2 ? "Back to basket" : "Back to delivery"}</button>
      <div className="mc-grid">
        <div className="mc-col">
          {step === 1 && <>
            <section className="mc-card">
              <div className="mc-card-head"><div><h1>Your basket</h1><p>{count} item{count === 1 ? "" : "s"} from GoFoode Mart · delivered together</p></div></div>
              <ul className="mc-lines">{lines.map(({ product, quantity }) => {
                const discount = product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0;
                const max = Math.min(20, Number.isFinite(product.stock) ? product.stock : 20);
                return <li key={product._id}>
                  <img src={product.image || fallbackImage} alt="" onError={onImageError}/>
                  <div className="mc-line-info"><b>{product.name}</b><small>{product.unit}{discount ? <em>{discount}% off</em> : null}</small>{quantity >= max && <small className="warn">Only {max} available</small>}</div>
                  <div className="mc-qty" role="group" aria-label={`Quantity of ${product.name}`}>
                    <button type="button" aria-label={quantity === 1 ? `Remove ${product.name}` : `One fewer ${product.name}`} onClick={() => changeQuantity(product, quantity - 1)}>{quantity === 1 ? <Trash2 size={15}/> : <Minus size={15}/>}</button>
                    <b aria-live="polite">{quantity}</b>
                    <button type="button" aria-label={`One more ${product.name}`} disabled={quantity >= max} onClick={() => changeQuantity(product, quantity + 1)}><Plus size={15}/></button>
                  </div>
                  <div className="mc-line-price"><b>{money(product.price * quantity)}</b>{product.mrp > product.price && <s>{money(product.mrp * quantity)}</s>}</div>
                </li>;
              })}</ul>
            </section>
            {toFree > 0 && topUps.length > 0 && <section className="mc-card">
              <div className="mc-card-head"><div><h2>Add {money(toFree)} more for free delivery</h2><p>Quick picks that get you there.</p></div></div>
              <div className="mc-topups">{topUps.map(product => <div className="mc-topup" key={product._id}><img src={product.image || fallbackImage} alt="" onError={onImageError}/><b>{product.name}</b><small>{product.unit}</small><div><span>{money(product.price)}</span><button type="button" onClick={() => changeQuantity(product, 1)} aria-label={`Add ${product.name}`}><Plus size={15}/> Add</button></div></div>)}</div>
            </section>}
            <section className="mc-card">
              <div className="mc-card-head"><div><h2>If an item is unavailable</h2><p>Fresh stock changes through the day. Tell us what you'd prefer.</p></div></div>
              <div className="mc-choice-grid" role="radiogroup" aria-label="If an item is unavailable">{SUBSTITUTIONS.map(([id, title, text, Icon]) => <button type="button" role="radio" aria-checked={substitution === id} key={id} className={`mc-choice ${substitution === id ? "on" : ""}`} onClick={() => setSubstitution(id)}><Icon size={18}/><span><b>{title}</b><small>{text}</small></span><i className="mc-radio"/></button>)}</div>
            </section>
          </>}

          {step === 2 && <>
            <section className="mc-card">
              <div className="mc-card-head"><div><h1>Delivery address</h1><p>Where should we bring your groceries?</p></div>{addresses.length > 0 && <button type="button" className="mc-link" onClick={() => setAddingNew(value => !value)}>{addingNew ? "Use a saved address" : <><Plus size={15}/> Add new address</>}</button>}</div>
              {!addingNew && addresses.length > 0 && <div className="mc-addresses" role="radiogroup" aria-label="Saved addresses">{addresses.map(row => { const Icon = addressIcon(row.label); return <button type="button" role="radio" aria-checked={addressId === row._id} key={row._id} className={`mc-address ${addressId === row._id ? "on" : ""}`} onClick={() => { setAddressId(row._id); setFieldError(""); }}>
                <span className="mc-address-icon"><Icon size={18}/></span><span><b>{row.label || "Address"}{row.isDefault && <em>Default</em>}</b><small>{row.name} · {row.phone}</small><small>{[row.street, row.city, row.state, row.postalCode].filter(Boolean).join(", ")}</small></span><i className="mc-radio"/>
              </button>; })}</div>}
              {addingNew && <div className="mc-form">
                <div className="mc-label-chips" role="radiogroup" aria-label="Address type">{["Home", "Work", "Other"].map(label => { const Icon = addressIcon(label); return <button type="button" role="radio" aria-checked={draft.label === label} key={label} className={draft.label === label ? "on" : ""} onClick={() => setDraft({ ...draft, label })}><Icon size={15}/>{label}</button>; })}</div>
                <div className="mc-row"><label>Receiver's name<input value={draft.name} autoComplete="name" onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Full name"/></label><label>Phone number<input value={draft.phone} type="tel" inputMode="tel" autoComplete="tel" onChange={event => setDraft({ ...draft, phone: event.target.value })} placeholder="+91 98765 43210"/></label></div>
                <label>Flat, building and street<input value={draft.street} autoComplete="street-address" onChange={event => setDraft({ ...draft, street: event.target.value })} placeholder="e.g. B-204, Green Park Apartments, Sector 15"/></label>
                <div className="mc-row three"><label>City<input value={draft.city} autoComplete="address-level2" onChange={event => setDraft({ ...draft, city: event.target.value })} placeholder="City"/></label><label>State<input value={draft.state} autoComplete="address-level1" onChange={event => setDraft({ ...draft, state: event.target.value })} placeholder="State"/></label><label>PIN code<input value={draft.postalCode} inputMode="numeric" maxLength={6} autoComplete="postal-code" onChange={event => setDraft({ ...draft, postalCode: event.target.value.replace(/\D/g, "") })} placeholder="121007"/></label></div>
                {location?.city && !draft.city && <button type="button" className="mc-link" onClick={() => setDraft({ ...draft, city: location.city || "", state: location.state || "", postalCode: location.postalCode || "" })}><MapPin size={14}/> Use {location.label}</button>}
                {isCustomer && <label className="mc-check"><input type="checkbox" checked={draft.save} onChange={event => setDraft({ ...draft, save: event.target.checked })}/> Save this address for next time</label>}
              </div>}
              {fieldError && <p className="mc-alert error" role="alert"><AlertTriangle size={16}/>{fieldError}</p>}
            </section>
            <section className="mc-card">
              <div className="mc-card-head"><div><h2>Delivery time</h2><p>Express, or a two-hour window that suits you.</p></div></div>
              <button type="button" className={`mc-express ${slot.kind === "express" ? "on" : ""}`} disabled={!options.express} onClick={() => setSlot({ kind: "express" })} aria-pressed={slot.kind === "express"}>
                <span className="mc-express-icon"><Zap size={20}/></span><span><b>Express delivery</b><small>{options.express ? `Arrives in 15–20 min · by about ${istClock(new Date(Date.now() + 20 * 60000))}` : "Available 7 AM – 10:30 PM"}</small></span><i className="mc-radio"/>
              </button>
              {options.days.map(day => <div className="mc-slot-day" key={day.label}><span><CalendarClock size={15}/>{day.label}<small>{day.date}</small></span><div className="mc-slots">{day.slots.map(entry => <button type="button" key={entry.start} aria-pressed={slot.kind === "scheduled" && slot.start === entry.start} className={slot.kind === "scheduled" && slot.start === entry.start ? "on" : ""} onClick={() => setSlot({ kind: "scheduled", start: entry.start })}>{entry.label}</button>)}</div></div>)}
            </section>
            <section className="mc-card">
              <div className="mc-card-head"><div><h2>Delivery instructions <em>(optional)</em></h2><p>Helps your delivery partner find you quickly.</p></div></div>
              <div className="mc-note-chips">{NOTE_CHIPS.map(([label, Icon]) => <button type="button" key={label} aria-pressed={chips.includes(label)} className={chips.includes(label) ? "on" : ""} onClick={() => toggleChip(label)}><Icon size={15}/>{label}</button>)}</div>
              <textarea className="mc-textarea" rows={2} maxLength={180} value={note} onChange={event => setNote(event.target.value)} placeholder="Landmark, gate code or anything else (optional)"/>
            </section>
          </>}

          {step === 3 && <>
            <section className="mc-card mc-review">
              <div className="mc-review-row"><MapPin size={18}/><div><small>Deliver to {address.label ? `· ${address.label}` : ""}</small><b>{address.name} · {address.phone}</b><p>{[address.street, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}</p></div><button type="button" className="mc-link" onClick={() => setStep(2)}><Pencil size={14}/> Change</button></div>
              <div className="mc-review-row"><Clock size={18}/><div><small>Delivery time</small><b>{slotSummary(slot)}</b>{instructions && <p>{instructions}</p>}</div><button type="button" className="mc-link" onClick={() => setStep(2)}><Pencil size={14}/> Change</button></div>
            </section>
            <section className="mc-card">
              <div className="mc-card-head"><div><h1>Payment method</h1><p>{payConfig?.testMode ? "Test mode: no real money moves." : "All online payments are encrypted and processed securely."}</p></div>{payConfig?.testMode && <span className="mc-badge">Test mode</span>}</div>
              <div className="mc-pay" role="radiogroup" aria-label="Payment method">{PAY_METHODS.map(([id, title, text, Icon]) => {
                const disabled = id !== "cod" && payConfig && !payConfig.gateway;
                return <button type="button" role="radio" aria-checked={method === id} key={id} disabled={disabled} className={`mc-choice ${method === id ? "on" : ""}`} onClick={() => setMethod(id)}><span className="mc-pay-icon"><Icon size={19}/></span><span><b>{title}</b><small>{disabled ? "Not available right now" : text}</small></span><i className="mc-radio"/></button>;
              })}</div>
              {payConfig && !payConfig.gateway && <p className="mc-alert info"><Info size={16}/> Online payment isn't set up on this server yet, so cash on delivery is selected.</p>}
            </section>
            <section className="mc-card">
              <div className="mc-card-head"><div><h2>Tip your delivery partner <em>(optional)</em></h2><p>A small thank-you for bringing your groceries to the door.</p></div></div>
              <div className="mc-tips" role="radiogroup" aria-label="Tip amount">{TIPS.map(value => <button type="button" role="radio" aria-checked={tip === value} key={value} className={tip === value ? "on" : ""} onClick={() => setTip(value)}>{value ? money(value) : "No tip"}</button>)}</div>
            </section>
          </>}

          {error && <p className={`mc-alert ${error.tone}`} role="alert"><AlertTriangle size={16}/>{error.text}</p>}
          <div className="mc-actions">{cta}</div>
          {step === 3 && <p className="mc-fine"><ShieldCheck size={14}/> By placing this order you agree to GoFoode's terms. You can cancel for free until it's packed.</p>}
        </div>
        {summary}
      </div>
    </main>
    <div className="mc-mobile-bar"><div><b>{money(total)}</b><small>{count} item{count === 1 ? "" : "s"} · {deliveryFee ? `+${money(deliveryFee)} delivery` : "free delivery"}</small></div>{cta}</div>
    {gateway.element}
  </div>;
}

/* ───────── Order page: confirmation, live tracking, payment recovery, invoice ───────── */

const TRACK = [["placed", "Order placed", Receipt], ["packed", "Packed", PackageCheck], ["out_for_delivery", "On the way", Bike], ["delivered", "Delivered", CheckCircle2]];
const groceryPaymentCopy = {
  title: "Complete your payment",
  text: "Your groceries are reserved. We start packing as soon as your payment succeeds.",
  paid: "Payment successful. Your groceries are being packed.",
  cancelConfirm: "Cancel this order? Nothing has been charged."
};
// Same outcomes as food checkout, in grocery words.
function describeGroceryOutcome(outcome) {
  if (outcome?.status === "paid") return { tone: "success", text: "Payment successful. Your groceries are being packed." };
  if (outcome?.status === "dismissed") return { tone: "info", text: "Payment wasn't completed. Your groceries are reserved for a few minutes, so you can pay below." };
  if (outcome?.status === "confirming") return { tone: "info", text: "We're confirming your payment with the bank. This page updates on its own; you won't be charged twice." };
  return describePaymentOutcome(outcome);
}
const paymentStatusText = { pending: "To pay", paid: "Paid", failed: "Failed", cancelled: "Not charged", refund_pending: "Refund in progress", partially_refunded: "Partly refunded", refunded: "Refunded" };

function useTicker(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  return now;
}

export function MartOrderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [order, setOrder] = useState(null), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(() => describeGroceryOutcome(routerLocation.state?.outcome));
  const justPlaced = Boolean(routerLocation.state?.justPlaced);
  const load = () => api.get(`/grocery/orders/${id}`).then(response => { setOrder(response.data); setLoadError(""); }).catch(error => setLoadError(errorMessage(error, "We couldn't load this order.")));
  useEffect(() => { load(); }, [id]);
  const live = order && !["delivered", "cancelled"].includes(order.status);
  useEffect(() => { if (!live) return; const timer = setInterval(load, order.status === "awaiting_payment" ? 5000 : 10000); return () => clearInterval(timer); }, [live, order?.status]);
  const now = useTicker(order?.status === "awaiting_payment");

  if (loadError) return <main className="mc-wrap mo-page"><div className="mc-card mo-empty"><AlertTriangle size={28}/><h1>Order unavailable</h1><p>{loadError}</p><Link className="btn btn-primary" to="/customer/grocery-orders">See your grocery orders</Link></div></main>;
  if (!order) return <main className="mc-wrap mo-page"><div className="mo-skeleton"><i/><i/><i/></div></main>;

  const reached = TRACK.findIndex(([status]) => status === order.status);
  const cancelled = order.status === "cancelled";
  const awaiting = order.status === "awaiting_payment";
  const count = order.items.reduce((sum, line) => sum + line.quantity, 0);
  const mrp = order.items.reduce((sum, line) => sum + Math.max(line.mrp || 0, line.price) * line.quantity, 0);
  const savings = mrp - order.subtotal;
  const placedAt = new Date(order.placedAt || order.createdAt);
  const etaAt = order.deliverySlot?.kind === "scheduled" && order.deliverySlot.end ? new Date(order.deliverySlot.end) : new Date(placedAt.getTime() + 20 * 60000);
  // Once the promised time has passed, show when it was placed instead of a stale arrival time.
  const overdue = !["delivered", "cancelled", "awaiting_payment"].includes(order.status) && Date.now() > etaAt.getTime() + 30 * 60000;
  const placedLabel = placedAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const eta = order.deliverySlot?.kind === "scheduled" ? order.deliverySlot.label : `By about ${istClock(etaAt)}`;
  const headline = cancelled ? "Order cancelled" : awaiting ? "Almost there: complete your payment" : order.status === "delivered" ? "Delivered. Enjoy!" : order.status === "out_for_delivery" ? "Your groceries are on the way" : order.status === "packed" ? "Packed and ready to go" : "Order confirmed!";

  const cancel = async () => {
    if (!window.confirm(order.paymentStatus === "paid" ? "Cancel this order? Your payment will be refunded to the original method." : "Cancel this order?")) return;
    setBusy(true);
    try { const { data } = await api.patch(`/grocery/orders/${order._id}/cancel`, { reason: "Cancelled by customer" }); setOrder(data); setNotice({ tone: "info", text: data.message }); }
    catch (error) { setNotice({ tone: "error", text: errorMessage(error, "We couldn't cancel this order.") }); load(); }
    finally { setBusy(false); }
  };
  const buyAgain = () => {
    try {
      const basket = JSON.parse(localStorage.getItem("gofoode-mart-basket") || "{}");
      order.items.forEach(line => { if (line.product) basket[line.product] = Math.min(20, (basket[line.product] || 0) + line.quantity); });
      localStorage.setItem("gofoode-mart-basket", JSON.stringify(basket));
    } catch { /* storage unavailable */ }
    navigate("/instamart", { state: { openBasket: true } });
  };

  return <main className="mc-wrap mo-page">
    <section className={`mo-hero ${cancelled ? "cancelled" : awaiting ? "pending" : ""}`}>
      {justPlaced && !cancelled && !awaiting && <div className="mo-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--i": index }}/>)}</div>}
      <span className="mo-hero-icon">{cancelled ? <XCircle size={30}/> : awaiting ? <Lock size={28}/> : order.status === "delivered" ? <PartyPopper size={30}/> : <CheckCircle2 size={30}/>}</span>
      <div className="mo-hero-copy">
        <span className="mo-number">Order {order.orderNumber}</span>
        <h1>{headline}</h1>
        <p>{cancelled ? `${order.cancellationReason || "This order was cancelled."}${order.paymentStatus === "refund_pending" || order.paymentStatus === "refunded" ? ` A refund of ${exactMoney(order.refundedAmount || order.totalAmount)} ${order.paymentStatus === "refunded" ? "has been processed" : "is on its way"} to your original payment method.` : order.paymentStatus === "cancelled" ? " Nothing was charged." : ""}`
          : awaiting ? "Your items are reserved for a few minutes while you pay."
          : order.status === "delivered" ? `${count} item${count === 1 ? "" : "s"} delivered to ${order.address?.label || "your address"}.`
          : overdue ? <>Placed on <b>{placedLabel}</b>. We'll update this page as soon as it moves.</>
          : <>Arriving <b>{eta}</b> at {order.address?.label ? `your ${order.address.label.toLowerCase()} address` : "your address"}.</>}</p>
      </div>
      {!cancelled && !awaiting && <div className="mo-eta"><Clock size={18}/><span><small>{order.status === "delivered" ? "Delivered" : overdue ? "Placed" : "Estimated arrival"}</small><b>{order.status === "delivered" ? new Date(order.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : overdue ? placedLabel : order.deliverySlot?.kind === "scheduled" ? order.deliverySlot.label.split(" · ").pop() : istClock(etaAt)}</b></span></div>}
    </section>

    {notice && <p className={`mc-alert ${notice.tone}`} role="status"><Info size={16}/>{notice.text}</p>}

    {awaiting && order.payment && <PaymentActionCard payment={order.payment} now={now} onChanged={load} notify={text => setNotice({ tone: "success", text })} copy={groceryPaymentCopy}/>}

    {!cancelled && !awaiting && <section className="mc-card mo-track" aria-label="Order progress">
      <ol>{TRACK.map(([status, label, Icon], index) => <li key={status} className={index < reached ? "done" : index === reached ? "now" : ""} aria-current={index === reached ? "step" : undefined}><span><Icon size={18}/></span><b>{label}</b>{index === 0 && <small>{Date.now() - placedAt.getTime() > 20 * 3600000 ? placedLabel : placedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</small>}</li>)}</ol>
      <p><Info size={15}/> This page updates on its own. {order.substitution === "call" ? "We'll call you if anything is out of stock." : order.substitution === "similar" ? "Out-of-stock items will be replaced with a close match." : "Out-of-stock items will be removed and refunded."}</p>
    </section>}

    <div className="mo-grid">
      <section className="mc-card mo-items">
        <div className="mc-card-head"><div><h2>Items ({count})</h2>{savings > 0 && <p className="mo-saved">You saved {money(savings)} on MRP</p>}</div></div>
        <ul>{order.items.map(line => <li key={String(line.product || line.name)}><img src={line.image || fallbackImage} alt="" onError={onImageError}/><div><b>{line.name}</b><small>{line.unit ? `${line.unit} · ` : ""}{line.quantity} × {money(line.price)}</small></div><span>{money(line.price * line.quantity)}</span></li>)}</ul>
      </section>
      <div className="mo-side">
        <section className="mc-card">
          <h2>Bill details</h2>
          <dl className="mc-bill">
            <div><dt>Item total {savings > 0 && <s>{money(mrp)}</s>}</dt><dd>{money(order.subtotal)}</dd></div>
            <div><dt>Delivery fee</dt><dd className={order.deliveryFee ? "" : "free"}>{order.deliveryFee ? money(order.deliveryFee) : "FREE"}</dd></div>
            {order.tip > 0 && <div><dt>Delivery partner tip</dt><dd>{money(order.tip)}</dd></div>}
            <div className="total"><dt>{order.paymentStatus === "paid" ? "Paid" : "Total"}</dt><dd>{exactMoney(order.totalAmount)}</dd></div>
          </dl>
          <p className="mo-pay"><span>{paymentMethodLabel(order.paymentMethod)}</span><em className={`mo-pay-status ${order.paymentStatus}`}>{order.paymentMethod === "cod" && order.paymentStatus === "pending" ? "Pay on delivery" : paymentStatusText[order.paymentStatus] || order.paymentStatus}</em></p>
        </section>
        <section className="mc-card mo-address">
          <h2>Delivery details</h2>
          <p><MapPin size={16}/><span><b>{order.address?.name} · {order.address?.phone}</b>{[order.address?.street, order.address?.city, order.address?.state, order.address?.postalCode].filter(Boolean).join(", ")}</span></p>
          <p><Clock size={16}/><span><b>{order.deliverySlot?.label || "Express"}</b>{order.instructions || "No delivery instructions"}</span></p>
        </section>
      </div>
    </div>

    <div className="mo-actions">
      {order.canCancel && !awaiting && <button type="button" className="btn btn-outline mo-cancel" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel order"}</button>}
      <button type="button" className="btn btn-outline" onClick={() => window.print()}><Printer size={16}/> Print invoice</button>
      <button type="button" className="btn btn-outline" onClick={buyAgain}><Repeat size={16}/> Buy these again</button>
      <Link className="btn btn-primary" to="/instamart">Continue shopping <ArrowRight size={16}/></Link>
    </div>
    <p className="mo-help"><Link to="/customer/grocery-orders">All grocery orders <ChevronRight size={14}/></Link></p>
  </main>;
}
