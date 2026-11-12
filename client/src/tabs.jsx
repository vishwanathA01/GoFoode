// Dineout, Pickup & drop, Events, Offers and Plus: the marketplace tabs beyond food and groceries.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight, ArrowRight, Bike, Briefcase, Cake, CalendarDays, CalendarPlus, Calculator, Check, CheckCircle2, ChevronRight, Clock, Copy, Crown,
  FileText, Gift, Headphones, Heart, Hourglass, Info, KeyRound, Laptop, Loader2, MapPin, Minus, Moon, Package, PackageOpen, PartyPopper, Plus,
  Route, Search, ShieldCheck, Sparkles, Star, Store, Sun, TicketPercent, Truck, Users, Utensils, X
} from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";
import { cuisinePhoto, photos, restaurantCover } from "./media";

const money = n => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const pad = n => String(n).padStart(2, "0");
const localDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const errorText = (error, fallback) => !error?.response ? "We couldn't reach GoFoode. Check your connection and try again." : error.response.data?.message || fallback;
const FOOD_DELIVERY_FEE = 35;

// "6:30 PM" or "18:30" → minutes after midnight.
function clockMinutes(text) {
  const match = String(text || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const suffix = match[3]?.toUpperCase();
  if (suffix) hours = (hours % 12) + (suffix === "PM" ? 12 : 0);
  return hours * 60 + Number(match[2]);
}
function clockLabel(text) {
  const minutes = clockMinutes(text);
  if (minutes == null) return text || "";
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${pad(minutes % 60)} ${hours < 12 ? "AM" : "PM"}`;
}
const shortDate = date => date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// Saves an .ics file that any calendar app (Google, Apple, Outlook) can open.
const icsStamp = date => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = value => String(value || "").replace(/[\\;,]/g, match => `\\${match}`).replace(/\r?\n/g, "\\n");
function downloadCalendarEvent({ title, start, minutes = 120, location = "", details = "" }) {
  const end = new Date(start.getTime() + minutes * 60000);
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GoFoode//Plans//EN", "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@gofoode`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`, `SUMMARY:${icsText(title)}`, `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(details)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "gofoode-plan"}.ics` });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function TabHero({ image, alt, crumb, eyebrow, title, lead, tone = "dark", aside, children }) {
  return <section className={`tb-hero ${tone}`}>
    <img className="tb-hero-bg" src={image} alt={alt} fetchpriority="high"/>
    <div className="tb-hero-shade" aria-hidden="true"/>
    <div className="tb-wrap tb-hero-inner">
      <div className="tb-hero-copy">
        <nav className="fd-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><ChevronRight size={14}/><span>{crumb}</span></nav>
        <span className="fd-eyebrow light">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{lead}</p>
        {children}
      </div>
      {aside && <div className="tb-hero-aside">{aside}</div>}
    </div>
  </section>;
}
function SectionHead({ eyebrow, icon: Icon = Sparkles, title, lead, children }) {
  return <div className="fd-head tb-head"><div><span className="fd-eyebrow"><Icon size={14}/>{eyebrow}</span><h2>{title}</h2>{lead && <p>{lead}</p>}</div>{children}</div>;
}
function Notice({ tone = "info", children, onClose }) {
  const Icon = tone === "success" ? CheckCircle2 : Info;
  return <div className={`tb-notice ${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={18}/><div>{children}</div>{onClose && <button type="button" aria-label="Dismiss message" onClick={onClose}><X size={16}/></button>}</div>;
}
function Stepper({ value, min = 1, max = 10, onChange, label }) {
  return <div className="tb-stepper" role="group" aria-label={label}>
    <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={16}/></button>
    <b aria-live="polite">{value}</b>
    <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16}/></button>
  </div>;
}
function Steps({ items }) {
  return <ol className="tb-steps">{items.map(([Icon, title, text], index) => <li key={title}><span className="tb-step-icon"><Icon size={20}/><i>{index + 1}</i></span><div><b>{title}</b><small>{text}</small></div></li>)}</ol>;
}
function SignInCard({ from, text }) {
  return <div className="tb-signin"><Users size={20}/><p>{text}</p><Link className="btn btn-primary" to="/login" state={{ from }}>Log in <ArrowRight size={15}/></Link></div>;
}
const fallbackTo = src => event => { event.currentTarget.onerror = null; event.currentTarget.src = src; };

/* ───────────────────────── Dineout ───────────────────────── */

const slotRange = (from, to) => { const list = []; for (let minute = from; minute <= to; minute += 30) list.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`); return list; };
const LUNCH_SLOTS = slotRange(12 * 60, 15 * 60 + 30);
const DINNER_SLOTS = slotRange(19 * 60, 22 * 60 + 30);
const OCCASIONS = [["Birthday", Cake], ["Anniversary", Heart], ["Date night", Moon], ["Family meal", Users], ["Business", Briefcase], ["Celebration", PartyPopper]];
const reservationStatus = { requested: "Awaiting confirmation", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed" };
// Reservation dates are stored as midnight UTC of the chosen day; read them back as that calendar day.
function reservationStart(row) {
  const day = new Date(row.date);
  const start = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  start.setMinutes(clockMinutes(row.time) ?? 19 * 60);
  return start;
}

export function DineoutView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index); return day; }), []);
  const lastDay = useMemo(() => { const day = new Date(days[0]); day.setDate(day.getDate() + 60); return localDay(day); }, [days]);
  const [restaurants, setRestaurants] = useState([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(""), [cuisine, setCuisine] = useState("All"), [sort, setSort] = useState("rating");
  // Late in the evening today has no slots left, so start on tomorrow instead of a row of crossed-out times.
  const [form, setForm] = useState(() => {
    const now = new Date();
    const lateToday = now.getHours() * 60 + now.getMinutes() + 30 >= clockMinutes(DINNER_SLOTS[DINNER_SLOTS.length - 1]);
    return { restaurantId: "", date: localDay(days[lateToday ? 1 : 0]), time: "", guests: 2, occasion: "", notes: "" };
  });
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [booked, setBooked] = useState(null);
  const bookingRef = useRef(null);

  useEffect(() => {
    api.get("/restaurants").then(response => setRestaurants(Array.isArray(response.data) ? response.data : []))
      .catch(() => setLoadError("Restaurants couldn't be loaded. Please refresh to try again.")).finally(() => setLoading(false));
  }, []);
  const loadRows = () => { if (isCustomer) api.get("/reservations/mine").then(response => setRows(Array.isArray(response.data) ? response.data : [])).catch(() => {}); else setRows([]); };
  useEffect(loadRows, [isCustomer]);

  const now = new Date();
  const isToday = form.date === localDay(now);
  const slotOpen = slot => !isToday || clockMinutes(slot) > now.getHours() * 60 + now.getMinutes() + 30;
  const anySlotOpen = [...LUNCH_SLOTS, ...DINNER_SLOTS].some(slotOpen);
  useEffect(() => { if (form.time && !slotOpen(form.time)) setForm(current => ({ ...current, time: "" })); }, [form.date]);

  const cuisines = useMemo(() => {
    const counts = new Map();
    restaurants.forEach(restaurant => (restaurant.cuisine || []).forEach(name => counts.set(name, (counts.get(name) || 0) + 1)));
    return ["All", ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name)];
  }, [restaurants]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return restaurants
      .filter(restaurant => cuisine === "All" || (restaurant.cuisine || []).includes(cuisine))
      .filter(restaurant => !needle || [restaurant.name, restaurant.description, ...(restaurant.cuisine || []), restaurant.address?.city].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => sort === "rating" ? (b.rating || 0) - (a.rating || 0) : a.name.localeCompare(b.name));
  }, [restaurants, query, cuisine, sort]);
  const selected = restaurants.find(restaurant => restaurant._id === form.restaurantId);
  const chosenDay = new Date(`${form.date}T00:00`);
  const customDay = !days.some(day => localDay(day) === form.date);
  const summary = `${selected ? `${selected.name} · ` : ""}Table for ${form.guests} · ${shortDate(chosenDay)}${form.time ? ` · ${clockLabel(form.time)}` : ""}`;

  const scrollTo = element => element?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const choose = id => { setForm(current => ({ ...current, restaurantId: id })); setNotice(null); setBooked(null); requestAnimationFrame(() => scrollTo(bookingRef.current)); };
  const update = (key, value) => { setForm(current => ({ ...current, [key]: value })); if (notice?.tone === "error") setNotice(null); };
  const submit = async event => {
    event.preventDefault();
    if (!user) { navigate("/login", { state: { from: "/dineout" } }); return; }
    if (!isCustomer) { setNotice({ tone: "error", text: "Table requests are made from a customer account." }); return; }
    if (!form.restaurantId) { setNotice({ tone: "error", text: "Choose a restaurant first." }); return; }
    if (!form.time) { setNotice({ tone: "error", text: "Pick a time slot for your table." }); return; }
    setBusy(true); setNotice(null);
    try {
      const { data } = await api.post("/reservations", form);
      setBooked(data);
      setForm(current => ({ ...current, occasion: "", notes: "" }));
      loadRows();
    } catch (error) { setNotice({ tone: "error", text: errorText(error, "We couldn't send that request. Please try again.") }); }
    finally { setBusy(false); }
  };
  const cancel = async row => {
    try { await api.patch(`/reservations/${row._id}/cancel`); setNotice({ tone: "info", text: `Your table at ${row.restaurant?.name || "the restaurant"} was cancelled.` }); if (booked?._id === row._id) setBooked(null); loadRows(); }
    catch (error) { setNotice({ tone: "error", text: errorText(error, "This reservation can't be cancelled any more.") }); }
  };
  const addToCalendar = row => downloadCalendarEvent({
    title: `Table at ${row.restaurant?.name || "the restaurant"}`, start: reservationStart(row), minutes: 90,
    location: [row.restaurant?.name, row.restaurant?.address?.city].filter(Boolean).join(", "),
    details: `Table for ${row.guests}${row.occasion ? ` · ${row.occasion}` : ""}. Requested with GoFoode Dineout.`
  });
  const upcoming = rows.filter(row => row.status !== "cancelled" && row.status !== "completed" && reservationStart(row) > new Date(Date.now() - 2 * 3600000)).sort((a, b) => reservationStart(a) - reservationStart(b));
  const earlier = rows.filter(row => !upcoming.includes(row));
  const reservationRow = row => <article className="tb-res" key={row._id}>
    <img src={restaurantCover(row.restaurant, 240)} alt="" onError={fallbackTo(cuisinePhoto(row.restaurant?.cuisine, 240))}/>
    <div><b>{row.restaurant?.name || "Restaurant"}</b><small>{shortDate(reservationStart(row))} · {clockLabel(row.time)} · {row.guests} guest{row.guests === 1 ? "" : "s"}</small><span className={`tb-status ${row.status}`}>{reservationStatus[row.status] || row.status}</span></div>
    {(row.status === "requested" || row.status === "confirmed") && reservationStart(row) > new Date() && <div className="tb-res-actions">
      <button type="button" className="tb-icon-btn" onClick={() => addToCalendar(row)} aria-label={`Add table at ${row.restaurant?.name || "restaurant"} to calendar`} title="Add to calendar"><CalendarPlus size={17}/></button>
      {row.status === "requested" && <button type="button" className="tb-text-btn danger" onClick={() => cancel(row)}>Cancel</button>}
    </div>}
  </article>;

  return <main className="tb-page dineout">
    <TabHero image={photos.dining} alt="A warmly lit restaurant dining room" crumb="Dineout" eyebrow={<><Utensils size={14}/> GoFoode Dineout</>}
      title={<>Make room for <em>good times.</em></>} lead="Find a table that fits the moment — a relaxed dinner, a celebration or a spontaneous catch-up with friends."
      aside={<div className="tb-ticket-preview" aria-hidden="true">
        <span className="tb-tp-label"><Sparkles size={13}/> Your table</span>
        <b>{selected?.name || "Pick a place you love"}</b>
        <div><span><CalendarDays size={14}/>{shortDate(chosenDay)}</span><span><Clock size={14}/>{form.time ? clockLabel(form.time) : "Choose a time"}</span><span><Users size={14}/>{form.guests} guest{form.guests === 1 ? "" : "s"}</span></div>
        <i className="tb-tp-cut"/>
        <small><ShieldCheck size={13}/> Free to reserve · no booking fee</small>
      </div>}>
      <form className="tb-search" role="search" onSubmit={event => { event.preventDefault(); scrollTo(document.getElementById("dineout-places")); }}>
        <Search size={19}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search restaurants or cuisines" aria-label="Search restaurants"/>
        <button className="btn btn-primary">Find a table</button>
      </form>
      <div className="tb-hero-stats"><span><b>{restaurants.length || "—"}</b> restaurants</span><span><b>Free</b> to reserve</span><span><b>Lunch & dinner</b> slots</span></div>
    </TabHero>

    <div className="tb-wrap"><Steps items={[[Search, "Find your atmosphere", "Browse photos, cuisine and ratings."], [CalendarDays, "Pick a day & time", "Lunch and dinner slots, up to 60 days ahead."], [CheckCircle2, "Get confirmed", "The restaurant confirms and you're notified."]]}/></div>

    <section className="tb-wrap fd-section" id="dineout-places">
      <SectionHead eyebrow="Tables worth gathering around" icon={Store} title="Choose a restaurant" lead="See the place, its cuisine and rating before you book.">
        <div className="tb-seg" role="group" aria-label="Sort restaurants">
          <button type="button" aria-pressed={sort === "rating"} className={sort === "rating" ? "on" : ""} onClick={() => setSort("rating")}><Star size={14}/> Top rated</button>
          <button type="button" aria-pressed={sort === "name"} className={sort === "name" ? "on" : ""} onClick={() => setSort("name")}>A–Z</button>
        </div>
      </SectionHead>
      <div className="tb-chips" role="group" aria-label="Filter by cuisine">{cuisines.map(name => <button type="button" key={name} aria-pressed={cuisine === name} className={cuisine === name ? "on" : ""} onClick={() => setCuisine(name)}>{name}</button>)}</div>
      {loading ? <div className="tb-place-grid">{[0, 1, 2].map(key => <div className="tb-skeleton" key={key}/>)}</div>
        : loadError ? <Notice tone="error">{loadError}</Notice>
        : shown.length ? <div className="tb-place-grid">{shown.map(restaurant => {
          const picked = form.restaurantId === restaurant._id;
          return <article className={`tb-place ${picked ? "on" : ""}`} key={restaurant._id}>
            <div className="tb-place-photo">
              <img src={restaurantCover(restaurant, 720)} alt="" loading="lazy" onError={fallbackTo(cuisinePhoto(restaurant.cuisine, 720))}/>
              <span className={`tb-rating ${restaurant.rating ? "" : "new"}`}>{restaurant.rating ? <><Star size={13} fill="currentColor"/>{Number(restaurant.rating).toFixed(1)}</> : "New"}</span>
              {picked && <span className="tb-picked"><Check size={14}/> Selected</span>}
            </div>
            <div className="tb-place-body">
              <h3>{restaurant.name}</h3>
              <p className="tb-meta">{(restaurant.cuisine || []).join(" · ") || "Multi-cuisine"}{restaurant.address?.city ? ` · ${restaurant.address.city}` : ""}</p>
              <p className="tb-desc">{restaurant.description || "A neighbourhood favourite on GoFoode."}</p>
              <div className="tb-place-actions">
                <button type="button" className={`btn ${picked ? "btn-outline" : "btn-primary"}`} onClick={() => choose(restaurant._id)}>{picked ? <><Check size={15}/> Selected</> : <>Reserve a table <ArrowRight size={15}/></>}</button>
                <Link to={`/restaurants/${restaurant._id}`} className="fd-link">Menu <ArrowRight size={14}/></Link>
              </div>
            </div>
          </article>;
        })}</div>
        : <div className="tb-empty"><Search size={26}/><b>No restaurants match that search</b><p>Try another cuisine or clear the filters.</p><button type="button" className="btn btn-outline" onClick={() => { setQuery(""); setCuisine("All"); }}>Clear filters</button></div>}
    </section>

    <section className="tb-wrap fd-section" id="dineout-booking" ref={bookingRef}>
      <SectionHead eyebrow="A few details, then you're set" icon={CalendarDays} title="Book your table" lead="Pick a day, a time and how many of you are coming. The restaurant confirms your request."/>
      <div className="tb-book-grid">
        <form className="tb-card tb-book-form" onSubmit={submit} noValidate>
          <fieldset><legend>Restaurant</legend>
            {selected ? <div className="tb-selected">
              <img src={restaurantCover(selected, 240)} alt="" onError={fallbackTo(cuisinePhoto(selected.cuisine, 240))}/>
              <div><b>{selected.name}</b><small>{(selected.cuisine || []).join(" · ")}{selected.rating ? ` · ★ ${Number(selected.rating).toFixed(1)}` : ""}</small></div>
              <button type="button" className="tb-text-btn" onClick={() => scrollTo(document.getElementById("dineout-places"))}>Change</button>
            </div> : <div className="tb-select"><Store size={18}/><select aria-label="Restaurant" value={form.restaurantId} onChange={event => update("restaurantId", event.target.value)}><option value="">Choose a restaurant</option>{restaurants.map(restaurant => <option key={restaurant._id} value={restaurant._id}>{restaurant.name}</option>)}</select></div>}
          </fieldset>
          <fieldset><legend>Day</legend>
            <div className="tb-days">
              {days.map((day, index) => { const value = localDay(day); return <button type="button" key={value} aria-pressed={form.date === value} className={form.date === value ? "on" : ""} onClick={() => update("date", value)}>
                <small>{index === 0 ? "Today" : index === 1 ? "Tomorrow" : day.toLocaleDateString("en-IN", { weekday: "short" })}</small><b>{day.getDate()}</b><small>{day.toLocaleDateString("en-IN", { month: "short" })}</small>
              </button>; })}
              <label className={`tb-day-more ${customDay ? "on" : ""}`}><CalendarDays size={17}/><span>{customDay ? shortDate(chosenDay) : "More dates"}</span><input type="date" aria-label="Pick another date" min={localDay(days[0])} max={lastDay} value={form.date} onClick={event => { try { event.currentTarget.showPicker?.(); } catch {} }} onChange={event => event.target.value && update("date", event.target.value)}/></label>
            </div>
          </fieldset>
          <fieldset><legend>Time</legend>
            {[["Lunch", Sun, LUNCH_SLOTS], ["Dinner", Moon, DINNER_SLOTS]].map(([label, Icon, slots]) => <div className="tb-slot-group" key={label}>
              <span><Icon size={15}/>{label}</span>
              <div className="tb-slots">{slots.map(slot => <button type="button" key={slot} disabled={!slotOpen(slot)} aria-pressed={form.time === slot} className={form.time === slot ? "on" : ""} onClick={() => update("time", slot)}>{clockLabel(slot)}</button>)}</div>
            </div>)}
            {isToday && !anySlotOpen && <p className="tb-hint"><Info size={14}/> Today's slots are over. Pick another day.</p>}
          </fieldset>
          <fieldset className="tb-inline"><legend>Guests</legend><Stepper value={form.guests} min={1} max={20} onChange={value => update("guests", value)} label="guests"/><small>{form.guests >= 10 ? "Large group — the restaurant may call to confirm." : "Up to 20 guests per request."}</small></fieldset>
          <fieldset><legend>Occasion <em>(optional)</em></legend>
            <div className="tb-chips small">{OCCASIONS.map(([label, Icon]) => <button type="button" key={label} aria-pressed={form.occasion === label} className={form.occasion === label ? "on" : ""} onClick={() => update("occasion", form.occasion === label ? "" : label)}><Icon size={14}/>{label}</button>)}</div>
          </fieldset>
          <label className="tb-field"><span>Special request <em>(optional)</em></span><textarea rows={2} maxLength={300} value={form.notes} onChange={event => update("notes", event.target.value)} placeholder="A window seat, a high chair, a cake at dessert…"/></label>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
          <div className="tb-book-foot">
            <p className="tb-summary"><CalendarDays size={16}/>{summary}</p>
            <button className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={17} className="tb-spin"/> Sending request…</> : !user ? <>Log in to book <ArrowRight size={16}/></> : <>Request this table <ArrowRight size={16}/></>}</button>
          </div>
        </form>

        <aside className="tb-side">
          {booked && <div className="tb-card tb-success" role="status">
            <span className="tb-success-icon"><PartyPopper size={22}/></span>
            <h3>Request sent!</h3>
            <p>{booked.restaurant?.name || "The restaurant"} has your request for {booked.guests} on {shortDate(reservationStart(booked))} at {clockLabel(booked.time)}. We'll notify you when it's confirmed.</p>
            <button type="button" className="btn btn-outline" onClick={() => addToCalendar(booked)}><CalendarPlus size={16}/> Add to calendar</button>
          </div>}
          <div className="tb-card">
            <h3 className="tb-card-title"><CalendarDays size={18}/> Your reservations</h3>
            {!user ? <SignInCard from="/dineout" text="Log in to request tables and see your bookings here."/>
              : !isCustomer ? <p className="tb-muted">Reservations are available on customer accounts.</p>
              : upcoming.length ? <div className="tb-res-list">{upcoming.map(reservationRow)}</div>
              : <p className="tb-muted">No upcoming tables yet. Your requests will appear here.</p>}
            {earlier.length > 0 && <details className="tb-earlier"><summary>Past and cancelled ({earlier.length})</summary><div className="tb-res-list">{earlier.map(reservationRow)}</div></details>}
          </div>
          <div className="tb-card tb-tip"><ShieldCheck size={20}/><div><b>Free to reserve</b><p>There's no booking fee. Plans changed? Cancel any request the restaurant hasn't confirmed yet.</p></div></div>
        </aside>
      </div>
    </section>
  </main>;
}

/* ───────────────────────── Pickup & drop ───────────────────────── */

const PARCEL_TYPES = [["Documents", FileText], ["Keys", KeyRound], ["Lunch box", Utensils], ["Small parcel", Package], ["Gift", Gift], ["Charger or gadget", Laptop]];
const TRIP_STEPS = [["requested", "Requested"], ["accepted", "Partner assigned"], ["picked_up", "Picked up"], ["on_the_way", "On the way"], ["delivered", "Delivered"]];
const tripLabel = status => ({ requested: "Finding a delivery partner", accepted: "Partner on the way to pickup", picked_up: "Parcel picked up", on_the_way: "On the way to drop", delivered: "Delivered", cancelled: "Cancelled" }[status] || status);

export function GenieView({ MapView }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const blank = () => ({ pickup: { name: user?.name || "", phone: user?.phone || "", address: "" }, drop: { name: "", phone: "", address: "" }, itemDescription: "", instructions: "" });
  const [form, setForm] = useState(blank), [rows, setRows] = useState([]), [notice, setNotice] = useState(null), [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const load = () => isCustomer ? api.get("/genie/requests/mine").then(response => setRows(Array.isArray(response.data) ? response.data : [])).catch(() => {}) : Promise.resolve(setRows([]));
  useEffect(() => { load(); if (!isCustomer) return; const timer = setInterval(load, 20000); return () => clearInterval(timer); }, [isCustomer]);
  useEffect(() => { if (user) setForm(current => ({ ...current, pickup: { ...current.pickup, name: current.pickup.name || user.name || "", phone: current.pickup.phone || user.phone || "" } })); }, [user]);
  const change = (section, key, value) => setForm(current => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const swap = () => setForm(current => ({ ...current, pickup: current.drop, drop: current.pickup }));
  const submit = async event => {
    event.preventDefault();
    if (!user) { navigate("/login", { state: { from: "/genie" } }); return; }
    if (!isCustomer) { setNotice({ tone: "error", text: "Pickup requests are made from a customer account." }); return; }
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true); setNotice(null);
    try {
      const { data } = await api.post("/genie/requests", form);
      setNotice({ tone: "success", text: `Request #${data._id.slice(-6).toUpperCase()} is live. A nearby delivery partner can accept it shortly.` });
      setForm(blank());
      await load();
    } catch (error) { setNotice({ tone: "error", text: errorText(error, "We couldn't create this request. Check the details and try again.") }); }
    finally { setBusy(false); }
  };
  const cancel = async request => { try { await api.patch(`/genie/requests/${request._id}/cancel`); setNotice({ tone: "info", text: `Request #${request._id.slice(-6).toUpperCase()} was cancelled.` }); await load(); } catch (error) { setNotice({ tone: "error", text: errorText(error, "This request can no longer be cancelled.") }); } };
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const active = rows.filter(row => !["delivered", "cancelled"].includes(row.status));
  const finished = rows.filter(row => ["delivered", "cancelled"].includes(row.status));
  const requestCard = request => {
    const reached = TRIP_STEPS.findIndex(([status]) => status === request.status);
    return <article className="tb-trip" key={request._id}>
      <div className="tb-trip-top"><div><span className="tb-trip-id">#{request._id.slice(-6).toUpperCase()}</span><b>{request.itemDescription}</b><small>{new Date(request.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small></div><span className={`tb-status ${request.status}`}>{tripLabel(request.status)}</span></div>
      {request.status !== "cancelled" && <ol className="tb-progress" aria-label="Delivery progress">{TRIP_STEPS.map(([status, label], index) => <li key={status} className={index <= reached ? "done" : ""} aria-current={index === reached ? "step" : undefined}><i/><span>{label}</span></li>)}</ol>}
      <div className="tb-route"><div><i className="from"/><span><small>Pickup · {request.pickup?.name}</small><p>{request.pickup?.address}</p></span></div><div><i className="to"/><span><small>Drop · {request.drop?.name}</small><p>{request.drop?.address}</p></span></div></div>
      {request.deliveryPartner && <p className="tb-partner"><Bike size={15}/> {request.deliveryPartner.name} is handling this delivery</p>}
      {MapView && request.currentLocation?.coordinates && <MapView title="Live delivery partner location" latitude={request.currentLocation.coordinates[1]} longitude={request.currentLocation.coordinates[0]} destination={request.drop?.address}/>}
      {request.status === "requested" && <button type="button" className="tb-text-btn danger" onClick={() => cancel(request)}>Cancel request</button>}
    </article>;
  };
  const addressBlock = (section, title, hint, tone) => <div className={`tb-stop ${tone}`}>
    <div className="tb-stop-head"><i/><div><b>{title}</b><small>{hint}</small></div></div>
    <div className="tb-row-2">
      <label className="tb-field"><span>{section === "pickup" ? "Sender's name" : "Recipient's name"}</span><input required maxLength={100} autoComplete={section === "pickup" ? "name" : "off"} value={form[section].name} onChange={event => change(section, "name", event.target.value)} placeholder="Full name"/></label>
      <label className="tb-field"><span>Phone number</span><input required type="tel" inputMode="tel" maxLength={30} value={form[section].phone} onChange={event => change(section, "phone", event.target.value)} placeholder="+91 98765 43210"/></label>
    </div>
    <label className="tb-field"><span>Full address</span><textarea required rows={2} maxLength={400} value={form[section].address} onChange={event => change(section, "address", event.target.value)} placeholder="Flat or building, street, area, city"/></label>
  </div>;

  return <main className="tb-page genie">
    <TabHero image={photos.scooter} alt="A delivery rider on a scooter moving through the city at night" crumb="Pickup & drop" eyebrow={<><Package size={14}/> GoFoode Genie</>}
      title={<>Across town, <em>without the runaround.</em></>} lead="Send documents, keys, lunch boxes and small parcels with a nearby delivery partner, and follow every step until it's delivered."
      aside={<div className="tb-route-card" aria-hidden="true">
        <span className="tb-tp-label"><Route size={13}/> Same-city delivery</span>
        <div className="tb-route mini"><div><i className="from"/><span><small>Pickup</small><p>Your home or office</p></span></div><div><i className="to"/><span><small>Drop</small><p>Anywhere in your city</p></span></div></div>
        <div className="tb-route-fee"><span>Flat fee</span><b>₹49</b></div>
      </div>}>
      <div className="tb-hero-actions"><a className="btn btn-primary" href="#pickup-form">Book a pickup <ArrowRight size={16}/></a><span><ShieldCheck size={16}/> Cancel free until a partner accepts</span></div>
      <div className="tb-hero-stats"><span><b>₹49</b> flat fee</span><span><b>Live</b> status updates</span><span><b>6</b> parcel types</span></div>
    </TabHero>

    <div className="tb-wrap"><Steps items={[[MapPin, "Add pickup & drop", "Who and where, at both ends."], [Bike, "A partner accepts", "A nearby rider picks it up."], [CheckCircle2, "Track to delivery", "Status updates every step."]]}/></div>

    <section className="tb-wrap fd-section" id="pickup-form">
      <SectionHead eyebrow="Schedule a local delivery" icon={Truck} title="Send something across town" lead="Enter a reachable contact and a complete address for both ends."/>
      <div className="tb-book-grid">
        <form className="tb-card tb-genie-form" onSubmit={submit} noValidate>
          {addressBlock("pickup", "Pickup point", "Where the partner collects the parcel", "from")}
          <div className="tb-swap-row"><button type="button" className="tb-swap" onClick={swap} aria-label="Swap pickup and drop details"><ArrowLeftRight size={15}/> Swap</button></div>
          {addressBlock("drop", "Drop point", "Who receives it, and where", "to")}
          <fieldset><legend>What are you sending?</legend>
            <div className="tb-chips small">{PARCEL_TYPES.map(([label, Icon]) => <button type="button" key={label} aria-pressed={form.itemDescription === label} className={form.itemDescription === label ? "on" : ""} onClick={() => setForm(current => ({ ...current, itemDescription: label }))}><Icon size={14}/>{label}</button>)}</div>
            <label className="tb-field"><span className="sr-only">Item description</span><input required maxLength={120} value={form.itemDescription} onChange={event => setForm(current => ({ ...current, itemDescription: event.target.value }))} placeholder="Or describe it, e.g. a blue folder of papers"/></label>
          </fieldset>
          <label className="tb-field"><span>Delivery instructions <em>(optional)</em></span><input maxLength={300} value={form.instructions} onChange={event => setForm(current => ({ ...current, instructions: event.target.value }))} placeholder="Landmark, gate code, call on arrival…"/></label>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
          <div className="tb-book-foot">
            <p className="tb-summary"><Package size={16}/>Flat ₹49 · demo fee, no real courier is dispatched</p>
            <button className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={17} className="tb-spin"/> Creating request…</> : !user ? <>Log in to request <ArrowRight size={16}/></> : <>Request pickup · ₹49 <ArrowRight size={16}/></>}</button>
          </div>
        </form>
        <aside className="tb-side">
          <div className="tb-card">
            <div className="tb-card-row"><h3 className="tb-card-title"><PackageOpen size={18}/> Your requests</h3>{isCustomer && <button type="button" className="tb-text-btn" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>}</div>
            {!user ? <SignInCard from="/genie" text="Log in to send parcels and follow each delivery here."/>
              : !isCustomer ? <p className="tb-muted">Pickup requests are available on customer accounts.</p>
              : active.length ? <div className="tb-trip-list">{active.map(requestCard)}</div>
              : <p className="tb-muted">No active requests. New ones update here every 20 seconds.</p>}
            {finished.length > 0 && <details className="tb-earlier"><summary>Completed and cancelled ({finished.length})</summary><div className="tb-trip-list">{finished.map(requestCard)}</div></details>}
          </div>
          <div className="tb-card tb-rules">
            <h3 className="tb-card-title"><ShieldCheck size={18}/> What can be sent</h3>
            <ul><li className="ok"><Check size={14}/> Documents, keys and small parcels</li><li className="ok"><Check size={14}/> Lunch boxes and gifts that fit a bag</li><li className="no"><X size={14}/> Cash, valuables or restricted goods</li><li className="no"><X size={14}/> Fragile, liquid or oversized items</li></ul>
          </div>
        </aside>
      </div>
    </section>
  </main>;
}

/* ───────────────────────── Events ───────────────────────── */

const eventStart = event => { const day = new Date(event.date); const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()); start.setMinutes(clockMinutes(event.time) ?? 18 * 60); return start; };
const durationMinutes = text => { const hours = parseFloat(String(text || "")); return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 120; };

function EventCard({ event, count, onCount, onBook, busy, featured }) {
  const capacity = event.capacity || 0;
  const left = Math.max(0, event.spotsLeft ?? capacity);
  const soldOut = left <= 0;
  const almost = !soldOut && left <= Math.max(3, Math.ceil(capacity * 0.2));
  const taken = capacity ? Math.round(((capacity - left) / capacity) * 100) : 0;
  const start = eventStart(event);
  const tickets = Math.min(count, Math.max(1, left));
  return <article className={`tb-event ${featured ? "featured" : ""} ${soldOut ? "sold" : ""}`}>
    <div className="tb-event-photo">
      <img src={event.image || photos.gathering} alt="" loading="lazy" onError={fallbackTo(photos.gathering)}/>
      <span className="tb-date"><b>{start.getDate()}</b><small>{start.toLocaleDateString("en-IN", { month: "short" })}</small></span>
      {event.category && <span className="tb-tag">{event.category}</span>}
    </div>
    <div className="tb-event-body">
      {featured && <span className="fd-eyebrow"><Sparkles size={13}/> Next up</span>}
      <h3>{event.title}</h3>
      <p className="tb-meta"><Clock size={14}/>{start.toLocaleDateString("en-IN", { weekday: "long" })} · {clockLabel(event.time)}{event.duration ? ` · ${event.duration}` : ""}</p>
      <p className="tb-meta"><MapPin size={14}/>{event.venue}{event.city ? `, ${event.city}` : ""}</p>
      <p className="tb-desc">{event.description}</p>
      {event.highlights?.length > 0 && <ul className="tb-highlights">{event.highlights.slice(0, 3).map(item => <li key={item}><Check size={14}/>{item}</li>)}</ul>}
      <div className="tb-seats"><div className="tb-seat-bar" aria-hidden="true"><i style={{ width: `${taken}%` }}/></div><small className={almost || soldOut ? "hot" : ""}>{soldOut ? "Sold out" : almost ? `Only ${left} spot${left === 1 ? "" : "s"} left` : `${left} of ${capacity} spots left`}</small></div>
      <div className="tb-event-foot">
        <div className="tb-price"><b>{event.price ? money(event.price) : "Free"}</b><small>per person</small></div>
        {!soldOut && <Stepper value={tickets} min={1} max={Math.min(10, left)} onChange={onCount} label="tickets"/>}
      </div>
      <button type="button" className="btn btn-primary tb-event-cta" disabled={soldOut || busy} onClick={() => onBook(tickets)}>{busy ? <><Loader2 size={17} className="tb-spin"/> Booking…</> : soldOut ? "Sold out" : <>Book {tickets} spot{tickets === 1 ? "" : "s"} · {event.price ? money(event.price * tickets) : "Free"} <ArrowRight size={16}/></>}</button>
    </div>
  </article>;
}

export function ExperiencesView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const [events, setEvents] = useState([]), [loading, setLoading] = useState(true), [bookings, setBookings] = useState([]);
  const [category, setCategory] = useState("All"), [counts, setCounts] = useState({}), [busyId, setBusyId] = useState(""), [notice, setNotice] = useState(null), [confirmed, setConfirmed] = useState(null);
  const load = () => {
    api.get("/experiences").then(response => setEvents(Array.isArray(response.data) ? response.data : [])).catch(() => setNotice({ tone: "error", text: "Events couldn't be loaded. Please refresh to try again." })).finally(() => setLoading(false));
    if (isCustomer) api.get("/experiences/bookings/mine").then(response => setBookings(Array.isArray(response.data) ? response.data : [])).catch(() => {}); else setBookings([]);
  };
  useEffect(load, [isCustomer]);
  const categories = useMemo(() => ["All", ...new Set(events.map(event => event.category).filter(Boolean))], [events]);
  const shown = events.filter(event => category === "All" || event.category === category);
  const [featured, ...rest] = shown;
  const book = async (event, tickets) => {
    if (!user) { navigate("/login", { state: { from: "/experiences" } }); return; }
    if (!isCustomer) { setNotice({ tone: "error", text: "Event spots are booked from a customer account." }); return; }
    setBusyId(event._id); setNotice(null);
    try {
      const { data } = await api.post(`/experiences/${event._id}/book`, { tickets });
      setConfirmed(data); setCounts(current => ({ ...current, [event._id]: 1 }));
      load();
      requestAnimationFrame(() => document.getElementById("my-plans")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { setNotice({ tone: "error", text: errorText(error, "We couldn't book that event. Please try again.") }); if (error.response?.status === 409) load(); }
    finally { setBusyId(""); }
  };
  const cancel = async booking => {
    try { await api.patch(`/experiences/bookings/${booking._id}/cancel`); setNotice({ tone: "info", text: `Your booking for ${booking.experience?.title || "the event"} was cancelled and the spots were released.` }); if (confirmed?._id === booking._id) setConfirmed(null); load(); }
    catch (error) { setNotice({ tone: "error", text: errorText(error, "This booking can't be cancelled.") }); }
  };
  const addToCalendar = event => downloadCalendarEvent({ title: event.title, start: eventStart(event), minutes: durationMinutes(event.duration), location: [event.venue, event.city].filter(Boolean).join(", "), details: `${event.description || ""}\nBooked with GoFoode Experiences.` });
  const card = (event, isFeatured = false) => <EventCard key={event._id} event={event} featured={isFeatured} count={counts[event._id] || 1} onCount={value => setCounts(current => ({ ...current, [event._id]: value }))} onBook={tickets => book(event, tickets)} busy={busyId === event._id}/>;
  const upcomingBookings = bookings.filter(booking => booking.status === "confirmed" && booking.experience && eventStart(booking.experience) > new Date(Date.now() - 6 * 3600000));
  const otherBookings = bookings.filter(booking => !upcomingBookings.includes(booking));
  const bookingRow = booking => {
    const event = booking.experience;
    const live = booking.status === "confirmed" && event && eventStart(event) > new Date();
    return <article className="tb-res" key={booking._id}>
      <img src={event?.image || photos.gathering} alt="" onError={fallbackTo(photos.gathering)}/>
      <div><b>{event?.title || "Event"}</b><small>{event ? `${shortDate(eventStart(event))} · ${clockLabel(event.time)}` : "Event details unavailable"} · {booking.tickets} spot{booking.tickets === 1 ? "" : "s"} · {money(booking.amount)}</small><span className={`tb-status ${booking.status}`}>{booking.status === "confirmed" ? "Confirmed" : "Cancelled"}</span></div>
      {live && <div className="tb-res-actions"><button type="button" className="tb-icon-btn" onClick={() => addToCalendar(event)} aria-label={`Add ${event.title} to calendar`} title="Add to calendar"><CalendarPlus size={17}/></button><button type="button" className="tb-text-btn danger" onClick={() => cancel(booking)}>Cancel</button></div>}
    </article>;
  };

  return <main className="tb-page experiences">
    <TabHero image={photos.gathering} alt="Friends sharing a long table at a local event" crumb="Events" eyebrow={<><PartyPopper size={14}/> GoFoode Experiences</>}
      title={<>Make memories. <em>Not just plans.</em></>} lead="Food walks, brunch tables and hands-on workshops hosted by local kitchens. Small groups, real food and good company."
      aside={featured && <div className="tb-next-card" aria-hidden="true"><img src={featured.image || photos.gathering} alt=""/><div><span className="tb-tp-label"><CalendarDays size={13}/> Next event</span><b>{featured.title}</b><small>{shortDate(eventStart(featured))} · {clockLabel(featured.time)}</small></div></div>}>
      <div className="tb-hero-actions"><a className="btn btn-primary" href="#upcoming-events">See upcoming events <ArrowRight size={16}/></a></div>
      <div className="tb-hero-stats"><span><b>{events.length || "—"}</b> upcoming events</span><span><b>{Math.max(0, categories.length - 1) || "—"}</b> kinds of plans</span><span><b>From {events.length ? money(Math.min(...events.map(event => event.price || 0))) : "—"}</b> per person</span></div>
    </TabHero>

    <section className="tb-wrap fd-section" id="upcoming-events">
      <SectionHead eyebrow="A good reason to get together" icon={CalendarDays} title="Upcoming experiences" lead="Pick a plan, choose how many spots you need and book in one tap."/>
      <div className="tb-chips" role="group" aria-label="Filter events">{categories.map(name => <button type="button" key={name} aria-pressed={category === name} className={category === name ? "on" : ""} onClick={() => setCategory(name)}>{name}{name !== "All" && <em>{events.filter(event => event.category === name).length}</em>}</button>)}</div>
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {loading ? <div className="tb-event-grid">{[0, 1, 2].map(key => <div className="tb-skeleton tall" key={key}/>)}</div>
        : shown.length ? <>{card(featured, true)}{rest.length > 0 && <div className="tb-event-grid">{rest.map(event => card(event))}</div>}</>
        : <div className="tb-empty"><CalendarDays size={26}/><b>No upcoming events{category !== "All" ? ` in ${category}` : ""}</b><p>New plans are added every week. Check back soon.</p></div>}
    </section>

    <section className="tb-wrap fd-section" id="my-plans">
      <SectionHead eyebrow="Your GoFoode plans" icon={CheckCircle2} title="Your bookings"/>
      {confirmed && <div className="tb-card tb-success wide" role="status">
        <span className="tb-success-icon"><PartyPopper size={22}/></span>
        <div><h3>You're going to {confirmed.experience?.title || "the event"}!</h3><p>{confirmed.tickets} spot{confirmed.tickets === 1 ? "" : "s"} confirmed · {money(confirmed.amount)} · reference {String(confirmed._id).slice(-6).toUpperCase()}</p></div>
        {confirmed.experience && <button type="button" className="btn btn-outline" onClick={() => addToCalendar(confirmed.experience)}><CalendarPlus size={16}/> Add to calendar</button>}
      </div>}
      <div className="tb-card">
        {!user ? <SignInCard from="/experiences" text="Log in to book spots and keep all your plans in one place."/>
          : !isCustomer ? <p className="tb-muted">Event bookings are available on customer accounts.</p>
          : upcomingBookings.length ? <div className="tb-res-list grid">{upcomingBookings.map(bookingRow)}</div>
          : <p className="tb-muted">No upcoming bookings yet. Pick an event above to get started.</p>}
        {otherBookings.length > 0 && <details className="tb-earlier"><summary>Past and cancelled ({otherBookings.length})</summary><div className="tb-res-list grid">{otherBookings.map(bookingRow)}</div></details>}
      </div>
    </section>
  </main>;
}

/* ───────────────────────── Offers ───────────────────────── */

const prizeSource = { spin: "Daily spin prize", streak: "Streak bonus", referral: "Referral reward", welcome: "Welcome gift" };
const couponSaving = (offer, amount) => amount < (offer.minOrder || 0) ? 0 : Math.round(Math.min(offer.discountType === "percentage" ? amount * offer.discountValue / 100 : offer.discountValue, offer.maxDiscount || amount));
function expiryLabel(expiresAt) {
  if (!expiresAt) return "No expiry date";
  const days = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000);
  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  if (days <= 14) return `Ends in ${days} days`;
  return `Valid till ${new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function CouponTicket({ offer, copied, onCopy, onUse, best }) {
  const percent = offer.discountType === "percentage";
  const soon = offer.expiresAt && new Date(offer.expiresAt) - Date.now() < 3 * 86400000;
  return <article className={`tb-coupon ${offer.personal ? "personal" : ""}`}>
    <div className="tb-coupon-stub"><b>{percent ? `${offer.discountValue}%` : `₹${offer.discountValue}`}</b><span>OFF</span></div>
    <div className="tb-coupon-body">
      <div className="tb-coupon-tags">{offer.personal ? <span className="tb-tag gift"><Gift size={12}/>{prizeSource[offer.source] || "Your reward"}</span> : <span className="tb-tag soft"><TicketPercent size={12}/> For everyone</span>}{best && <span className="tb-tag best"><Star size={12} fill="currentColor"/> Best value</span>}</div>
      <h3>{offer.title || (percent ? `${offer.discountValue}% off your order` : `₹${offer.discountValue} off your order`)}</h3>
      <p>{offer.minOrder ? `On orders above ${money(offer.minOrder)}` : "No minimum order"}{percent && offer.maxDiscount ? ` · save up to ${money(offer.maxDiscount)}` : ""}{offer.personal ? " · single use" : ""}</p>
      <div className="tb-code"><code>{offer.code}</code><button type="button" onClick={() => onCopy(offer.code)} aria-label={`Copy code ${offer.code}`}>{copied === offer.code ? <><Check size={15}/> Copied</> : <><Copy size={15}/> Copy</>}</button></div>
      <div className="tb-coupon-foot"><small className={soon ? "hot" : ""}><Hourglass size={13}/>{expiryLabel(offer.expiresAt)}</small><button type="button" className="fd-link" onClick={() => onUse(offer.code)}>Use now <ArrowRight size={14}/></button></div>
    </div>
  </article>;
}

export function OffersView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const [offers, setOffers] = useState([]), [loading, setLoading] = useState(true), [copied, setCopied] = useState(""), [amount, setAmount] = useState(399), [notice, setNotice] = useState(null);
  const copyTimer = useRef(0);
  useEffect(() => { api.get("/offers").then(response => setOffers(Array.isArray(response.data) ? response.data : [])).catch(() => setNotice({ tone: "error", text: "Offers couldn't be loaded. Please refresh to try again." })).finally(() => setLoading(false)); }, [user?.id]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const personal = offers.filter(offer => offer.personal);
  const campaigns = offers.filter(offer => !offer.personal);
  const ranked = useMemo(() => offers.map(offer => ({ offer, saving: couponSaving(offer, amount), short: Math.max(0, (offer.minOrder || 0) - amount) })).sort((a, b) => b.saving - a.saving || a.short - b.short), [offers, amount]);
  const best = ranked[0]?.saving > 0 ? ranked[0].offer.code : "";
  const bestByValue = useMemo(() => [...campaigns].sort((a, b) => (b.maxDiscount || b.discountValue) - (a.maxDiscount || a.discountValue))[0]?.code, [campaigns]);
  const biggestSaving = offers.reduce((max, offer) => Math.max(max, offer.maxDiscount || offer.discountValue || 0), 0);
  const copy = async code => {
    try { await navigator.clipboard.writeText(code); setCopied(code); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(""), 2200); }
    catch { setNotice({ tone: "info", text: `Copy isn't available in this browser. Your code is ${code}.` }); }
  };
  const use = code => {
    const target = `/cart?coupon=${encodeURIComponent(code)}`;
    if (!user) navigate("/login", { state: { from: target } });
    else if (!isCustomer) setNotice({ tone: "error", text: "Coupons are redeemed from a customer account." });
    else navigate(target);
  };
  const ticket = offer => <CouponTicket key={offer._id || offer.code} offer={offer} copied={copied} onCopy={copy} onUse={use} best={offer.code === bestByValue && !offer.personal}/>;
  const heroOffer = campaigns.find(offer => offer.code === bestByValue) || offers[0];

  return <main className="tb-page offers">
    <TabHero tone="warm" image={photos.feast} alt="Plates of freshly cooked food on a wooden table" crumb="Offers" eyebrow={<><TicketPercent size={14}/> More joy in every order</>}
      title={<>Offers worth <em>sharing.</em></>} lead="Live coupon codes, your personal prizes and a calculator that finds the best code for your order."
      aside={heroOffer && <div className="tb-hero-coupon" aria-hidden="true"><span className="tb-tp-label"><Sparkles size={13}/> Top pick</span><b>{heroOffer.discountType === "percentage" ? `${heroOffer.discountValue}% OFF` : `₹${heroOffer.discountValue} OFF`}</b><code>{heroOffer.code}</code><small>{heroOffer.minOrder ? `On orders above ${money(heroOffer.minOrder)}` : "No minimum order"}</small></div>}>
      <div className="tb-hero-stats"><span><b>{loading ? "—" : offers.length}</b> live codes</span>{personal.length > 0 && <span><b>{personal.length}</b> just for you</span>}<span><b>{biggestSaving ? `Up to ${money(biggestSaving)}` : "—"}</b> off an order</span></div>
    </TabHero>

    {notice && <div className="tb-wrap tb-top-notice"><Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice></div>}

    {personal.length > 0 && <section className="tb-wrap fd-section">
      <SectionHead eyebrow="Won by you" icon={Gift} title="Your rewards" lead="Personal codes from daily spins and invites. Each works once, so use them before they expire."><Link to="/rewards" className="fd-link">Spin today's wheel <ArrowRight size={14}/></Link></SectionHead>
      <div className="tb-coupon-grid">{personal.map(ticket)}</div>
    </section>}

    <section className="tb-wrap fd-section">
      <SectionHead eyebrow="Savings calculator" icon={Calculator} title="Which code saves you the most?" lead="Slide to your order total and we'll rank every code for it."/>
      <div className="tb-card tb-calc">
        <div className="tb-calc-input">
          <label htmlFor="tb-amount">Order total</label>
          <div className="tb-calc-amount"><span>₹</span><input id="tb-amount" type="number" inputMode="numeric" min={0} max={5000} value={amount} onChange={event => setAmount(Math.max(0, Math.min(5000, Math.round(Number(event.target.value) || 0))))}/></div>
          <input type="range" min={99} max={1500} step={10} value={Math.min(1500, Math.max(99, amount))} onChange={event => setAmount(Number(event.target.value))} aria-label="Order total slider"/>
          <div className="tb-calc-presets">{[199, 399, 599, 999].map(value => <button type="button" key={value} className={amount === value ? "on" : ""} onClick={() => setAmount(value)}>{money(value)}</button>)}</div>
        </div>
        <ol className="tb-calc-list">
          {loading ? <li className="tb-muted">Loading codes…</li> : ranked.length ? ranked.map(({ offer, saving, short }) => <li key={offer._id || offer.code} className={offer.code === best ? "best" : saving ? "" : "locked"}>
            <code>{offer.code}</code>
            <span>{saving ? <>You save <b>{money(saving)}</b>{offer.code === best && <em>Best for you</em>}</> : <>Add <b>{money(short)}</b> more to unlock</>}</span>
            {saving > 0 && <button type="button" className="tb-text-btn" onClick={() => use(offer.code)}>Use</button>}
          </li>) : <li className="tb-muted">No live codes right now.</li>}
        </ol>
      </div>
    </section>

    <section className="tb-wrap fd-section">
      <SectionHead eyebrow="For everyone" icon={TicketPercent} title="All live coupon codes" lead="Copy a code, or tap Use now and it's applied in your cart automatically."/>
      {loading ? <div className="tb-coupon-grid">{[0, 1, 2].map(key => <div className="tb-skeleton short" key={key}/>)}</div>
        : campaigns.length ? <div className="tb-coupon-grid">{campaigns.map(ticket)}</div>
        : <div className="tb-empty"><TicketPercent size={26}/><b>No public codes right now</b><p>Spin the daily wheel on Rewards to win a personal one.</p></div>}
    </section>

    <section className="tb-wrap fd-section">
      <Steps items={[[Copy, "Pick a code", "Copy it, or tap Use now."], [Utensils, "Add your dishes", "Meet the minimum order shown."], [CheckCircle2, "Save at checkout", "The discount shows in your bill."]]}/>
      <div className="tb-promo-row">
        <Link to="/rewards" className="tb-promo spin"><Gift size={26}/><div><b>Spin daily, win up to ₹100 off</b><small>A free spin every day, plus a bonus prize for a 7-day streak.</small></div><ArrowRight size={18}/></Link>
        <Link to="/plus" className="tb-promo plus"><Crown size={26}/><div><b>Free delivery with GoFoode Plus</b><small>Never pay the ₹{FOOD_DELIVERY_FEE} delivery fee on food orders.</small></div><ArrowRight size={18}/></Link>
      </div>
    </section>
  </main>;
}

/* ───────────────────────── Plus ───────────────────────── */

const PLUS_PRICE = 299, PLUS_MONTHS = 3;
const PLUS_PERKS = [
  [Truck, "Free delivery on every food order", `Save the ₹${FOOD_DELIVERY_FEE} delivery fee each time. It comes off your bill automatically at checkout.`],
  [TicketPercent, "Member-only offers", "Extra coupon drops for members, on top of the public codes."],
  [Headphones, "Priority support", "Your chats jump the queue when something needs fixing."],
  [Utensils, "Dining-out perks", "Special treats when you book a table with Dineout."]
];
const PLUS_FAQ = [
  ["How does free delivery work?", `Once you're a member, the ₹${FOOD_DELIVERY_FEE} delivery fee is removed from every food order, including multi-restaurant carts. You'll see "FREE with Plus" in your bill.`],
  ["Is this a real payment?", "Not yet. This is a demo membership: no money is charged. It activates instantly and lasts 90 days."],
  ["Does it cover Instamart orders?", "Plus covers food delivery. Instamart delivery is already free on baskets above ₹299."],
  ["Can I renew early?", "You can renew once your current membership ends. We show the exact end date on this page."]
];

export function PlusView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const [state, setState] = useState({ membership: null, active: false }), [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [orders, setOrders] = useState(8);
  useEffect(() => {
    if (!isCustomer) { setState({ membership: null, active: false }); return; }
    api.get("/membership").then(response => setState({ membership: response.data?.membership || null, active: Boolean(response.data?.active) })).catch(() => {});
  }, [isCustomer]);
  const join = async () => {
    if (!user) { navigate("/login", { state: { from: "/plus" } }); return; }
    if (!isCustomer) { setNotice({ tone: "error", text: "GoFoode Plus is available on customer accounts." }); return; }
    setBusy(true); setNotice(null);
    try {
      const { data } = await api.post("/membership/subscribe");
      setState({ membership: data.membership, active: true });
      setNotice({ tone: "success", text: "Welcome to GoFoode Plus! Free delivery is now on for every food order." });
    } catch (error) {
      if (error.response?.data?.code === "ALREADY_MEMBER") setState({ membership: error.response.data.membership, active: true });
      setNotice({ tone: error.response?.status === 409 ? "info" : "error", text: errorText(error, "We couldn't start your membership. Please try again.") });
    } finally { setBusy(false); }
  };
  const { membership, active } = state;
  const ends = membership?.expiresAt ? new Date(membership.expiresAt) : null;
  const daysLeft = active && ends ? Math.max(0, Math.ceil((ends - Date.now()) / 86400000)) : 0;
  const saved = orders * PLUS_MONTHS * FOOD_DELIVERY_FEE;
  const breakEven = Math.ceil(PLUS_PRICE / FOOD_DELIVERY_FEE);
  const net = saved - PLUS_PRICE;
  const endLabel = ends?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return <main className="tb-page plus">
    <TabHero tone="night" image={photos.spread} alt="A table of grilled dishes and dips" crumb="GoFoode Plus" eyebrow={<><Crown size={14}/> The good life, with extras</>}
      title={<>GoFoode <em>Plus.</em></>} lead={`Free delivery on every food order, member-only offers and priority support, all for ₹${PLUS_PRICE} every ${PLUS_MONTHS} months.`}
      aside={<div className={`tb-member-card ${active ? "active" : ""}`} aria-hidden="true">
        <div className="tb-mc-top"><span><Crown size={16}/> PLUS</span><img src="/icons/icon-192.png" alt=""/></div>
        <b>{user?.name || "Your name here"}</b>
        <small>{active ? `Member until ${endLabel}` : `₹${PLUS_PRICE} · ${PLUS_MONTHS} months`}</small>
        <div className="tb-mc-chip"/>
      </div>}>
      <div className="tb-hero-actions">
        {active ? <span className="tb-member-pill"><CheckCircle2 size={17}/> You're a member · {daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>
          : <button type="button" className="btn btn-primary" onClick={join} disabled={busy}>{busy ? <><Loader2 size={17} className="tb-spin"/> Activating…</> : !user ? <>Log in to join <ArrowRight size={16}/></> : <>Join Plus · ₹{PLUS_PRICE} <ArrowRight size={16}/></>}</button>}
        <span><ShieldCheck size={16}/> Demo membership · no charge</span>
      </div>
      <div className="tb-hero-stats"><span><b>₹0</b> delivery fee</span><span><b>{PLUS_MONTHS} months</b> of perks</span><span><b>≈ ₹{Math.round(PLUS_PRICE / PLUS_MONTHS)}</b> a month</span></div>
    </TabHero>

    {notice && <div className="tb-wrap tb-top-notice"><Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice></div>}

    {active && ends && <section className="tb-wrap fd-section"><div className="tb-card tb-membership">
      <div><span className="fd-eyebrow"><Crown size={13}/> Your membership</span><h3>Active until {endLabel}</h3><p>Free delivery is applied automatically. Order food and look for "FREE with Plus" in your bill.</p></div>
      <div className="tb-days-left"><div className="tb-seat-bar"><i style={{ width: `${Math.min(100, Math.round((daysLeft / 90) * 100))}%` }}/></div><small>{daysLeft} of 90 days left</small></div>
      <Link className="btn btn-primary" to="/food">Order with free delivery <ArrowRight size={16}/></Link>
    </div></section>}

    <section className="tb-wrap fd-section">
      <SectionHead eyebrow="Member perks" icon={Sparkles} title="Everything you get with Plus"/>
      <div className="tb-perks">{PLUS_PERKS.map(([Icon, title, text]) => <article key={title}><span><Icon size={22}/></span><b>{title}</b><p>{text}</p></article>)}</div>
    </section>

    <section className="tb-wrap fd-section">
      <SectionHead eyebrow="Savings estimator" icon={Calculator} title="Will Plus pay for itself?" lead={`Plus pays for itself after ${breakEven} food orders in ${PLUS_MONTHS} months.`}/>
      <div className="tb-card tb-estimator">
        <label htmlFor="tb-orders">Food orders per month <b>{orders}</b></label>
        <input id="tb-orders" type="range" min={1} max={30} value={orders} onChange={event => setOrders(Number(event.target.value))}/>
        <div className="tb-estimate">
          <div><small>Delivery fees saved in {PLUS_MONTHS} months</small><b>{money(saved)}</b></div>
          <div><small>Plus costs</small><b>{money(PLUS_PRICE)}</b></div>
          <div className={net >= 0 ? "good" : ""}><small>{net >= 0 ? "You come out ahead by" : "You'd need a few more orders"}</small><b>{net >= 0 ? money(net) : `${Math.max(0, breakEven - orders * PLUS_MONTHS)} more`}</b></div>
        </div>
        <div className="tb-compare" aria-hidden="true"><span style={{ width: `${Math.min(100, (PLUS_PRICE / Math.max(saved, PLUS_PRICE)) * 100)}%` }}>Plus</span><span className="saved" style={{ width: `${Math.min(100, (saved / Math.max(saved, PLUS_PRICE)) * 100)}%` }}>Saved</span></div>
      </div>
    </section>

    <section className="tb-wrap fd-section">
      <SectionHead eyebrow="Good to know" icon={Info} title="Questions, answered"/>
      <div className="tb-faq">{PLUS_FAQ.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18}/></summary><p>{answer}</p></details>)}</div>
    </section>
  </main>;
}
