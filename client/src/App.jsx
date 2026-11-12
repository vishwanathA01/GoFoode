import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { Search, ShoppingBag, MapPin, Star, Clock, ArrowRight, Utensils, Menu, X, LogOut, LayoutDashboard, Store, Bike, Users, ClipboardList, Bell, Plus, Minus, CheckCircle2, TrendingUp, Package, Wallet, ChefHat, Settings, ShieldCheck, Heart, ShoppingBasket, TicketPercent, CalendarDays, Crown, Trash2, PackageOpen, RefreshCw, UserRound, Mail, Phone, MessageCircle, Send, Power, History, Activity, CreditCard, LayoutGrid, List, Truck, Sparkles, Leaf, Navigation, Quote, Flame, BadgePercent, Mic, SlidersHorizontal, ChevronLeft, ChevronRight, Check, PackageCheck, Eye, Zap, RotateCcw, Lock, Hourglass, Undo2, House, Gift, PartyPopper, ChevronDown, UtensilsCrossed , Camera, Crosshair } from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";
import { InstallPrompt, MoodFinder, PulseSection, RewardsPage, RewardsTeaser } from "./engagement";
import AuthPage from "./AuthPage";
import { DineoutView, ExperiencesView, GenieView, OffersView, PlusView } from "./tabs";
import { cuisinePhoto, initials, avatarTone, photos, restaurantCover } from "./media";
import { LocationSheet } from "./location";
import { MartCheckout, MartOrderView } from "./martCheckout";
import { ONLINE_METHODS, exactMoney, PaymentActionCard, PaymentDetailsCard, PaymentHealth, completeOnlinePayment, describePaymentOutcome, errorMessage, isRetryableError, newIdempotencyKey, onlineMethodOptions, paymentMethodLabel, paymentStatusLabel, usePaymentGateway, withRetry } from "./payments";

const money = n => `₹${Number(n || 0).toFixed(0)}`;
const imageFallback = "/food-placeholder.svg";
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
function showImageFallback(event) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = imageFallback;
}
async function toUploadImage(file){
  if(!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if(file.size>12*1024*1024) throw new Error("Choose an image smaller than 12 MB.");
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1200/bitmap.width,1200/bitmap.height);
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*scale);
  canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.78));
  if(!blob||blob.size>680*1024) throw new Error("This image could not be compressed small enough. Choose a smaller image.");
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(blob);
  });
}

function GoogleMap({ latitude, longitude, destination, title = "Google Maps", zoom = 14 }) {
  const hasCoordinates = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const origin = hasCoordinates ? `${Number(latitude)},${Number(longitude)}` : "";
  const place = destination || origin;
  if (!place) return <div className="map-placeholder"><MapPin size={28}/><b>Location details are not available yet</b></div>;

  const embedUrl = googleMapsApiKey
    ? origin && destination
      ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(googleMapsApiKey)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving`
      : `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsApiKey)}&q=${encodeURIComponent(place)}&zoom=${zoom}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(origin || place)}&z=${zoom}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&${origin ? `origin=${encodeURIComponent(origin)}&` : ""}destination=${encodeURIComponent(destination || origin)}`;

  return <><iframe className="google-map-frame" title={title} src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/><div className="map-actions"><span><MapPin size={14}/>{googleMapsApiKey?"Google Maps":"Google Maps preview"}</span><a href={directionsUrl} target="_blank" rel="noreferrer">Open directions <ArrowRight size={13}/></a></div></>;
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const routerLocation = useLocation();
  if (loading) return <div className="loading">Loading GoFoode...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${routerLocation.pathname}${routerLocation.search}` }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role === "restaurant_owner" ? "restaurant" : user.role === "delivery_partner" ? "delivery" : user.role === "admin" ? "admin" : "customer"}`} replace />;
}
function Brand({ light = false }) {
  return <Link to="/" className={`brand gofoode-brand ${light ? "brand-light" : ""}`} aria-label="GoFoode home">
    <img src="/gofoode-logo.png" alt="GoFoode" />
  </Link>;
}
// ---------------------------------------------------------------------------------------------------------
// Site header: a pinned top bar (logo, location, cart, account menu) and a tab row that depends on who's
// signed in. Customers and visitors see the marketplace; partners and admins see their workspace.
// ---------------------------------------------------------------------------------------------------------
const roleLabels = { customer: "Customer", restaurant_owner: "Restaurant partner", delivery_partner: "Delivery partner", admin: "Administrator" };
const marketplaceTabs = [
  { label: "Home", to: "/", icon: House, exact: true },
  { label: "Food", to: "/food", icon: Utensils },
  { label: "Instamart", to: "/instamart", icon: ShoppingBasket },
  { label: "Dineout", to: "/dineout", icon: UtensilsCrossed },
  { label: "Pickup & drop", to: "/genie", icon: Package },
  { label: "Events", to: "/experiences", icon: PartyPopper },
  { label: "Offers", to: "/offers", icon: TicketPercent },
  { label: "Rewards", to: "/rewards", icon: Gift, accent: true }
];
const pickNav = (items, paths) => paths.map(path => items.find(item => item.to === path)).filter(Boolean)
  .map(item => item.label === "Overview" ? { ...item, label: "Dashboard", exact: true } : item);
function headerTabs(role) {
  const home = { label: "Home", to: "/", icon: House, exact: true };
  if (role === "restaurant_owner") return [home, ...pickNav(ownerNav, ["/restaurant", "/restaurant/orders", "/restaurant/menu", "/restaurant/places", "/restaurant/reservations", "/restaurant/reviews"])];
  if (role === "delivery_partner") return [home, ...pickNav(deliveryNav, ["/delivery", "/delivery/jobs", "/delivery/earnings", "/delivery/availability", "/delivery/history"])];
  if (role === "admin") return [home, ...pickNav(adminNav, ["/admin", "/admin/orders", "/admin/transactions", "/admin/restaurants", "/admin/users", "/admin/support", "/admin/reviews", "/admin/activity"])];
  return marketplaceTabs;
}
function accountLinks(role) {
  const profile = { label: "Profile", to: "/profile", icon: UserRound };
  if (role === "customer") return [
    { label: "My dashboard", to: "/customer", icon: LayoutDashboard }, { label: "My orders", to: "/customer/orders", icon: ClipboardList },
    { label: "Rewards & referrals", to: "/rewards", icon: Gift }, { label: "Saved addresses", to: "/customer/addresses", icon: MapPin },
    { label: "Notifications", to: "/customer/notifications", icon: Bell }, profile
  ];
  if (role === "restaurant_owner") return [{ label: "Restaurant dashboard", to: "/restaurant", icon: LayoutDashboard }, { label: "Orders", to: "/restaurant/orders", icon: ClipboardList }, { label: "Menu manager", to: "/restaurant/menu", icon: Utensils }, profile];
  if (role === "delivery_partner") return [{ label: "Rider dashboard", to: "/delivery", icon: LayoutDashboard }, { label: "Assignments", to: "/delivery/jobs", icon: Bike }, { label: "Earnings", to: "/delivery/earnings", icon: Wallet }, profile];
  if (role === "admin") return [{ label: "Admin dashboard", to: "/admin", icon: LayoutDashboard }, { label: "Transactions", to: "/admin/transactions", icon: Wallet }, { label: "Activity log", to: "/admin/activity", icon: Activity }, profile];
  return [profile];
}
function UserAvatar({ user, large = false }) {
  const [background, color] = avatarTone(user.name || "");
  return <span className={`gf-avatar ${large ? "lg" : ""}`} style={user.profileImage ? undefined : { background, color }}>{user.profileImage ? <img src={user.profileImage} alt=""/> : initials(user.name)}</span>;
}
function AccountMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="gf-account" ref={ref}>
    <button type="button" className="gf-account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <UserAvatar user={user}/>
      <span className="gf-account-name"><b>{user.name?.split(" ")[0] || "Account"}</b><small>{roleLabels[user.role] || "Account"}</small></span>
      <ChevronDown size={16} className="gf-chevron"/>
    </button>
    {open && <div className="gf-menu" role="menu">
      <div className="gf-menu-head"><UserAvatar user={user} large/><div><b>{user.name}</b><small>{user.email}</small><em>{roleLabels[user.role]}</em></div></div>
      {accountLinks(user.role).map(({ label, to, icon: Icon }) => <Link role="menuitem" to={to} key={to} className={pathname === to ? "on" : ""}><Icon size={16}/>{label}</Link>)}
      <button type="button" role="menuitem" className="gf-logout" onClick={logout}><LogOut size={16}/> Log out</button>
    </div>}
  </div>;
}
function HeaderTabs({ role }) {
  const { pathname } = useLocation();
  const barRef = useRef(null);
  const tabs = headerTabs(role);
  const isActive = tab => tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
  const workspace = role && role !== "customer";
  // On narrow screens the tab row scrolls sideways; keep the current tab in view.
  useEffect(() => {
    const active = barRef.current?.querySelector(".gf-tab.on");
    const bar = barRef.current;
    if (active && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);
  return <nav className={`gf-tabs ${workspace ? "workspace" : ""}`} aria-label={workspace ? `${roleLabels[role]} workspace` : "Main"}>
    <div className="gf-wrap gf-tabs-inner" ref={barRef}>
      {tabs.map(tab => { const Icon = tab.icon; const on = isActive(tab); return <Link key={tab.to} to={tab.to} className={`gf-tab ${on ? "on" : ""} ${tab.accent ? "accent" : ""}`} aria-current={on ? "page" : undefined}><Icon size={16}/><span>{tab.label}</span></Link>; })}
      {workspace && <span className="gf-workspace-chip">{roleLabels[role]} workspace</span>}
    </div>
  </nav>;
}
function Header() {
  const { user, logout, location, locationStatus, locationError } = useAuth();
  const [locationOpen, setLocationOpen] = useState(false);
  const locating = locationStatus === "loading" || locationStatus === "retrying";
  return <><div className="announcement"><span>✦</span> Fresh cravings, happy moments — delivered to your door <Link className="announcement-link" to="/offers">Explore today’s offers</Link></div>
  <header className="gf-header">
    <div className="gf-wrap gf-header-row">
    <Brand />
    <div className="location-control">
      <button className={`location-pill ${locationError && !location ? "has-error" : ""}`} type="button" aria-haspopup="dialog" aria-expanded={locationOpen} onClick={() => setLocationOpen(true)} aria-label={`Delivery location: ${location?.label || "not set"}. Change location`}>
        <MapPin size={16}/><span className="location-pill-prefix">Delivering to</span><b>{locating ? "Locating…" : location?.label || "Choose location"}</b><ChevronDown size={14}/>
      </button>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)}/>
    </div>
    <div className="gf-actions">
      {user ? <>
        {user.role === "customer" && <><Link className="gf-icon-link" to="/customer/orders" aria-label="My orders"><ClipboardList size={19}/><span>Orders</span></Link><Link className="gf-icon-link" to="/cart" aria-label="Cart"><ShoppingBag size={19}/><span>Cart</span></Link></>}
        <AccountMenu user={user} logout={logout}/>
      </> : <><Link className="gf-login" to="/login">Log in</Link><Link className="btn btn-primary btn-small gf-cta" to="/register">Get started <ArrowRight size={14}/></Link></>}
    </div>
    </div>
  </header>
  <HeaderTabs role={user?.role}/></>;
}
function RestaurantCard({ restaurant }) {
  return <Link to={`/restaurants/${restaurant._id}`} className="restaurant-card">
    <div className="restaurant-photo"><img src={restaurantCover(restaurant)} alt={restaurant.name} loading="lazy" onError={showImageFallback}/><span className="photo-tag">POPULAR</span></div>
    <div className="restaurant-card-body"><div className="card-title-row"><h3>{restaurant.name}</h3><span className="rating"><Star size={14} fill="currentColor"/> {restaurant.rating || "New"}</span></div><p>{(restaurant.cuisine || []).join(" · ") || "Multi-cuisine"}</p>{restaurant.description&&<small className="restaurant-description">{restaurant.description}</small>}<div className="card-meta"><span><Clock size={14}/> {restaurant.deliveryTime || 35} min delivery</span><span><MapPin size={13}/> {restaurant.address?.city||"Nearby"}</span></div></div>
  </Link>;
}
function ChatWidget() {
  const { user } = useAuth();
  const [open,setOpen]=useState(false);
  const [messages,setMessages]=useState([{role:"assistant",content:"Hi! I’m the GoFoode assistant. Ask me about ordering, delivery, offers, or using your account."}]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [ticketMessage,setTicketMessage]=useState("");
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[messages,open]);
  const send=async text=>{
    const content=text.trim();
    if(!content||busy)return;
    const next=[...messages,{role:"user",content}];
    setMessages(next);setDraft("");setBusy(true);setError("");setTicketMessage("");
    try{
      const {data}=await api.post("/chatbot",{messages:next.slice(-12).map(({role,content})=>({role,content}))});
      setMessages(current=>[...current,{role:"assistant",content:data.reply}]);
    }catch(err){
      setError(err.response?.data?.message||"The assistant is unavailable. Please try again.");
    }finally{setBusy(false)}
  };
  const createTicket=async()=>{
    if(!user){setTicketMessage("Sign in to send this conversation to the support team.");return}
    try{
      await api.post("/support",{subject:"GoFoode chat support",message:messages.slice(-8).map(message=>`${message.role==="user"?"You":"Assistant"}: ${message.content}`).join("\n")});
      setTicketMessage("Your support request was sent. The team will follow up from your account.");
    }catch(err){setTicketMessage(err.response?.data?.message||"Could not send your support request. Please try again.")}
  };
  return <div className="chat-widget">
    {open&&<section className="chat-panel" aria-label="GoFoode chat assistant">
      <header className="chat-panel-head"><div className="chat-avatar"><MessageCircle size={18}/></div><div><b>GoFoode assistant</b><small>Ordering and account help</small></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Close chat"><X size={18}/></button></header>
      <div className="chat-messages" aria-live="polite">{messages.map((message,index)=><div className={`chat-message ${message.role}`} key={index}>{message.content}</div>)}{busy&&<div className="chat-message assistant">Thinking…</div>}<div ref={endRef}/></div>
      {error&&<div className="chat-error" role="status">{error}</div>}
      {ticketMessage&&<div className="chat-ticket-message" role="status">{ticketMessage}</div>}
      {!user&&<Link className="chat-login-link" to="/login">Sign in to contact support</Link>}
      {user&&<button className="chat-ticket-button" onClick={createTicket}>Send conversation to support</button>}
      <form className="chat-compose" onSubmit={event=>{event.preventDefault();send(draft)}}>
        <input aria-label="Chat message" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Ask us anything…" maxLength={2000}/>
        <button className="chat-send" type="submit" disabled={busy||!draft.trim()} aria-label="Send message"><Send size={17}/></button>
      </form>
    </section>}
    <button className="chat-launcher" onClick={()=>setOpen(value=>!value)} aria-label={open?"Close chat":"Chat with GoFoode"}><MessageCircle size={22}/><span>{open?"Close":"Chat with us"}</span></button>
  </div>;
}
const communityStories=[
  {name:"Aisha Mehta",role:"GoFoode customer",quote:"Finding a new favourite is easy, and the delivery updates mean I always know what’s happening with my order."},
  {name:"Rohan Shah",role:"GoFoode customer",quote:"I can explore local menus, compare details, and get dinner sorted in just a few taps."},
  {name:"Neha Kapoor",role:"Restaurant owner · Cafe Basil",quote:"The menu and order tools help our team stay organized during the dinner rush and reach more people nearby."},
  {name:"Arjun Rao",role:"Restaurant owner · Spice Route",quote:"GoFoode gives our restaurant a simple way to share our food with the neighbourhood and manage incoming orders."}
];
const unsplash = (id, width = 480) => `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;
const prefersReducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const heroCravings = ["biryani", "pizza", "momos", "burgers", "desserts"];
const heroOrbit = ["1565299624946-b28f40a0ae38", "1496116218417-1a781b1c416c", "1563379091339-03b21ab4a4f8", "1563805042-7684c019e1cb"];
const cuisineRibbon = [
  { name: "Biryani", term: "biryani", image: "1563379091339-03b21ab4a4f8" },
  { name: "Pizza", term: "pizza", image: "1565299624946-b28f40a0ae38" },
  { name: "Momos", term: "momo", image: "1496116218417-1a781b1c416c" },
  { name: "Burgers", term: "burger", image: "1568901346375-23c9450c58cd" },
  { name: "North Indian", term: "indian", image: "1585937421612-70a008356fbe" },
  { name: "Healthy bowls", term: "healthy", image: "1546069901-ba9599a7e63c" },
  { name: "Street food", term: "samosa", image: "1601050690597-df0568f70950" },
  { name: "Desserts", term: "dessert", image: "1563805042-7684c019e1cb" },
  { name: "Pasta", term: "pasta", image: "1473093295043-cdd812d0e601" },
  { name: "Pav bhaji", term: "pav bhaji", image: "1606491956689-2ea866880c84" },
  { name: "Fried chicken", term: "chicken", image: "1626082927389-6cd097cdc6ec" },
  { name: "Mocktails", term: "drink", image: "1513558161293-cdaf765ed2fd" }
];
const homeCategories = [
  { name: "Indian", note: "Rich & comforting", image: "1585937421612-70a008356fbe" },
  { name: "Pizza", note: "Cheesy favourites", image: "1565299624946-b28f40a0ae38" },
  { name: "Burgers", note: "Big, juicy bites", image: "1571091718767-18b5b1457add" },
  { name: "Chinese", note: "Wok-tossed goodness", image: "1525755662778-989d0524087e" },
  { name: "Cold Drinks", note: "Cool sips & refreshers", image: "1513558161293-cdaf765ed2fd" },
  { name: "Healthy", note: "Fresh & vibrant", image: "1512621776951-a57141f2eefd" },
  { name: "Desserts", note: "A sweet finish", image: "1551024601-bec78aea704b" }
];
const homeServices = [
  { to: "/food", cls: "food", icon: "🍽️", title: "Food delivery", text: "Restaurant favourites, cooked fresh by local kitchens and brought straight to your door.", cta: "Order food", image: "1600891964599-f61ba0e24092" },
  { to: "/instamart", cls: "mart", icon: "🛒", title: "GoFoode Mart", text: "Groceries and daily essentials, sorted.", cta: "Shop essentials", image: "1542838132-92c53300491e" },
  { to: "/dineout", cls: "dine", icon: "🥂", title: "Dineout", text: "Discover places and book a table.", cta: "Find a table", image: "1517248135467-4c7edcad34c4" },
  { to: "/genie", cls: "genie", icon: "📦", title: "Pickup & drop", text: "Send parcels across your city.", cta: "Request pickup", image: "1586528116311-ad8dd3c8310d" },
  { to: "/experiences", cls: "events", icon: "🎟️", title: "Experiences", text: "Food events and local experiences worth booking.", cta: "Explore events", image: "1511795409834-ef04bbd61622" },
  { to: "/offers", cls: "offers", icon: "🎁", title: "Offers & rewards", text: "Coupon codes and savings for your next order.", cta: "Browse offers", image: "1555939594-58d7cb561ad1" }
];
const homeSteps = [
  { icon: Search, title: "Discover your craving", text: "Browse trusted local restaurants with real menus, ingredients and dietary details.", note: "Made to order by local kitchens" },
  { icon: ShoppingBag, title: "Order in a few taps", text: "Pick your favourites, customise your basket and check out in moments.", note: "See prep time before you order" },
  { icon: Navigation, title: "Follow the flavour", text: "Get updates as your food is prepared and brought right to your door.", note: "Follow your rider on the map" }
];
const trackingStages = [
  { icon: ClipboardList, title: "Order placed", text: "The restaurant confirms your order." },
  { icon: ChefHat, title: "Being prepared", text: "Your meal is cooked fresh." },
  { icon: Bike, title: "On the way", text: "Follow your delivery partner live." },
  { icon: CheckCircle2, title: "Delivered", text: "Hot, fresh and ready to enjoy." }
];

function useRevealOnScroll(rootRef) {
  const observerRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute("data-shown", "");
      observer.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    observerRef.current = observer;
    root.setAttribute("data-reveal-ready", "");
    return () => { observer.disconnect(); observerRef.current = null; root.removeAttribute("data-reveal-ready"); };
  }, [rootRef]);
  useEffect(() => {
    const observer = observerRef.current;
    if (!observer || !rootRef.current) return;
    rootRef.current.querySelectorAll("[data-reveal]:not([data-shown])").forEach(element => observer.observe(element));
  });
}
function CountUp({ value, suffix = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) { setShown(value); return; }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - start) / 1400);
        setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <span ref={ref}>{shown}{suffix}</span>;
}
function RotatingWord({ words }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % words.length), 2400);
    return () => clearInterval(timer);
  }, [words.length]);
  return <span className="hx-rotator" aria-hidden="true">
    <span className="hx-rotator-clip"><span className="hx-rotator-word" key={index}>{words[index]}</span></span>
    <svg className="hx-squiggle" key={`line-${index}`} viewBox="0 0 300 20" preserveAspectRatio="none"><path d="M4 14 C 60 2, 110 4, 152 11 S 250 19, 296 6"/></svg>
  </span>;
}
function TrackingTimeline() {
  const [active, setActive] = useState(() => prefersReducedMotion() ? trackingStages.length - 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => setActive(current => (current + 1) % trackingStages.length), 2200);
    return () => clearInterval(timer);
  }, []);
  return <ol className="hx-timeline" style={{ "--progress": active / (trackingStages.length - 1) }}>
    {trackingStages.map((stage, index) => <li key={stage.title} className={index < active ? "done" : index === active ? "active" : ""}>
      <span className="hx-timeline-icon"><stage.icon size={18}/></span>
      <span><b>{stage.title}</b><small>{stage.text}</small></span>
    </li>)}
  </ol>;
}
function Home() {
  const { user, location } = useAuth();
  const [restaurants, setRestaurants] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showAllDishes, setShowAllDishes] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [dishLoading, setDishLoading] = useState(true);
  const [restaurantError, setRestaurantError] = useState("");
  const [dishError, setDishError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const homeRef = useRef(null);
  const visualRef = useRef(null);
  const pointerFrame = useRef(0);
  useRevealOnScroll(homeRef);
  useEffect(() => {
    api.get("/restaurants").then(r => setRestaurants(r.data)).catch(() => setRestaurantError("Restaurants could not be loaded. Please try again later.")).finally(() => setLoading(false));
    api.get("/food-items").then(r => setDishes(r.data)).catch(() => setDishError("Popular dishes could not be loaded. Please try again later.")).finally(() => setDishLoading(false));
    api.get("/reviews/featured").then(r => setReviews(r.data)).catch(() => setReviewError("Customer feedback could not be loaded right now."));
  }, []);
  useEffect(() => () => cancelAnimationFrame(pointerFrame.current), []);
  const categories = ["All", "Indian", "Pizza", "Burgers", "Chinese", "Cold Drinks", "Healthy", "Desserts"];
  const filtered = restaurants.filter(r => {
    const text = `${r.name} ${(r.cuisine || []).join(" ")}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (category === "All" || text.includes(category.toLowerCase()));
  });
  const filteredDishes = dishes.filter(dish => {
    const restaurant = dish.restaurant;
    const text = `${dish.name} ${dish.description || ""} ${restaurant?.name || ""} ${(restaurant?.cuisine || []).join(" ")}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (category === "All" || text.includes(category.toLowerCase()));
  });
  const featuredDishLimit = 12;
  const featuredDishes = showAllDishes ? filteredDishes : filteredDishes.slice(0, featuredDishLimit);
  const isFiltering = Boolean(search.trim()) || category !== "All";
  const cuisineCount = new Set(restaurants.flatMap(r => r.cuisine || []).map(c => String(c).trim().toLowerCase()).filter(Boolean)).size;
  const deliveryTimes = restaurants.map(r => Number(r.deliveryTime)).filter(time => time > 0);
  const averageDelivery = deliveryTimes.length ? Math.round(deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length) : 0;
  const stats = [
    { icon: Store, value: restaurants.length, label: "Local kitchens on GoFoode" },
    { icon: Utensils, value: dishes.length, label: "Dishes to explore" },
    { icon: Sparkles, value: cuisineCount, label: "Cuisines to choose from" },
    { icon: Clock, value: averageDelivery, suffix: " min", label: "Average delivery estimate" }
  ].filter(stat => stat.value > 0);
  const perks = [
    { icon: Store, title: "Plenty of choice", text: "Explore local favourites" },
    { icon: ShoppingBag, title: "Simple ordering", text: "Your meal in a few taps" },
    { icon: Heart, title: "Every bite matters", text: "Made fresh, delivered with care" }
  ];
  const scrollToDishes = () => document.getElementById("popular-dishes")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  const quickSearch = term => { setSearch(term); setCategory("All"); scrollToDishes(); };
  const moveHero = event => {
    if (event.pointerType !== "mouse" || !visualRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => {
      visualRef.current?.style.setProperty("--px", x.toFixed(3));
      visualRef.current?.style.setProperty("--py", y.toFixed(3));
    });
  };
  const resetHero = () => {
    cancelAnimationFrame(pointerFrame.current);
    visualRef.current?.style.setProperty("--px", "0");
    visualRef.current?.style.setProperty("--py", "0");
  };
  return <><Header/><main className="gofoode-home" ref={homeRef}>
    <div className="hx-scrollbar" aria-hidden="true"/>

    <section className="hx-hero" onPointerMove={moveHero} onPointerLeave={resetHero}>
      <div className="hx-hero-bg" aria-hidden="true"><span className="hx-blob b1"/><span className="hx-blob b2"/><span className="hx-blob b3"/><span className="hx-dots"/></div>
      <div className="hx-wrap hx-hero-inner">
        <div className="hx-hero-copy">
          <span className="hx-pill"><span className="hx-pulse"/>{location?.city ? <>Delivering to <b>{location.city}</b></> : "Fresh food from local kitchens"}</span>
          <h1>Your favourite<br/><RotatingWord words={heroCravings}/><span className="hx-sr-only">food</span><br/><span className="hx-h1-tail">at your door.</span></h1>
          <p className="hx-lead">Discover your city’s best local kitchens, order in a few taps and follow every step until a fresh, hot meal arrives at your doorstep.</p>
          <form className="hx-search" role="search" onSubmit={event => { event.preventDefault(); scrollToDishes(); }}>
            <Search size={20}/>
            <input aria-label="Search dishes, restaurants or cuisines" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search biryani, pizza, cafés…"/>
            {search && <button type="button" className="hx-search-clear" aria-label="Clear search" onClick={() => setSearch("")}><X size={16}/></button>}
            <button type="submit" className="btn btn-primary"><span>Find food</span> <ArrowRight size={16}/></button>
          </form>
          <div className="hx-quick"><span>Popular:</span>{["Biryani", "Pizza", "Burger", "Momos", "Paneer"].map(term => <button type="button" key={term} onClick={() => quickSearch(term)}>{term}</button>)}</div>
          <div className="hx-proof">
            <div className="hx-avatars">{(restaurants.length ? restaurants.slice(0, 4) : [["Indian"], ["Pizza"], ["Burgers"], ["Chinese"]].map(cuisine => ({ cuisine }))).map((kitchen, index) => <img key={kitchen._id || index} src={restaurantCover(kitchen, 120)} alt="" onError={showImageFallback}/>)}</div>
            <div className="hx-proof-text"><b>Local kitchens, one happy place</b><span>{restaurants.length ? `${restaurants.length} neighbourhood kitchens cooking on GoFoode` : "Food lovers and restaurant partners on GoFoode"}</span></div>
          </div>
          <div className="hx-perks"><span><CheckCircle2 size={16}/> Easy ordering</span><span><CheckCircle2 size={16}/> Freshly prepared</span><span><CheckCircle2 size={16}/> Live order tracking</span></div>
        </div>
        <div className="hx-visual" ref={visualRef} aria-hidden="true">
          <span className="hx-glow"/>
          <span className="hx-ring"/>
          <span className="hx-ring hx-ring-outer"/>
          <span className="hx-plate"><img src={unsplash("1546069901-ba9599a7e63c", 720)} alt="" onError={showImageFallback}/></span>
          <span className="hx-orbit">{heroOrbit.map((id, index) => <span className={`hx-orbit-item o${index + 1}`} key={id}><img src={unsplash(id, 220)} alt="" onError={showImageFallback}/></span>)}</span>
          <span className="hx-float hx-card-cook"><span className="hx-float-icon"><ChefHat size={20}/></span><span className="hx-float-text"><b>Chef is cooking</b><span className="hx-cook-bar"><i/></span></span></span>
          <span className="hx-float hx-card-rider"><span className="hx-float-icon blue"><span className="hx-scooter">🛵</span></span><span className="hx-float-text"><b>Rider on the way</b><small><span className="hx-live"/> Live on the map</small></span></span>
          <span className="hx-float hx-card-fresh"><Leaf size={16}/> Made fresh</span>
          <span className="hx-emoji e1">🌶️</span><span className="hx-emoji e2">🍅</span><span className="hx-emoji e3">🌿</span><span className="hx-emoji e4">🧀</span>
        </div>
      </div>
    </section>

    <section className="hx-marquee" aria-label="Popular cravings">
      <div className="hx-marquee-track">{[...cuisineRibbon, ...cuisineRibbon].map((item, index) => {
        const copy = index >= cuisineRibbon.length;
        return <button type="button" className="hx-marquee-item" key={`${item.name}-${index}`} onClick={() => quickSearch(item.term)} aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}><img src={unsplash(item.image, 120)} alt="" loading="lazy" onError={showImageFallback}/>{item.name}<i aria-hidden="true">✦</i></button>;
      })}</div>
    </section>

    <section className="hx-wrap hx-stats" aria-label="GoFoode at a glance">
      {!loading && stats.length >= 2
        ? <div className="hx-stats-grid">{stats.map((stat, index) => <div className="hx-stat" key={stat.label} data-reveal style={{ "--d": `${index * 0.08}s` }}><span className="hx-stat-icon"><stat.icon size={22}/></span><span><strong><CountUp value={stat.value} suffix={stat.suffix}/></strong><span>{stat.label}</span></span></div>)}</div>
        : <div className="hx-stats-grid">{perks.map((perk, index) => <div className="hx-stat hx-stat-text" key={perk.title} data-reveal style={{ "--d": `${index * 0.08}s` }}><span className="hx-stat-icon"><perk.icon size={22}/></span><span><strong>{perk.title}</strong><span>{perk.text}</span></span></div>)}</div>}
    </section>

    <section className="hx-section" id="services">
      <div className="hx-wrap">
        <div className="hx-head" data-reveal><div><span className="hx-kicker"><Sparkles size={13}/> One app. More convenience.</span><h2>Everything you crave, <em>all in one place.</em></h2><p>Food, groceries, table bookings, parcels and local experiences — your everyday plans, made deliciously simple.</p></div></div>
        <div className="hx-bento">{homeServices.map((service, index) => <Link to={service.to} className={`hx-service ${service.cls}`} key={service.to} data-reveal style={{ "--d": `${index * 0.07}s` }}>
          <img src={unsplash(service.image, service.cls === "food" ? 1000 : 640)} alt="" loading="lazy" onError={showImageFallback}/>
          <span className="hx-service-icon" aria-hidden="true">{service.icon}</span>
          <h3>{service.title}</h3><p>{service.text}</p>
          <span className="hx-service-cta">{service.cta} <ArrowRight size={15}/></span>
        </Link>)}</div>
      </div>
    </section>

    <PulseSection/>
    <section className="hx-section hx-cats-section" id="categories">
      <div className="hx-wrap">
        <div className="hx-head" data-reveal><div><span className="hx-kicker"><Flame size={13}/> What are you in the mood for?</span><h2>Pick your kind of <em>delicious.</em></h2><p>From comfort food to something a little adventurous — tap a craving to filter dishes and restaurants.</p></div>{category !== "All" && <button type="button" className="hx-link" onClick={() => setCategory("All")}>Clear “{category}” <X size={15}/></button>}</div>
        <div className="hx-cats" role="group" aria-label="Filter by cuisine" data-reveal>{homeCategories.map((item, index) => <button type="button" key={item.name} className={category === item.name ? "hx-cat selected" : "hx-cat"} aria-pressed={category === item.name} style={{ "--i": index }} onClick={() => { setCategory(category === item.name ? "All" : item.name); scrollToDishes(); }}>
          <span className="hx-cat-img"><img src={unsplash(item.image, 300)} alt="" loading="lazy" onError={showImageFallback}/></span><b>{item.name}</b><small>{item.note}</small>
        </button>)}</div>
      </div>
    </section>

    <section className="hx-section hx-dishes" id="popular-dishes">
      <div className="hx-wrap">
        <div className="hx-head" data-reveal><div><span className="hx-kicker"><ChefHat size={13}/> Made fresh by local kitchens</span><h2>Fresh picks for <em>every craving.</em></h2><p>Real menus with ingredients, dietary details and prep times — so you know exactly what you’re ordering.</p></div><span className="hx-count">{filteredDishes.length} dishes</span></div>
        {isFiltering && <div className="hx-filter-note" role="status"><span>Showing {category !== "All" && <b>{category}</b>}{category !== "All" && search.trim() && " · "}{search.trim() && <>results for <b>“{search.trim()}”</b></>}</span><button type="button" onClick={() => { setSearch(""); setCategory("All"); }}>Clear filters <X size={14}/></button></div>}
        {dishLoading ? <div className="hx-skeleton-grid" aria-label="Finding dishes for you">{Array.from({ length: 4 }, (_, index) => <span key={index}/>)}</div> : dishError ? <div className="empty-state"><Utensils size={30}/><p>{dishError}</p></div> : featuredDishes.length ? <><div className="featured-dish-grid">{featuredDishes.map((dish, index) => <article className="featured-dish-card" key={dish._id} style={{ "--i": index % featuredDishLimit }}>
          <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-image"><img src={dish.image || imageFallback} alt={dish.name} loading="lazy" onError={showImageFallback}/>{dish.isBestseller && <span className="bestseller-tag">Bestseller</span>}</Link>
          <div className="featured-dish-copy"><div className="food-tags"><span className={dish.foodType === "non-veg" ? "food-type nonveg" : "food-type"}>{dish.foodType === "non-veg" ? "● Non-veg" : dish.foodType === "vegan" ? "● Vegan" : "● Vegetarian"}</span><span className="featured-dish-price">{money(dish.discountPrice ?? dish.price)}</span></div>
            <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-name">{dish.name}</Link>
            <p>{dish.description || "Freshly prepared by a local kitchen."}</p>
            <small className="featured-dish-restaurant">{dish.restaurant.name} · {dish.restaurant.rating || "New"} ★</small>
            <div className="featured-dish-meta"><span><Clock size={13}/>{dish.preparationTime || 20} min</span>{dish.calories && <span>{dish.calories} kcal</span>}{dish.portionSize && <span>{dish.portionSize}</span>}</div>
            {dish.ingredients?.length > 0 && <small className="featured-dish-detail"><b>Ingredients:</b> {dish.ingredients.join(", ")}</small>}
            {dish.allergens?.length > 0 && <small className="featured-dish-detail allergen-note"><b>Allergens:</b> {dish.allergens.join(", ")}</small>}
            <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-link">View menu <ArrowRight size={14}/></Link>
          </div>
        </article>)}</div>{filteredDishes.length > featuredDishLimit && <button type="button" className="btn btn-outline btn-small featured-dishes-toggle" onClick={() => setShowAllDishes(value => !value)}>{showAllDishes ? "Show fewer dishes" : "Show all dishes"} <ArrowRight size={14}/></button>}</> : <div className="empty-state"><Utensils size={30}/><h3>No dishes match this selection yet</h3><p>Try another cuisine or search term, or explore all restaurants while local menus are being updated.</p><button className="btn btn-outline btn-small" onClick={() => { setSearch(""); setCategory("All"); }}>Show all dishes</button></div>}
      </div>
    </section>

    <MoodFinder dishes={dishes}/>
    <section className="hx-section hx-track">
      <div className="hx-wrap hx-track-inner">
        <div className="hx-track-visual" data-reveal="left">
          <div className="hx-track-frame"><img src={photos.doorstep} alt="A delivery partner handing a fresh food order to a delighted customer at her door" loading="lazy"/></div>
          <div className="hx-float hx-track-chip a" aria-hidden="true"><span className="hx-float-icon"><MapPin size={18}/></span><span className="hx-float-text"><b>Almost there!</b><small>Your order is around the corner</small></span></div>
          <div className="hx-float hx-track-chip b" aria-hidden="true"><span className="hx-float-icon green"><CheckCircle2 size={18}/></span><span className="hx-float-text"><b>Delivered with care</b><small>Enjoy your meal 🎉</small></span></div>
        </div>
        <div className="hx-track-copy" data-reveal="right">
          <span className="hx-kicker"><Navigation size={13}/> Live order tracking</span>
          <h2>Track every <em>tasty moment.</em></h2>
          <p>From the kitchen to your doorstep, see each update as it happens — and when your delivery partner shares GPS, follow them on the map.</p>
          <TrackingTimeline/>
          <Link to={user ? "/customer/orders" : "/login"} className="btn btn-primary">{user ? "Track my orders" : "Sign in to track orders"} <ArrowRight size={16}/></Link>
        </div>
      </div>
    </section>

    <section className="hx-section hx-restaurants" id="restaurants">
      <div className="hx-wrap">
        <div className="hx-head" data-reveal><div><span className="hx-kicker"><Store size={13}/> Handpicked for your hunger</span><h2>Explore <em>restaurants.</em></h2><p>Good places. Great plates. Right around your city.</p></div><span className="hx-count">{filtered.length} places</span></div>
        <div className="filter-row">{categories.map(c => <button key={c} className={category === c ? "filter-chip active" : "filter-chip"} onClick={() => setCategory(c)}>{c}</button>)}</div>
        {loading ? <div className="hx-skeleton-grid three" aria-label="Finding delicious places">{Array.from({ length: 3 }, (_, index) => <span key={index}/>)}</div> : restaurantError ? <div className="empty-state"><Utensils size={34}/><p>{restaurantError}</p></div> : filtered.length ? <div className="restaurant-grid">{filtered.map(r => <RestaurantCard key={r._id} restaurant={r}/>)}</div> : <div className="empty-state"><Utensils size={34}/><h3>No restaurants found just yet</h3><p>Try another cuisine or search term. Restaurant partners can join GoFoode to list their kitchens.</p><Link className="btn btn-primary" to="/register">Join GoFoode <ArrowRight size={15}/></Link></div>}
      </div>
    </section>

    <RewardsTeaser/>
    <section className="hx-wrap hx-offer-wrap" id="offers">
      <div className="hx-offer" data-reveal="zoom">
        <span className="hx-offer-spark s1" aria-hidden="true">✦</span><span className="hx-offer-spark s2" aria-hidden="true">✦</span><span className="hx-offer-spark s3" aria-hidden="true">✦</span>
        <div className="hx-offer-copy">
          <span className="hx-kicker light"><BadgePercent size={13}/> A little extra joy</span>
          <h2>Big cravings.<br/><em>Beautifully easy.</em></h2>
          <p>Unlock coupon codes, member perks and new neighbourhood favourites — and make every meal feel like a treat.</p>
          <div className="hx-offer-actions"><Link to="/offers" className="btn btn-white">Browse offers <ArrowRight size={16}/></Link><Link to={user ? "/food" : "/register"} className="btn hx-btn-ghost">{user ? "Order food" : "Create free account"}</Link></div>
        </div>
        <div className="hx-offer-art" aria-hidden="true">
          <img className="hx-offer-main" src={unsplash("1555939594-58d7cb561ad1", 900)} alt="" loading="lazy" onError={showImageFallback}/>
          <img className="hx-offer-mini m1" src={unsplash("1568901346375-23c9450c58cd", 260)} alt="" loading="lazy" onError={showImageFallback}/>
          <img className="hx-offer-mini m2" src={unsplash("1551024601-bec78aea704b", 260)} alt="" loading="lazy" onError={showImageFallback}/>
          <span className="hx-badge"><svg viewBox="0 0 120 120"><defs><path id="hx-badge-path" d="M60 60m-46 0a46 46 0 1 1 92 0a46 46 0 1 1-92 0"/></defs><text><textPath href="#hx-badge-path" textLength="284">GOOD FOOD • GOOD MOOD • EVERY DAY •</textPath></text></svg><b>🍔</b></span>
        </div>
      </div>
    </section>

    <section className="hx-section hx-how" id="how">
      <div className="hx-wrap">
        <div className="hx-head center" data-reveal><div><span className="hx-kicker"><Sparkles size={13}/> The GoFoode way</span><h2>Three steps to your <em>happy place.</em></h2><p>Less planning, more enjoying. Your next favourite meal is closer than you think.</p></div></div>
        <div className="hx-steps">
          <svg className="hx-steps-line" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="M90 30 C 250 -8, 360 68, 500 30 S 760 -8, 910 30"/></svg>
          {homeSteps.map((step, index) => <article className="hx-step" key={step.title} data-reveal style={{ "--d": `${index * 0.15}s` }}>
            <span className="hx-step-icon"><step.icon size={28}/><i>{index + 1}</i></span>
            <h3>{step.title}</h3><p>{step.text}</p>
            <small><CheckCircle2 size={14}/> {step.note}</small>
          </article>)}
        </div>
      </div>
    </section>

    <section className="hx-section hx-stories-section">
      <div className="hx-wrap"><div className="hx-head center" data-reveal><div><span className="hx-kicker"><Heart size={13}/> From the GoFoode community</span><h2>Good things, <em>shared by our community.</em></h2><p>Sample stories from customers and restaurant partners about using GoFoode.</p></div></div></div>
      <div className="hx-stories" data-reveal>
        <div className="hx-stories-track">{[0, 1, 2].flatMap(copy => communityStories.map(story => <article className="hx-story" key={`${story.name}-${copy}`} aria-hidden={copy > 0 || undefined}>
          <div className="hx-story-top"><Quote size={26}/><span className="sample-story-label">Sample story</span></div>
          <p>“{story.quote}”</p>
          <div className="hx-story-author"><span className="hx-initials" style={{ background: avatarTone(story.name)[0], color: avatarTone(story.name)[1] }} aria-hidden="true">{initials(story.name)}</span><span><b>{story.name}</b><small>{story.role}</small></span></div>
        </article>))}</div>
      </div>
      <div className="hx-wrap hx-reviews" data-reveal>
        <div className="hx-subhead"><div><h3>Customer reviews of local restaurants</h3><p>Feedback shared by customers after their orders.</p></div><span className="hx-count">{reviews.length ? `${reviews.length} recent reviews` : "Customer reviews"}</span></div>
        {reviewError ? <p className="error-box" role="status">{reviewError}</p> : reviews.length ? <div className="feedback-grid">{reviews.slice(0, 3).map(review => <article className="feedback-card" key={review._id}><div className="feedback-stars" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < review.rating ? "currentColor" : "none"}/>)}</div><p>“{review.comment}”</p><div className="feedback-author"><span className="feedback-avatar">{review.user?.profileImage ? <img src={review.user.profileImage} alt="" onError={showImageFallback}/> : review.user?.name?.[0]?.toUpperCase() || "G"}</span><span><b>{review.user?.name || "GoFoode customer"}</b><small>{review.restaurant?.name || "Local restaurant"}</small></span></div></article>)}</div> : <div className="feedback-empty"><span className="feedback-avatar"><Star size={16}/></span><div><b>Customer reviews will appear here.</b><p>After a food order is delivered, customers can leave a review and help others discover a local favourite.</p></div><Link to="/customer/orders">View my orders <ArrowRight size={14}/></Link></div>}
      </div>
    </section>

    <section className="hx-section hx-partners" id="community">
      <div className="hx-wrap">
        <div className="hx-head" data-reveal><div><span className="hx-kicker"><Users size={13}/> Good food, good people</span><h2>Local businesses <em>on GoFoode.</em></h2><p>Meet neighbourhood kitchens and growing food businesses available on the platform.</p></div><a href="#restaurants" className="hx-link">Explore all restaurants <ArrowRight size={15}/></a></div>
        {restaurants.length ? <div className="partner-strip" data-reveal>{restaurants.slice(0, 4).map(restaurant => <Link className="partner-card" key={restaurant._id} to={`/restaurants/${restaurant._id}`}><img src={restaurant.logo || restaurantCover(restaurant, 240)} alt={`${restaurant.name} profile`} onError={showImageFallback}/><span><b>{restaurant.name}</b><small>{(restaurant.cuisine || []).slice(0, 2).join(" · ") || "Local restaurant"} · {restaurant.address?.city || "Nearby"}</small></span><ArrowRight size={15}/></Link>)}</div> : <p className="muted">Local restaurant partners will appear here as they join.</p>}
      </div>
    </section>

    <section className="hx-wrap hx-plus-wrap">
      <div className="hx-plus" data-reveal>
        <span className="hx-plus-crown"><Crown size={30}/></span>
        <div className="hx-plus-copy"><span className="hx-kicker gold">A little more love</span><h2>Meet GoFoode Plus</h2><p>Member-only deals, delivery perks and more reasons to order your favourites.</p></div>
        <Link to="/plus" className="btn hx-btn-gold">Explore membership <ArrowRight size={16}/></Link>
      </div>
    </section>

    <section className="hx-section hx-join">
      <div className="hx-wrap">
        <div className="hx-head center" data-reveal><div><span className="hx-kicker"><TrendingUp size={13}/> Grow with GoFoode</span><h2>Have a kitchen or love <em>being on the move?</em></h2><p>Partner with GoFoode as a restaurant or delivery professional and be part of a growing food community.</p></div></div>
        <div className="hx-join-grid">
          <Link to="/register" className="hx-join-card" data-reveal="left"><img src={unsplash("1414235077428-338989a2e8c0", 1000)} alt="" loading="lazy" onError={showImageFallback}/><span className="hx-join-tag"><Store size={15}/> For restaurants</span><h3>Bring your kitchen to more neighbours</h3><p>List your menu, manage incoming orders and reach hungry customers nearby.</p><span className="hx-service-cta">Become a restaurant partner <ArrowRight size={15}/></span></Link>
          <Link to="/register" className="hx-join-card" data-reveal="right"><img src={unsplash("1526367790999-0150786686a2", 1000)} alt="" loading="lazy" onError={showImageFallback}/><span className="hx-join-tag"><Bike size={15}/> For delivery partners</span><h3>Ride with GoFoode</h3><p>Pick up delivery jobs, set your availability and keep track of your earnings.</p><span className="hx-service-cta">Become a delivery partner <ArrowRight size={15}/></span></Link>
        </div>
        <p className="hx-join-signin">Already a partner? <Link to="/login">Sign in <ArrowRight size={14}/></Link></p>
      </div>
    </section>
  </main><Footer/><ChatWidget/></>;
}
function Footer() {
  return <footer className="hx-footer">
    <div className="hx-wrap">
      <div className="hx-footer-cta"><div><h2>Hungry already?</h2><p>Your next favourite meal is just a few taps away.</p></div><Link to="/food" className="btn btn-primary">Order food now <ArrowRight size={16}/></Link></div>
      <div className="hx-footer-grid">
        <div className="hx-footer-about"><Brand/><p>Bringing good food and good people together — from neighbourhood kitchens to your doorstep.</p></div>
        <nav className="hx-footer-col" aria-label="Services"><h4>Services</h4><Link to="/food">Food delivery</Link><Link to="/instamart">GoFoode Mart</Link><Link to="/dineout">Dineout</Link><Link to="/genie">Pickup &amp; drop</Link><Link to="/experiences">Experiences</Link></nav>
        <nav className="hx-footer-col" aria-label="Explore"><h4>Explore</h4><a href="/#restaurants">Restaurants</a><Link to="/offers">Offers</Link><Link to="/plus">GoFoode Plus</Link><a href="/#how">How it works</a></nav>
        <nav className="hx-footer-col" aria-label="Partners"><h4>Partners</h4><Link to="/register">Become a partner</Link><Link to="/login">Partner sign in</Link><Link to="/dashboard">Dashboard</Link></nav>
      </div>
      <div className="hx-footer-bottom"><small>© 2026 GoFoode. Made for every craving.</small><small>Fresh food · Local kitchens · Doorstep delivery</small></div>
    </div>
  </footer>;
}

const FOOD_DELIVERY_FEE = 35;
const FOOD_TAX_RATE = 0.05;
const foodHeroWords = ["pizza", "burger", "noodle", "dessert", "smoothie"];
const foodCuisines = [
  { name: "Indian", terms: ["indian"], image: "1585937421612-70a008356fbe" },
  { name: "Pizza", terms: ["pizza", "italian"], image: "1565299624946-b28f40a0ae38" },
  { name: "Burgers", terms: ["burger", "fast food"], image: "1568901346375-23c9450c58cd" },
  { name: "Chinese", terms: ["chinese", "asian", "noodle"], image: "1525755662778-989d0524087e" },
  { name: "Healthy", terms: ["healthy", "salad"], image: "1512621776951-a57141f2eefd" },
  { name: "Desserts", terms: ["dessert", "bakery", "cake", "brownie"], image: "1551024601-bec78aea704b" },
  { name: "Drinks", terms: ["drink", "beverage", "cafe", "smoothie", "shake", "coffee", "soda", "cooler"], image: "1497534446932-c925b458314e" }
];
const foodSorts = [
  { id: "recommended", label: "Recommended" },
  { id: "rating", label: "Top rated kitchens" },
  { id: "fastest", label: "Fastest to you" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" }
];
const foodJourney = [
  { icon: Search, title: "Choose your dishes", text: "Compare prep times, portions, ingredients and allergens before you add." },
  { icon: TicketPercent, title: "Check out your way", text: "Apply a coupon, pick a saved address and pay with cash on delivery." },
  { icon: Navigation, title: "Track every stage", text: "See the kitchen's progress, and the rider's location once they share it." }
];
const spiceHeat = { Mild: 1, Medium: 2, Hot: 3, "Extra hot": 4 };
const foodPrice = dish => dish?.discountPrice ?? dish?.price ?? 0;
function foodMatchesCuisine(dish, entry) {
  if (!entry) return true;
  const text = `${dish.name} ${dish.description || ""} ${(dish.restaurant?.cuisine || []).join(" ")}`.toLowerCase();
  return entry.terms.some(term => text.includes(term));
}
function offerSummary(offer) {
  const min = offer.minOrder ? ` on orders above ₹${offer.minOrder}` : "";
  return offer.discountType === "percentage"
    ? `${offer.discountValue}% off${offer.maxDiscount ? `, up to ₹${offer.maxDiscount}` : ""}${min}`
    : `Flat ₹${offer.discountValue} off${min}`;
}
// Mirrors the server's /checkout maths: one order per restaurant, each with its own delivery fee and 5% tax.
function foodBill(lines, discount = 0, { freeDelivery = false } = {}) {
  const groups = new Map();
  lines.forEach(line => {
    const key = String(line.restaurant?._id || line.restaurant);
    const group = groups.get(key) || { key, restaurant: line.restaurant, lines: [], subtotal: 0 };
    group.lines.push(line);
    group.subtotal += foodPrice(line.foodItem) * line.quantity;
    groups.set(key, group);
  });
  const list = [...groups.values()];
  const taxOf = amount => Math.round(amount * FOOD_TAX_RATE * 100) / 100;
  const subtotal = list.reduce((sum, group) => sum + group.subtotal, 0);
  const tax = list.reduce((sum, group) => sum + taxOf(group.subtotal), 0);
  // GoFoode Plus members pay no delivery fee; the server applies the same rule at checkout.
  const feeEach = freeDelivery ? 0 : FOOD_DELIVERY_FEE;
  const deliveryFee = list.length * feeEach;
  const cap = list.length ? list[0].subtotal + taxOf(list[0].subtotal) + feeEach : 0;
  const appliedDiscount = Math.min(discount, cap);
  return { groups: list, subtotal, tax, deliveryFee, discount: appliedDiscount, total: Math.max(0, subtotal + tax + deliveryFee - appliedDiscount) };
}
function useFlash() {
  const [flash, setFlash] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = (text, options = {}) => {
    clearTimeout(timer.current);
    setFlash({ id: Date.now(), text, ...options });
    timer.current = setTimeout(() => setFlash(null), options.action ? 4500 : 3000);
  };
  return [flash, notify, () => setFlash(null)];
}
function FlashToast({ flash, onClose }) {
  return <div className="fd-toast" role="status" aria-live="polite">{flash && <div className={`fd-toast-card ${flash.tone || ""}`} key={flash.id}>
    {flash.tone === "error" ? <X size={17}/> : <CheckCircle2 size={18}/>}<span>{flash.text}</span>
    {flash.action && <button type="button" onClick={() => { flash.action.run(); onClose(); }}>{flash.action.label}</button>}
  </div>}</div>;
}
// The customer's server-side cart, shared by the food page, restaurant menus and checkout.
function useFoodCart(notify = () => {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const isCustomer = user?.role === "customer";
  const [cart, setCart] = useState({ items: [] });
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(null);
  const reload = () => {
    if (!isCustomer) { setCart({ items: [] }); setLoaded(true); return Promise.resolve(); }
    return api.get("/cart").then(response => setCart(response.data || { items: [] })).catch(() => {}).finally(() => setLoaded(true));
  };
  useEffect(() => { reload(); }, [isCustomer, user?._id]);
  const lines = (cart.items || []).filter(line => line.foodItem && typeof line.foodItem === "object");
  const quantityOf = id => lines.find(line => String(line.foodItem._id) === String(id))?.quantity || 0;
  const setQuantity = async (foodItemId, quantity) => {
    setPending(foodItemId);
    try {
      const current = quantityOf(foodItemId);
      if (quantity <= 0) { await api.delete(`/cart/items/${foodItemId}`); await reload(); }
      else if (!current) { const { data } = await api.post("/cart/items", { foodItemId, quantity }); setCart(data); }
      else { const { data } = await api.patch(`/cart/items/${foodItemId}`, { quantity: Math.min(20, quantity) }); setCart(data); }
      return true;
    } catch (error) {
      notify(error.response?.data?.message || "We couldn't update your cart. Please try again.", { tone: "error" });
      return false;
    } finally { setPending(null); }
  };
  const add = async (dish, event) => {
    if (!user) { navigate("/login", { state: { from: `${routerLocation.pathname}${routerLocation.search}` } }); return; }
    if (!isCustomer) { notify("Sign in with a customer account to order food.", { tone: "error" }); return; }
    const source = event?.currentTarget?.closest("[data-fly-root]")?.querySelector("[data-fly-img]");
    const before = quantityOf(dish._id);
    if (await setQuantity(dish._id, before + 1)) {
      flyToBasket(source);
      if (!before) notify(`${dish.name} added to your cart`, routerLocation.pathname === "/cart" ? {} : { action: { label: "View cart", run: () => navigate("/cart") } });
    }
  };
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + foodPrice(line.foodItem) * line.quantity, 0);
  const restaurantCount = new Set(lines.map(line => String(line.restaurant?._id || line.restaurant))).size;
  return { user, isCustomer, cart, setCart, lines, loaded, count, subtotal, restaurantCount, quantityOf, setQuantity, add, pending, reload };
}
function VegMark({ type }) {
  const nonVeg = type === "non-veg";
  return <span className={`fd-vegmark ${nonVeg ? "nonveg" : ""}`} role="img" aria-label={nonVeg ? "Non-vegetarian" : type === "vegan" ? "Vegan" : "Vegetarian"}><i/></span>;
}
function SpiceMeter({ level }) {
  const heat = spiceHeat[level] || 0;
  if (!heat) return null;
  return <span className="fd-spice" aria-label={`${level} spice`}>{Array.from({ length: heat }, (_, index) => <i key={index} aria-hidden="true">🌶️</i>)}<em>{level}</em></span>;
}
function FoodQty({ dish, food, compact = false }) {
  const quantity = food.quantityOf(dish._id);
  const busy = food.pending === dish._id;
  if (!quantity) return <button type="button" className={`fd-add ${compact ? "sm" : ""}`} disabled={busy} aria-label={`Add ${dish.name} to cart`} onClick={event => food.add(dish, event)}>{busy ? <span className="fd-spin" aria-hidden="true"/> : <>ADD<Plus size={compact ? 13 : 15} strokeWidth={2.8}/></>}</button>;
  return <span className={`fd-stepper ${compact ? "sm" : ""} ${busy ? "busy" : ""}`} role="group" aria-label={`${dish.name}: ${quantity} in cart`}>
    <button type="button" disabled={busy} aria-label={`Remove one ${dish.name}`} onClick={() => food.setQuantity(dish._id, quantity - 1)}><Minus size={14} strokeWidth={2.8}/></button>
    <b key={quantity}>{quantity}</b>
    <button type="button" disabled={busy || quantity >= 20} aria-label={`Add one more ${dish.name}`} onClick={() => food.setQuantity(dish._id, quantity + 1)}><Plus size={14} strokeWidth={2.8}/></button>
  </span>;
}
function FoodCartBar({ food }) {
  if (!food.isCustomer || !food.count) return null;
  return <Link to="/cart" className="fd-cartbar" aria-label={`View cart: ${food.count} items, ${money(food.subtotal)}`}>
    <span className="fd-cartbar-icon" data-basket-target><ShoppingBag size={20}/><b key={food.count}>{food.count}</b></span>
    <span className="fd-cartbar-copy"><b>{food.count} {food.count === 1 ? "item" : "items"} · {money(food.subtotal)}</b><small>{food.restaurantCount > 1 ? `From ${food.restaurantCount} restaurants` : "Taxes and delivery added at checkout"}</small></span>
    <span className="fd-cartbar-cta">View cart <ArrowRight size={16}/></span>
  </Link>;
}
function useModalLayer(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus({ preventScroll: true });
    const onKey = event => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prior; if (previous?.focus && document.contains(previous)) previous.focus({ preventScroll: true }); };
  }, []);
  return ref;
}
function DishDetailModal({ dish, food, onClose }) {
  const ref = useModalLayer(onClose);
  const restaurant = dish.restaurant && typeof dish.restaurant === "object" ? dish.restaurant : null;
  const hasDiscount = dish.discountPrice != null && dish.discountPrice < dish.price;
  return <div className="fd-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="fd-modal" role="dialog" aria-modal="true" aria-labelledby="fd-dish-title" tabIndex={-1} ref={ref} data-fly-root>
      <button type="button" className="fd-close" aria-label="Close dish details" onClick={onClose}><X size={18}/></button>
      <div className="fd-modal-media"><img data-fly-img src={dish.image || imageFallback} alt={dish.name} onError={showImageFallback}/>{dish.isBestseller && <span className="fd-best"><Flame size={13}/> Bestseller</span>}</div>
      <div className="fd-modal-copy">
        <div className="fd-modal-tags"><VegMark type={dish.foodType}/><span>{dish.foodType === "non-veg" ? "Non-veg" : dish.foodType === "vegan" ? "Vegan" : "Vegetarian"}</span><SpiceMeter level={dish.spiceLevel}/></div>
        <h2 id="fd-dish-title">{dish.name}</h2>
        {restaurant && <Link to={`/restaurants/${restaurant._id}`} className="fd-modal-restaurant" onClick={onClose}><Store size={15}/> {restaurant.name}{restaurant.rating ? <em><Star size={12} fill="currentColor"/> {Number(restaurant.rating).toFixed(1)}</em> : null}<ArrowRight size={14}/></Link>}
        <p>{dish.description || "Freshly prepared by a local kitchen."}</p>
        <div className="fd-modal-price"><strong>{money(foodPrice(dish))}</strong>{hasDiscount && <del>{money(dish.price)}</del>}</div>
        <ul className="fd-facts">
          <li><Clock size={17}/><span><b>{dish.preparationTime || 20} min</b>prep time</span></li>
          {restaurant?.deliveryTime ? <li><Bike size={17}/><span><b>{restaurant.deliveryTime} min</b>delivery estimate</span></li> : null}
          {dish.calories ? <li><Flame size={17}/><span><b>{dish.calories} kcal</b>energy</span></li> : null}
          {dish.portionSize ? <li><Utensils size={17}/><span><b>{dish.portionSize}</b>portion</span></li> : null}
        </ul>
        {dish.ingredients?.length > 0 && <div className="fd-modal-block"><h3>Ingredients</h3><div className="fd-chips">{dish.ingredients.map(item => <span key={item}>{item}</span>)}</div></div>}
        {dish.allergens?.length > 0 && <div className="fd-modal-block allergen"><h3>Allergens</h3><div className="fd-chips">{dish.allergens.map(item => <span key={item}>{item}</span>)}</div></div>}
        {dish.dietaryTags?.length > 0 && <div className="fd-modal-block"><h3>Dietary</h3><div className="fd-chips">{dish.dietaryTags.map(item => <span key={item}>{item}</span>)}</div></div>}
        <div className="fd-modal-actions"><FoodQty dish={dish} food={food}/>{food.quantityOf(dish._id) > 0 && <Link to="/cart" className="fd-link">Go to cart <ArrowRight size={14}/></Link>}</div>
      </div>
    </div>
  </div>;
}
function FoodDeliveryPage() {
  const { location } = useAuth();
  const rootRef = useRef(null), searchRef = useRef(null), visualRef = useRef(null), parallaxFrame = useRef(0);
  useRevealOnScroll(rootRef);
  const [flash, notify, closeFlash] = useFlash();
  const food = useFoodCart(notify);
  const [dishes, setDishes] = useState([]), [restaurants, setRestaurants] = useState([]), [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  // ?q= pre-fills the search and ?dish= opens a dish, so other pages (mood finder, trending) can deep-link here.
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || ""), [cuisine, setCuisine] = useState("All"), [vegOnly, setVegOnly] = useState(false), [bestOnly, setBestOnly] = useState(false), [budget, setBudget] = useState(false), [quick, setQuick] = useState(false), [sort, setSort] = useState("recommended"), [restaurantSort, setRestaurantSort] = useState("rating"), [limit, setLimit] = useState(12);
  const [suggestOpen, setSuggestOpen] = useState(false), [activeSuggest, setActiveSuggest] = useState(-1), [detailId, setDetailId] = useState(() => new URLSearchParams(window.location.search).get("dish")), [copied, setCopied] = useState("");

  const loadAll = async () => {
    setLoading(true); setError("");
    try {
      const [dishResponse, restaurantResponse] = await Promise.all([api.get("/food-items"), api.get("/restaurants")]);
      setDishes(Array.isArray(dishResponse.data) ? dishResponse.data : []);
      setRestaurants(Array.isArray(restaurantResponse.data) ? restaurantResponse.data : []);
    } catch (err) { setError(err.response?.data?.message || "Food items could not be loaded. Please try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); api.get("/offers").then(response => setOffers(Array.isArray(response.data) ? response.data : [])).catch(() => {}); }, []);
  useEffect(() => setLimit(12), [search, cuisine, vegOnly, bestOnly, budget, quick, sort]);
  useEffect(() => () => cancelAnimationFrame(parallaxFrame.current), []);

  const dishesByRestaurant = useMemo(() => { const map = new Map(); dishes.forEach(dish => { const key = String(dish.restaurant?._id || ""); map.set(key, [...(map.get(key) || []), dish]); }); return map; }, [dishes]);
  const restaurantCards = restaurants.map(restaurant => { const own = dishesByRestaurant.get(String(restaurant._id)) || []; return { ...restaurant, cover: restaurant.coverImage || own[0]?.image || cuisinePhoto(restaurant.cuisine), dishCount: own.length }; })
    .sort((a, b) => restaurantSort === "fastest" ? (a.deliveryTime || 35) - (b.deliveryTime || 35) || (b.rating || 0) - (a.rating || 0) : (b.rating || 0) - (a.rating || 0) || (a.deliveryTime || 35) - (b.deliveryTime || 35));
  const cuisineStats = foodCuisines.map(entry => ({ ...entry, count: dishes.filter(dish => foodMatchesCuisine(dish, entry)).length })).filter(entry => entry.count > 0);
  const fastest = restaurants.length ? Math.min(...restaurants.map(restaurant => restaurant.deliveryTime || 35)) : 0;
  const topRating = restaurants.length ? Math.max(...restaurants.map(restaurant => Number(restaurant.rating) || 0)) : 0;
  const heroDishes = (() => { const seen = new Set(); return dishes.filter(dish => dish.isBestseller && dish.restaurant && !seen.has(dish.restaurant._id) && seen.add(dish.restaurant._id)).slice(0, 2); })();

  const query = search.trim().toLowerCase();
  const textOf = dish => `${dish.name} ${dish.description || ""} ${dish.restaurant?.name || ""} ${(dish.restaurant?.cuisine || []).join(" ")} ${(dish.ingredients || []).join(" ")}`.toLowerCase();
  const matchesQuery = dish => !query || query.split(/\s+/).every(token => textOf(dish).includes(token));
  const cuisineEntry = foodCuisines.find(entry => entry.name === cuisine);
  const sorters = {
    recommended: (a, b) => (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0) || (b.restaurant?.rating || 0) - (a.restaurant?.rating || 0),
    rating: (a, b) => (b.restaurant?.rating || 0) - (a.restaurant?.rating || 0),
    fastest: (a, b) => ((a.preparationTime || 20) + (a.restaurant?.deliveryTime || 35)) - ((b.preparationTime || 20) + (b.restaurant?.deliveryTime || 35)),
    "price-asc": (a, b) => foodPrice(a) - foodPrice(b),
    "price-desc": (a, b) => foodPrice(b) - foodPrice(a)
  };
  const filtered = dishes.filter(dish => matchesQuery(dish) && (cuisine === "All" || foodMatchesCuisine(dish, cuisineEntry)) && (!vegOnly || dish.foodType !== "non-veg") && (!bestOnly || dish.isBestseller) && (!budget || foodPrice(dish) < 200) && (!quick || (dish.preparationTime || 20) <= 15)).sort(sorters[sort] || sorters.recommended);
  const activeFilters = [
    query && { key: "search", label: `“${search.trim()}”`, clear: () => setSearch("") },
    cuisine !== "All" && { key: "cuisine", label: cuisine, clear: () => setCuisine("All") },
    vegOnly && { key: "veg", label: "Veg only", clear: () => setVegOnly(false) },
    bestOnly && { key: "best", label: "Bestsellers", clear: () => setBestOnly(false) },
    budget && { key: "budget", label: "Under ₹200", clear: () => setBudget(false) },
    quick && { key: "quick", label: "Ready in 15 min", clear: () => setQuick(false) }
  ].filter(Boolean);
  const clearFilters = () => { setSearch(""); setCuisine("All"); setVegOnly(false); setBestOnly(false); setBudget(false); setQuick(false); };
  const dishSuggestions = query ? dishes.filter(matchesQuery).slice(0, 5) : [];
  const restaurantSuggestions = query ? restaurantCards.filter(restaurant => `${restaurant.name} ${(restaurant.cuisine || []).join(" ")}`.toLowerCase().includes(query)).slice(0, 3) : [];
  const showSuggest = suggestOpen && query.length > 0;
  const detailDish = detailId ? dishes.find(dish => dish._id === detailId) : null;

  const scrollToId = id => document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  const pickCuisine = name => { setCuisine(name); requestAnimationFrame(() => scrollToId("food-items")); };
  const quickToggle = (setter, value) => { setter(value); requestAnimationFrame(() => scrollToId("food-items")); };
  const submitSearch = event => { event.preventDefault(); if (activeSuggest >= 0 && dishSuggestions[activeSuggest]) { setDetailId(dishSuggestions[activeSuggest]._id); setSuggestOpen(false); return; } setSuggestOpen(false); searchRef.current?.blur(); scrollToId("food-items"); };
  const onSearchKey = event => {
    if (event.key === "ArrowDown" && dishSuggestions.length) { event.preventDefault(); setActiveSuggest(index => (index + 1) % dishSuggestions.length); }
    else if (event.key === "ArrowUp" && dishSuggestions.length) { event.preventDefault(); setActiveSuggest(index => index <= 0 ? dishSuggestions.length - 1 : index - 1); }
    else if (event.key === "Escape") { setSuggestOpen(false); setActiveSuggest(-1); }
  };
  const copyCode = code => {
    const done = () => { setCopied(code); notify(`${code} copied. Paste it at checkout.`); setTimeout(() => setCopied(current => current === code ? "" : current), 2500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => notify(`Use code ${code} at checkout.`));
    else notify(`Use code ${code} at checkout.`);
  };
  const moveVisual = event => { if (event.pointerType === "touch" || prefersReducedMotion()) return; const element = visualRef.current; if (!element) return; const rect = element.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5; cancelAnimationFrame(parallaxFrame.current); parallaxFrame.current = requestAnimationFrame(() => { element.style.setProperty("--px", x.toFixed(3)); element.style.setProperty("--py", y.toFixed(3)); }); };
  const resetVisual = () => { const element = visualRef.current; if (!element) return; element.style.setProperty("--px", "0"); element.style.setProperty("--py", "0"); };

  const renderDish = (dish, index) => {
    const restaurant = dish.restaurant;
    return <article className="fd-dish" key={dish._id} style={{ "--i": index % 12 }} data-fly-root>
      <div className="fd-dish-media" onClick={() => setDetailId(dish._id)}>
        <img data-fly-img src={dish.image || imageFallback} alt="" loading="lazy" onError={showImageFallback}/>
        {dish.isBestseller && <span className="fd-best"><Flame size={12}/> Bestseller</span>}
        <span className="fd-dish-time"><Clock size={12}/> {dish.preparationTime || 20} min prep</span>
        <span className="fd-peek" aria-hidden="true"><Eye size={14}/> View details</span>
      </div>
      <div className="fd-dish-body">
        <div className="fd-dish-tags"><VegMark type={dish.foodType}/><SpiceMeter level={dish.spiceLevel}/>{dish.calories ? <small>{dish.calories} kcal</small> : null}</div>
        <h3><button type="button" onClick={() => setDetailId(dish._id)}>{dish.name}</button></h3>
        <p>{dish.description || "Freshly prepared by a local kitchen."}</p>
        {restaurant && <Link className="fd-dish-rest" to={`/restaurants/${restaurant._id}`}><Store size={13}/><span>{restaurant.name}</span>{restaurant.rating ? <em><Star size={11} fill="currentColor"/>{Number(restaurant.rating).toFixed(1)}</em> : null}</Link>}
        <div className="fd-dish-foot"><span className="fd-price"><strong>{money(foodPrice(dish))}</strong>{dish.portionSize && <small>{dish.portionSize}</small>}</span><FoodQty dish={dish} food={food}/></div>
      </div>
    </article>;
  };

  return <><Header/><main className="fd-page" ref={rootRef}>
    <section className="fd-hero" aria-labelledby="food-hero-title">
      <div className="fd-hero-bg" aria-hidden="true"><span className="fd-glow a"/><span className="fd-glow b"/><span className="fd-grain"/></div>
      <div className="fd-wrap fd-hero-inner">
        <div className="fd-hero-copy">
          <nav className="fd-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><ChevronRight size={14}/><span>Food delivery</span></nav>
          <h1 id="food-hero-title">Your <span className="hx-sr-only">favourite food</span><RotatingWord words={foodHeroWords}/> fix,<br/>delivered fresh.</h1>
          <p>Order from {restaurants.length || "local"} neighbourhood kitchens{location?.city ? ` around ${location.city}` : ""}. See prep times, ingredients and allergens before you choose.</p>
          <form className="fd-search" role="search" onSubmit={submitSearch} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setSuggestOpen(false); setActiveSuggest(-1); } }}>
            <div className="fd-search-box">
              <Search size={20}/>
              <input ref={searchRef} type="search" role="combobox" aria-label="Search dishes, restaurants or cuisines" aria-expanded={showSuggest} aria-controls="fd-suggest-list" aria-autocomplete="list" aria-activedescendant={showSuggest && activeSuggest >= 0 ? `fd-sg-${activeSuggest}` : undefined} autoComplete="off" placeholder="Search paneer, pizza, noodles…" value={search} onChange={event => { setSearch(event.target.value); setSuggestOpen(true); setActiveSuggest(-1); }} onFocus={() => setSuggestOpen(true)} onKeyDown={onSearchKey}/>
              {search && <button type="button" className="fd-icon-btn" aria-label="Clear search" onClick={() => { setSearch(""); searchRef.current?.focus(); }}><X size={17}/></button>}
              <button type="submit" className="fd-search-go">Find food</button>
            </div>
            {showSuggest && <div className="fd-suggest" onMouseDown={event => event.preventDefault()}>
              {restaurantSuggestions.length > 0 && <><h4>Restaurants</h4><div className="fd-suggest-rests">{restaurantSuggestions.map(restaurant => <Link key={restaurant._id} to={`/restaurants/${restaurant._id}`}><img src={restaurant.cover} alt="" onError={showImageFallback}/><span><b>{restaurant.name}</b><small>{(restaurant.cuisine || []).join(" · ")} · {restaurant.deliveryTime || 35} min</small></span></Link>)}</div></>}
              {dishSuggestions.length > 0 ? <><h4>Dishes</h4><ul id="fd-suggest-list" role="listbox" aria-label="Matching dishes">{dishSuggestions.map((dish, index) => <li key={dish._id} id={`fd-sg-${index}`} role="option" aria-selected={activeSuggest === index} className={`fd-sg ${activeSuggest === index ? "active" : ""}`} onMouseEnter={() => setActiveSuggest(index)} onClick={() => { setDetailId(dish._id); setSuggestOpen(false); }} data-fly-root>
                <img data-fly-img src={dish.image || imageFallback} alt="" onError={showImageFallback}/>
                <span><b><VegMark type={dish.foodType}/><HighlightMatch text={dish.name} query={query}/></b><small>{dish.restaurant?.name} · {money(foodPrice(dish))}</small></span>
                <span onClick={event => event.stopPropagation()}><FoodQty dish={dish} food={food} compact/></span>
              </li>)}</ul>
              <button type="button" className="fd-suggest-all" onClick={() => { setSuggestOpen(false); scrollToId("food-items"); }}>See all {dishes.filter(matchesQuery).length} matching dishes <ArrowRight size={15}/></button></>
              : restaurantSuggestions.length === 0 && <div className="fd-suggest-empty"><span aria-hidden="true">🍽️</span><p>Nothing matches “{search.trim()}” yet. Try “paneer”, “pizza” or “smoothie”.</p></div>}
            </div>}
          </form>
          <div className="fd-quick" aria-label="Quick filters">
            <button type="button" className={vegOnly ? "on" : ""} aria-pressed={vegOnly} onClick={() => quickToggle(setVegOnly, !vegOnly)}><VegMark type="veg"/> Veg only</button>
            <button type="button" className={bestOnly ? "on" : ""} aria-pressed={bestOnly} onClick={() => quickToggle(setBestOnly, !bestOnly)}><Flame size={14}/> Bestsellers</button>
            <button type="button" className={budget ? "on" : ""} aria-pressed={budget} onClick={() => quickToggle(setBudget, !budget)}><BadgePercent size={14}/> Under ₹200</button>
            <button type="button" className={quick ? "on" : ""} aria-pressed={quick} onClick={() => quickToggle(setQuick, !quick)}><Clock size={14}/> Ready in 15 min</button>
          </div>
          {restaurants.length > 0 && <ul className="fd-stats">
            <li><b><CountUp value={restaurants.length}/></b><span>kitchens open</span></li>
            <li><b><CountUp value={dishes.length}/></b><span>dishes to try</span></li>
            <li><b><CountUp value={fastest} suffix=" min"/></b><span>fastest delivery</span></li>
            {topRating > 0 && <li><b>{topRating.toFixed(1)}★</b><span>top rated kitchen</span></li>}
          </ul>}
        </div>
        <div className="fd-hero-visual" ref={visualRef} onPointerMove={moveVisual} onPointerLeave={resetVisual}>
          <span className="fd-ring" aria-hidden="true"/>
          <figure className="fd-shot s1" aria-hidden="true"><img src={unsplash("1555939594-58d7cb561ad1", 700)} alt="" onError={showImageFallback}/></figure>
          <figure className="fd-shot s2" aria-hidden="true"><img src={unsplash("1546069901-ba9599a7e63c", 700)} alt="" onError={showImageFallback}/></figure>
          <figure className="fd-shot s3"><img src={unsplash("1565299624946-b28f40a0ae38", 900)} alt="A freshly baked pizza" onError={showImageFallback}/><span className="fd-steam" aria-hidden="true"><i/><i/><i/></span></figure>
          {heroDishes.map((dish, index) => <div className={`fd-float f${index}`} key={dish._id} data-fly-root>
            <img data-fly-img src={dish.image || imageFallback} alt="" onError={showImageFallback}/>
            <span><b>{dish.name}</b><small>{money(foodPrice(dish))} · <em><Star size={11} fill="currentColor"/> {Number(dish.restaurant?.rating || 0).toFixed(1)}</em></small></span>
            <FoodQty dish={dish} food={food} compact/>
          </div>)}
          {fastest > 0 && <div className="fd-badge speed"><span><Bike size={18}/></span><b>{fastest} min</b><small>fastest kitchen</small></div>}
          <span className="fd-emoji e0" aria-hidden="true">🍕</span><span className="fd-emoji e1" aria-hidden="true">🍔</span><span className="fd-emoji e2" aria-hidden="true">🍜</span><span className="fd-emoji e3" aria-hidden="true">🧁</span>
        </div>
      </div>
    </section>

    {cuisineStats.length > 0 && <section className="fd-section" id="food-cuisines" aria-labelledby="food-cuisines-title"><div className="fd-wrap">
      <div className="fd-head" data-reveal><div><span className="fd-eyebrow"><Sparkles size={14}/>What are you craving?</span><h2 id="food-cuisines-title">Pick a cuisine</h2></div></div>
      <div className="fd-cuisines">
        <button type="button" className={`fd-cuisine ${cuisine === "All" ? "on" : ""}`} aria-pressed={cuisine === "All"} onClick={() => pickCuisine("All")}><span className="fd-cuisine-img all"><Utensils size={30}/></span><b>Everything</b><small>{dishes.length} dishes</small></button>
        {cuisineStats.map((entry, index) => <button type="button" key={entry.name} className={`fd-cuisine ${cuisine === entry.name ? "on" : ""}`} aria-pressed={cuisine === entry.name} style={{ "--i": index + 1 }} onClick={() => pickCuisine(cuisine === entry.name ? "All" : entry.name)}><span className="fd-cuisine-img"><img src={unsplash(entry.image, 260)} alt="" loading="lazy" onError={showImageFallback}/></span><b>{entry.name}</b><small>{entry.count} {entry.count === 1 ? "dish" : "dishes"}</small></button>)}
      </div>
    </div></section>}

    {restaurantCards.length > 0 && <section className="fd-section" id="food-restaurants" aria-labelledby="food-restaurants-title"><div className="fd-wrap">
      <div className="fd-head" data-reveal><div><span className="fd-eyebrow"><Store size={14}/>Kitchens near you</span><h2 id="food-restaurants-title">Restaurants worth ordering from</h2><p>{restaurantCards.length} kitchens are open and taking orders right now.</p></div>
        <div className="fd-seg" role="group" aria-label="Sort restaurants"><button type="button" aria-pressed={restaurantSort === "rating"} className={restaurantSort === "rating" ? "on" : ""} onClick={() => setRestaurantSort("rating")}><Star size={14}/> Top rated</button><button type="button" aria-pressed={restaurantSort === "fastest"} className={restaurantSort === "fastest" ? "on" : ""} onClick={() => setRestaurantSort("fastest")}><Bike size={14}/> Fastest</button></div>
      </div>
      <div className="fd-restaurants">{restaurantCards.map((restaurant, index) => <Link to={`/restaurants/${restaurant._id}`} className="fd-rest" key={`${restaurantSort}-${restaurant._id}`} style={{ "--i": index }}>
        <div className="fd-rest-media"><img src={restaurant.cover} alt="" loading="lazy" onError={showImageFallback}/><span className="fd-rest-time"><Clock size={13}/> {restaurant.deliveryTime || 35} min</span>{index === 0 && <span className="fd-rest-flag">{restaurantSort === "rating" ? "★ Highest rated" : "⚡ Fastest"}</span>}<span className="fd-rest-go">View menu <ArrowRight size={14}/></span></div>
        <div className="fd-rest-body"><div className="fd-rest-top"><h3>{restaurant.name}</h3><span className="fd-rating"><Star size={12} fill="currentColor"/>{restaurant.rating ? Number(restaurant.rating).toFixed(1) : "New"}</span></div><p>{(restaurant.cuisine || []).join(" · ") || "Multi-cuisine"}</p><small><span className="fd-open-dot"/>Open now · {restaurant.dishCount} {restaurant.dishCount === 1 ? "dish" : "dishes"}{restaurant.address?.city ? ` · ${restaurant.address.city}` : ""}</small></div>
      </Link>)}</div>
    </div></section>}

    {offers.length > 0 && <section className="fd-section" aria-labelledby="food-offers-title"><div className="fd-wrap">
      <div className="fd-head" data-reveal><div><span className="fd-eyebrow"><TicketPercent size={14}/>Offers for you</span><h2 id="food-offers-title">Save on your next order</h2><p>Copy a code now and apply it in your cart.</p></div></div>
      <div className="fd-offers">{offers.map((offer, index) => <article className={`fd-ticket t${index % 3}`} key={offer._id} data-reveal style={{ "--d": `${index * 90}ms` }}>
        <div className="fd-ticket-main"><span className="fd-ticket-value">{offer.discountType === "percentage" ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} OFF`}</span><p>{offerSummary(offer)}</p>{offer.expiresAt && <small>Valid till {new Date(offer.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small>}</div>
        <div className="fd-ticket-stub"><code>{offer.code}</code><button type="button" onClick={() => copyCode(offer.code)}>{copied === offer.code ? <><Check size={14} strokeWidth={3}/> Copied</> : "Copy code"}</button></div>
      </article>)}</div>
    </div></section>}

    <section className="fd-section fd-dishes" id="food-items" aria-labelledby="food-items-title"><div className="fd-wrap">
      <div className="fd-head" data-reveal><div><span className="fd-eyebrow"><ChefHat size={14}/>Made fresh by local kitchens</span><h2 id="food-items-title">{cuisine === "All" ? "Find your next favourite" : `${cuisine} picks`}</h2><p>{loading ? "Finding dishes for you…" : `${filtered.length} ${filtered.length === 1 ? "dish" : "dishes"}${activeFilters.length ? " match your filters" : " available right now"}`}</p></div></div>
      <div className="fd-toolbar">
        <div className="fd-toggles" role="group" aria-label="Dish filters">
          <button type="button" className={`fd-toggle ${vegOnly ? "on" : ""}`} aria-pressed={vegOnly} onClick={() => setVegOnly(!vegOnly)}><VegMark type="veg"/> Veg only</button>
          <button type="button" className={`fd-toggle ${bestOnly ? "on" : ""}`} aria-pressed={bestOnly} onClick={() => setBestOnly(!bestOnly)}><Flame size={14}/> Bestsellers</button>
          <button type="button" className={`fd-toggle ${budget ? "on" : ""}`} aria-pressed={budget} onClick={() => setBudget(!budget)}>Under ₹200</button>
          <button type="button" className={`fd-toggle ${quick ? "on" : ""}`} aria-pressed={quick} onClick={() => setQuick(!quick)}><Clock size={14}/> Ready in 15 min</button>
        </div>
        <label className="fd-sort"><span>Sort</span><select value={sort} aria-label="Sort dishes" onChange={event => setSort(event.target.value)}>{foodSorts.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      </div>
      {activeFilters.length > 0 && <div className="fd-active">{activeFilters.map(filter => <button type="button" key={filter.key} aria-label={`Remove filter ${filter.label}`} onClick={filter.clear}>{filter.label}<X size={13}/></button>)}<button type="button" className="fd-link" onClick={clearFilters}>Clear all</button></div>}
      {error ? <div className="fd-empty"><span className="fd-empty-art" aria-hidden="true">🍲</span><h3>The kitchen didn't respond</h3><p>{error}</p><button type="button" className="btn btn-primary" onClick={loadAll}><RefreshCw size={15}/> Try again</button></div>
      : loading ? <div className="fd-grid">{Array.from({ length: 8 }, (_, index) => <div className="fd-dish fd-skeleton" key={index} aria-hidden="true"><span/><i/><i/><i/></div>)}</div>
      : filtered.length === 0 ? <div className="fd-empty"><span className="fd-empty-art" aria-hidden="true">🥡</span><h3>No dishes match this selection</h3><p>Try another search or cuisine, or clear a filter to see the full menu.</p><button type="button" className="btn btn-primary" onClick={clearFilters}>Show all dishes</button></div>
      : <><div className="fd-grid">{filtered.slice(0, limit).map(renderDish)}</div>
        {filtered.length > limit && <div className="fd-more"><span>Showing {limit} of {filtered.length} dishes</span><i><i style={{ width: `${limit / filtered.length * 100}%` }}/></i><button type="button" className="btn btn-outline" onClick={() => setLimit(current => current + 12)}>Show more dishes <ChevronRight size={16}/></button></div>}</>}
    </div></section>

    <section className="fd-section" aria-labelledby="food-journey-title"><div className="fd-wrap"><div className="fd-journey" data-reveal="zoom">
      <div className="fd-journey-copy"><span className="fd-eyebrow light"><Navigation size={14}/>From kitchen to doorstep</span><h2 id="food-journey-title">Order in a minute.<br/>Follow it all the way.</h2><p>Every order gets its own live tracking page, from the moment the kitchen accepts it to the knock at your door.</p><a className="btn btn-primary" href="#food-items">Start your order <ArrowRight size={16}/></a></div>
      <ol className="fd-journey-steps">{foodJourney.map(({ icon: Icon, title, text }, index) => <li key={title} style={{ "--i": index }}><span className="fd-journey-icon"><Icon size={22}/></span><div><b>{title}</b><p>{text}</p></div><em>{index + 1}</em></li>)}</ol>
    </div></div></section>
  </main>
  <FoodCartBar food={food}/>
  {detailDish && <DishDetailModal dish={detailDish} food={food} onClose={() => setDetailId(null)}/>}
  <FlashToast flash={flash} onClose={closeFlash}/>
  <Footer/></>;
}
function RestaurantDetail() {
  const { id: restaurantId } = useParams();
  const navigate = useNavigate();
  const [flash, notify, closeFlash] = useFlash();
  const food = useFoodCart(notify);
  const [data, setData] = useState(null), [saved, setSaved] = useState(false), [offers, setOffers] = useState([]);
  const [menuSearch, setMenuSearch] = useState(""), [vegOnly, setVegOnly] = useState(false), [expanded, setExpanded] = useState({}), [activeSection, setActiveSection] = useState("");
  useEffect(() => { setData(null); api.get(`/restaurants/${restaurantId}`).then(response => setData(response.data)).catch(() => setData({ error: true })); }, [restaurantId]);
  useEffect(() => { api.get("/offers").then(response => setOffers(Array.isArray(response.data) ? response.data : [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!food.isCustomer) return;
    api.get("/favorites").then(response => setSaved((response.data || []).some(row => String(row.restaurant?._id || row.restaurant) === String(restaurantId)))).catch(() => {});
  }, [food.isCustomer, restaurantId]);

  const menu = data?.menu || [];
  const query = menuSearch.trim().toLowerCase();
  const visible = menu.filter(item => (!vegOnly || item.foodType !== "non-veg") && (!query || `${item.name} ${item.description || ""} ${(item.ingredients || []).join(" ")}`.toLowerCase().includes(query)));
  const sections = [
    { id: "menu-bestsellers", title: "Bestsellers", note: "The dishes this kitchen is known for", items: visible.filter(item => item.isBestseller) },
    { id: "menu-veg", title: "Vegetarian & vegan", note: "Meat-free plates from the menu", items: visible.filter(item => !item.isBestseller && item.foodType !== "non-veg") },
    { id: "menu-nonveg", title: "Non-veg", note: "Chicken, meat and egg dishes", items: visible.filter(item => !item.isBestseller && item.foodType === "non-veg") }
  ].filter(section => section.items.length);
  const sectionKey = sections.map(section => section.id).join(",");
  useEffect(() => {
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      const top = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActiveSection(top.target.id);
    }, { rootMargin: "-150px 0px -55% 0px" });
    sections.forEach(section => { const element = document.getElementById(section.id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [sectionKey]);

  const saveRestaurant = async () => {
    if (!food.isCustomer) { navigate("/login", { state: { from: `/restaurants/${restaurantId}` } }); return; }
    try {
      if (saved) { await api.delete(`/favorites/${restaurantId}`); setSaved(false); notify("Removed from your favourites"); }
      else { await api.post(`/favorites/${restaurantId}`); setSaved(true); notify("Saved to your favourites"); }
    } catch (error) { notify(error.response?.data?.message || "Log in as a customer to save favourites", { tone: "error" }); }
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: data.restaurant.name, url }); return; }
      await navigator.clipboard.writeText(url); notify("Restaurant link copied");
    } catch (error) { if (error?.name !== "AbortError") notify("Copy the link from your address bar to share it.", { tone: "error" }); }
  };
  const jumpTo = id => { const element = document.getElementById(id); if (!element) return; window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 150, behavior: prefersReducedMotion() ? "auto" : "smooth" }); };

  if (!data) return <><Header/><main className="fd-page"><div className="fd-rhero loading" aria-busy="true"><div className="fd-wrap"><div className="fd-rhero-card fd-skeleton-card"><span/><i/><i/></div></div></div><div className="fd-wrap fd-menu-loading">{Array.from({ length: 3 }, (_, index) => <div className="fd-menu-item fd-skeleton-row" key={index}><i/><span/></div>)}</div></main><Footer/></>;
  if (data.error) return <><Header/><main className="fd-page"><div className="fd-wrap"><div className="fd-empty fd-notfound"><span className="fd-empty-art" aria-hidden="true">🍽️</span><h3>This restaurant isn't taking orders</h3><p>It may be closed right now, or the link is out of date. Plenty of other kitchens are open.</p><Link className="btn btn-primary" to="/food">Browse restaurants <ArrowRight size={15}/></Link></div></div></main><Footer/></>;

  const restaurant = data.restaurant;
  const cover = restaurant.coverImage || menu.find(item => item.image)?.image || cuisinePhoto(restaurant.cuisine, 1400);
  const initials = restaurant.name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(-2).map(word => word[0]).join("").toUpperCase();
  const hereLines = food.lines.filter(line => String(line.restaurant?._id || line.restaurant) === String(restaurantId));
  const otherCount = food.lines.filter(line => String(line.restaurant?._id || line.restaurant) !== String(restaurantId)).reduce((sum, line) => sum + line.quantity, 0);

  const renderItem = item => {
    const open = Boolean(expanded[item._id]);
    const hasDiscount = item.discountPrice != null && item.discountPrice < item.price;
    const hasDetails = item.ingredients?.length > 0 || item.allergens?.length > 0;
    return <article className="fd-menu-item" key={item._id} data-fly-root>
      <div className="fd-menu-copy">
        <div className="fd-menu-tags"><VegMark type={item.foodType}/>{item.isBestseller && <span className="fd-best inline"><Flame size={12}/> Bestseller</span>}{item.foodType === "vegan" && <span className="fd-tag-vegan"><Leaf size={12}/> Vegan</span>}</div>
        <h3>{item.name}</h3>
        <div className="fd-menu-price"><strong>{money(foodPrice(item))}</strong>{hasDiscount && <del>{money(item.price)}</del>}</div>
        <p>{item.description || "Freshly prepared to order."}</p>
        <div className="fd-meta"><span><Clock size={13}/> {item.preparationTime || 20} min prep</span>{item.calories ? <span>{item.calories} kcal</span> : null}{item.portionSize ? <span>{item.portionSize}</span> : null}<SpiceMeter level={item.spiceLevel}/></div>
        {hasDetails && <button type="button" className="fd-more-btn" aria-expanded={open} onClick={() => setExpanded(current => ({ ...current, [item._id]: !open }))}>{open ? "Hide details" : "Ingredients & allergens"}<ChevronRight size={14}/></button>}
        {open && <div className="fd-menu-details">
          {item.ingredients?.length > 0 && <div><b>Ingredients</b><div className="fd-chips">{item.ingredients.map(entry => <span key={entry}>{entry}</span>)}</div></div>}
          {item.allergens?.length > 0 && <div className="allergen"><b>Allergens</b><div className="fd-chips">{item.allergens.map(entry => <span key={entry}>{entry}</span>)}</div></div>}
        </div>}
      </div>
      <div className="fd-menu-media"><img data-fly-img src={item.image || imageFallback} alt={item.name} loading="lazy" onError={showImageFallback}/><FoodQty dish={item} food={food}/></div>
    </article>;
  };

  return <><Header/><main className="fd-page fd-restaurant">
    <section className="fd-rhero" aria-labelledby="fd-restaurant-title">
      <div className="fd-rhero-media" aria-hidden="true"><img src={cover} alt="" onError={showImageFallback}/></div>
      <div className="fd-wrap fd-rhero-inner">
        <nav className="fd-crumbs light" aria-label="Breadcrumb"><Link to="/">Home</Link><ChevronRight size={14}/><Link to="/food">Food</Link><ChevronRight size={14}/><span>{restaurant.name}</span></nav>
        <div className="fd-rhero-card">
          <span className="fd-rlogo">{restaurant.logo ? <img src={restaurant.logo} alt="" onError={showImageFallback}/> : initials || "GF"}</span>
          <div className="fd-rhero-main">
            <span className="fd-open-pill"><span className="fd-open-dot"/>Open now · {restaurant.openingHours || "Taking orders"}</span>
            <h1 id="fd-restaurant-title">{restaurant.name}</h1>
            {restaurant.description && <p>{restaurant.description}</p>}
            <div className="fd-rhero-cuisine">{(restaurant.cuisine || []).map(entry => <span key={entry}>{entry}</span>)}</div>
          </div>
          <div className="fd-rhero-actions">
            <button type="button" className={`fd-round ${saved ? "on" : ""}`} aria-pressed={saved} aria-label={saved ? "Remove from favourites" : "Save to favourites"} onClick={saveRestaurant}><Heart size={19} fill={saved ? "currentColor" : "none"}/></button>
            <button type="button" className="fd-round" aria-label="Share this restaurant" onClick={share}><Send size={18}/></button>
          </div>
          <ul className="fd-rfacts">
            <li><span className="fd-rating big"><Star size={14} fill="currentColor"/>{restaurant.rating ? Number(restaurant.rating).toFixed(1) : "New"}</span><small>rating</small></li>
            <li><b><Clock size={16}/>{restaurant.deliveryTime || 35} min</b><small>delivery estimate</small></li>
            <li><b><Utensils size={16}/>{menu.length}</b><small>{menu.length === 1 ? "dish" : "dishes"} on the menu</small></li>
            {restaurant.address?.city && <li><b><MapPin size={16}/>{restaurant.address.city}</b><small>{restaurant.address.street || "Restaurant location"}</small></li>}
            {restaurant.minimumOrder > 0 && <li><b>{money(restaurant.minimumOrder)}</b><small>minimum order</small></li>}
          </ul>
        </div>
      </div>
    </section>

    {offers.length > 0 && <div className="fd-wrap"><div className="fd-roffers" aria-label="Offers you can use here">{offers.map(offer => <span className="fd-roffer" key={offer._id}><span className="fd-roffer-icon"><TicketPercent size={17}/></span><span><b>{offer.discountType === "percentage" ? `${offer.discountValue}% off` : `₹${offer.discountValue} off`}</b><small>{offerSummary(offer)} · use <code>{offer.code}</code></small></span></span>)}</div></div>}

    <div className="fd-wrap fd-rlayout">
      <div className="fd-rmenu">
        <div className="fd-menubar">
          <label className="fd-menu-search"><Search size={17}/><input type="search" value={menuSearch} aria-label={`Search the ${restaurant.name} menu`} placeholder="Search this menu" onChange={event => setMenuSearch(event.target.value)}/></label>
          <button type="button" className={`fd-toggle ${vegOnly ? "on" : ""}`} aria-pressed={vegOnly} onClick={() => setVegOnly(!vegOnly)}><VegMark type="veg"/> Veg only</button>
          {sections.length > 1 && <nav className="fd-menu-tabs" aria-label="Menu sections">{sections.map(section => <button type="button" key={section.id} className={activeSection === section.id ? "on" : ""} aria-current={activeSection === section.id ? "true" : undefined} onClick={() => jumpTo(section.id)}>{section.title}<small>{section.items.length}</small></button>)}</nav>}
        </div>
        {sections.length === 0 ? <div className="fd-empty"><span className="fd-empty-art" aria-hidden="true">🔍</span><h3>{menu.length ? "No dishes match" : "The menu is being updated"}</h3><p>{menu.length ? "Try a different search, or turn off the veg filter." : "This kitchen hasn't listed any dishes yet. Check back soon."}</p>{menu.length > 0 && <button type="button" className="btn btn-primary" onClick={() => { setMenuSearch(""); setVegOnly(false); }}>Show the full menu</button>}</div>
        : sections.map(section => <section className="fd-menu-section" id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
          <header><h2 id={`${section.id}-title`}>{section.title}<span>{section.items.length}</span></h2><p>{section.note}</p></header>
          {section.items.map(renderItem)}
        </section>)}
      </div>
      <aside className="fd-rcart" aria-label="Your cart">
        <div className="fd-rcart-head"><span className="fd-rcart-icon" data-basket-target><ShoppingBag size={19}/></span><div><h3>Your cart</h3><small>{food.count ? `${food.count} ${food.count === 1 ? "item" : "items"}${food.restaurantCount > 1 ? ` · ${food.restaurantCount} restaurants` : ""}` : "Nothing added yet"}</small></div></div>
        {food.count ? <>
          {hereLines.length > 0 && <ul className="fd-rcart-lines">{hereLines.map(line => <li key={line.foodItem._id}><VegMark type={line.foodItem.foodType}/><span><b>{line.foodItem.name}</b><small>{money(foodPrice(line.foodItem) * line.quantity)}</small></span><FoodQty dish={line.foodItem} food={food} compact/></li>)}</ul>}
          {otherCount > 0 && <p className="fd-rcart-note">+ {otherCount} {otherCount === 1 ? "item" : "items"} from other restaurants</p>}
          <div className="fd-rcart-total"><span>Item total</span><b>{money(food.subtotal)}</b></div>
          <p className="fd-rcart-fine">A ₹{FOOD_DELIVERY_FEE} delivery fee per restaurant and 5% tax are added at checkout.</p>
          <Link to="/cart" className="btn btn-primary btn-full">Go to checkout <ArrowRight size={16}/></Link>
        </> : <div className="fd-rcart-empty"><span aria-hidden="true">🛍️</span><p>Add a dish and it will show up here.</p></div>}
      </aside>
    </div>
  </main>
  <FoodCartBar food={food}/>
  <FlashToast flash={flash} onClose={closeFlash}/>
  <Footer/></>;
}
const roleTitles = { customer: "Customer", restaurant_owner: "Restaurant partner", delivery_partner: "Delivery partner", admin: "Administrator" };
const greeting = () => { const hour = new Date().getHours(); return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };
// A person's photo, or warm initials when they haven't added one.
function Avatar({ user, size = 40 }) {
  const [background, color] = avatarTone(user?.name || "");
  return <span className="ds-avatar" style={{ width: size, height: size, fontSize: Math.round(size * .36), ...(user?.profileImage ? {} : { background, color }) }}>{user?.profileImage ? <img src={user.profileImage} alt=""/> : initials(user?.name)}</span>;
}
const quickActions = {
  customer: [["Order food", "/food", Utensils], ["Shop Instamart", "/instamart", ShoppingBasket], ["Book a table", "/dineout", CalendarDays], ["Today's offers", "/offers", TicketPercent], ["Spin the reward wheel", "/rewards", Gift]],
  restaurant_owner: [["Add or edit dishes", "/restaurant/menu", Utensils], ["Open kitchen orders", "/restaurant/orders", ClipboardList], ["Table requests", "/restaurant/reservations", CalendarDays]],
  delivery_partner: [["Go online", "/delivery/availability", Power], ["Open assignments", "/delivery/jobs", Bike], ["See earnings", "/delivery/earnings", Wallet]],
  admin: [["Review restaurants", "/admin/restaurants", Store], ["Payments and refunds", "/admin/transactions", Wallet], ["Support tickets", "/admin/support", ShieldCheck]]
};
// ⌘K / Ctrl+K: jump to any workspace page or common action from the keyboard.
function CommandPalette({ open, onClose, nav, role }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(""), [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { if (!open) return; setQuery(""); setIndex(0); const timer = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(timer); }, [open]);
  if (!open) return null;
  const entries = [...nav.map(item => ({ label: item.label, to: item.to, icon: item.icon, group: "Pages" })), ...(quickActions[role] || []).map(([label, to, icon]) => ({ label, to, icon, group: "Quick actions" })), { label: "Marketplace home", to: "/", icon: Store, group: "Quick actions" }];
  const needle = query.trim().toLowerCase();
  const list = entries.filter(entry => !needle || entry.label.toLowerCase().includes(needle));
  const go = entry => { onClose(); navigate(entry.to); };
  const onKey = event => {
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex(current => Math.min(list.length - 1, current + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(current => Math.max(0, current - 1)); }
    else if (event.key === "Enter" && list[index]) { event.preventDefault(); go(list[index]); }
    else if (event.key === "Escape") onClose();
  };
  return <div className="ds-palette-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="ds-palette" role="dialog" aria-modal="true" aria-label="Jump to a page">
      <label className="ds-palette-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={onKey} placeholder="Search pages and actions…" role="combobox" aria-expanded="true" aria-controls="ds-palette-list" aria-activedescendant={list[index] ? `ds-opt-${index}` : undefined} aria-label="Search pages and actions"/><kbd>Esc</kbd></label>
      <ul id="ds-palette-list" role="listbox">{list.length ? list.map((entry, position) => <li key={`${entry.group}-${entry.to}-${entry.label}`} id={`ds-opt-${position}`} role="option" aria-selected={position === index} className={position === index ? "on" : ""} onMouseEnter={() => setIndex(position)} onMouseDown={event => { event.preventDefault(); go(entry); }}><entry.icon size={17}/><span>{entry.label}</span><small>{entry.group}</small></li>) : <li className="empty">No matches for “{query}”</li>}</ul>
    </div>
  </div>;
}
function DashboardLayout({ title, subtitle, items, children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false), [palette, setPalette] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(value => !value); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const nav = [...items, { label: "Profile", to: "/profile", icon: UserRound }];
  const isOverview = items[0]?.to === pathname;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return <div className="ds-shell">
    {open && <div className="ds-scrim" onClick={() => setOpen(false)} aria-hidden="true"/>}
    <aside className={`ds-side ${open ? "open" : ""}`} aria-label="Workspace navigation">
      <div className="ds-brand"><Brand/><button type="button" className="ds-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <Link to="/profile" className="ds-me"><Avatar user={user} size={44}/><span><b>{user?.name}</b><small>{roleTitles[user?.role] || "Account"}</small></span></Link>
      <nav className="ds-nav"><span className="ds-nav-label">Workspace</span>{nav.map(item => <Link key={item.to} to={item.to} className={pathname === item.to ? "on" : ""} aria-current={pathname === item.to ? "page" : undefined}><item.icon size={18}/><span>{item.label}</span></Link>)}</nav>
      <div className="ds-side-foot">
        <Link to="/" className="ds-market"><span className="ds-market-icon"><Store size={18}/></span><span><b>Visit marketplace</b><small>Order, shop and explore</small></span><ArrowRight size={15}/></Link>
        <button type="button" className="ds-signout" onClick={logout}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
    <div className="ds-main">
      <header className="ds-top">
        <button type="button" className="ds-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <nav className="ds-crumbs" aria-label="Breadcrumb"><Link to={items[0]?.to || "/"}>Workspace</Link><ChevronRight size={14}/><span>{title}</span></nav>
        <button type="button" className="ds-jump" onClick={() => setPalette(true)} aria-label="Jump to a page"><Search size={16}/><span>Jump to…</span><kbd>{mac ? "⌘" : "Ctrl"} K</kbd></button>
        <div className="ds-top-right">
          <span className="ds-live"><i/>Live</span>
          {user?.role === "customer" && <Link to="/customer/notifications" className="ds-icon-btn" aria-label="Notifications"><Bell size={18}/></Link>}
          <Link to="/profile" className="ds-top-avatar" aria-label="Your profile"><Avatar user={user} size={36}/></Link>
        </div>
      </header>
      <main className="ds-content">
        <div className="ds-intro">
          <div>{isOverview && <span className="ds-greet">{greeting()}, {user?.name?.split(" ")[0] || "there"} 👋</span>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
          <span className="ds-date"><CalendarDays size={15}/>{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
        {children}
      </main>
    </div>
    <CommandPalette open={palette} onClose={() => setPalette(false)} nav={nav} role={user?.role}/>
  </div>;
}
const customerNav=[{label:"Overview",to:"/customer",icon:LayoutDashboard},{label:"My orders",to:"/customer/orders",icon:ClipboardList},{label:"Grocery orders",to:"/customer/grocery-orders",icon:ShoppingBasket},{label:"Saved addresses",to:"/customer/addresses",icon:MapPin},{label:"Dineout bookings",to:"/customer/reservations",icon:CalendarDays},{label:"GoFoode Plus",to:"/customer/membership",icon:CreditCard},{label:"Notifications",to:"/customer/notifications",icon:Bell},{label:"Favourites",to:"/customer/favourites",icon:Heart},{label:"Rewards & referrals",to:"/rewards",icon:Sparkles}];
const ownerNav=[{label:"Overview",to:"/restaurant",icon:LayoutDashboard},{label:"My restaurants",to:"/restaurant/places",icon:Store},{label:"Menu manager",to:"/restaurant/menu",icon:Utensils},{label:"Orders",to:"/restaurant/orders",icon:ClipboardList},{label:"Reservations",to:"/restaurant/reservations",icon:CalendarDays},{label:"Customer reviews",to:"/restaurant/reviews",icon:Star}];
const deliveryNav=[{label:"Overview",to:"/delivery",icon:LayoutDashboard},{label:"Assignments",to:"/delivery/jobs",icon:Bike},{label:"Availability",to:"/delivery/availability",icon:Power},{label:"Delivery history",to:"/delivery/history",icon:History},{label:"Earnings",to:"/delivery/earnings",icon:Wallet}];
const adminNav=[{label:"Overview",to:"/admin",icon:LayoutDashboard},{label:"Users",to:"/admin/users",icon:Users},{label:"Restaurants",to:"/admin/restaurants",icon:Store},{label:"Orders",to:"/admin/orders",icon:ClipboardList},{label:"Transactions",to:"/admin/transactions",icon:Wallet},{label:"Reviews",to:"/admin/reviews",icon:Star},{label:"Support",to:"/admin/support",icon:ShieldCheck},{label:"Grocery orders",to:"/admin/grocery-orders",icon:ShoppingBasket},{label:"Reservations",to:"/admin/reservations",icon:CalendarDays},{label:"Activity log",to:"/admin/activity",icon:Activity}];
const roleNavigation={customer:customerNav,restaurant_owner:ownerNav,delivery_partner:deliveryNav,admin:adminNav};

function ProfilePage() {
  const { user, location, locationStatus, locationError, requestLocation, updateProfile } = useAuth();
  const [roleData,setRoleData]=useState(null),[roleError,setRoleError]=useState(""),[loading,setLoading]=useState(true);
  const [profileImage,setProfileImage]=useState(user.profileImage||""),[profileMessage,setProfileMessage]=useState(""),[profileError,setProfileError]=useState(""),[profileBusy,setProfileBusy]=useState(false);
  const [locationSheet,setLocationSheet]=useState(false);
  const chooseProfileImage=async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    event.target.value="";
    setProfileError("");setProfileMessage("");
    try{setProfileImage(await toUploadImage(file))}
    catch(error){setProfileError(error.message||"Could not prepare this profile image.")}
  };
  const saveProfileImage=async()=>{
    setProfileBusy(true);setProfileError("");setProfileMessage("");
    try{await updateProfile({profileImage});setProfileMessage("Profile photo updated.")}
    catch(error){setProfileError(error.response?.data?.message||"Could not update your profile photo.")}
    finally{setProfileBusy(false)}
  };
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setLoading(true);setRoleError("");
      try{
        let data;
        if(user.role==="customer"){
          const response=await api.get("/orders/my-orders");
          data=response.data;
        }else if(user.role==="restaurant_owner"){
          const response=await api.get("/restaurant/mine");
          data=response.data;
        }else if(user.role==="delivery_partner"){
          const [assignments,earnings]=await Promise.all([api.get("/delivery/assignments"),api.get("/delivery/earnings")]);
          data={assignments:assignments.data,earnings:earnings.data};
        }else{
          const response=await api.get("/admin/dashboard");
          data=response.data;
        }
        if(active)setRoleData(data);
      }catch(error){
        if(active)setRoleError(error.response?.data?.message||"Could not load your role-specific account information.");
      }finally{
        if(active)setLoading(false);
      }
    };
    load();
    return ()=>{active=false};
  },[user.role]);

  const details={
    customer:{label:"Customer account",icon:ShoppingBag,summary:loading?"Loading order history…":`${roleData?.length||0} food orders placed`},
    restaurant_owner:{label:"Restaurant partner",icon:Store,summary:loading?"Loading your restaurants…":`${roleData?.length||0} restaurant application${roleData?.length===1?"":"s"}`},
    delivery_partner:{label:"Delivery partner",icon:Bike,summary:loading?"Loading delivery activity…":`${roleData?.earnings?.completed||0} completed deliveries · ${money(roleData?.earnings?.estimatedEarnings)}`},
    admin:{label:"Platform administrator",icon:ShieldCheck,summary:loading?"Loading platform overview…":`${roleData?.users||0} users · ${roleData?.restaurants||0} restaurants`}
  }[user.role]||{label:"GoFoode account",icon:UserRound,summary:"Your account details"};
  const RoleIcon=details.icon;
  const activeOrders=(Array.isArray(roleData)?roleData:[]).filter(order=>!["delivered","cancelled","rejected"].includes(order.orderStatus)).length;
  const activeDeliveries=roleData?.assignments?.filter(job=>job.deliveryPartner&&["accepted","picked_up","on_the_way"].includes(job.status)).length||0;
  const roleStats={
    customer:<div className="stats-grid"><Stat label="Food orders" value={roleData?.length||0} icon={Package}/><Stat label="Active orders" value={activeOrders} icon={Clock} tone="blue"/></div>,
    restaurant_owner:<div className="panel"><div className="panel-head"><div><h3>Your restaurants</h3><p>Application and approval status for your kitchens.</p></div><Link to="/restaurant/places" className="link-orange">Manage restaurants <ArrowRight size={14}/></Link></div>{roleData?.length?roleData.map(restaurant=><div className="list-row" key={restaurant._id}><img className="list-photo" src={restaurantCover(restaurant,160)} alt="" loading="lazy" onError={showImageFallback}/><div className="list-grow"><b>{restaurant.name}</b><small>{[restaurant.address?.city,restaurant.address?.state].filter(Boolean).join(", ")||"Location not set"}</small></div><Badge>{restaurant.status}</Badge></div>):<p className="muted">No restaurant applications yet.</p>}</div>,
    delivery_partner:<div className="stats-grid"><Stat label="Completed deliveries" value={roleData?.earnings?.completed||0} icon={CheckCircle2} tone="green"/><Stat label="Active deliveries" value={activeDeliveries} icon={Bike} tone="blue"/><Stat label="Estimated earnings" value={money(roleData?.earnings?.estimatedEarnings)} icon={Wallet}/></div>,
    admin:<div className="stats-grid"><Stat label="Platform users" value={roleData?.users||0} icon={Users}/><Stat label="Restaurants" value={roleData?.restaurants||0} icon={Store} tone="blue"/><Stat label="Orders" value={roleData?.orders||0} icon={Package} tone="purple"/></div>
  }[user.role];

  const photoChanged = profileImage !== (user.profileImage || "");
  const locationSource = { search: "Picked from search", saved: "Saved address", city: "City", manual: "Entered manually" }[location?.source] || (location ? "Detected by GPS" : "");
  const hasCoordinates = Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
  return <DashboardLayout title="Your profile" subtitle="Your account details, photo, delivery location and activity." items={roleNavigation[user.role]||customerNav}>
    <section className="pf-hero">
      <div className="pf-cover" aria-hidden="true"><img src={photos.spread} alt=""/></div>
      <div className="pf-hero-body">
        <label className="pf-avatar" title="Change your photo">
          {profileImage ? <img src={profileImage} alt="Your profile"/> : <span style={{ background: avatarTone(user.name)[0], color: avatarTone(user.name)[1] }}>{initials(user.name)}</span>}
          <i aria-hidden="true"><Camera size={16}/></i>
          <input className="visually-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage} aria-label="Choose a profile photo"/>
        </label>
        <div className="pf-id"><h2>{user.name}</h2><p><span className="pf-role"><RoleIcon size={14}/>{details.label}</span><span>{user.email}</span></p></div>
        <div className="pf-photo-actions">
          {photoChanged ? <>
            <button type="button" className="btn btn-outline btn-small" onClick={() => { setProfileImage(user.profileImage || ""); setProfileError(""); }}>Cancel</button>
            <button type="button" className="btn btn-primary btn-small" disabled={profileBusy} onClick={saveProfileImage}>{profileBusy ? "Saving…" : "Save photo"}</button>
          </> : <>
            <label className="btn btn-outline btn-small"><Camera size={15}/> {profileImage ? "Change photo" : "Add a photo"}<input className="visually-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage}/></label>
            {profileImage && <button type="button" className="btn btn-outline btn-small" onClick={() => setProfileImage("")}>Remove</button>}
          </>}
        </div>
      </div>
      {photoChanged && <p className="pf-hint">Preview only. Save to update your photo everywhere on GoFoode.</p>}
      {profileMessage && <p className="success-box" role="status">{profileMessage}</p>}
      {profileError && <p className="error-box" role="alert">{profileError}</p>}
    </section>
    <div className="pf-grid">
      <section className="panel pf-details"><div className="panel-head"><div><h3>Personal information</h3><p>How restaurants and riders reach you.</p></div></div>
        {[[UserRound, "Full name", user.name], [Mail, "Email address", user.email], [Phone, "Phone number", user.phone], [RoleIcon, "Account type", details.label]].map(([Icon, label, value]) => <div className="pf-row" key={label}><span className="pf-row-icon"><Icon size={17}/></span><div><small>{label}</small><b className={value ? "" : "missing"}>{value || "Not added yet"}</b></div></div>)}
      </section>
      <section className="panel pf-location"><div className="panel-head"><div><h3>Delivery location</h3><p>Prefills checkout and shows kitchens near you.</p></div>{locationSource && <span className="pf-chip"><MapPin size={13}/>{locationSource}</span>}</div>
        <div className="pf-loc-value"><b>{location?.label || "No location set yet"}</b>{location?.accuracy && <small>Accurate to about {Math.round(location.accuracy)} m</small>}{location?.updatedAt && <small>Updated {new Date(location.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small>}</div>
        {hasCoordinates && <div className="pf-map"><GoogleMap title="Your delivery location" latitude={location.latitude} longitude={location.longitude} zoom={14}/></div>}
        {locationError && <p className="error-box" role="status">{locationError}</p>}
        <div className="pf-loc-actions">
          <button type="button" className="btn btn-primary btn-small" onClick={() => setLocationSheet(true)}><MapPin size={15}/> Change location</button>
          <button type="button" className="btn btn-outline btn-small" onClick={requestLocation} disabled={locationStatus==="loading"||locationStatus==="retrying"}><Crosshair size={15}/>{locationStatus==="loading"||locationStatus==="retrying"?"Locating…":"Use GPS"}</button>
        </div>
        <LocationSheet open={locationSheet} onClose={() => setLocationSheet(false)}/>
      </section>
    </div>
    {roleError&&<p className="error-box" role="status">{roleError}</p>}
    <section className="profile-role-section"><div className="panel-head"><div><h3>Your GoFoode activity</h3><p>{details.summary}</p></div></div>{roleStats}</section>
  </DashboardLayout>;
}

function Stat({ label,value,icon:Icon, tone="orange", hint }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function DataTable({ columns, rows, empty="No records found." }) { return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={row._id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(row):row[c.key]??"—"}</td>)}</tr>):<tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>}</tbody></table></div>; }
function Badge({ children }) { return <span className={`badge badge-${String(children).toLowerCase().replaceAll(" ","-")}`}>{String(children).replaceAll("_"," ")}</span>; }
function CustomerDashboard() {
  const [orders,setOrders]=useState([]),[groceryOrders,setGroceryOrders]=useState([]),[cart,setCart]=useState({items:[]}),[notifications,setNotifications]=useState([]),[error,setError]=useState("");
  const load=()=>Promise.all([api.get("/orders/my-orders"),api.get("/grocery/orders/mine"),api.get("/cart"),api.get("/notifications")]).then(([o,g,c,n])=>{setOrders(o.data);setGroceryOrders(g.data);setCart(c.data);setNotifications(n.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load your account overview."));
  useEffect(()=>{load()},[]);
  return <DashboardLayout title="Customer overview" subtitle="Your food journey, all in one place." items={customerNav}>
    {error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Try again</button></p>}
    <div className="stats-grid"><Stat label="All orders" value={orders.length+groceryOrders.length} icon={Package}/><Stat label="Food orders" value={orders.length} icon={Utensils} tone="blue"/><Stat label="Grocery orders" value={groceryOrders.length} icon={ShoppingBasket} tone="green"/><Stat label="Cart items" value={cart.items?.reduce((s,i)=>s+i.quantity,0)||0} icon={ShoppingBag} tone="purple"/></div>
    <section className="dashboard-quick-links"><Link to="/" className="dashboard-quick-link"><span className="quick-link-icon"><Utensils size={18}/></span><span><b>Order food</b><small>Explore nearby restaurants</small></span><ArrowRight size={16}/></Link><Link to="/instamart" className="dashboard-quick-link"><span className="quick-link-icon green"><ShoppingBasket size={18}/></span><span><b>Shop groceries</b><small>Everyday essentials delivered</small></span><ArrowRight size={16}/></Link><Link to="/customer/addresses" className="dashboard-quick-link"><span className="quick-link-icon blue"><MapPin size={18}/></span><span><b>Saved addresses</b><small>Manage delivery locations</small></span><ArrowRight size={16}/></Link><Link to="/customer/favourites" className="dashboard-quick-link"><span className="quick-link-icon rose"><Heart size={18}/></span><span><b>Your favourites</b><small>Restaurants you saved</small></span><ArrowRight size={16}/></Link></section>
    <div className="panel"><div className="panel-head"><div><h3>Recent food orders</h3><p>Track the latest restaurant orders.</p></div><Link to="/customer/orders" className="link-orange">View all <ArrowRight size={15}/></Link></div><DataTable columns={[{key:"orderNumber",label:"Order"},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"orderStatus",label:"Status",render:r=><Badge>{r.orderStatus}</Badge>},{key:"createdAt",label:"Date",render:r=>new Date(r.createdAt).toLocaleDateString()}]} rows={orders.slice(0,5)}/></div>
    <div className="panel"><div className="panel-head"><div><h3>Recent grocery orders</h3><p>Check delivery progress and payment status.</p></div><Link to="/customer/grocery-orders" className="link-orange">View grocery history <ArrowRight size={15}/></Link></div><DataTable columns={[{key:"orderNumber",label:"Order"},{key:"items",label:"Items",render:r=>r.items?.reduce((sum,item)=>sum+item.quantity,0)||0},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"createdAt",label:"Date",render:r=>new Date(r.createdAt).toLocaleDateString()}]} rows={groceryOrders.slice(0,5)}/></div>
    <div className="callout"><div><span className="eyebrow">HUNGRY FOR SOMETHING?</span><h3>Find your next favourite.</h3><p>Explore restaurants and discover something delicious.</p></div><Link to="/" className="btn btn-primary">Explore restaurants <ArrowRight size={16}/></Link></div>
  </DashboardLayout>;
}
const GROCERY_ACTIVE=["awaiting_payment","placed","packed","out_for_delivery"];
function CustomerGroceryOrders(){
 const [orders,setOrders]=useState([]),[error,setError]=useState(""),[loaded,setLoaded]=useState(false);
 const load=()=>api.get("/grocery/orders/mine").then(response=>{setOrders(Array.isArray(response.data)?response.data:[]);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load grocery order history.")).finally(()=>setLoaded(true));
 useEffect(()=>{load()},[]);
 const active=orders.filter(order=>GROCERY_ACTIVE.includes(order.status));
 const saved=orders.reduce((sum,order)=>sum+(order.items||[]).reduce((n,line)=>n+Math.max(0,(line.mrp||line.price)-line.price)*line.quantity,0),0);
 return <DashboardLayout title="Grocery orders" subtitle="Track GoFoode Mart deliveries and reorder your essentials." items={customerNav}>
  {error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Retry</button></p>}
  <div className="stats-grid"><Stat label="Grocery orders" value={orders.length} icon={ShoppingBasket}/><Stat label="In progress" value={active.length} icon={Truck} tone="blue"/><Stat label="Saved on MRP" value={money(saved)} icon={Sparkles} tone="green"/></div>
  <div className="panel"><div className="panel-head"><div><h3>Order history</h3><p>Tap an order to track it live, see the bill or buy it again.</p></div><Link to="/instamart" className="btn btn-primary btn-small">Shop groceries <ArrowRight size={14}/></Link></div>
   {!loaded?<div className="ds-skeleton-list">{[0,1].map(key=><i key={key}/>)}</div>:orders.length?<div className="ds-order-list">{orders.map(order=>{const live=GROCERY_ACTIVE.includes(order.status);const thumbs=(order.items||[]).slice(0,3);return <Link to={`/instamart/orders/${order._id}`} className={`ds-order ${live?"live":""}`} key={order._id}>
    <span className="ds-thumb-stack">{thumbs.map((line,index)=><img key={index} src={line.image||imageFallback} alt="" onError={showImageFallback}/>)}</span>
    <div className="ds-order-main"><b>{(order.items||[]).length} product{(order.items||[]).length===1?"":"s"} · {(order.items||[]).map(line=>line.name).slice(0,2).join(", ")}{(order.items||[]).length>2?"…":""}</b><small>{order.orderNumber} · {new Date(order.createdAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}{order.deliverySlot?.label?` · ${order.deliverySlot.label}`:""}</small><div className="ds-order-badges"><Badge>{order.status}</Badge><Badge>{order.paymentMethod==="cod"&&order.paymentStatus==="pending"?"cash on delivery":{cancelled:"not charged",refund_pending:"refund pending",partially_refunded:"partly refunded"}[order.paymentStatus]||order.paymentStatus}</Badge></div></div>
    <div className="ds-order-side"><strong>{exactMoney(order.totalAmount)}</strong><span className={live?"btn btn-primary btn-small":"btn btn-outline btn-small"}>{order.status==="awaiting_payment"?"Complete payment":live?<>Track live <ArrowRight size={14}/></>:"View details"}</span></div>
   </Link>})}</div>:<div className="ds-empty"><ShoppingBasket size={28}/><b>No grocery orders yet</b><p>Fruits, vegetables and daily essentials, delivered in minutes.</p><Link className="btn btn-primary btn-small" to="/instamart">Shop groceries <ArrowRight size={14}/></Link></div>}
  </div>
 </DashboardLayout>;
}
const ORDER_DONE = ["delivered", "cancelled", "rejected"];
function CustomerOrders() {
  const [orders,setOrders]=useState([]),[loaded,setLoaded]=useState(false),[filter,setFilter]=useState("all");
  useEffect(()=>{api.get("/orders/my-orders").then(r=>setOrders(Array.isArray(r.data)?r.data:[])).catch(()=>{}).finally(()=>setLoaded(true))},[]);
  const groups={all:orders,active:orders.filter(o=>!ORDER_DONE.includes(o.orderStatus)),delivered:orders.filter(o=>o.orderStatus==="delivered"),cancelled:orders.filter(o=>["cancelled","rejected"].includes(o.orderStatus))};
  const shown=groups[filter];
  const spent=groups.delivered.reduce((sum,order)=>sum+(order.totalAmount||0)-(order.refundedAmount||0),0);
  return <DashboardLayout title="My orders" subtitle="Follow active orders live and look back at past meals." items={customerNav}>
    <div className="stats-grid"><Stat label="All orders" value={orders.length} icon={Package}/><Stat label="On the way" value={groups.active.length} icon={Clock} tone="blue" hint={groups.active.length?"Tap Track to follow live":"Nothing in progress"}/><Stat label="Delivered" value={groups.delivered.length} icon={CheckCircle2} tone="green"/><Stat label="Spent on delivered orders" value={money(spent)} icon={Wallet} tone="purple"/></div>
    <div className="panel">
      <div className="ds-tabs" role="tablist" aria-label="Filter orders">{[["all","All"],["active","Active"],["delivered","Delivered"],["cancelled","Cancelled"]].map(([key,label])=><button key={key} type="button" role="tab" aria-selected={filter===key} className={filter===key?"on":""} onClick={()=>setFilter(key)}>{label}<em>{groups[key].length}</em></button>)}</div>
      {!loaded ? <div className="ds-skeleton-list">{[0,1,2].map(key=><i key={key}/>)}</div>
      : shown.length ? <div className="ds-order-list">{shown.map(order=>{ const live=!ORDER_DONE.includes(order.orderStatus); return <article className={`ds-order ${live?"live":""}`} key={order._id}>
        <img src={restaurantCover(order.restaurant,200)} alt="" loading="lazy" onError={showImageFallback}/>
        <div className="ds-order-main"><b>{order.restaurant?.name||"Restaurant"}</b><small>{order.orderNumber} · {(order.items||[]).reduce((n,item)=>n+(item.quantity||0),0)||"—"} item{(order.items||[]).reduce((n,item)=>n+(item.quantity||0),0)===1?"":"s"} · {new Date(order.createdAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}</small><div className="ds-order-badges"><Badge>{order.orderStatus}</Badge><Badge>{order.paymentStatus}</Badge></div></div>
        <div className="ds-order-side"><strong>{exactMoney(order.totalAmount)}</strong><Link className={live?"btn btn-primary btn-small":"btn btn-outline btn-small"} to={`/orders/${order._id}`}>{live?<>Track live <ArrowRight size={14}/></>:"View receipt"}</Link></div>
      </article>; })}</div>
      : <div className="ds-empty"><Package size={28}/><b>{filter==="all"?"No orders yet":`No ${filter} orders`}</b><p>{filter==="all"?"Your first order is a few taps away.":"Try another filter."}</p>{filter==="all"&&<Link className="btn btn-primary btn-small" to="/food">Order food <ArrowRight size={14}/></Link>}</div>}
    </div>
  </DashboardLayout>;
}
function NotificationsPage() {
  const [rows,setRows]=useState([]); useEffect(()=>{api.get("/notifications").then(r=>setRows(r.data)).catch(()=>{})},[]);
  return <DashboardLayout title="Notifications" subtitle="Updates from your GoFoode account." items={customerNav}><div className="panel">{rows.map(n=><div className="notification-row" key={n._id}><span className="notification-dot"/><div><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div></div>)}</div></DashboardLayout>;
}
const foodStages = [
  { key: "placed", label: "Placed", note: "Waiting for the restaurant to accept your order.", icon: ClipboardList, art: "🧾" },
  { key: "accepted", label: "Accepted", note: "The kitchen has confirmed your order.", icon: CheckCircle2, art: "👍" },
  { key: "preparing", label: "Preparing", note: "Your food is being cooked fresh.", icon: ChefHat, art: "👨‍🍳" },
  { key: "ready", label: "Ready", note: "Packed and waiting for a delivery partner.", icon: Package, art: "🛍️" },
  { key: "picked_up", label: "Picked up", note: "Your delivery partner has collected the order.", icon: Bike, art: "🛵" },
  { key: "on_the_way", label: "On the way", note: "Your order is heading to your door.", icon: Navigation, art: "🛵" },
  { key: "delivered", label: "Delivered", note: "Your order has arrived. Enjoy your meal!", icon: Heart, art: "🎉" }
];
const foodStatusHeadline = { awaiting_payment: "Complete your payment", placed: "Order placed!", accepted: "Order accepted", preparing: "Cooking your food", ready: "Ready for pickup", picked_up: "Picked up by your rider", on_the_way: "On its way to you", delivered: "Delivered. Enjoy!", rejected: "Order not accepted", cancelled: "Order cancelled" };
const foodReviewChips = ["Tasty food", "Hot and fresh", "Generous portions", "Great packaging", "Quick delivery"];
const foodPaymentLabel = paymentMethodLabel;
function OrderTrackingPage(){
  const { id } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const placedState = routerLocation.state?.justPlaced ? routerLocation.state : null;
  const outcomeNote = placedState?.paymentOutcome ? describePaymentOutcome({ status: placedState.paymentOutcome, message: placedState.paymentMessage }) : null;
  const [flash, notify, closeFlash] = useFlash();
  const [order, setOrder] = useState(null), [error, setError] = useState(""), [lastSync, setLastSync] = useState(0), [now, setNow] = useState(Date.now()), [syncing, setSyncing] = useState(false);
  const [siblings, setSiblings] = useState([]), [restaurantInfo, setRestaurantInfo] = useState(null), [celebrate, setCelebrate] = useState(Boolean(placedState) && (!placedState.paymentOutcome || placedState.paymentOutcome === "paid")), [cancelling, setCancelling] = useState(false), [reordering, setReordering] = useState(false), [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(5), [hoverRating, setHoverRating] = useState(0), [chips, setChips] = useState([]), [comment, setComment] = useState(""), [reviewMessage, setReviewMessage] = useState(""), [reviewError, setReviewError] = useState(""), [reviewBusy, setReviewBusy] = useState(false), [submittedReview, setSubmittedReview] = useState(null);
  const finalRef = useRef(false);
  const load = () => {
    setSyncing(true);
    return api.get(`/orders/${id}`).then(response => { setOrder(response.data); setError(""); setLastSync(Date.now()); finalRef.current = ["delivered", "rejected", "cancelled"].includes(response.data?.orderStatus) && response.data?.paymentStatus !== "refund_pending"; })
      .catch(err => setError(err.response?.data?.message || "Unable to load this order."))
      .finally(() => setSyncing(false));
  };
  useEffect(() => { setOrder(null); setError(""); finalRef.current = false; load(); }, [id]);
  // Poll faster while money is moving, so a confirmed payment or refund shows up within seconds.
  const fastPoll = order?.orderStatus === "awaiting_payment" || order?.paymentStatus === "refund_pending";
  useEffect(() => { const timer = setInterval(() => { if (!finalRef.current) load(); }, fastPoll ? 3000 : 7000); return () => clearInterval(timer); }, [id, fastPoll]);
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(tick); }, []);
  useEffect(() => { if (!order?.groupOrderId) return; api.get("/orders/my-orders").then(response => setSiblings((response.data || []).filter(row => row.groupOrderId === order.groupOrderId && row._id !== order._id))).catch(() => {}); }, [order?.groupOrderId, order?._id, order?.orderStatus, order?.paymentStatus]);
  useEffect(() => { const restaurantId = order?.restaurant?._id; if (!restaurantId) return; api.get(`/restaurants/${restaurantId}`).then(response => setRestaurantInfo(response.data.restaurant)).catch(() => setRestaurantInfo(null)); }, [order?.restaurant?._id]);
  useEffect(() => { if (!celebrate) return; const timer = setTimeout(() => setCelebrate(false), 5200); return () => clearTimeout(timer); }, [celebrate]);

  const submitReview = async event => {
    event.preventDefault(); setReviewError(""); setReviewMessage(""); setReviewBusy(true);
    const text = [...chips, comment.trim()].filter(Boolean).join(". ").slice(0, 1000);
    try { const response = await api.post("/reviews", { restaurantId: order.restaurant?._id, orderId: id, rating, comment: text }); setSubmittedReview(response.data); setReviewMessage("Thanks for sharing your feedback with the GoFoode community."); }
    catch (err) { setReviewError(err.response?.data?.message || "Could not submit your review. Please try again."); }
    finally { setReviewBusy(false); }
  };
  const reorder = async () => {
    setReordering(true);
    let added = 0;
    for (const item of order.items || []) {
      if (!item.foodItem) continue;
      try { await api.post("/cart/items", { foodItemId: item.foodItem, quantity: item.quantity || 1 }); added += 1; } catch { /* dish no longer available */ }
    }
    setReordering(false);
    if (added) navigate("/cart");
    else notify("These dishes aren't available to order right now.", { tone: "error" });
  };
  const cancelOrder = async () => {
    const paidOnline = order.paymentMethod !== "cod" && ["paid", "partially_refunded"].includes(order.paymentStatus);
    const refundable = Math.max(0, (order.totalAmount || 0) - (order.refundedAmount || 0));
    if (!window.confirm(paidOnline ? `Cancel this order? ${exactMoney(refundable)} will be refunded to your original payment method.` : "Cancel this order? The restaurant hasn't started on it yet.")) return;
    setCancelling(true);
    try { const { data } = await api.patch(`/orders/${id}/cancel`, { reason: "Cancelled by customer" }); notify(data.message); }
    catch (err) { notify(errorMessage(err, "We couldn't cancel this order."), { tone: "error" }); }
    finally { setCancelling(false); load(); }
  };
  const copyNumber = () => {
    if (!navigator.clipboard?.writeText) { notify(`Your order number is ${order.orderNumber}`); return; }
    navigator.clipboard.writeText(order.orderNumber).then(() => { setCopied(true); notify("Order number copied"); setTimeout(() => setCopied(false), 2000); }).catch(() => notify(`Your order number is ${order.orderNumber}`));
  };

  if (!order) return <><Header/><main className="fd-page fd-track"><div className="fd-wrap fd-track-loading">{error
    ? <div className="fd-empty"><span className="fd-empty-art" aria-hidden="true">📦</span><h3>We couldn't open that order</h3><p>{error}</p><Link to="/customer/orders" className="btn btn-primary">See your orders <ArrowRight size={15}/></Link></div>
    : <div className="fd-track-skeleton" aria-busy="true" aria-label="Loading your order"><span/><i/><i/><i/></div>}</div></main><Footer/></>;

  const status = order.orderStatus || "placed";
  const awaitingPayment = status === "awaiting_payment";
  const payment = order.payment;
  const failed = status === "rejected" || status === "cancelled";
  // Unpaid online checkouts that close put their items back in the cart, so "Order again" would double them.
  const restoredToCart = failed && payment && payment.method !== "cod" && ["expired", "cancelled"].includes(payment.status);
  const refundShown = ["refund_pending", "refunded", "partially_refunded"].includes(order.paymentStatus);
  // The navigation outcome only describes the moment checkout finished; once the order moves on, describe that instead.
  const banner = !placedState ? null
    : awaitingPayment ? outcomeNote
    : failed ? null
    : order.paymentMethod !== "cod" && order.paymentStatus === "paid" ? describePaymentOutcome({ status: "paid" })
    : outcomeNote?.tone === "success" ? outcomeNote : { tone: "success", text: placedState.orderCount > 1 ? `Order placed! Your cart was split into ${placedState.orderCount} orders, one for each restaurant.` : "Your order was placed successfully." };
  const refundAmount = order.paymentStatus === "refund_pending" ? Math.max(0, order.totalAmount - (order.refundedAmount || 0)) : order.refundedAmount;
  const delivered = status === "delivered";
  const currentIndex = Math.max(0, foodStages.findIndex(entry => entry.key === status));
  const stage = foodStages[currentIndex];
  const stageProgress = failed ? 0 : currentIndex / (foodStages.length - 1) * 100;
  const gps = order.delivery?.currentLocation?.coordinates;
  const rider = order.delivery?.deliveryPartner;
  const drop = order.delivery?.dropLocation || order.deliveryAddress;
  const destination = [drop?.street, drop?.city, drop?.state, drop?.postalCode].filter(Boolean).join(", ");
  const placedAt = new Date(order.placedAt || order.createdAt);
  const etaMinutes = restaurantInfo?.deliveryTime;
  const eta = etaMinutes ? new Date(placedAt.getTime() + etaMinutes * 60000) : null;
  const showEta = Boolean(eta) && !delivered && !failed && !awaitingPayment && now - placedAt.getTime() < 3 * 3600000;
  const late = showEta && now > eta.getTime();
  const minutesLeft = showEta ? Math.max(1, Math.ceil((eta.getTime() - now) / 60000)) : 0;
  const ringPct = showEta ? Math.min(100, Math.max(2, (now - placedAt.getTime()) / (eta.getTime() - placedAt.getTime()) * 100)) : delivered ? 100 : Math.max(4, stageProgress);
  const secondsAgo = lastSync ? Math.max(0, Math.round((now - lastSync) / 1000)) : 0;
  const itemCount = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  const cover = restaurantCover(restaurantInfo, 1400);
  const shownRating = hoverRating || rating;

  return <><Header/><main className="fd-page fd-track">
    <section className={`fd-track-hero ${failed ? "failed" : delivered ? "done" : ""}`} aria-labelledby="fd-track-title">
      <div className="fd-hero-bg" aria-hidden="true"><span className="fd-glow a"/><span className="fd-glow b"/><span className="fd-grain"/></div>
      {celebrate && <div className="fd-confetti-rain" aria-hidden="true">{Array.from({ length: 44 }, (_, index) => <i key={index} style={{ "--n": index, "--x": `${(index * 37) % 100}%`, "--delay": `${((index * 53) % 17) * 0.09}s`, "--spin": `${(index * 71) % 360 + 360}deg`, "--dur": `${2.4 + ((index * 29) % 10) * 0.12}s` }}/>)}</div>}
      <div className="fd-wrap fd-track-hero-inner">
        <div className="fd-track-copy">
          <nav className="fd-crumbs light" aria-label="Breadcrumb"><Link to="/customer/orders">My orders</Link><ChevronRight size={14}/><span>{order.orderNumber}</span></nav>
          {banner && <p className={`fd-placed-banner ${banner.tone === "success" ? "" : banner.tone}`} key={banner.text}>{banner.tone === "success" ? <CheckCircle2 size={18}/> : banner.tone === "error" ? <X size={18}/> : <Hourglass size={18}/>}{banner.text}</p>}
          <span className={`fd-live ${failed || delivered ? "static" : ""}`}><i/>{failed || delivered ? "Final status" : `Live · updated ${secondsAgo < 3 ? "just now" : `${secondsAgo}s ago`}`}</span>
          <h1 id="fd-track-title">{foodStatusHeadline[status] || "Tracking your order"}</h1>
          <p>{awaitingPayment ? "Your order is reserved. It's sent to the kitchen as soon as your payment goes through." : failed ? (status === "rejected" ? "The restaurant couldn't take this order right now. You can order the same dishes again, or try another kitchen." : order.cancelledBy === "system" ? "Payment wasn't completed in time, so this order was cancelled. Nothing was charged." : "This order was cancelled. You can order the same dishes again in a couple of taps.") : stage.note}</p>
          <div className="fd-track-meta"><span><Store size={15}/>{order.restaurant?.name}</span><span><ShoppingBag size={15}/>{itemCount} {itemCount === 1 ? "item" : "items"} · {money(order.totalAmount)}</span><span><Clock size={15}/>Placed {placedAt.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</span></div>
        </div>
        <div className="fd-orb-wrap">
          <svg className="fd-orb-ring" viewBox="0 0 160 160" aria-hidden="true"><circle className="track" cx="80" cy="80" r="72"/><circle className={`bar ${late ? "late" : ""}`} cx="80" cy="80" r="72" pathLength="100" style={{ strokeDashoffset: 100 - ringPct }}/></svg>
          <div className={`fd-orb ${failed ? "failed" : ""}`}><span key={status}>{failed ? "😔" : awaitingPayment ? "💳" : stage.art}</span></div>
          {showEta ? <div className="fd-orb-eta"><b>{late ? "Any minute" : `${minutesLeft} min`}</b><small>{late ? `past the ${etaMinutes}-min estimate` : `left · around ${eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}`}</small></div>
            : <div className="fd-orb-eta"><b>{failed ? (status === "rejected" ? "Not accepted" : "Cancelled") : awaitingPayment ? "Payment due" : stage.label}</b><small>{delivered ? "Order complete" : failed ? "No further updates" : awaitingPayment ? "Pay to confirm" : `Step ${currentIndex + 1} of ${foodStages.length}`}</small></div>}
        </div>
      </div>
    </section>

    <div className="fd-wrap fd-track-grid">
      <div className="fd-track-main">
        {awaitingPayment && payment && <PaymentActionCard payment={payment} now={now} onChanged={load} notify={notify}/>}
        {failed ? <div className="fd-panel fd-failed-card"><span aria-hidden="true">{restoredToCart ? "🛒" : "🍽️"}</span><div><h2>{restoredToCart ? "Your items are waiting" : "Still hungry?"}</h2><p>{restoredToCart ? "We put everything from this checkout back in your cart, so you can pick up where you left off." : "Add the same dishes back to your cart, or find another kitchen that's open now."}</p>{refundShown && refundAmount > 0 && <p className="fd-refund-line"><Undo2 size={15}/>{order.paymentStatus === "refund_pending" ? `Refund of ${exactMoney(refundAmount)} in progress to your original payment method.` : `${exactMoney(refundAmount)} refunded to your original payment method.`}</p>}</div><div className="fd-failed-actions">{restoredToCart ? <Link to="/cart" className="btn btn-primary"><ShoppingBag size={15}/> Review cart</Link> : <button type="button" className="btn btn-primary" disabled={reordering} onClick={reorder}><RotateCcw size={15}/>{reordering ? "Adding…" : "Order again"}</button>}<Link to="/food" className="btn btn-outline">Browse food</Link></div></div>
        : awaitingPayment ? null : <div className="fd-panel fd-progress-card">
          <div className="fd-progress-head"><h2>Order progress</h2><span>{Math.round(stageProgress)}%</span></div>
          <div className="fd-progress-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, stageProgress)}%` }}/></div>
          <ol className="fd-stages">{foodStages.map((entry, index) => { const Icon = entry.icon; const state = index < currentIndex || delivered ? "done" : index === currentIndex ? "current" : ""; return <li className={state} key={entry.key} aria-current={index === currentIndex ? "step" : undefined}>
            <span className="fd-stage-dot">{state === "done" ? <Check size={15} strokeWidth={3}/> : <Icon size={15}/>}</span><b>{entry.label}</b>
          </li>; })}</ol>
        </div>}

        {!failed && !awaitingPayment && <div className="fd-panel fd-map-card">
          <div className="fd-map-head"><div><span className="fd-eyebrow"><Navigation size={14}/>Delivery partner</span><h2>{gps ? "Rider location is live" : rider ? `${rider.name} is delivering your order` : delivered ? "Delivered to your address" : "Waiting for a delivery partner"}</h2><p>{gps ? "The map shows the rider's latest shared location and your address." : rider ? "Their location appears here as soon as they share GPS." : delivered ? "Thanks for ordering with GoFoode." : status === "ready" ? "Your order is packed, and delivery partners nearby have been notified to pick it up." : "A rider is assigned once the restaurant marks your order ready."}</p></div><span className={`fd-gps ${gps ? "live" : ""}`}><i/>{gps ? "Live GPS" : "GPS pending"}</span></div>
          {rider && <div className="fd-rider"><span className="fd-rider-avatar">{rider.profileImage ? <img src={rider.profileImage} alt="" onError={showImageFallback}/> : (rider.name || "R")[0].toUpperCase()}</span><div><b>{rider.name}</b><small>Your GoFoode delivery partner</small></div>{rider.phone && <a className="fd-round" href={`tel:${rider.phone}`} aria-label={`Call ${rider.name}`}><Phone size={17}/></a>}</div>}
          {gps || destination ? <div className="fd-map"><GoogleMap title="Delivery partner location and destination" latitude={gps?.[1]} longitude={gps?.[0]} destination={destination}/></div> : <div className="fd-map-empty"><MapPin size={26}/><b>The map appears once location details are available</b></div>}
        </div>}

        {delivered && (order.customerReview || submittedReview
          ? <div className="fd-panel fd-review-done"><span aria-hidden="true">💛</span><div><b>Thanks for your feedback!</b><small>{reviewMessage || "Your review helps other customers discover local favourites."}</small></div></div>
          : <form className="fd-panel fd-review" onSubmit={submitReview}>
            <span className="fd-eyebrow"><Star size={14}/>How was it?</span>
            <h2>Rate your order from {order.restaurant?.name}</h2>
            <div className="fd-stars" role="radiogroup" aria-label="Rate your order" onMouseLeave={() => setHoverRating(0)}>
              {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={value <= shownRating ? "on" : ""} onMouseEnter={() => setHoverRating(value)} onFocus={() => setHoverRating(value)} onBlur={() => setHoverRating(0)} onClick={() => setRating(value)}><Star size={30} fill={value <= shownRating ? "currentColor" : "none"}/></button>)}
              <em key={shownRating}>{["", "Poor", "Okay", "Good", "Great", "Loved it!"][shownRating]}</em>
            </div>
            <div className="fd-review-chips" role="group" aria-label="What did you like?">{foodReviewChips.map(chip => <button type="button" key={chip} aria-pressed={chips.includes(chip)} className={chips.includes(chip) ? "on" : ""} onClick={() => setChips(current => current.includes(chip) ? current.filter(entry => entry !== chip) : [...current, chip])}>{chips.includes(chip) && <Check size={13} strokeWidth={3}/>}{chip}</button>)}</div>
            <label><span>Anything else? <em>(optional)</em></span><textarea maxLength={800} value={comment} onChange={event => setComment(event.target.value)} placeholder="Share what you enjoyed or what could be better."/></label>
            {reviewError && <p className="fd-note error" role="alert">{reviewError}</p>}
            <button className="btn btn-primary" disabled={reviewBusy}>{reviewBusy ? "Sending…" : "Share feedback"}</button>
          </form>)}
      </div>

      <aside className="fd-track-side">
        <div className="fd-panel fd-receipt">
          <div className="fd-receipt-head"><div><small>Order number</small><b>{order.orderNumber}</b></div><button type="button" className="fd-round sm" aria-label="Copy order number" onClick={copyNumber}>{copied ? <Check size={16} strokeWidth={3}/> : <ClipboardList size={16}/>}</button></div>
          <div className="fd-receipt-rest"><img src={cover} alt="" onError={showImageFallback}/><div><b>{order.restaurant?.name}</b><small>{[order.restaurant?.address?.street, order.restaurant?.address?.city].filter(Boolean).join(", ") || "Restaurant"}</small></div></div>
          <ul className="fd-receipt-items">{(order.items || []).map((item, index) => <li key={`${item.foodItem || item.name}-${index}`}><span><em>{item.quantity}×</em>{item.name}</span><b>{money(item.subtotal ?? (item.unitPrice || 0) * (item.quantity || 0))}</b></li>)}</ul>
          <div className="fd-receipt-bill">
            <div><span>Item total</span><b>{money(order.subtotal)}</b></div>
            <div><span>Delivery fee</span><b>{money(order.deliveryFee)}</b></div>
            <div><span>Taxes</span><b>{exactMoney(order.tax)}</b></div>
            {order.discount > 0 && <div className="save"><span>Discount</span><b>−{money(order.discount)}</b></div>}
            <div className="total"><span>Total</span><b>{exactMoney(order.totalAmount)}</b></div>
          </div>
          <div className="fd-receipt-row"><Wallet size={16}/><span>{foodPaymentLabel(order.paymentMethod)}{order.refundedAmount > 0 && <small>{exactMoney(order.refundedAmount)} refunded</small>}</span><em className={`fd-pay-status ${order.paymentStatus}`}>{paymentStatusLabel(order.paymentStatus)}</em></div>
          <div className="fd-receipt-row addr"><MapPin size={16}/><span><b>{order.deliveryAddress?.name}</b><small>{[order.deliveryAddress?.street, order.deliveryAddress?.city, order.deliveryAddress?.postalCode].filter(Boolean).join(", ")}</small>{order.deliveryAddress?.instructions && <small className="fd-instr">“{order.deliveryAddress.instructions}”</small>}</span></div>
        </div>
        <PaymentDetailsCard payment={payment}/>
        {siblings.length > 0 && <div className="fd-panel fd-siblings"><h3>Also part of this checkout</h3>{siblings.map(row => <Link to={`/orders/${row._id}`} key={row._id}><span className="fd-sib-icon"><Store size={16}/></span><span><b>{row.restaurant?.name}</b><small>{foodStatusHeadline[row.orderStatus] || row.orderStatus} · {money(row.totalAmount)}</small></span><ArrowRight size={15}/></Link>)}</div>}
        <div className="fd-track-actions">
          {(delivered || (failed && !restoredToCart)) && <button type="button" className="btn btn-primary" disabled={reordering} onClick={reorder}><RotateCcw size={15}/>{reordering ? "Adding to cart…" : "Order again"}</button>}
          {status === "placed" && <button type="button" className="btn btn-outline fd-cancel-order" disabled={cancelling} onClick={cancelOrder}><X size={15}/>{cancelling ? "Cancelling…" : "Cancel order"}</button>}
          <button type="button" className="btn btn-outline" disabled={syncing} onClick={load}><RefreshCw size={15} className={syncing ? "fd-spinning" : ""}/> Refresh</button>
          <Link to="/customer/orders" className="btn btn-outline">All orders</Link>
        </div>
      </aside>
    </div>
  </main>
  <FlashToast flash={flash} onClose={closeFlash}/>
  <ChatWidget/>
  <Footer/></>;
}
function FavoritesPage(){const [rows,setRows]=useState([]);const load=()=>api.get("/favorites").then(r=>setRows(r.data)).catch(()=>{});useEffect(()=>{load()},[]);const remove=async id=>{await api.delete(`/favorites/${id}`);load()};return <DashboardLayout title="Your favourites" subtitle="The restaurants you have saved for another delicious day." items={customerNav}><div className="restaurant-grid">{rows.map(x=><div className="favorite-card" key={x._id}><RestaurantCard restaurant={x.restaurant}/><button className="btn btn-outline btn-small" onClick={()=>remove(x.restaurant._id)}><Heart size={14}/> Remove</button></div>)}</div>{!rows.length&&<div className="panel"><p>No favourites saved yet. Save restaurants to build your personal shortlist.</p><Link to="/" className="btn btn-primary">Discover restaurants</Link></div>}</DashboardLayout>;}
function CustomerAddresses() {
  const {user,location}=useAuth();
  const navigate=useNavigate();
  const emptyForm=()=>({label:"Home",name:user.name||"",phone:user.phone||"",street:"",city:location?.city||"",state:location?.state||"",postalCode:location?.postalCode||"",isDefault:false});
  const [rows,setRows]=useState([]),[form,setForm]=useState(emptyForm),[message,setMessage]=useState(""),[error,setError]=useState("");
  const load=()=>api.get("/addresses").then(response=>setRows(response.data)).catch(err=>setError(err.response?.data?.message||"Could not load your saved addresses."));
  useEffect(()=>{load()},[]);
  useEffect(()=>{setForm(current=>({...current,city:current.city||location?.city||"",state:current.state||location?.state||"",postalCode:current.postalCode||location?.postalCode||""}))},[location]);
  const save=async event=>{
    event.preventDefault();setError("");setMessage("");
    try{await api.post("/addresses",{...form,isDefault:form.isDefault||!rows.length});setForm(emptyForm());setMessage("Delivery address saved.");load()}
    catch(err){setError(err.response?.data?.message||"Could not save this address.")}
  };
  const makeDefault=async row=>{
    try{await api.patch(`/addresses/${row._id}`,{isDefault:true});setMessage("Default address updated.");load()}
    catch(err){setError(err.response?.data?.message||"Could not update the default address.")}
  };
  const remove=async row=>{
    try{await api.delete(`/addresses/${row._id}`);setMessage("Address removed.");load()}
    catch(err){setError(err.response?.data?.message||"Could not remove this address.")}
  };
  return <DashboardLayout title="Saved addresses" subtitle="Save delivery details and fill checkout in one tap." items={customerNav}>
    {message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error}</p>}
    <div className="two-col">
      <section className="panel"><h3>Add a delivery address</h3><form className="stack-form" onSubmit={save}>
        <div className="form-row"><label>Address label<input required value={form.label} onChange={event=>setForm({...form,label:event.target.value})} placeholder="Home, work…"/></label><label>Full name<input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label></div>
        <label>Phone<input required value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/></label>
        <label>Street address<input required value={form.street} onChange={event=>setForm({...form,street:event.target.value})} placeholder="House, street, landmark"/></label>
        <div className="form-row"><label>City<input required value={form.city} onChange={event=>setForm({...form,city:event.target.value})}/></label><label>State<input value={form.state} onChange={event=>setForm({...form,state:event.target.value})}/></label></div>
        <label>PIN code<input value={form.postalCode} onChange={event=>setForm({...form,postalCode:event.target.value})}/></label>
        <label className="checkbox-label"><input type="checkbox" checked={form.isDefault} onChange={event=>setForm({...form,isDefault:event.target.checked})}/> Set as default address</label>
        <button className="btn btn-primary">Save address</button>
      </form></section>
      <section className="panel"><div className="panel-head"><div><h3>Your delivery addresses</h3><p>{rows.length} saved address{rows.length===1?"":"es"}</p></div></div>
        {rows.length?rows.map(row=><article className="saved-address-card" key={row._id}><div><div className="card-title-row"><b>{row.label}</b>{row.isDefault&&<Badge>default</Badge>}</div><p>{row.name} · {row.phone}</p><small>{[row.street,row.city,row.state,row.postalCode].filter(Boolean).join(", ")}</small></div>
          <div className="inline-actions"><button className="btn btn-primary btn-small" onClick={()=>navigate("/cart",{state:{deliveryAddress:row}})}>Use at checkout</button>{!row.isDefault&&<button className="btn btn-outline btn-small" onClick={()=>makeDefault(row)}>Make default</button>}<button className="btn btn-outline btn-small" onClick={()=>remove(row)}>Remove</button></div>
        </article>):<p className="muted">No saved addresses yet. Add one to make checkout quicker.</p>}
      </section>
    </div>
  </DashboardLayout>;
}
function CustomerReservations() {
  const [rows,setRows]=useState([]),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=()=>api.get("/reservations/mine").then(response=>setRows(response.data)).catch(err=>setError(err.response?.data?.message||"Could not load your reservations."));
  useEffect(()=>{load()},[]);
  const cancel=async row=>{
    setError("");setMessage("");
    try{await api.patch(`/reservations/${row._id}/cancel`);setMessage("Reservation cancelled.");load()}
    catch(err){setError(err.response?.data?.message||"This reservation could not be cancelled.")}
  };
  return <DashboardLayout title="Dineout bookings" subtitle="Review upcoming table requests and manage your bookings." items={customerNav}>
    {message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error}</p>}
    <div className="panel">{rows.length?rows.map(row=><article className="reservation-row customer-reservation" key={row._id}>
      <div className="list-grow"><b>{row.restaurant?.name||"Restaurant reservation"}</b><small>{new Date(row.date).toLocaleDateString()} at {row.time} · {row.guests} guest{row.guests===1?"":"s"}</small>{row.occasion&&<small>Occasion: {row.occasion}</small>}</div>
      <Badge>{row.status}</Badge>{row.status==="requested"&&<button className="btn btn-outline btn-small" onClick={()=>cancel(row)}>Cancel request</button>}
    </article>):<div className="empty-feature"><CalendarDays size={34}/><h3>No dineout bookings yet</h3><p>Your reservation requests will appear here.</p><Link to="/dineout" className="btn btn-primary">Explore Dineout</Link></div>}</div>
  </DashboardLayout>;
}
function CustomerMembership() {
  const [membership,setMembership]=useState(null),[plans,setPlans]=useState([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const load=()=>api.get("/membership").then(response=>{setMembership(response.data.membership);setPlans(response.data.plans)}).catch(err=>setError(err.response?.data?.message||"Could not load your membership."));
  useEffect(()=>{load()},[]);
  const subscribe=async()=>{
    setBusy(true);setError("");setMessage("");
    try{const response=await api.post("/membership/subscribe");setMembership(response.data.membership);setMessage(response.data.message)}
    catch(err){setError(err.response?.data?.message||"Could not activate membership.")}
    finally{setBusy(false)}
  };
  const plan=plans[0];
  return <DashboardLayout title="GoFoode Plus" subtitle="Membership perks, status and renewal dates." items={customerNav}>
    {message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error}</p>}
    <section className="panel membership-panel"><div className="plus-crown"><Crown size={28}/></div><span className="eyebrow">YOUR MEMBERSHIP</span>
      <h2>{membership?.status==="active"?"You're a GoFoode Plus member":"Make every order go further"}</h2>
      {membership?<p className="membership-dates"><Badge>{membership.status}</Badge> Started {new Date(membership.startedAt).toLocaleDateString()} · Renews/expires {new Date(membership.expiresAt).toLocaleDateString()}</p>:<p>Join for member offers, delivery perks and priority support.</p>}
      <div className="membership-benefits">{(plan?.benefits||["Free delivery on eligible orders","Member-only offers","Priority customer support","Special dining-out perks"]).map(benefit=><span key={benefit}><CheckCircle2 size={16}/>{benefit}</span>)}</div>
      {!membership&&<button className="btn btn-primary" onClick={subscribe} disabled={busy}>{busy?"Activating…":`Activate demo membership · ${money(plan?.price||299)}`}</button>}
      <small className="muted">Demo activation does not collect payment. Configure a payment provider before charging for memberships.</small>
    </section>
  </DashboardLayout>;
}
function OwnerDashboard() {
  const [stats,setStats]=useState({restaurants:[],totalOrders:0,pendingOrders:0,completedOrders:0,revenue:0,menuItems:0,recentOrders:[]}),[error,setError]=useState("");
  const load=()=>api.get("/restaurant/dashboard").then(r=>{setStats(r.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load restaurant overview."));
  useEffect(()=>{load()},[]);
  return <DashboardLayout title="Restaurant overview" subtitle="Manage your kitchens, menu and customer orders." items={ownerNav}>
    {error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Try again</button></p>}
    <div className="stats-grid"><Stat label="Total revenue" value={money(stats.revenue)} icon={Wallet} hint="Completed orders"/><Stat label="Total orders" value={stats.totalOrders} icon={Package} tone="blue"/><Stat label="Needs attention" value={stats.pendingOrders} icon={Clock} tone="purple"/><Stat label="Menu items" value={stats.menuItems} icon={Utensils} tone="green"/></div>
    <section className="dashboard-quick-links"><Link to="/restaurant/menu" className="dashboard-quick-link"><span className="quick-link-icon"><Plus size={18}/></span><span><b>Manage menu</b><small>Add dishes and update photos</small></span><ArrowRight size={16}/></Link><Link to="/restaurant/orders" className="dashboard-quick-link"><span className="quick-link-icon blue"><ClipboardList size={18}/></span><span><b>Kitchen orders</b><small>{stats.pendingOrders} order{stats.pendingOrders===1?"":"s"} need attention</small></span><ArrowRight size={16}/></Link><Link to="/restaurant/availability" className="dashboard-quick-link"><span className="quick-link-icon green"><Power size={18}/></span><span><b>Availability</b><small>Manage which kitchens are open</small></span><ArrowRight size={16}/></Link><Link to="/restaurant/reservations" className="dashboard-quick-link"><span className="quick-link-icon rose"><CalendarDays size={18}/></span><span><b>Dineout reservations</b><small>Review guest table requests</small></span><ArrowRight size={16}/></Link></section>
    <div className="panel"><div className="panel-head"><div><h3>Your restaurants</h3><p>Approval and service status for each kitchen.</p></div><Link to="/restaurant/places" className="btn btn-primary btn-small"><Plus size={15}/> Add restaurant</Link></div>{stats.restaurants.length?stats.restaurants.map(r=><div className="list-row" key={r._id}><img className="list-photo" src={restaurantCover(r,160)} alt="" loading="lazy" onError={showImageFallback}/><div className="list-grow"><b>{r.name}</b><small>{r.status==="approved"?(r.isOpen?"Accepting orders":"Temporarily closed"):r.status}</small></div><Badge>{r.status}</Badge></div>):<div className="empty-feature"><Store size={32}/><h3>Set up your first restaurant</h3><p>Add your kitchen details and submit them for approval.</p><Link to="/restaurant/places" className="btn btn-primary">Add restaurant</Link></div>}</div>
    <div className="panel"><div className="panel-head"><div><h3>Latest orders</h3><p>Recent activity from your customers.</p></div><Link to="/restaurant/orders" className="link-orange">Open order manager <ArrowRight size={14}/></Link></div><DataTable columns={[{key:"orderNumber",label:"Order"},{key:"customer",label:"Customer",render:row=>row.customer?.name||"Customer"},{key:"restaurant",label:"Restaurant",render:row=>row.restaurant?.name||"—"},{key:"totalAmount",label:"Amount",render:row=>money(row.totalAmount)},{key:"orderStatus",label:"Status",render:row=><Badge>{row.orderStatus}</Badge>},{key:"createdAt",label:"Received",render:row=>new Date(row.createdAt).toLocaleString()}]} rows={stats.recentOrders||[]}/></div>
  </DashboardLayout>;
}
function OwnerAvailability() {
  const [restaurants,setRestaurants]=useState([]),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const load=()=>api.get("/restaurant/mine").then(response=>{setRestaurants(response.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load your restaurants."));
  useEffect(()=>{load()},[]);
  const toggle=async restaurant=>{
    setBusy(restaurant._id);setError("");
    try{const response=await api.patch(`/restaurant/${restaurant._id}/availability`,{isOpen:!restaurant.isOpen});setRestaurants(current=>current.map(row=>row._id===response.data._id?response.data:row))}
    catch(err){setError(err.response?.data?.message||"Could not update restaurant availability.")}
    finally{setBusy("")}
  };
  return <DashboardLayout title="Restaurant availability" subtitle="Control which approved kitchens are accepting customers." items={ownerNav}>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <div className="panel"><div className="panel-head"><div><h3>Your restaurants</h3><p>Only approved restaurants can change marketplace availability.</p></div><button className="btn btn-outline btn-small" onClick={load}>Refresh</button></div>
      {restaurants.map(restaurant=><article className="availability-row" key={restaurant._id}><img className="list-photo" src={restaurantCover(restaurant,160)} alt="" loading="lazy" onError={showImageFallback}/><div className="list-grow"><b>{restaurant.name}</b><small>{[restaurant.address?.city,restaurant.address?.state].filter(Boolean).join(", ")||"Location not set"}</small></div><Badge>{restaurant.status}</Badge>{restaurant.status==="approved"&&<button className={restaurant.isOpen?"btn btn-outline btn-small":"btn btn-primary btn-small"} disabled={busy===restaurant._id} onClick={()=>toggle(restaurant)}>{busy===restaurant._id?"Saving…":restaurant.isOpen?"Close restaurant":"Open restaurant"}</button>}</article>)}
      {!restaurants.length&&!error&&<p className="muted">No restaurant applications yet.</p>}
    </div>
  </DashboardLayout>;
}
function OwnerReviews() {
  const [reviews,setReviews]=useState([]),[error,setError]=useState("");
  const load=()=>api.get("/restaurant/reviews").then(response=>{setReviews(response.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load customer reviews."));
  useEffect(()=>{load()},[]);
  const average=reviews.length?reviews.reduce((sum,review)=>sum+review.rating,0)/reviews.length:0;
  return <DashboardLayout title="Customer reviews" subtitle="See feedback from customers across your restaurants." items={ownerNav}>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <div className="stats-grid"><Stat label="Total reviews" value={reviews.length} icon={MessageCircle}/><Stat label="Average rating" value={reviews.length?`${average.toFixed(1)} / 5`:"—"} icon={Star} tone="green"/></div>
    <div className="panel">{reviews.length?reviews.map(review=><article className="owner-review" key={review._id}><div className="review-rating"><Star size={15} fill="currentColor"/><b>{review.rating}/5</b></div><div className="list-grow"><b>{review.user?.name||"Customer"} · {review.restaurant?.name}</b><p>{review.comment||"No written comment."}</p><small>{new Date(review.createdAt).toLocaleDateString()}</small></div></article>):!error&&<p className="muted">Customer reviews will appear here after completed orders are reviewed.</p>}</div>
  </DashboardLayout>;
}
function OwnerPlaces() {
  const [rows,setRows]=useState([]),[form,setForm]=useState({name:"",description:"",cuisine:"Indian, Fast Food",street:"",city:"Faridabad",state:"Haryana",postalCode:""}),[message,setMessage]=useState("");
  const load=()=>api.get("/restaurant/mine").then(r=>setRows(r.data)).catch(()=>{});
  useEffect(()=>{load()},[]);
  const submit=async e=>{e.preventDefault();setMessage("");try{await api.post("/restaurants",form);setMessage("Restaurant submitted for admin approval.");load();}catch(err){setMessage(err.response?.data?.message||"Unable to submit restaurant.")}};
  return <DashboardLayout title="My restaurants" subtitle="Register and manage your restaurant locations." items={ownerNav}><div className="two-col"><div className="panel"><h3>Register a restaurant</h3><form className="stack-form" onSubmit={submit}><label>Restaurant name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Cuisines<input value={form.cuisine} onChange={e=>setForm({...form,cuisine:e.target.value})}/></label><label>Street address<input value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label><div className="form-row"><label>City<input required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>Postal code<input value={form.postalCode} onChange={e=>setForm({...form,postalCode:e.target.value})}/></label></div><button className="btn btn-primary">Submit for approval</button>{message&&<p className="form-message">{message}</p>}</form></div><div className="panel"><h3>Applications</h3>{rows.map(r=><div className="list-row" key={r._id}><img className="list-photo" src={restaurantCover(r,160)} alt="" loading="lazy" onError={showImageFallback}/><div className="list-grow"><b>{r.name}</b><small>{r.address?.city}</small></div><Badge>{r.status}</Badge></div>)}</div></div></DashboardLayout>;
}
function OwnerMenu() {
  const emptyForm={restaurant:"",name:"",description:"",price:"",discountPrice:"",image:"",foodType:"veg",calories:"",spiceLevel:"Mild",ingredients:"",allergens:"",dietaryTags:"",portionSize:"",preparationTime:20,isBestseller:false};
  const [items,setItems]=useState([]),[restaurants,setRestaurants]=useState([]),[form,setForm]=useState(emptyForm),[editingId,setEditingId]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[imageError,setImageError]=useState(""),[busy,setBusy]=useState(false);
  const load=()=>api.get("/restaurant/menu").then(r=>{setItems(r.data);setError("")}).catch(e=>setError(e.response?.data?.message||"Could not load your menu."));
  useEffect(()=>{load();api.get("/restaurant/mine").then(r=>setRestaurants(r.data.filter(x=>x.status==="approved"))).catch(e=>setError(e.response?.data?.message||"Could not load approved restaurants."))},[]);
  const imageChanged=async event=>{const file=event.target.files?.[0];if(!file)return;setImageError("");try{const image=await toUploadImage(file);setForm(current=>({...current,image}))}catch(error){setImageError(error.message||"Could not prepare this image.")}};
  const resetForm=()=>{setForm({...emptyForm});setEditingId("");setImageError("")};
  const edit=item=>{setEditingId(item._id);setMessage("");setForm({restaurant:item.restaurant?._id||"",name:item.name||"",description:item.description||"",price:String(item.price??""),discountPrice:item.discountPrice==null?"":String(item.discountPrice),image:item.image||"",foodType:item.foodType||"veg",calories:item.calories==null?"":String(item.calories),spiceLevel:item.spiceLevel||"Mild",ingredients:(item.ingredients||[]).join(", "),allergens:(item.allergens||[]).join(", "),dietaryTags:(item.dietaryTags||[]).join(", "),portionSize:item.portionSize||"",preparationTime:item.preparationTime||20,isBestseller:Boolean(item.isBestseller)})};
  const submit=async event=>{
    event.preventDefault();setError("");setMessage("");
    if(!form.image){setError("Upload a food photo or paste an image URL before saving this item.");return}
    setBusy(true);
    const payload={...form,calories:Number(form.calories)||null,discountPrice:form.discountPrice===""?null:Number(form.discountPrice),preparationTime:Number(form.preparationTime)||20,ingredients:form.ingredients.split(",").map(x=>x.trim()).filter(Boolean),allergens:form.allergens.split(",").map(x=>x.trim()).filter(Boolean),dietaryTags:form.dietaryTags.split(",").map(x=>x.trim()).filter(Boolean)};
    try{
      if(editingId){await api.patch(`/restaurant/menu/${editingId}`,payload);setMessage("Menu item updated.")}
      else{await api.post("/restaurant/menu",payload);setMessage("Menu item added.")}
      resetForm();await load();
    }catch(err){setError(err.response?.data?.message||`Could not ${editingId?"update":"add"} this menu item.`)}
    finally{setBusy(false)}
  };
  const toggle=async item=>{setError("");try{await api.patch(`/restaurant/menu/${item._id}`,{isAvailable:!item.isAvailable});await load()}catch(e){setError(e.response?.data?.message||"Could not update item availability.")}};
  const remove=async item=>{if(!window.confirm(`Delete "${item.name}" from your menu?`))return;setError("");try{await api.delete(`/restaurant/menu/${item._id}`);if(editingId===item._id)resetForm();await load()}catch(e){setError(e.response?.data?.message||"Could not delete this menu item.")}};
  return <DashboardLayout title="Menu manager" subtitle="Add dishes, upload photos and keep your menu accurate." items={ownerNav}>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <div className="owner-menu-layout"><section className="panel owner-menu-form"><div className="panel-head"><div><h3>{editingId?"Edit menu item":"Add a menu item"}</h3><p>Clear photos and accurate dish details help customers choose.</p></div>{editingId&&<button type="button" className="btn btn-outline btn-small" onClick={resetForm}>Cancel edit</button>}</div>
      <form className="stack-form" onSubmit={submit}>
        <label>Restaurant<select required disabled={Boolean(editingId)} value={form.restaurant} onChange={e=>setForm({...form,restaurant:e.target.value})}><option value="">Select approved restaurant</option>{restaurants.map(r=><option value={r._id} key={r._id}>{r.name}</option>)}</select></label>
        <label>Food name<input required maxLength="100" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Description<textarea maxLength="500" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the dish, key flavours and serving."/></label>
        <div className="form-row"><label>Price (₹)<input required type="number" min="0" step="1" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Offer price (₹)<input type="number" min="0" step="1" value={form.discountPrice} onChange={e=>setForm({...form,discountPrice:e.target.value})} placeholder="Optional"/></label></div>
        <div className="form-row"><label>Food type<select value={form.foodType} onChange={e=>setForm({...form,foodType:e.target.value})}><option value="veg">Vegetarian</option><option value="non-veg">Non-vegetarian</option><option value="vegan">Vegan</option></select></label><label>Preparation time (min)<input type="number" min="1" max="240" value={form.preparationTime} onChange={e=>setForm({...form,preparationTime:e.target.value})}/></label></div>
        <label>Upload food photo<input type="file" accept="image/*" onChange={imageChanged}/></label>
        {imageError&&<p className="error-box" role="alert">{imageError}</p>}
        {form.image&&<img className="menu-image-preview" src={form.image} alt="Menu item preview"/>}
        <label>Or paste an image URL<input value={form.image.startsWith("data:")?"":form.image} onChange={e=>setForm({...form,image:e.target.value})} placeholder="https://…"/></label>
        <div className="form-row"><label>Calories (kcal)<input type="number" min="0" value={form.calories} onChange={e=>setForm({...form,calories:e.target.value})} placeholder="Optional"/></label><label>Spice level<select value={form.spiceLevel} onChange={e=>setForm({...form,spiceLevel:e.target.value})}><option>Mild</option><option>Medium</option><option>Hot</option><option>Extra hot</option></select></label></div>
        <label>Portion size<input value={form.portionSize} onChange={e=>setForm({...form,portionSize:e.target.value})} placeholder="e.g. Serves 1"/></label>
        <label>Ingredients (comma separated)<input value={form.ingredients} onChange={e=>setForm({...form,ingredients:e.target.value})} placeholder="Paneer, tomato, cream"/></label>
        <label>Allergens (comma separated)<input value={form.allergens} onChange={e=>setForm({...form,allergens:e.target.value})} placeholder="Milk, nuts, gluten"/></label>
        <label>Dietary tags (comma separated)<input value={form.dietaryTags} onChange={e=>setForm({...form,dietaryTags:e.target.value})} placeholder="High protein, gluten free"/></label>
        <label className="checkbox-label"><input type="checkbox" checked={form.isBestseller} onChange={e=>setForm({...form,isBestseller:e.target.checked})}/> Mark as bestseller</label>
        <button disabled={busy} className="btn btn-primary">{busy?"Saving…":editingId?"Save menu item":"Add menu item"}</button>
        {message&&<p className="form-message" role="status">{message}</p>}
      </form>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Your menu</h3><p>{items.length} items across approved restaurants</p></div><button type="button" className="btn btn-outline btn-small" onClick={load}>Refresh</button></div>
      {items.length?items.map(item=><article className="menu-admin-row" key={item._id}><img src={item.image||imageFallback} alt={item.name}/><div className="list-grow"><b>{item.name}</b><small>{item.restaurant?.name} · {item.discountPrice?money(item.discountPrice):money(item.price)}{item.discountPrice?` · MRP ${money(item.price)}`:""}</small><small>{item.foodType} · {item.preparationTime||20} min</small></div><div className="menu-admin-actions"><button className="btn btn-outline btn-small" onClick={()=>edit(item)}>Edit</button><button className="btn btn-outline btn-small" onClick={()=>toggle(item)}>{item.isAvailable?"Available":"Unavailable"}</button><button className="btn btn-outline btn-small" onClick={()=>remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={14}/></button></div></article>):<div className="empty-feature"><Utensils size={30}/><h3>No menu items yet</h3><p>Add a dish with a photo to start building your menu.</p></div>}
    </section></div>
  </DashboardLayout>;
}
function OwnerOrders() {
  const [rows,setRows]=useState([]),[message,setMessage]=useState("");
  const load=()=>api.get("/restaurant/orders").then(r=>setRows(r.data)).catch(()=>{});
  useEffect(()=>{load()},[]);
  const advance=async (order,status)=>{try{await api.patch(`/restaurant/orders/${order._id}/status`,{status});setMessage(`Order updated to ${status}`);load()}catch(e){setMessage(e.response?.data?.message||"Update failed")}};
  const next={placed:"accepted",accepted:"preparing",preparing:"ready"};
  return <DashboardLayout title="Order management" subtitle="Review incoming orders and update kitchen progress." items={ownerNav}><div className="panel">{message&&<p className="form-message">{message}</p>}<DataTable columns={[{key:"orderNumber",label:"Order"},{key:"customer",label:"Customer",render:r=>r.customer?.name},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"payment",label:"Payment",render:r=><span>{r.paymentMethod==="cod"?"Cash on delivery":"Paid online"}<small className="table-subtext"><Badge>{r.paymentStatus}</Badge></small></span>},{key:"orderStatus",label:"Status",render:r=><Badge>{r.orderStatus}</Badge>},{key:"actions",label:"Action",render:r=>next[r.orderStatus]?<div className="inline-actions"><button className="btn btn-primary btn-small" onClick={()=>advance(r,next[r.orderStatus])}>{next[r.orderStatus]}</button>{r.orderStatus==="placed"&&<button className="btn btn-outline btn-small" onClick={()=>{if(window.confirm(`Reject order ${r.orderNumber}?${r.paymentMethod!=="cod"&&r.paymentStatus==="paid"?" The customer will be refunded automatically.":""}`))advance(r,"rejected")}}>Reject</button>}</div>:"—"}]} rows={rows}/></div></DashboardLayout>;
}
function OwnerReservations(){const [rows,setRows]=useState([]),[message,setMessage]=useState("");const load=()=>api.get("/restaurant/reservations").then(r=>setRows(r.data)).catch(()=>{});useEffect(()=>{load()},[]);const update=async(id,status)=>{try{await api.patch(`/restaurant/reservations/${id}`,{status});setMessage(`Reservation ${status}`);load()}catch(e){setMessage(e.response?.data?.message||"Could not update reservation")}};return <DashboardLayout title="Dineout reservations" subtitle="Confirm and manage table requests from your guests." items={ownerNav}><div className="panel">{message&&<p className="form-message">{message}</p>}<DataTable columns={[{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"user",label:"Guest",render:r=>r.user?.name},{key:"date",label:"Date",render:r=>new Date(r.date).toLocaleDateString()},{key:"time",label:"Time"},{key:"guests",label:"Guests"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"action",label:"Action",render:r=>r.status==="requested"?<div className="inline-actions"><button className="btn btn-primary btn-small" onClick={()=>update(r._id,"confirmed")}>Confirm</button><button className="btn btn-outline btn-small" onClick={()=>update(r._id,"cancelled")}>Decline</button></div>:"—"}]} rows={rows}/></div></DashboardLayout>;}
function DeliveryDashboard() {
  const { user, requestLocation, locationStatus } = useAuth();
  const [jobs,setJobs]=useState([]),[pickupRequests,setPickupRequests]=useState([]),[earnings,setEarnings]=useState({completed:0,estimatedEarnings:0});
  const [notifications,setNotifications]=useState([]);
  const [gpsError,setGpsError]=useState(""),[availabilityError,setAvailabilityError]=useState(""),[locationRetry,setLocationRetry]=useState(0),[isAvailable,setIsAvailable]=useState(false);
  const load=()=>Promise.all([api.get("/delivery/assignments"),api.get("/delivery/earnings"),api.get("/delivery/availability"),api.get("/delivery/genie-requests"),api.get("/notifications")]).then(([j,e,a,p,n])=>{setJobs(j.data);setEarnings(e.data);setIsAvailable(a.data.isAvailable);setPickupRequests(p.data);setNotifications(n.data);setAvailabilityError("")}).catch(error=>setAvailabilityError(error.response?.data?.message||"Could not load delivery assignments."));
  useEffect(()=>{load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    const active=jobs.find(j=>j.deliveryPartner && ["accepted","picked_up","on_the_way"].includes(j.status));
    if(!active){setGpsError("");return}
    if(!navigator.geolocation){setGpsError("This browser does not support live location sharing.");return}
    setGpsError("");
    const watch=navigator.geolocation.watchPosition(async position=>{
      try{await api.post("/delivery/location",{deliveryId:active._id,longitude:position.coords.longitude,latitude:position.coords.latitude})}
      catch(error){setGpsError(error.response?.data?.message||"Your live location could not be sent. Check your connection and try again.")}
    },error=>{
      setGpsError(error.code===1?"Location access is blocked. Allow it in your browser's site settings to share your live delivery location.":error.code===2?"Your device could not determine a location. Check that location services are enabled.":"Getting your live location timed out. Check location services and try again.");
    }, {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    return ()=>navigator.geolocation.clearWatch(watch);
  },[jobs,locationRetry]);
  useEffect(()=>{
    const active=pickupRequests.find(request=>String(request.deliveryPartner?._id||request.deliveryPartner)===user.id&&["accepted","picked_up","on_the_way"].includes(request.status));
    if(!active)return;
    if(!navigator.geolocation){setGpsError("This browser does not support live location sharing.");return}
    const watch=navigator.geolocation.watchPosition(async position=>{
      try{await api.post("/delivery/genie-location",{requestId:active._id,longitude:position.coords.longitude,latitude:position.coords.latitude})}
      catch(error){setGpsError(error.response?.data?.message||"Your pickup delivery location could not be sent.")}
    },error=>setGpsError(error.code===1?"Location access is blocked. Allow it in your browser settings to share this pickup delivery.":"Could not get your live pickup delivery location. Check location services and try again."),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    return ()=>navigator.geolocation.clearWatch(watch);
  },[pickupRequests,locationRetry,user.id]);
  const retryGps=async()=>{
    const position=await requestLocation();
    if(position){setGpsError("");setLocationRetry(retry=>retry+1)}
  };
  const accept=async id=>{setAvailabilityError("");try{await api.patch(`/delivery/assignments/${id}/accept`);load()}catch(error){setAvailabilityError(error.response?.data?.message||"Could not accept this delivery.")}};
  const advance=async d=>{const next={accepted:"picked_up",picked_up:"on_the_way",on_the_way:"delivered"}[d.status];if(next){try{await api.patch(`/delivery/assignments/${d._id}/status`,{status:next});load()}catch(error){setAvailabilityError(error.response?.data?.message||"Could not update delivery status.")}}};
  const acceptPickup=async id=>{setAvailabilityError("");try{await api.patch(`/delivery/genie-requests/${id}/accept`);await load()}catch(error){setAvailabilityError(error.response?.data?.message||"Could not accept this pickup request.")}};
  const advancePickup=async request=>{const next={accepted:"picked_up",picked_up:"on_the_way",on_the_way:"delivered"}[request.status];if(!next)return;setAvailabilityError("");try{await api.patch(`/delivery/genie-requests/${request._id}/status`,{status:next});await load()}catch(error){setAvailabilityError(error.response?.data?.message||"Could not update this pickup delivery.")}};
  const activeJobs=jobs.filter(job=>String(job.deliveryPartner?._id||job.deliveryPartner)===user.id&&["accepted","picked_up","on_the_way"].includes(job.status));
  const activePickupRequests=pickupRequests.filter(request=>String(request.deliveryPartner?._id||request.deliveryPartner)===user.id&&["accepted","picked_up","on_the_way"].includes(request.status));
  const availableCount=jobs.filter(job=>!job.deliveryPartner).length+pickupRequests.filter(request=>!request.deliveryPartner&&request.status==="requested").length;
  return <DashboardLayout title="Delivery overview" subtitle="Your assignments, deliveries and earnings." items={deliveryNav}>
    <div className="availability-banner"><span className={isAvailable?"status-dot":"status-dot status-offline"}/><b>You are {isAvailable?"online and available":"offline"}</b><Link to="/delivery/availability" className="link-orange">Manage availability <ArrowRight size={14}/></Link></div>
    <div className="stats-grid"><Stat label="Completed deliveries" value={earnings.completed} icon={CheckCircle2} tone="green"/><Stat label="Estimated earnings" value={money(earnings.estimatedEarnings)} icon={Wallet}/><Stat label="Available jobs" value={availableCount} icon={Bike} tone="blue"/><Stat label="Active jobs" value={activeJobs.length+activePickupRequests.length} icon={Clock} tone="purple"/></div>
    {notifications.length>0&&<section className="panel delivery-updates"><div className="panel-head"><div><h3>Dispatch updates</h3><p>New assignments and delivery messages for your shift.</p></div></div>{notifications.slice(0,3).map(notification=><div className="notification-row" key={notification._id}><span className="notification-dot"/><div><b>{notification.title}</b><p>{notification.message}</p><small>{new Date(notification.createdAt).toLocaleString()}</small></div></div>)}</section>}
    <div className="panel"><div className="panel-head"><div><h3>Delivery assignments</h3><p>Accept available jobs and progress active deliveries.</p></div><button className="btn btn-outline btn-small" onClick={load}>Refresh</button></div>
      {availabilityError&&<p className="error-box" role="alert">{availabilityError}</p>}
      {gpsError&&<div className="gps-error-row"><p className="error-box" role="status">{gpsError}</p><button className="btn btn-outline btn-small" onClick={retryGps} disabled={locationStatus==="loading"||locationStatus==="retrying"}>{locationStatus==="loading"||locationStatus==="retrying"?"Finding location…":"Retry GPS"}</button><Link className="link-orange" to="/profile">Profile settings</Link></div>}
      {jobs.map(job=>{
        const destination=[job.order?.deliveryAddress?.street,job.order?.deliveryAddress?.city,job.order?.deliveryAddress?.state].filter(Boolean).join(", ");
        const riderCoordinates=job.currentLocation?.coordinates;
        const isAssigned=String(job.deliveryPartner?._id||job.deliveryPartner)===user.id;
        return <article className="delivery-job" key={job._id}><div className="job-card"><div className="job-icon"><Bike/></div><div className="list-grow"><b>{job.order?.orderNumber||"Order assignment"}</b><small>{job.order?.restaurant?.name} → {job.order?.deliveryAddress?.city}</small><small>Status: {job.status}</small>{isAssigned&&["accepted","picked_up","on_the_way"].includes(job.status)&&<small className="gps-sharing-label"><MapPin size={12}/> Live GPS sharing is active while location is allowed.</small>}</div>
          {!job.deliveryPartner?<button className="btn btn-primary btn-small" disabled={!isAvailable} onClick={()=>accept(job._id)}>{isAvailable?"Accept job":"Go online to accept"}</button>:isAssigned&&["accepted","picked_up","on_the_way"].includes(job.status)?<button className="btn btn-outline btn-small" onClick={()=>advance(job)}>{({accepted:"Picked up",picked_up:"On the way",on_the_way:"Delivered"})[job.status]}</button>:<Badge>{job.status}</Badge>}
        </div>
        {isAssigned&&<details className="delivery-map-details"><summary>View route in Google Maps</summary><GoogleMap title="Delivery route in Google Maps" latitude={riderCoordinates?.[1]} longitude={riderCoordinates?.[0]} destination={destination}/></details>}
        </article>;
      })}
      {!jobs.length&&!availabilityError&&<p className="muted">No delivery assignments right now.</p>}
    </div>
    <section className="panel genie-driver-panel"><div className="panel-head"><div><h3>Pickup & drop requests</h3><p>Accept local parcel jobs and update customers at each handoff.</p></div><button className="btn btn-outline btn-small" onClick={load}>Refresh</button></div>
      {pickupRequests.map(request=>{
        const isAssigned=String(request.deliveryPartner?._id||request.deliveryPartner)===user.id;
        const coordinates=request.currentLocation?.coordinates;
        const next={accepted:"picked_up",picked_up:"on_the_way",on_the_way:"delivered"}[request.status];
        return <article className="genie-driver-card" key={request._id}><div className="genie-driver-head"><div className="job-icon"><Package size={18}/></div><div className="list-grow"><b>{request.itemDescription} · #{request._id.slice(-6).toUpperCase()}</b><small>Pickup: {request.pickup?.name} · {request.pickup?.phone}</small><small>{request.pickup?.address}</small><small>Drop: {request.drop?.name} · {request.drop?.phone}</small><small>{request.drop?.address}</small></div><div className="genie-driver-action">{!request.deliveryPartner?<button className="btn btn-primary btn-small" disabled={!isAvailable} onClick={()=>acceptPickup(request._id)}>{isAvailable?"Accept pickup":"Go online to accept"}</button>:isAssigned&&next?<button className="btn btn-outline btn-small" onClick={()=>advancePickup(request)}>{({accepted:"Mark picked up",picked_up:"Start delivery",on_the_way:"Mark delivered"})[request.status]}</button>:<Badge>{request.status}</Badge>}</div></div>{isAssigned&&request.instructions&&<p className="muted">Customer note: {request.instructions}</p>}{isAssigned&&coordinates&&<GoogleMap title="Pickup and drop live route" latitude={coordinates[1]} longitude={coordinates[0]} destination={request.drop?.address}/>}</article>;
      })}
      {!pickupRequests.length&&!availabilityError&&<div className="genie-empty"><PackageOpen size={26}/><b>No pickup requests available</b><p>New parcel requests will appear here when customers submit them.</p></div>}
    </section>
  </DashboardLayout>;
}
function DeliveryJobs() { return <DeliveryDashboard/>; }
function DeliveryAvailability() {
  const [status,setStatus]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const load=()=>api.get("/delivery/availability").then(response=>{setStatus(response.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load your shift status."));
  useEffect(()=>{load()},[]);
  const toggle=async()=>{
    if(!status)return;
    setBusy(true);setError("");
    try{const response=await api.patch("/delivery/availability",{isAvailable:!status.isAvailable});setStatus({...status,isAvailable:response.data.isAvailable})}
    catch(err){setError(err.response?.data?.message||"Could not update your availability.")}
    finally{setBusy(false)}
  };
  return <DashboardLayout title="Shift availability" subtitle="Choose when you are ready to receive delivery jobs." items={deliveryNav}>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <section className="panel availability-panel"><div className={status?.isAvailable?"availability-indicator online":"availability-indicator"}><span/><div><b>{status?.isAvailable?"You are online":"You are offline"}</b><small>{status?.hasActiveDelivery?"Finish your active delivery before going offline.":"Change your status to control whether you can accept new jobs."}</small></div></div>
      <button className={status?.isAvailable?"btn btn-outline":"btn btn-primary"} disabled={!status||busy||(status.isAvailable&&status.hasActiveDelivery)} onClick={toggle}><Power size={16}/>{busy?"Updating…":status?.isAvailable?"Go offline":"Go online"}</button>
      {status?.hasActiveDelivery&&<p className="muted">You have an active delivery. Availability will return automatically after it is delivered.</p>}
    </section>
  </DashboardLayout>;
}
function DeliveryHistory() {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=>{api.get("/delivery/earnings").then(response=>setData(response.data)).catch(err=>setError(err.response?.data?.message||"Could not load delivery history."))},[]);
  const deliveries=data?.deliveries||[];
  return <DashboardLayout title="Delivery history" subtitle="Completed jobs and your estimated earnings." items={deliveryNav}>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <div className="stats-grid"><Stat label="Completed deliveries" value={data?.completed??"—"} icon={CheckCircle2} tone="green"/><Stat label="Estimated earnings" value={money(data?.estimatedEarnings)} icon={Wallet}/></div>
    <div className="panel"><DataTable columns={[{key:"order",label:"Order",render:row=>row.order?.orderNumber||"Delivery"},{key:"restaurant",label:"Restaurant",render:row=>row.order?.restaurant?.name||"—"},{key:"actualDeliveryTime",label:"Delivered",render:row=>row.actualDeliveryTime?new Date(row.actualDeliveryTime).toLocaleString():"—"},{key:"status",label:"Status",render:row=><Badge>{row.status}</Badge>},{key:"earning",label:"Estimated pay",render:()=>money(35)}]} rows={deliveries}/></div>
  </DashboardLayout>;
}
function DeliveryEarnings() { return <DeliveryHistory/>; }
function AdminDashboard() {
  const [data,setData]=useState(null),[error,setError]=useState("");
  const load=()=>api.get("/admin/dashboard").then(response=>{setData(response.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load the admin dashboard. Please sign in again if your session expired."));
  useEffect(()=>{load()},[]);
  return <DashboardLayout title="Platform overview" subtitle="A live snapshot of the GoFoode marketplace." items={adminNav}>{error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Retry</button></p>}<div className="stats-grid"><Stat label="Total users" value={data?.users??"—"} icon={Users}/><Stat label="Restaurants" value={data?.restaurants??"—"} icon={Store} tone="blue"/><Stat label="Orders" value={data?.orders??"—"} icon={Package} tone="purple"/><Stat label="Paid revenue" value={data?money(data.revenue):"—"} icon={TrendingUp} tone="green"/></div><div className="panel"><div className="panel-head"><div><h3>Order status overview</h3><p>Distribution of orders by current status.</p></div><Link to="/admin/activity" className="link-orange">View activity log <ArrowRight size={14}/></Link></div>{data?<div className="status-bars">{(data.byStatus||[]).map(x=><div className="status-bar-row" key={x._id}><span>{x._id}</span><div><i style={{width:`${Math.min(100,x.count/Math.max(1,data.orders)*100)}%`}}/></div><b>{x.count}</b></div>)}</div>:!error&&<p className="muted">Loading platform metrics…</p>}</div></DashboardLayout>;
}
function AdminTablePage({ type }) {
  const [rows,setRows]=useState([]),[message,setMessage]=useState(""),[error,setError]=useState("");
  const endpoints={users:"/admin/users",restaurants:"/admin/restaurants",orders:"/admin/orders",transactions:"/admin/transactions",reviews:"/admin/reviews",support:"/admin/support", "grocery-orders":"/admin/grocery-orders", reservations:"/admin/reservations",activity:"/admin/audit-logs"};
  const load=()=>api.get(endpoints[type]).then(r=>{setRows(r.data);setError("")}).catch(e=>setError(e.response?.data?.message||"Could not load this admin page."));
  useEffect(()=>{load()},[type]);
  const update=async (path,body)=>{try{await api.patch(path,body);setMessage("Updated successfully");setError("");load()}catch(e){setMessage("");setError(e.response?.data?.message||"Update failed")}};
  const [busyRow,setBusyRow]=useState(""),[refreshKey,setRefreshKey]=useState(0);
  const act=async (rowId,path,body,fallback)=>{setBusyRow(rowId);try{const {data}=await api.post(path,body);setMessage(data.message||"Done");setError("");await load();setRefreshKey(key=>key+1)}catch(e){setMessage("");setError(e.response?.data?.message||fallback)}finally{setBusyRow("")}};
  const refundOrder=row=>{
    const remaining=Math.round((row.totalAmount-(row.refundedAmount||0))*100)/100;
    const amount=window.prompt(`Refund for ${row.orderNumber}: enter an amount up to ₹${remaining}, or leave blank to refund all of it.`,"");
    if(amount===null)return;
    const reason=window.prompt("Reason for the refund (recorded in the payment timeline and audit log):","Customer support refund");
    if(!reason?.trim())return;
    act(row._id,`/admin/orders/${row._id}/refund`,{amount:amount.trim()===""?null:Number(amount),reason:reason.trim()},"Refund failed");
  };
  const refundable=row=>row.paymentMethod!=="cod"&&["paid","partially_refunded"].includes(row.paymentStatus);
  const configs={
    users:{title:"User management",subtitle:"Manage customer, owner and delivery accounts.",columns:[{key:"name",label:"Name"},{key:"email",label:"Email"},{key:"role",label:"Role"},{key:"isActive",label:"Account",render:r=><Badge>{r.isActive?"active":"disabled"}</Badge>},{key:"action",label:"Action",render:r=><button className="btn btn-outline btn-small" onClick={()=>update(`/admin/users/${r._id}/status`,{isActive:!r.isActive})}>{r.isActive?"Disable":"Enable"}</button>}]},
    restaurants:{title:"Restaurant approvals",subtitle:"Review restaurant applications and marketplace listings.",columns:[{key:"name",label:"Restaurant"},{key:"owner",label:"Owner",render:r=>r.owner?.name},{key:"address",label:"City",render:r=>r.address?.city},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"action",label:"Action",render:r=><div className="inline-actions"><button className="btn btn-primary btn-small" onClick={()=>update(`/admin/restaurants/${r._id}/status`,{status:"approved"})}>Approve</button><button className="btn btn-outline btn-small" onClick={()=>update(`/admin/restaurants/${r._id}/status`,{status:"rejected"})}>Reject</button></div>}]},
    orders:{title:"Order monitoring",subtitle:"Monitor restaurant orders across the platform and issue refunds.",columns:[{key:"orderNumber",label:"Order"},{key:"customer",label:"Customer",render:r=>r.customer?.name},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"totalAmount",label:"Amount",render:r=><span>{money(r.totalAmount)}{r.refundedAmount>0&&<small className="table-subtext">{money(r.refundedAmount)} refunded</small>}</span>},{key:"payment",label:"Payment",render:r=><span>{paymentMethodLabel(r.paymentMethod)}<small className="table-subtext"><Badge>{r.paymentStatus}</Badge></small></span>},{key:"orderStatus",label:"Status",render:r=><Badge>{r.orderStatus}</Badge>},{key:"action",label:"Action",render:r=>refundable(r)?<button className="btn btn-outline btn-small" disabled={busyRow===r._id} onClick={()=>refundOrder(r)}>{busyRow===r._id?"Refunding…":"Refund"}</button>:"—"}]},
    transactions:{title:"Transactions",subtitle:"Every checkout payment with its gateway reference, refunds and status.",columns:[{key:"groupOrderId",label:"Checkout",render:r=><span>{r.groupOrderId}<small className="table-subtext">{new Date(r.createdAt).toLocaleString()}</small></span>},{key:"customer",label:"Customer",render:r=>r.customer?.name||"—"},{key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"method",label:"Method",render:r=><span>{paymentMethodLabel(r.method)}{r.testMode&&r.method!=="cod"&&<small className="table-subtext">Test gateway</small>}</span>},{key:"status",label:"Status",render:r=><span><Badge>{r.status}</Badge>{r.failedAttempts>0&&<small className="table-subtext">{r.failedAttempts} failed attempt{r.failedAttempts===1?"":"s"}</small>}</span>},{key:"amountPaid",label:"Paid",render:r=>r.amountPaid?money(r.amountPaid):"—"},{key:"amountRefunded",label:"Refunded",render:r=><span>{r.amountRefunded?money(r.amountRefunded):"—"}{r.refunds?.some(x=>x.status==="pending")&&<small className="table-subtext">Refund in progress</small>}{r.refunds?.some(x=>x.status==="failed")&&<small className="table-subtext warn">Refund attempt failed</small>}</span>},{key:"reference",label:"Gateway reference",render:r=><span className="mono">{r.providerPaymentId||r.providerOrderId||"—"}</span>},{key:"action",label:"Action",render:r=>r.method!=="cod"||r.status==="pending"?<button className="btn btn-outline btn-small" disabled={busyRow===r._id} onClick={()=>act(r._id,`/admin/payments/${r._id}/reconcile`,{},"Reconciliation failed")}>{busyRow===r._id?"Checking…":"Reconcile"}</button>:"—"}]},
    reviews:{title:"Reviews",subtitle:"Customer ratings and feedback.",columns:[{key:"user",label:"Customer",render:r=>r.user?.name},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"rating",label:"Rating",render:r=>`${r.rating}/5`},{key:"comment",label:"Comment"}]},
    "grocery-orders":{title:"GoFoode Mart orders",subtitle:"Move grocery orders from packing to delivery. Customers see each step live.",columns:[{key:"orderNumber",label:"Order"},{key:"user",label:"Customer",render:r=>r.user?.name},{key:"totalAmount",label:"Amount",render:r=>exactMoney(r.totalAmount)},{key:"payment",label:"Payment",render:r=><>{r.paymentMethod==="cod"?"Cash on delivery":String(r.paymentMethod||"").toUpperCase()}<br/><Badge>{r.paymentStatus}</Badge></>},{key:"slot",label:"Delivery",render:r=>r.deliverySlot?.label||"Express"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"createdAt",label:"Placed",render:r=>new Date(r.createdAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})},{key:"action",label:"Next step",render:r=>{const next={placed:["packed","Mark packed"],packed:["out_for_delivery","Send out"],out_for_delivery:["delivered","Mark delivered"]}[r.status];return next?<button className="btn btn-outline btn-small" onClick={()=>update(`/admin/grocery-orders/${r._id}`,{status:next[0]})}>{next[1]}</button>:<span className="muted">—</span>}}]},
    reservations:{title:"Dineout reservations",subtitle:"Monitor table requests across restaurants.",columns:[{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"user",label:"Guest",render:r=>r.user?.name},{key:"date",label:"Date",render:r=>new Date(r.date).toLocaleDateString()},{key:"time",label:"Time"},{key:"guests",label:"Guests"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>}]},
    support:{title:"Support tickets",subtitle:"Review customer requests and track each resolution stage.",columns:[{key:"user",label:"Customer",render:r=><span>{r.user?.name}<small className="table-subtext">{r.user?.email}</small></span>},{key:"subject",label:"Subject"},{key:"message",label:"Message"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"action",label:"Update status",render:r=><select aria-label={`Update status for ${r.subject}`} value={r.status} onChange={event=>update(`/admin/support/${r._id}`,{status:event.target.value})}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>}]},
    activity:{title:"Admin activity log",subtitle:"Recent administrative and account events across GoFoode.",columns:[{key:"actor",label:"Actor",render:r=>r.actor?.name||"System"},{key:"action",label:"Action"},{key:"entityType",label:"Record type"},{key:"entityId",label:"Record ID"},{key:"createdAt",label:"Time",render:r=>new Date(r.createdAt).toLocaleString()}]}
  };
  const c=configs[type];
  return <DashboardLayout title={c.title} subtitle={c.subtitle} items={adminNav}>{type==="transactions"&&<PaymentHealth refreshKey={refreshKey}/>}{message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Retry</button></p>}<div className="panel"><DataTable columns={c.columns} rows={rows}/></div></DashboardLayout>;
}

const foodPaymentOptions = [
  ...onlineMethodOptions,
  { id: "cod", title: "Cash on delivery", detail: "Pay the rider in cash when your food arrives.", icon: Wallet }
];
function FoodSteps({ step, onStep }) {
  const steps = [{ label: "Your cart", icon: ShoppingBag }, { label: "Delivery address", icon: MapPin }, { label: "Review & pay", icon: Wallet }];
  return <ol className="fd-steps" aria-label="Checkout progress">{steps.map(({ label, icon: Icon }, index) => {
    const number = index + 1;
    return <li key={label} className={step > number ? "done" : step === number ? "current" : ""} aria-current={step === number ? "step" : undefined}>
      <button type="button" disabled={number >= step} onClick={() => onStep(number)}><span>{step > number ? <Check size={16} strokeWidth={3}/> : <Icon size={16}/>}</span><b>{label}</b></button>
    </li>;
  })}</ol>;
}
function CartPage(){
  const { location, user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [flash, notify, closeFlash] = useFlash();
  const food = useFoodCart(notify);
  const blankAddress = () => ({ name: user?.name || "", phone: user?.phone || "", street: "", city: location?.city || "", state: location?.state || "", postalCode: location?.postalCode || "", instructions: "", latitude: location?.latitude ?? null, longitude: location?.longitude ?? null });
  const fromSaved = saved => ({ name: saved.name || user?.name || "", phone: saved.phone || user?.phone || "", street: saved.street || "", city: saved.city || "", state: saved.state || "", postalCode: saved.postalCode || "", instructions: "", latitude: saved.location?.coordinates?.[1] ?? null, longitude: saved.location?.coordinates?.[0] ?? null });
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState(() => routerLocation.state?.deliveryAddress ? fromSaved(routerLocation.state.deliveryAddress) : blankAddress());
  const [savedAddresses, setSavedAddresses] = useState([]), [selectedAddress, setSelectedAddress] = useState(routerLocation.state?.deliveryAddress?._id || "");
  const [offers, setOffers] = useState([]), [couponInput, setCouponInput] = useState(""), [applied, setApplied] = useState(null), [couponNote, setCouponNote] = useState(null), [couponBusy, setCouponBusy] = useState(false), [burst, setBurst] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cod"), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [picks, setPicks] = useState([]);
  const [payConfig, setPayConfig] = useState(null), [phase, setPhase] = useState(""), [plus, setPlus] = useState(false);
  const gateway = usePaymentGateway();
  // One key per distinct checkout attempt: retries of the same request reuse it, so they can't double-order.
  const checkoutKey = useRef(null);

  useEffect(() => {
    api.get("/offers").then(response => setOffers(Array.isArray(response.data) ? response.data : [])).catch(() => {});
    api.get("/membership").then(response => setPlus(Boolean(response.data?.active))).catch(() => {});
    api.get("/payments/config").then(response => { setPayConfig(response.data); if (response.data?.gateway) setPaymentMethod(current => current === "cod" ? "upi" : current); }).catch(() => setPayConfig({ gateway: null, methods: ["cod"] }));
    api.get("/food-items").then(response => setPicks((Array.isArray(response.data) ? response.data : []).filter(dish => dish.isBestseller))).catch(() => {});
    api.get("/addresses").then(response => {
      const rows = Array.isArray(response.data) ? response.data : [];
      setSavedAddresses(rows);
      if (routerLocation.state?.deliveryAddress) return;
      const preferred = rows.find(row => row.isDefault) || rows[0];
      if (preferred) { setSelectedAddress(preferred._id); setAddress(fromSaved(preferred)); }
    }).catch(() => {});
  }, []);
  useEffect(() => { if (location) setAddress(current => ({ ...current, city: current.city || location.city || "", state: current.state || location.state || "", postalCode: current.postalCode || location.postalCode || "", latitude: current.latitude ?? location.latitude ?? null, longitude: current.longitude ?? location.longitude ?? null })); }, [location]);
  useEffect(() => { if (user) setAddress(current => ({ ...current, name: current.name || user.name || "", phone: current.phone || user.phone || "" })); }, [user]);

  const bill = foodBill(food.lines, applied?.discount || 0, { freeDelivery: plus });
  // A code chosen on the Offers page (/cart?coupon=CODE) waits until the cart has items, then applies itself once.
  const couponParam = new URLSearchParams(routerLocation.search).get("coupon");
  useEffect(() => { if (couponParam) { try { sessionStorage.setItem("gf_pending_coupon", couponParam.trim().toUpperCase()); } catch {} } }, [couponParam]);
  useEffect(() => {
    if (!food.loaded || applied) return;
    let pending = "";
    try { pending = sessionStorage.getItem("gf_pending_coupon") || ""; } catch {}
    if (!pending) return;
    if (!food.lines.length) { setCouponNote({ tone: "info", text: `${pending} is saved. Add dishes and it will be applied automatically.` }); return; }
    try { sessionStorage.removeItem("gf_pending_coupon"); } catch {}
    applyCoupon(pending);
  }, [food.loaded, food.lines.length]);
  // Re-check an applied coupon whenever the cart total changes, so the saving shown is what checkout will apply.
  useEffect(() => {
    if (!applied) return;
    let live = true;
    api.post("/coupons/validate", { code: applied.code })
      .then(({ data }) => { if (live) setApplied({ code: data.code, discount: data.discount }); })
      .catch(error => { if (!live) return; setCouponNote({ tone: "error", text: `${applied.code} was removed: ${error.response?.data?.message || "it no longer applies to this cart"}.` }); setApplied(null); });
    return () => { live = false; };
  }, [bill.subtotal]);
  useEffect(() => { if (food.loaded && !food.lines.length && step !== 1) setStep(1); }, [food.loaded, food.lines.length]);
  const addressKey = [address.name, address.phone, address.street, address.city, address.state, address.postalCode, address.instructions].join("|");
  useEffect(() => { checkoutKey.current = null; }, [bill.total, paymentMethod, applied?.code, addressKey]);
  const onlineAvailable = Boolean(payConfig?.gateway);
  const payingOnline = paymentMethod !== "cod";

  const scrollTop = () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  const changeStep = next => { setMessage(""); setStep(next); scrollTop(); };
  const applyCoupon = async code => {
    const value = String(code || "").trim().toUpperCase();
    if (!value) { setCouponNote({ tone: "error", text: "Enter a coupon code first." }); return; }
    setCouponBusy(true);
    try {
      const { data } = await api.post("/coupons/validate", { code: value });
      setApplied({ code: data.code, discount: data.discount }); setCouponInput(""); setBurst(current => current + 1);
      setCouponNote({ tone: "success", text: `${data.code} applied. You save ${money(data.discount)} on this order.` });
    } catch (error) { setCouponNote({ tone: "error", text: error.response?.data?.message || "That coupon couldn't be applied." }); }
    finally { setCouponBusy(false); }
  };
  const removeCoupon = () => { setCouponNote({ tone: "info", text: `${applied.code} removed.` }); setApplied(null); };
  const offerSaving = offer => Math.round(Math.min(offer.discountType === "percentage" ? bill.subtotal * offer.discountValue / 100 : offer.discountValue, offer.maxDiscount || bill.subtotal));
  const bestOffer = offers.filter(offer => bill.subtotal >= (offer.minOrder || 0)).sort((a, b) => offerSaving(b) - offerSaving(a))[0]?.code;
  const editAddress = (field, value) => { setAddress(current => ({ ...current, [field]: value })); if (selectedAddress && selectedAddress !== "new") setSelectedAddress(""); };
  const chooseSaved = row => { setSelectedAddress(row._id); setAddress(fromSaved(row)); setMessage(""); };
  const continueToPayment = event => {
    event.preventDefault();
    if (![address.name, address.phone, address.street, address.city].every(value => String(value || "").trim())) { setMessage("Please add your name, phone number, street address and city."); return; }
    changeStep(3);
  };
  const placeOrder = async () => {
    if (busy) return;
    if (payingOnline && !onlineAvailable) { setMessage("Online payments are unavailable right now. Choose cash on delivery."); return; }
    setBusy(true); setMessage(""); setPhase("placing");
    checkoutKey.current ||= newIdempotencyKey();
    const idempotencyKey = checkoutKey.current;
    try {
      const { data } = await withRetry(
        () => api.post("/checkout", { deliveryAddress: address, paymentMethod, couponCode: applied?.code || "", expectedTotal: Math.round(bill.total * 100) / 100 }, { headers: { "Idempotency-Key": idempotencyKey } }),
        { retries: 3, shouldRetry: error => isRetryableError(error) || error.response?.data?.code === "CHECKOUT_IN_PROGRESS" }
      );
      checkoutKey.current = null;
      const first = data.orders?.[0]?._id;
      const open = (extra = {}) => { food.setCart({ items: [] }); navigate(first ? `/orders/${first}` : "/customer/orders", { state: { justPlaced: true, orderCount: data.orders?.length || 1, ...extra } }); };
      if (data.paymentMethod === "cod" || !data.payment?.canPay) { open(); return; }
      const outcome = await completeOnlinePayment({ paymentId: data.payment.id, method: paymentMethod, gateway, onPhase: setPhase });
      open({ paymentOutcome: outcome.status, paymentMessage: outcome.message || "" });
    } catch (error) {
      const code = error.response?.data?.code;
      if (code === "PRICE_CHANGED" || code === "CART_CHANGED" || code === "ITEM_UNAVAILABLE") { checkoutKey.current = null; await food.reload(); }
      else if (error.response && error.response.status < 500) checkoutKey.current = null;
      if (!error.response) {
        // The request may have reached us before the connection dropped. An empty cart means it did.
        await food.reload();
        setMessage("We lost the connection while placing your order. If your cart is now empty, the order went through: check My orders before trying again.");
      } else setMessage(errorMessage(error, "We couldn't place your order. Please try again."));
    } finally { setBusy(false); setPhase(""); }
  };

  const empty = food.loaded && !food.lines.length;
  const restaurantWord = count => `${count} ${count === 1 ? "restaurant" : "restaurants"}`;

  return <><Header/><main className="fd-page fd-checkout">
    <section className="fd-checkout-hero"><div className="fd-wrap">
      <nav className="fd-crumbs" aria-label="Breadcrumb"><Link to="/food">Food</Link><ChevronRight size={14}/><span>Checkout</span></nav>
      <h1>{empty ? "Your cart" : step === 1 ? "Your cart" : step === 2 ? "Where should we deliver?" : "Review and pay"}</h1>
      {!empty && food.loaded && <FoodSteps step={step} onStep={changeStep}/>}
    </div></section>

    <div className="fd-wrap">
      {!food.loaded ? <div className="fd-checkout-grid"><div className="fd-panel fd-skeleton-panel" aria-busy="true"><i/><i/><i/></div><div className="fd-panel fd-skeleton-panel"><i/><i/></div></div>
      : empty ? <div className="fd-cart-empty">
        <div className="fd-empty-plate" aria-hidden="true"><span>🍽️</span><i/><i/><i/></div>
        <h2>Your cart is hungry</h2><p>Add a few dishes from a local kitchen and they'll show up here.</p>
        {couponNote?.tone === "info" && <p className="fd-pending-coupon" role="status"><TicketPercent size={16}/>{couponNote.text}</p>}
        <Link className="btn btn-primary" to="/food">Browse food <ArrowRight size={16}/></Link>
        {picks.length > 0 && <div className="fd-picks"><h3>Popular right now</h3><div className="fd-picks-row">{picks.slice(0, 4).map(dish => <article className="fd-pick" key={dish._id} data-fly-root><img data-fly-img src={dish.image || imageFallback} alt="" loading="lazy" onError={showImageFallback}/><b><VegMark type={dish.foodType}/>{dish.name}</b><small>{dish.restaurant?.name} · {money(foodPrice(dish))}</small><FoodQty dish={dish} food={food} compact/></article>)}</div></div>}
      </div>
      : <div className="fd-checkout-grid">
        <div className="fd-checkout-main" key={step}>
          {step === 1 && <section className="fd-panel" aria-labelledby="fd-cart-title">
            <div className="fd-panel-head"><div><h2 id="fd-cart-title">Review your order</h2><p>{food.count} {food.count === 1 ? "item" : "items"} from {restaurantWord(bill.groups.length)}</p></div><Link to="/food" className="fd-link"><Plus size={15}/> Add more</Link></div>
            {bill.groups.length > 1 && <div className="fd-split-note"><Store size={17}/><span>Your cart has dishes from {restaurantWord(bill.groups.length)}. They arrive as {bill.groups.length} separate orders, each with its own ₹{FOOD_DELIVERY_FEE} delivery fee.</span></div>}
            {bill.groups.map(group => <div className="fd-cart-group" key={group.key}>
              <div className="fd-cart-rest"><span className="fd-cart-rest-img">{group.restaurant?.coverImage ? <img src={group.restaurant.coverImage} alt="" onError={showImageFallback}/> : <Store size={18}/>}</span><div><b>{group.restaurant?.name || "Restaurant"}</b><small><Clock size={12}/> {group.restaurant?.deliveryTime || 35} min · {(group.restaurant?.cuisine || []).join(" · ") || "Local kitchen"}</small></div>{group.restaurant?._id && <Link to={`/restaurants/${group.restaurant._id}`} className="fd-link">Menu <ArrowRight size={13}/></Link>}</div>
              <ul className="fd-cart-lines">{group.lines.map(line => <li key={line.foodItem._id} data-fly-root>
                <img data-fly-img src={line.foodItem.image || imageFallback} alt="" onError={showImageFallback}/>
                <div className="fd-line-copy"><b><VegMark type={line.foodItem.foodType}/>{line.foodItem.name}</b><small>{money(foodPrice(line.foodItem))} each{line.foodItem.portionSize ? ` · ${line.foodItem.portionSize}` : ""}</small></div>
                <FoodQty dish={line.foodItem} food={food} compact/>
                <strong>{money(foodPrice(line.foodItem) * line.quantity)}</strong>
                <button type="button" className="fd-remove" aria-label={`Remove ${line.foodItem.name}`} disabled={food.pending === line.foodItem._id} onClick={() => food.setQuantity(line.foodItem._id, 0)}><Trash2 size={16}/></button>
              </li>)}</ul>
            </div>)}
            <div className="fd-coupons">
              <div className="fd-coupons-head"><TicketPercent size={18}/><b>Offers & coupons</b></div>
              {applied ? <div className="fd-applied" key={burst}><span className="fd-applied-icon" aria-hidden="true">🎉</span><div><b>{applied.code} applied</b><small>You save {money(bill.discount)} on this order</small></div><button type="button" className="fd-link" onClick={removeCoupon}>Remove</button><span className="fd-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--n": index }}/>)}</span></div>
              : <form className="fd-coupon-form" onSubmit={event => { event.preventDefault(); applyCoupon(couponInput); }}><input value={couponInput} aria-label="Coupon code" placeholder="Enter a coupon code" onChange={event => setCouponInput(event.target.value.toUpperCase())}/><button className="btn btn-outline" disabled={couponBusy}>{couponBusy ? "Checking…" : "Apply"}</button></form>}
              {couponNote && <p className={`fd-note ${couponNote.tone}`} role="status">{couponNote.text}</p>}
              {offers.length > 0 && <div className="fd-offer-list">{offers.map(offer => { const ready = bill.subtotal >= (offer.minOrder || 0); const isApplied = applied?.code === offer.code; return <div className={`fd-offer ${ready ? "" : "locked"} ${isApplied ? "applied" : ""}`} key={offer._id}>
                <div className="fd-offer-copy"><span className="fd-offer-top"><code>{offer.code}</code>{offer.personal && <em className="mine">🎁 Your reward</em>}{bestOffer === offer.code && !isApplied && <em>Best for this cart</em>}</span><p>{offerSummary(offer)}</p><small>{isApplied ? "Applied to this order" : ready ? `Saves about ${money(offerSaving(offer))} on this cart` : `Add ${money(offer.minOrder - bill.subtotal)} more to unlock`}</small>{!ready && <span className="fd-offer-meter"><i style={{ width: `${Math.min(100, bill.subtotal / offer.minOrder * 100)}%` }}/></span>}</div>
                <button type="button" className="fd-offer-apply" disabled={!ready || isApplied || couponBusy} onClick={() => applyCoupon(offer.code)}>{isApplied ? <><Check size={14} strokeWidth={3}/> Applied</> : ready ? "Apply" : "Locked"}</button>
              </div>; })}</div>}
            </div>
            <div className="fd-panel-actions"><Link to="/food" className="btn btn-outline"><ChevronLeft size={16}/> Keep browsing</Link><button type="button" className="btn btn-primary" onClick={() => changeStep(2)}>Continue to delivery <ArrowRight size={16}/></button></div>
          </section>}

          {step === 2 && <section className="fd-panel" aria-labelledby="fd-address-title">
            <div className="fd-panel-head"><div><h2 id="fd-address-title">Delivery address</h2><p>{savedAddresses.length ? "Pick a saved address or enter a new one." : "Tell us where to bring your food."}</p></div><Link to="/customer/addresses" className="fd-link">Manage addresses</Link></div>
            {location?.label && <div className="fd-detected"><span><Navigation size={17}/></span><div><b>Your location</b><small>{location.label}</small></div><em>Prefilled</em></div>}
            {savedAddresses.length > 0 && <div className="fd-saved" role="radiogroup" aria-label="Saved addresses">
              {savedAddresses.map(row => <button type="button" role="radio" aria-checked={selectedAddress === row._id} key={row._id} className={selectedAddress === row._id ? "on" : ""} onClick={() => chooseSaved(row)}>
                <span className="fd-saved-icon">{/work|office/i.test(row.label || "") ? <Store size={17}/> : <MapPin size={17}/>}</span>
                <span className="fd-saved-copy"><b>{row.label || "Saved address"}{row.isDefault && <em>Default</em>}</b><small>{[row.street, row.city, row.postalCode].filter(Boolean).join(", ")}</small></span>
                <span className="fd-saved-check" aria-hidden="true"><Check size={14} strokeWidth={3}/></span>
              </button>)}
              <button type="button" role="radio" aria-checked={selectedAddress === "new"} className={`fd-saved-new ${selectedAddress === "new" ? "on" : ""}`} onClick={() => { setSelectedAddress("new"); setAddress(blankAddress()); }}><Plus size={17}/> New address</button>
            </div>}
            <form id="fd-address-form" className="fd-form" onSubmit={continueToPayment}>
              <div className="fd-form-grid">
                <label>Full name<input required autoComplete="name" value={address.name} onChange={event => editAddress("name", event.target.value)}/></label>
                <label>Phone number<input required type="tel" autoComplete="tel" placeholder="+91" value={address.phone} onChange={event => editAddress("phone", event.target.value)}/></label>
                <label className="wide">Street address<input required autoComplete="street-address" placeholder="House / flat, street, landmark" value={address.street} onChange={event => editAddress("street", event.target.value)}/></label>
                <label>City<input required autoComplete="address-level2" value={address.city} onChange={event => editAddress("city", event.target.value)}/></label>
                <label>PIN code<input inputMode="numeric" autoComplete="postal-code" value={address.postalCode} onChange={event => editAddress("postalCode", event.target.value)}/></label>
                <label className="wide"><span>Delivery instructions <em>(optional)</em></span><input placeholder="E.g. ring the bell, leave at the gate" value={address.instructions} onChange={event => editAddress("instructions", event.target.value)}/></label>
              </div>
              {message && <p className="fd-note error" role="alert">{message}</p>}
              <div className="fd-panel-actions"><button type="button" className="btn btn-outline" onClick={() => changeStep(1)}><ChevronLeft size={16}/> Back to cart</button><button className="btn btn-primary">Continue to payment <ArrowRight size={16}/></button></div>
            </form>
          </section>}

          {step === 3 && <section className="fd-panel" aria-labelledby="fd-pay-title">
            <div className="fd-panel-head"><div><h2 id="fd-pay-title">Almost there</h2><p>Check your details, choose how to pay and place your order.</p></div></div>
            <div className="fd-review-card"><span className="fd-review-icon"><MapPin size={18}/></span><div><small>Delivering to</small><b>{address.name} · {address.phone}</b><p>{[address.street, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}</p>{address.instructions && <p className="fd-instr">“{address.instructions}”</p>}</div><button type="button" className="fd-link" onClick={() => changeStep(2)}>Change</button></div>
            <div className="fd-review-card items"><span className="fd-review-icon"><ShoppingBag size={18}/></span><div>{bill.groups.map(group => <div className="fd-review-group" key={group.key}><small>{group.restaurant?.name}</small><ul>{group.lines.map(line => <li key={line.foodItem._id}><span><VegMark type={line.foodItem.foodType}/>{line.quantity} × {line.foodItem.name}</span><b>{money(foodPrice(line.foodItem) * line.quantity)}</b></li>)}</ul></div>)}</div><button type="button" className="fd-link" onClick={() => changeStep(1)}>Edit</button></div>
            <fieldset className="fd-pay"><legend>How would you like to pay?</legend>
              {foodPaymentOptions.map(({ id: optionId, title, detail, icon: Icon }) => { const disabled = ONLINE_METHODS.includes(optionId) && payConfig && !onlineAvailable; return <label className={`fd-pay-option ${paymentMethod === optionId ? "on" : ""} ${disabled ? "off" : ""}`} key={optionId}>
                <input type="radio" name="food-payment" value={optionId} disabled={disabled} checked={paymentMethod === optionId} onChange={() => setPaymentMethod(optionId)}/>
                <span className="fd-pay-icon"><Icon size={19}/></span><span className="fd-pay-copy"><b>{title}{optionId === "upi" && onlineAvailable && <em>Fastest</em>}{payConfig?.testMode && ONLINE_METHODS.includes(optionId) && <em className="test">Test mode</em>}</b><small>{disabled ? "Unavailable right now" : detail}</small></span><span className="fd-pay-radio" aria-hidden="true"/>
              </label>; })}
              <p className="fd-pay-note"><ShieldCheck size={15}/> {!payConfig ? "Checking payment options…" : !onlineAvailable ? "Online payments are unavailable right now, so you can pay in cash on delivery." : payConfig.testMode ? `Test mode: online payments use ${payConfig.gateway === "razorpay" ? "Razorpay test keys" : "GoFoode's built-in test gateway"}, so no real money moves.` : "Payments are processed securely by Razorpay. GoFoode never sees your card or UPI PIN."}{payingOnline && onlineAvailable ? ` Your order goes to the kitchen once payment succeeds. If it fails, you can retry or switch to cash for ${payConfig.windowMinutes} minutes.` : ""}</p>
            </fieldset>
            {message && <p className="fd-note error" role="alert">{message}</p>}
            <div className="fd-panel-actions"><button type="button" className="btn btn-outline" onClick={() => changeStep(2)}><ChevronLeft size={16}/> Back</button><button type="button" className="btn btn-primary fd-place" disabled={busy || (payingOnline && !onlineAvailable)} onClick={placeOrder}>{busy ? <><span className="fd-spin light" aria-hidden="true"/> {phase === "opening" ? "Opening secure payment…" : phase === "confirming" ? "Confirming payment…" : "Placing your order…"}</> : payingOnline ? <><Lock size={16}/> Pay {exactMoney(bill.total)} securely</> : <>Place order · {exactMoney(bill.total)} <ArrowRight size={16}/></>}</button></div>
          </section>}
        </div>

        <aside className="fd-bill" aria-label="Bill summary">
          <h3>Bill summary</h3>
          <div><span>Item total</span><b>{money(bill.subtotal)}</b></div>
          <div><span>Delivery fee{bill.groups.length > 1 ? ` · ${restaurantWord(bill.groups.length)}` : ""}</span>{plus ? <b className="fd-plus-free"><Crown size={13}/> FREE with Plus</b> : <b>{money(bill.deliveryFee)}</b>}</div>
          <div><span>Taxes (5%)</span><b>{exactMoney(bill.tax)}</b></div>
          {bill.discount > 0 && <div className="save"><span>Coupon {applied?.code}</span><b>−{money(bill.discount)}</b></div>}
          <div className="total"><span>To pay</span><b key={Math.round(bill.total)}>{exactMoney(bill.total)}</b></div>
          {bill.discount > 0 && <p className="fd-bill-save">🎉 You're saving {money(bill.discount)} on this order</p>}
          <p className="fd-bill-fine"><ShieldCheck size={15}/>{paymentMethod === "cod" ? "Pay in cash when your food arrives." : `${paymentMethodLabel(paymentMethod)} · you're only charged once, even if you retry.`}</p>
          <ul className="fd-bill-perks"><li><Navigation size={14}/> Live tracking after you order</li><li><ChefHat size={14}/> Cooked fresh by the kitchen</li></ul>
        </aside>
      </div>}
    </div>
  </main>
  {gateway.element}
  <FlashToast flash={flash} onClose={closeFlash}/>
  <Footer/></>;
}
const MART_FREE_DELIVERY = 299;
const MART_DELIVERY_FEE = 25;
const martHeroWords = ["fruits", "veggies", "dairy", "snacks", "essentials"];
const martTrySearches = ["Milk", "Bananas", "Paneer", "Bread", "Chips"];
const martCategoryOrder = ["Fruits", "Vegetables", "Dairy", "Bakery", "Breakfast", "Beverages", "Snacks", "Staples", "Home care"];
const martCategoryLook = {
  Fruits: { image: "1610832958506-aa56368176cf", tint: "#fff1e8", emoji: "🍎" },
  Vegetables: { image: "1597362925123-77861d3fbac7", tint: "#ecf8ea", emoji: "🥕" },
  Dairy: { image: "1563636619-e9143da7973b", tint: "#eef5ff", emoji: "🥛" },
  Bakery: { image: "1509440159596-0249088772ff", tint: "#fff4e2", emoji: "🍞" },
  Breakfast: { image: "1517673400267-0251440c45dc", tint: "#fbf3e8", emoji: "🥣" },
  Beverages: { image: "1497534446932-c925b458314e", tint: "#fff0f3", emoji: "🧃" },
  Snacks: { image: "1566478989037-eec170784d0b", tint: "#fff7dc", emoji: "🍪" },
  Staples: { image: "1586201375761-83865001e31c", tint: "#f6f2ea", emoji: "🌾" },
  "Home care": { image: "1585421514284-efb74c2b69ba", tint: "#ecf7f8", emoji: "🧴" }
};
const martSynonyms = {
  Fruits: "fruit fruits",
  Vegetables: "veg veggie veggies vegetable vegetables sabzi greens",
  Dairy: "milk dairy",
  Beverages: "drink drinks juice beverage beverages",
  Snacks: "snack snacks chips munchies",
  Staples: "staple staples grocery atta rice",
  "Home care": "cleaning clean soap detergent household home",
  Breakfast: "cereal breakfast",
  Bakery: "bread bakery"
};
const martPriceRanges = [
  { id: "any", label: "Any price", test: () => true },
  { id: "u50", label: "Under ₹50", test: product => product.price < 50 },
  { id: "50-99", label: "₹50 – ₹99", test: product => product.price >= 50 && product.price < 100 },
  { id: "100-199", label: "₹100 – ₹199", test: product => product.price >= 100 && product.price < 200 },
  { id: "200", label: "₹200 & above", test: product => product.price >= 200 }
];
const martSorts = [
  { id: "featured", label: "Featured" },
  { id: "discount", label: "Biggest discount" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "name", label: "Name: A to Z" }
];
const martKits = [
  { id: "breakfast", title: "Breakfast table", text: "Bread, eggs, butter and milk for an easy morning.", items: ["Brown Bread", "Farm Eggs", "Salted Butter", "Amul Taaza Milk", "Orange Juice"] },
  { id: "pizza", title: "Pizza night in", text: "Cheese, toppings and something fizzy to go with it.", items: ["Mozzarella Cheese", "Fresh Tomatoes", "Red Onions", "Sweet Corn", "Sparkling Lemon Drink"] },
  { id: "sabzi", title: "Everyday sabzi", text: "The weekday vegetable basics, all in one go.", items: ["Farm Potatoes", "Red Onions", "Fresh Tomatoes", "Cauliflower", "Baby Spinach"] },
  { id: "bowl", title: "Power bowl", text: "Greens, yogurt and crunch for a lighter meal.", items: ["Fresh Avocados", "Baby Spinach", "Greek Yogurt", "Honey Granola", "Crunchy Cucumbers"] },
  { id: "movie", title: "Movie night", text: "Salty, sweet and ready for the couch.", items: ["Classic Potato Chips", "Mixed Namkeen", "Chocolate Cookies", "Dark Chocolate Bar", "Coconut Water"] },
  { id: "restock", title: "Monthly restock", text: "Staples and home care, sorted for the month.", items: ["Basmati Rice", "Whole Wheat Atta", "Dishwashing Liquid", "Laundry Detergent"] }
];
const martPromises = [
  { icon: Leaf, tone: "pr-green", title: "Freshness guaranteed", text: "Fruits, vegetables and dairy handled with care on the way to you." },
  { icon: Truck, tone: "pr-orange", title: `Free delivery over ₹${MART_FREE_DELIVERY}`, text: `Smaller baskets are delivered for just ₹${MART_DELIVERY_FEE}.` },
  { icon: Wallet, tone: "pr-blue", title: "Cash on delivery", text: "Pay in cash when your groceries reach your door." },
  { icon: PackageCheck, tone: "pr-purple", title: "Track every order", text: "Follow each grocery order and its status from your dashboard." }
];
const martDiscount = product => product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0;
const martLook = category => martCategoryLook[category] || { tint: "#f2f5f8", emoji: "🛒" };
const martMaxQuantity = product => Math.min(20, Number.isFinite(product.stock) ? product.stock : 20);
function martMatches(product, query) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = `${product.name} ${product.category} ${product.description || ""} ${martSynonyms[product.category] || ""}`.toLowerCase();
  return tokens.every(token => text.includes(token));
}
function martRelevance(product, query) {
  const needle = query.toLowerCase().trim();
  const name = product.name.toLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.split(/\s+/).some(word => word.startsWith(needle))) return 1;
  return name.includes(needle) ? 2 : 3;
}
function readMartStore(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function writeMartStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable in private mode */ }
}
function HighlightMatch({ text, query }) {
  const needle = query.trim().toLowerCase().split(/\s+/)[0] || "";
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + needle.length)}</mark>{text.slice(at + needle.length)}</>;
}
// Flies a copy of the product photo into the basket button so adding an item feels physical.
function flyToBasket(source) {
  if (!source || prefersReducedMotion() || typeof source.animate !== "function") return;
  const start = source.getBoundingClientRect();
  if (!start.width || !start.height) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = [...document.querySelectorAll("[data-basket-target]")].find(element => element.getBoundingClientRect().width > 0);
    if (!target) return;
    const end = target.getBoundingClientRect();
    const ghost = document.createElement("img");
    ghost.src = source.currentSrc || source.src;
    ghost.alt = "";
    ghost.className = "im-fly";
    Object.assign(ghost.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
    document.body.appendChild(ghost);
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);
    const flight = ghost.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: "18px" },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(.5) rotate(-8deg)`, opacity: 1, borderRadius: "40%", offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(10deg)`, opacity: 0.25, borderRadius: "50%" }
    ], { duration: 820, easing: "cubic-bezier(.45,.05,.55,.95)" });
    const cleanup = () => ghost.remove();
    flight.onfinish = cleanup;
    flight.oncancel = cleanup;
  }));
}
function MartCarousel({ slides }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const goTo = index => {
    const track = trackRef.current;
    if (!track || !slides.length) return;
    const next = (index + slides.length) % slides.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => setActive(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (paused || slides.length < 2 || prefersReducedMotion()) return;
    const timer = setTimeout(() => goTo(active + 1), 5200);
    return () => clearTimeout(timer);
  }, [active, paused, slides.length]);
  return <div className="im-carousel" aria-roledescription="carousel" aria-label="GoFoode Mart offers"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="im-carousel-track" ref={trackRef}>
      {slides.map((slide, index) => <article className={`im-slide ${slide.tone}`} key={slide.id} aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`}>
        <img src={unsplash(slide.image, 1100)} alt="" className={active === index ? "on" : ""} onError={showImageFallback}/>
        <div className="im-slide-copy">
          <span className="im-eyebrow">{slide.eyebrow}</span>
          <h3>{slide.title}</h3>
          <p>{slide.text}</p>
          <button type="button" className="im-slide-cta" tabIndex={active === index ? 0 : -1} onClick={slide.action}>{slide.cta} <ArrowRight size={16}/></button>
        </div>
      </article>)}
    </div>
    {slides.length > 1 && <div className="im-carousel-ui">
      <button type="button" aria-label="Previous offer" onClick={() => goTo(active - 1)}><ChevronLeft size={18}/></button>
      <div className="im-dots">{slides.map((slide, index) => <button type="button" key={slide.id} aria-label={`Show offer ${index + 1}`} aria-current={active === index} className={active === index ? "on" : ""} onClick={() => goTo(index)}>{active === index && !paused && <i key={active}/>}</button>)}</div>
      <button type="button" aria-label="Next offer" onClick={() => goTo(active + 1)}><ChevronRight size={18}/></button>
    </div>}
  </div>;
}
function InstamartPage(){
 const {user,location}=useAuth();
 const navigate=useNavigate(),routerLocation=useLocation();
 const rootRef=useRef(null),searchRef=useRef(null),visualRef=useRef(null),toastTimer=useRef(0),recognitionRef=useRef(null),parallaxFrame=useRef(0);
 useRevealOnScroll(rootRef);
 const [products,setProducts]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
 const [search,setSearch]=useState(""),[category,setCategory]=useState("All"),[priceRange,setPriceRange]=useState("any"),[onOffer,setOnOffer]=useState(false),[inStockOnly,setInStockOnly]=useState(false),[savedOnly,setSavedOnly]=useState(false),[sort,setSort]=useState("featured"),[view,setView]=useState("grid"),[limit,setLimit]=useState(12);
 const [suggestOpen,setSuggestOpen]=useState(false),[activeSuggest,setActiveSuggest]=useState(-1),[listening,setListening]=useState(false);
 const [quickId,setQuickId]=useState(null),[drawerOpen,setDrawerOpen]=useState(false),[filtersOpen,setFiltersOpen]=useState(false),[toast,setToast]=useState(null);
 const [saved,setSaved]=useState(()=>readMartStore("gofoode-mart-saved",[])),[recent,setRecent]=useState(()=>readMartStore("gofoode-mart-recent",[])),[recentSearches,setRecentSearches]=useState(()=>readMartStore("gofoode-mart-searches",[])),[pastOrders,setPastOrders]=useState([]);
 const [checkoutOpen,setCheckoutOpen]=useState(()=>{try{return sessionStorage.getItem("gofoode-mart-checkout")==="open"}catch{return false}});
 const [basket,setBasket]=useState(()=>{try{return JSON.parse(localStorage.getItem("gofoode-mart-basket")||"{}")}catch{return {}}});
 const load=async()=>{try{const {data}=await api.get("/grocery/products");setProducts(Array.isArray(data)?data:[]);setLoadError("")}catch{setLoadError("We couldn't load grocery products. Check your connection and try again.")}finally{setLoading(false)}};
 const loadPastOrders=()=>{if(user?.role!=="customer"){setPastOrders([]);return}api.get("/grocery/orders/mine").then(({data})=>setPastOrders(Array.isArray(data)?data:[])).catch(()=>setPastOrders([]))};
 useEffect(()=>{load()},[]);
 useEffect(()=>{loadPastOrders()},[user?.role,user?._id]);
 useEffect(()=>{try{localStorage.setItem("gofoode-mart-basket",JSON.stringify(basket))}catch{}},[basket]);
 useEffect(()=>{try{if(checkoutOpen)sessionStorage.setItem("gofoode-mart-checkout","open");else sessionStorage.removeItem("gofoode-mart-checkout")}catch{}},[checkoutOpen]);
 useEffect(()=>writeMartStore("gofoode-mart-saved",saved),[saved]);
 useEffect(()=>writeMartStore("gofoode-mart-recent",recent),[recent]);
 useEffect(()=>writeMartStore("gofoode-mart-searches",recentSearches),[recentSearches]);
 useEffect(()=>setLimit(12),[search,category,priceRange,onOffer,inStockOnly,savedOnly,sort]);
 useEffect(()=>()=>{clearTimeout(toastTimer.current);recognitionRef.current?.abort?.();cancelAnimationFrame(parallaxFrame.current)},[]);

 // Catalogue lookups and everything derived from the live product list.
 const byId=useMemo(()=>new Map(products.map(product=>[product._id,product])),[products]);
 const byName=useMemo(()=>new Map(products.map(product=>[product.name,product])),[products]);
 const categories=useMemo(()=>{const map=new Map();products.forEach(product=>{const entry=map.get(product.category)||{name:product.category,count:0,maxOff:0,image:product.image};entry.count+=1;entry.maxOff=Math.max(entry.maxOff,martDiscount(product));map.set(product.category,entry)});const rank=name=>{const index=martCategoryOrder.indexOf(name);return index<0?99:index};return [...map.values()].sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name))},[products]);
 const maxOff=products.reduce((best,product)=>Math.max(best,martDiscount(product)),0);
 const count=Object.values(basket).reduce((sum,quantity)=>sum+quantity,0);
 const basketItems=products.filter(product=>basket[product._id]>0);
 const subtotal=basketItems.reduce((sum,product)=>sum+product.price*basket[product._id],0);
 const deliveryFee=subtotal>=MART_FREE_DELIVERY?0:MART_DELIVERY_FEE;
 const total=subtotal+deliveryFee;
 const savings=basketItems.reduce((sum,product)=>sum+Math.max(0,(product.mrp||0)-product.price)*basket[product._id],0);
 const remaining=Math.max(0,MART_FREE_DELIVERY-subtotal);
 const freeProgress=Math.min(100,Math.round(subtotal/MART_FREE_DELIVERY*100));

 const query=search.trim();
 const priceTest=(martPriceRanges.find(range=>range.id===priceRange)||martPriceRanges[0]).test;
 const searched=products.filter(product=>martMatches(product,query));
 const toggled=searched.filter(product=>(!onOffer||martDiscount(product)>=10)&&(!inStockOnly||product.stock>0)&&(!savedOnly||saved.includes(product._id)));
 const categoryCount=name=>toggled.filter(product=>(name==="All"||product.category===name)&&priceTest(product)).length;
 const priceCount=test=>toggled.filter(product=>(category==="All"||product.category===category)&&test(product)).length;
 const sorters={featured:(a,b)=>query?martRelevance(a,query)-martRelevance(b,query):0,discount:(a,b)=>martDiscount(b)-martDiscount(a)||a.price-b.price,"price-asc":(a,b)=>a.price-b.price,"price-desc":(a,b)=>b.price-a.price,name:(a,b)=>a.name.localeCompare(b.name)};
 const filtered=toggled.filter(product=>(category==="All"||product.category===category)&&priceTest(product)).sort((a,b)=>(a.stock===0)-(b.stock===0)||(sorters[sort]||sorters.featured)(a,b));
 const activeFilters=[
  query&&{key:"search",label:`“${query}”`,clear:()=>setSearch("")},
  category!=="All"&&{key:"category",label:category,clear:()=>setCategory("All")},
  priceRange!=="any"&&{key:"price",label:martPriceRanges.find(range=>range.id===priceRange)?.label,clear:()=>setPriceRange("any")},
  onOffer&&{key:"offer",label:"On offer",clear:()=>setOnOffer(false)},
  inStockOnly&&{key:"stock",label:"In stock",clear:()=>setInStockOnly(false)},
  savedOnly&&{key:"saved",label:"Saved items",clear:()=>setSavedOnly(false)}
 ].filter(Boolean);
 const suggestions=query?[...searched].sort((a,b)=>martRelevance(a,query)-martRelevance(b,query)||(a.stock===0)-(b.stock===0)).slice(0,6):[];
 const suggestedCategories=query?categories.filter(entry=>`${entry.name} ${martSynonyms[entry.name]||""}`.toLowerCase().includes(query.toLowerCase())).slice(0,3):[];
 const showSuggest=suggestOpen&&(query?true:recentSearches.length>0||categories.length>0);

 const deals=products.filter(product=>product.stock>0&&martDiscount(product)>0).sort((a,b)=>martDiscount(b)-martDiscount(a)||a.price-b.price).slice(0,10);
 const heroPicks=(()=>{const seen=new Set();return deals.filter(product=>!seen.has(product.category)&&seen.add(product.category)).slice(0,3)})();
 const orbitPicks=categories.map(entry=>products.find(product=>product.category===entry.name&&product.stock>0&&!heroPicks.includes(product))).filter(Boolean).slice(0,5);
 const stripItems=products.filter((product,index,list)=>product.stock>0&&list.findIndex(other=>other.image===product.image)===index).slice(0,16);
 const kits=martKits.map(kit=>{const items=kit.items.map(name=>byName.get(name)).filter(product=>product&&product.stock>0);return {...kit,products:items,price:items.reduce((sum,product)=>sum+product.price,0),mrp:items.reduce((sum,product)=>sum+Math.max(product.mrp||0,product.price),0),allIn:items.length>0&&items.every(product=>basket[product._id]>0)}}).filter(kit=>kit.products.length>=3);
 const buyAgain=(()=>{const ids=[];pastOrders.forEach(order=>(order.items||[]).forEach(item=>{const id=String(item.product?._id||item.product||"");if(id&&!ids.includes(id))ids.push(id)}));return ids.map(id=>byId.get(id)).filter(Boolean).slice(0,12)})();
 const recentlyViewed=recent.map(id=>byId.get(id)).filter(Boolean).slice(0,12);
 const quickProduct=quickId?byId.get(quickId)||null:null;
 const similar=quickProduct?products.filter(product=>product.category===quickProduct.category&&product._id!==quickProduct._id).slice(0,4):[];
 const topUps=remaining>0?products.filter(product=>product.stock>0&&!basket[product._id]).sort((a,b)=>Math.abs(a.price-remaining)-Math.abs(b.price-remaining)).slice(0,6):[];
 const produceOff=products.filter(product=>product.category==="Fruits"||product.category==="Vegetables").reduce((best,product)=>Math.max(best,martDiscount(product)),0);
 const morningPrices=products.filter(product=>["Breakfast","Dairy","Bakery"].includes(product.category)).map(product=>product.price);
 const underFifty=products.filter(product=>product.stock>0&&product.price<50).length;

 const scrollToId=id=>document.getElementById(id)?.scrollIntoView({behavior:prefersReducedMotion()?"auto":"smooth",block:"start"});
 const pickCategory=name=>{setCategory(name);setFiltersOpen(false);requestAnimationFrame(()=>scrollToId("mart-shop"))};
 const slides=[
  produceOff>0&&{id:"produce",tone:"tone-green",image:"1610832958506-aa56368176cf",eyebrow:"Fresh from the farm",title:<>Fruits &amp; veggies,<br/>up to {produceOff}% off</>,text:"Juicy fruit, crisp greens and kitchen basics for the week.",cta:"Shop fresh produce",action:()=>pickCategory(categories.some(entry=>entry.name==="Fruits")?"Fruits":"All")},
  morningPrices.length>0&&{id:"morning",tone:"tone-sun",image:"1504754524776-8f4f37790ca0",eyebrow:"Mornings, sorted",title:<>Breakfast &amp; dairy<br/>from {money(Math.min(...morningPrices))}</>,text:"Milk, eggs, bread, oats and spreads in one basket.",cta:"See breakfast kits",action:()=>scrollToId("mart-kits")},
  underFifty>0&&{id:"budget",tone:"tone-berry",image:"1566478989037-eec170784d0b",eyebrow:"Small basket, big smile",title:<>{underFifty} everyday picks<br/>under ₹50</>,text:"Snacks, vegetables and quick fixes that are easy on the wallet.",cta:"See budget picks",action:()=>{setCategory("All");setPriceRange("u50");requestAnimationFrame(()=>scrollToId("mart-shop"))}},
  {id:"free",tone:"tone-ink",image:"1584473457406-6240486418e9",eyebrow:"Free delivery",title:<>No delivery fee<br/>above {money(MART_FREE_DELIVERY)}</>,text:`Smaller baskets are delivered for just ${money(MART_DELIVERY_FEE)}.`,cta:"Start your basket",action:()=>scrollToId("mart-shop")}
 ].filter(Boolean);

 const notify=(text,action)=>{clearTimeout(toastTimer.current);setToast({id:Date.now(),text,action});toastTimer.current=setTimeout(()=>setToast(null),action?4500:2800)};
 const changeQuantity=(product,quantity)=>{const capped=Math.min(martMaxQuantity(product),quantity);setBasket(current=>{const next={...current};if(capped<=0)delete next[product._id];else next[product._id]=capped;return next})};
 const addToBasket=(product,event)=>{if(product.stock===0)return;const before=basket[product._id]||0;changeQuantity(product,before+1);flyToBasket(event?.currentTarget?.closest("[data-fly-root]")?.querySelector("[data-fly-img]"));if(!before&&!drawerOpen)notify(`${product.name} added to your basket`,{label:"View basket",run:()=>{setQuickId(null);setDrawerOpen(true)}})};
 const toggleSaved=product=>{const has=saved.includes(product._id);setSaved(current=>has?current.filter(id=>id!==product._id):[product._id,...current]);notify(has?`Removed ${product.name} from saved items`:`Saved ${product.name} for later`)};
 const openQuickView=product=>{setSuggestOpen(false);setActiveSuggest(-1);setQuickId(product._id);setRecent(current=>[product._id,...current.filter(id=>id!==product._id)].slice(0,12))};
 const addKit=kit=>{if(kit.allIn){setDrawerOpen(true);return}const previous=basket;const fresh=kit.products.filter(product=>!basket[product._id]);setBasket(current=>{const next={...current};fresh.forEach(product=>{next[product._id]=1});return next});notify(`Added ${fresh.length} ${fresh.length===1?"item":"items"} from ${kit.title}`,{label:"Undo",run:()=>setBasket(previous)})};
 const clearBasket=()=>{const previous=basket;setBasket({});notify("Your basket is empty now",{label:"Undo",run:()=>setBasket(previous)})};
 const clearFilters=()=>{setSearch("");setCategory("All");setPriceRange("any");setOnOffer(false);setInStockOnly(false);setSavedOnly(false)};
 const rememberSearch=term=>{const value=term.trim();if(value.length<2)return;setRecentSearches(current=>[value,...current.filter(item=>item.toLowerCase()!==value.toLowerCase())].slice(0,5))};
 const runSearch=term=>{setSearch(term);rememberSearch(term);setSuggestOpen(false);setActiveSuggest(-1);requestAnimationFrame(()=>scrollToId("mart-shop"))};
 const submitSearch=event=>{event.preventDefault();if(activeSuggest>=0&&suggestions[activeSuggest]){openQuickView(suggestions[activeSuggest]);return}rememberSearch(search);setSuggestOpen(false);searchRef.current?.blur();scrollToId("mart-shop")};
 const onSearchKey=event=>{if(event.key==="ArrowDown"&&suggestions.length){event.preventDefault();setSuggestOpen(true);setActiveSuggest(index=>(index+1)%suggestions.length)}else if(event.key==="ArrowUp"&&suggestions.length){event.preventDefault();setActiveSuggest(index=>index<=0?suggestions.length-1:index-1)}else if(event.key==="Escape"){setSuggestOpen(false);setActiveSuggest(-1)}};
 const SpeechRecognitionApi=typeof window!=="undefined"?window.SpeechRecognition||window.webkitSpeechRecognition:null;
 const toggleVoice=()=>{if(!SpeechRecognitionApi)return;if(recognitionRef.current){recognitionRef.current.stop();return}const recognition=new SpeechRecognitionApi();recognition.lang="en-IN";recognition.interimResults=true;recognition.maxAlternatives=1;recognition.onresult=event=>{const heard=[...event.results].map(result=>result[0].transcript).join(" ").replace(/[.?!]+$/,"").trim();setSearch(heard);setSuggestOpen(true);setActiveSuggest(-1)};recognition.onerror=event=>{if(event.error!=="aborted"&&event.error!=="no-speech")notify(event.error==="not-allowed"?"Allow microphone access to search by voice.":"Voice search didn't catch that. Please try again.")};recognition.onend=()=>{setListening(false);recognitionRef.current=null};recognitionRef.current=recognition;setListening(true);searchRef.current?.focus();try{recognition.start()}catch{setListening(false);recognitionRef.current=null}};
 const moveVisual=event=>{if(event.pointerType==="touch"||prefersReducedMotion())return;const element=visualRef.current;if(!element)return;const rect=element.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width-.5,y=(event.clientY-rect.top)/rect.height-.5;cancelAnimationFrame(parallaxFrame.current);parallaxFrame.current=requestAnimationFrame(()=>{element.style.setProperty("--px",x.toFixed(3));element.style.setProperty("--py",y.toFixed(3))})};
 const resetVisual=()=>{const element=visualRef.current;if(!element)return;cancelAnimationFrame(parallaxFrame.current);element.style.setProperty("--px","0");element.style.setProperty("--py","0")};
 const scrollRail=(id,direction)=>{const rail=document.querySelector(`[data-rail="${id}"]`);rail?.scrollBy({left:direction*Math.max(240,rail.clientWidth*.8),behavior:prefersReducedMotion()?"auto":"smooth"})};
 const showCheckout=()=>{setDrawerOpen(false);setCheckoutOpen(true);window.scrollTo({top:0,behavior:"smooth"})};

 // One modal layer at a time: Escape closes it, the page behind stops scrolling, focus returns afterwards.
 const overlay=quickProduct?"quick":drawerOpen?"drawer":filtersOpen?"filters":null;
 useEffect(()=>{if(!overlay)return;const previous=document.activeElement;const body=document.body;const prior=body.style.overflow;body.style.overflow="hidden";document.querySelector("[data-im-dialog]")?.focus({preventScroll:true});const onKey=event=>{if(event.key!=="Escape")return;if(overlay==="quick")setQuickId(null);else if(overlay==="drawer")setDrawerOpen(false);else setFiltersOpen(false)};window.addEventListener("keydown",onKey);return ()=>{window.removeEventListener("keydown",onKey);body.style.overflow=prior;if(previous?.focus&&document.contains(previous))previous.focus({preventScroll:true})}},[overlay]);
 useEffect(()=>{const onKey=event=>{if(event.key!=="/"||event.metaKey||event.ctrlKey||event.altKey)return;if(event.target?.closest?.("input,textarea,select,[contenteditable='true']")||document.querySelector("[data-im-dialog]"))return;event.preventDefault();searchRef.current?.focus({preventScroll:true});searchRef.current?.scrollIntoView({block:"center",behavior:prefersReducedMotion()?"auto":"smooth"});setSuggestOpen(true)};window.addEventListener("keydown",onKey);return ()=>window.removeEventListener("keydown",onKey)},[]);

 // "Buy these again" from an order page lands here with the basket open.
 useEffect(()=>{if(routerLocation.state?.openBasket){setDrawerOpen(true);navigate(".",{replace:true,state:null})}},[]);
 if(checkoutOpen&&count>0)return <MartCheckout items={basketItems} basket={basket} products={products} changeQuantity={changeQuantity} onBackToShop={()=>setCheckoutOpen(false)} onRefresh={load} onPlaced={(data,outcome)=>{try{sessionStorage.removeItem("gofoode-mart-checkout");localStorage.setItem("gofoode-mart-basket","{}")}catch{}setBasket({});setCheckoutOpen(false);loadPastOrders();load();navigate(`/instamart/orders/${data._id}`,{state:{justPlaced:true,outcome}})}}/>;

 const renderQty=(product,compact=false)=>{
  const quantity=basket[product._id]||0;
  if(product.stock===0)return <span className="im-soldout">Sold out</span>;
  if(!quantity)return <button type="button" className={`im-add ${compact?"sm":""}`} aria-label={`Add ${product.name} to basket`} onClick={event=>addToBasket(product,event)}>ADD<Plus size={compact?13:15} strokeWidth={2.8}/></button>;
  return <span className={`im-stepper ${compact?"sm":""}`} role="group" aria-label={`${product.name}: ${quantity} in basket`}>
   <button type="button" aria-label={`Remove one ${product.name}`} onClick={()=>changeQuantity(product,quantity-1)}><Minus size={14} strokeWidth={2.8}/></button>
   <b key={quantity}>{quantity}</b>
   <button type="button" aria-label={`Add one more ${product.name}`} disabled={quantity>=martMaxQuantity(product)} onClick={()=>changeQuantity(product,quantity+1)}><Plus size={14} strokeWidth={2.8}/></button>
  </span>;
 };
 const renderCard=(product,index,variant="grid")=>{
  const off=martDiscount(product),isSaved=saved.includes(product._id);
  return <article className={`im-card ${variant} ${product.stock===0?"is-out":""}`} key={`${variant}-${product._id}`} style={{"--i":index%12,"--tint":martLook(product.category).tint}} data-fly-root>
   <div className="im-card-media" onClick={()=>openQuickView(product)}>
    <img data-fly-img src={product.image||imageFallback} alt="" loading="lazy" onError={showImageFallback}/>
    {off>0&&<span className="im-off">{off}%<small>OFF</small></span>}
    {product.stock>0&&product.stock<=10&&<span className="im-low"><Flame size={12}/> Only {product.stock} left</span>}
    <span className="im-peek" aria-hidden="true"><Eye size={14}/> Quick view</span>
   </div>
   <button type="button" className={`im-heart ${isSaved?"on":""}`} aria-pressed={isSaved} aria-label={isSaved?`Remove ${product.name} from saved items`:`Save ${product.name} for later`} onClick={()=>toggleSaved(product)}><Heart size={16} fill={isSaved?"currentColor":"none"}/></button>
   <div className="im-card-body">
    <span className="im-unit">{product.unit}</span>
    <h3><button type="button" onClick={()=>openQuickView(product)}>{product.name}</button></h3>
    {variant!=="rail"&&<p>{product.description}</p>}
    <div className="im-card-foot"><span className="im-price"><strong>{money(product.price)}</strong>{off>0&&<del>{money(product.mrp)}</del>}</span>{renderQty(product,variant==="rail")}</div>
   </div>
  </article>;
 };
 const renderRail=({id,icon,eyebrow,title,text,items})=>items.length>0&&<section className="im-section" id={id} aria-labelledby={`${id}-title`}><div className="im-wrap">
  <div className="im-head" data-reveal><div><span className="im-eyebrow">{icon}{eyebrow}</span><h2 id={`${id}-title`}>{title}</h2>{text&&<p>{text}</p>}</div>
   <div className="im-rail-nav"><button type="button" aria-label={`Scroll ${title} back`} onClick={()=>scrollRail(id,-1)}><ChevronLeft size={18}/></button><button type="button" aria-label={`Scroll ${title} forward`} onClick={()=>scrollRail(id,1)}><ChevronRight size={18}/></button></div>
  </div>
  <div className="im-rail" data-rail={id}>{items.map((product,index)=>renderCard(product,index,"rail"))}</div>
 </div></section>;

 return <><Header/><main className="im-page" ref={rootRef}>
  <section className="im-hero" aria-labelledby="mart-hero-title">
   <div className="im-hero-bg" aria-hidden="true"><span className="im-blob a"/><span className="im-blob b"/><span className="im-dotgrid"/></div>
   <div className="im-wrap im-hero-inner">
    <div className="im-hero-copy">
     <span className="im-pill"><span className="im-live"/>{location?.city?<>Delivering to <b>{location.city}</b></>:"GoFoode Mart · Daily essentials"}</span>
     <h1 id="mart-hero-title">Fresh <span className="hx-sr-only">groceries</span><RotatingWord words={martHeroWords}/><br/>at your doorstep.</h1>
     <p>Fruits, vegetables, dairy and everyday essentials, picked with care and delivered to your door.</p>
     <form className="im-search" role="search" onSubmit={submitSearch} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setSuggestOpen(false);setActiveSuggest(-1)}}}>
      <div className="im-search-box">
       <Search size={20}/>
       <input ref={searchRef} type="search" role="combobox" aria-label="Search groceries" aria-expanded={showSuggest} aria-controls="im-suggest-list" aria-autocomplete="list" aria-activedescendant={showSuggest&&activeSuggest>=0?`im-sg-${activeSuggest}`:undefined} placeholder={listening?"Listening…":"Search milk, fruits, snacks…"} value={search} onChange={event=>{setSearch(event.target.value);setSuggestOpen(true);setActiveSuggest(-1)}} onFocus={()=>setSuggestOpen(true)} onKeyDown={onSearchKey} autoComplete="off"/>
       {search?<button type="button" className="im-icon-btn" aria-label="Clear search" onClick={()=>{setSearch("");searchRef.current?.focus()}}><X size={17}/></button>:<kbd aria-hidden="true">/</kbd>}
       {SpeechRecognitionApi&&<button type="button" className={`im-icon-btn im-mic ${listening?"on":""}`} aria-pressed={listening} aria-label={listening?"Stop voice search":"Search by voice"} onClick={toggleVoice}><Mic size={18}/></button>}
       <button type="submit" className="im-search-go">Search</button>
      </div>
      {showSuggest&&<div className="im-suggest" onMouseDown={event=>event.preventDefault()}>
       {!query&&recentSearches.length>0&&<><div className="im-suggest-head"><h4><History size={13}/> Recent searches</h4><button type="button" className="im-link" onClick={()=>setRecentSearches([])}>Clear</button></div><div className="im-suggest-chips">{recentSearches.map(term=><button type="button" key={term} onClick={()=>runSearch(term)}>{term}</button>)}</div></>}
       {!query&&categories.length>0&&<><h4>Browse categories</h4><div className="im-suggest-chips">{categories.map(entry=><button type="button" key={entry.name} onClick={()=>{setSuggestOpen(false);pickCategory(entry.name)}}><span aria-hidden="true">{martLook(entry.name).emoji}</span> {entry.name}</button>)}</div></>}
       {query&&suggestedCategories.length>0&&<div className="im-suggest-chips">{suggestedCategories.map(entry=><button type="button" key={entry.name} className="cat" onClick={()=>{setSearch("");setSuggestOpen(false);pickCategory(entry.name)}}><span aria-hidden="true">{martLook(entry.name).emoji}</span> All {entry.name} <small>{entry.count}</small></button>)}</div>}
       {query&&(suggestions.length?<><h4>Products</h4><ul id="im-suggest-list" role="listbox" aria-label="Matching products">{suggestions.map((product,index)=><li key={product._id} id={`im-sg-${index}`} role="option" aria-selected={activeSuggest===index} className={`im-sg ${activeSuggest===index?"active":""}`} style={{"--tint":martLook(product.category).tint}} onMouseEnter={()=>setActiveSuggest(index)} onClick={()=>openQuickView(product)} data-fly-root>
         <img data-fly-img src={product.image||imageFallback} alt="" onError={showImageFallback}/>
         <span><b><HighlightMatch text={product.name} query={query}/></b><small>{product.unit} · {money(product.price)}{martDiscount(product)>0&&<em> · {martDiscount(product)}% off</em>}</small></span>
         <span onClick={event=>event.stopPropagation()}>{renderQty(product,true)}</span>
        </li>)}</ul>
        <button type="button" className="im-suggest-all" onClick={()=>runSearch(query)}>See all {searched.length} {searched.length===1?"result":"results"} for “{query}” <ArrowRight size={15}/></button></>
       :<div className="im-suggest-empty"><span aria-hidden="true">🔍</span><p>No products match “{query}”. Try “milk”, “fruit” or browse a category.</p></div>)}
      </div>}
     </form>
     <div className="im-try"><span>Try:</span>{martTrySearches.map(term=><button type="button" key={term} onClick={()=>runSearch(term)}>{term}</button>)}</div>
     {products.length>0&&<ul className="im-hero-facts">
      <li><span><ShoppingBasket size={17}/></span><div><b><CountUp value={products.length}/></b>products</div></li>
      <li><span><LayoutGrid size={17}/></span><div><b><CountUp value={categories.length}/></b>categories</div></li>
      {maxOff>0&&<li><span><BadgePercent size={17}/></span><div><b>Up to <CountUp value={maxOff} suffix="%"/></b>off MRP</div></li>}
     </ul>}
    </div>
    <div className="im-hero-visual" ref={visualRef} onPointerMove={moveVisual} onPointerLeave={resetVisual}>
     <span className="im-hero-glow" aria-hidden="true"/>
     <span className="im-ring r1" aria-hidden="true"/><span className="im-ring r2" aria-hidden="true"/>
     <div className="im-hero-photo"><img src={unsplash("1584473457406-6240486418e9",900)} alt="A mesh bag filled with fresh groceries" onError={showImageFallback}/></div>
     {orbitPicks.length>0&&<div className="im-orbit" aria-hidden="true">{orbitPicks.map((product,index)=><span className="im-orbit-item" key={product._id} style={{"--a":`${index*(360/orbitPicks.length)-90}deg`}}><img src={product.image||imageFallback} alt="" onError={showImageFallback}/></span>)}</div>}
     {heroPicks.map((product,index)=><div className={`im-float f${index}`} key={product._id} data-fly-root>
      <img data-fly-img src={product.image||imageFallback} alt="" onError={showImageFallback}/>
      <span><b>{product.name}</b><small>{money(product.price)} <em>{martDiscount(product)}% off</em></small></span>
      {renderQty(product,true)}
     </div>)}
     <div className="im-sticker" aria-label={`Free delivery on orders above ₹${MART_FREE_DELIVERY}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="im-sticker-path" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs><text><textPath href="#im-sticker-path" textLength="276" lengthAdjust="spacing">FREE DELIVERY • ORDERS ABOVE ₹{MART_FREE_DELIVERY} • </textPath></text></svg>
      <span><Truck size={22}/></span>
     </div>
     <span className="im-emoji e0" aria-hidden="true">🥑</span><span className="im-emoji e1" aria-hidden="true">🍓</span><span className="im-emoji e2" aria-hidden="true">🥕</span><span className="im-emoji e3" aria-hidden="true">🥛</span>
    </div>
   </div>
  </section>

  {stripItems.length>0&&<div className="im-strip-wrap"><div className="im-strip" aria-label="Fresh picks">
   <div className="im-strip-track">{[0,1].map(copy=><div className="im-strip-set" key={copy} aria-hidden={copy===1||undefined}>{stripItems.map(product=><button type="button" key={product._id} tabIndex={copy?-1:0} onClick={()=>openQuickView(product)}><img src={product.image||imageFallback} alt="" loading="lazy" onError={showImageFallback}/><b>{product.name}</b><small>{money(product.price)}</small></button>)}</div>)}</div>
  </div></div>}



  {categories.length>0&&<section className="im-section" id="mart-categories" aria-labelledby="mart-categories-title"><div className="im-wrap">
   <div className="im-head" data-reveal><div><span className="im-eyebrow"><Sparkles size={14}/>Shop by category</span><h2 id="mart-categories-title">What's on your list today?</h2></div></div>
   <div className="im-cats">{categories.map((entry,index)=>{const look=martLook(entry.name);return <button type="button" key={entry.name} className={`im-cat ${category===entry.name?"active":""}`} style={{"--tint":look.tint,"--i":index}} aria-pressed={category===entry.name} onClick={()=>pickCategory(category===entry.name?"All":entry.name)}>
    <span className="im-cat-img"><img src={look.image?unsplash(look.image,240):entry.image||imageFallback} alt="" loading="lazy" onError={showImageFallback}/></span>
    <b>{entry.name}</b><small>{entry.count} {entry.count===1?"item":"items"}{entry.maxOff>0?` · up to ${entry.maxOff}% off`:""}</small>
   </button>})}</div>
  </div></section>}

  {products.length>0&&<section className="im-section" aria-label="Offers"><div className="im-wrap im-promo" data-reveal="zoom">
   <MartCarousel slides={slides}/>
   <div className="im-promo-side">
    <button type="button" className="im-tile" onClick={()=>scrollToId("mart-deals")}><img src={unsplash("1582979512210-99b6a53386f9",700)} alt="" loading="lazy" onError={showImageFallback}/><span><small>Today's savings</small><b>{maxOff>0?`Up to ${maxOff}% off`:"Today's picks"}</b><em>See the deals <ArrowRight size={15}/></em></span></button>
    <button type="button" className="im-tile" onClick={()=>scrollToId("mart-kits")}><img src={unsplash("1543168256-418811576931",700)} alt="" loading="lazy" onError={showImageFallback}/><span><small>One-tap baskets</small><b>Shop a whole list</b><em>Browse kits <ArrowRight size={15}/></em></span></button>
   </div>
  </div></section>}

  {renderRail({id:"mart-again",icon:<RotateCcw size={14}/>,eyebrow:"Buy it again",title:"Your usual favourites",text:"Products from your previous GoFoode Mart orders.",items:buyAgain})}
  {renderRail({id:"mart-deals",icon:<BadgePercent size={14}/>,eyebrow:"Biggest savings",title:"Deals worth grabbing",text:"The largest discounts off MRP across the store right now.",items:deals})}

  {kits.length>0&&<section className="im-section im-band" id="mart-kits" aria-labelledby="mart-kits-title"><div className="im-wrap">
   <div className="im-head" data-reveal><div><span className="im-eyebrow"><Zap size={14}/>Quick kits</span><h2 id="mart-kits-title">Shop a whole list in one tap</h2><p>Hand-picked bundles. Add everything at once, then fine-tune quantities in your basket.</p></div></div>
   <div className="im-kits">{kits.map((kit,index)=><article className="im-kit" key={kit.id} style={{"--i":index}} data-reveal>
    <div className="im-kit-mosaic">{kit.products.slice(0,3).map(product=><img key={product._id} src={product.image||imageFallback} alt="" loading="lazy" onError={showImageFallback}/>)}<span className="im-kit-count">{kit.products.length} items</span></div>
    <div className="im-kit-body">
     <h3>{kit.title}</h3><p>{kit.text}</p>
     <ul className="im-kit-items">{kit.products.map(product=><li key={product._id} className={basket[product._id]?"in":""}>{basket[product._id]?<Check size={12} strokeWidth={3}/>:null}{product.name}</li>)}</ul>
     <div className="im-kit-foot"><span><strong>{money(kit.price)}</strong>{kit.mrp>kit.price&&<del>{money(kit.mrp)}</del>}</span><button type="button" className={`im-kit-add ${kit.allIn?"done":""}`} onClick={()=>addKit(kit)}>{kit.allIn?<><Check size={15} strokeWidth={3}/> In your basket</>:<>Add all <Plus size={15} strokeWidth={2.8}/></>}</button></div>
    </div>
   </article>)}</div>
  </div></section>}

  <section className="im-section im-shop" id="mart-shop" aria-labelledby="mart-shop-title"><div className="im-wrap">
   <div className="im-head" data-reveal><div><span className="im-eyebrow"><ShoppingBasket size={14}/>The everyday shop</span><h2 id="mart-shop-title">{category==="All"?"Fresh picks, ready for you":category}</h2><p>{loading?"Loading products…":`${filtered.length} ${filtered.length===1?"product":"products"}${activeFilters.length?" match your filters":" available today"}`}</p></div></div>
   <div className="im-shop-layout">
    <aside className={`im-filters ${filtersOpen?"open":""}`} aria-label="Product filters" {...(filtersOpen?{"data-im-dialog":"",role:"dialog","aria-modal":"true",tabIndex:-1}:{})}>
     <div className="im-filters-head"><h3><SlidersHorizontal size={17}/> Filters</h3>{activeFilters.length>0&&<button type="button" className="im-link" onClick={clearFilters}>Clear all</button>}<button type="button" className="im-close im-only-sheet" aria-label="Close filters" onClick={()=>setFiltersOpen(false)}><X size={18}/></button></div>
     <fieldset className="im-fieldset"><legend>Category</legend>{["All",...categories.map(entry=>entry.name)].map(name=><label key={name} className={`im-option ${category===name?"on":""}`}><input type="radio" name="im-category" value={name} checked={category===name} onChange={()=>setCategory(name)}/><span className="im-option-icon" aria-hidden="true">{name==="All"?"🛒":martLook(name).emoji}</span><span className="im-option-label">{name==="All"?"All products":name}</span><small>{categoryCount(name)}</small></label>)}</fieldset>
     <fieldset className="im-fieldset"><legend>Price</legend>{martPriceRanges.map(range=><label key={range.id} className={`im-option ${priceRange===range.id?"on":""}`}><input type="radio" name="im-price" value={range.id} checked={priceRange===range.id} onChange={()=>setPriceRange(range.id)}/><span className="im-radio-dot" aria-hidden="true"/><span className="im-option-label">{range.label}</span><small>{priceCount(range.test)}</small></label>)}</fieldset>
     <fieldset className="im-fieldset"><legend>Show only</legend>
      <label className="im-switch"><input type="checkbox" checked={onOffer} onChange={event=>setOnOffer(event.target.checked)}/><span aria-hidden="true"/>On offer · 10%+ off</label>
      <label className="im-switch"><input type="checkbox" checked={inStockOnly} onChange={event=>setInStockOnly(event.target.checked)}/><span aria-hidden="true"/>In stock only</label>
      <label className="im-switch"><input type="checkbox" checked={savedOnly} onChange={event=>setSavedOnly(event.target.checked)}/><span aria-hidden="true"/>Saved items ({saved.length})</label>
     </fieldset>
     <button type="button" className="btn btn-primary btn-full im-only-sheet" onClick={()=>setFiltersOpen(false)}>Show {filtered.length} {filtered.length===1?"product":"products"}</button>
    </aside>
    {filtersOpen&&<div className="im-sheet-backdrop" aria-hidden="true" onClick={()=>setFiltersOpen(false)}/>}
    <div className="im-results">
     <div className="im-toolbar">
      <button type="button" className="im-filter-btn" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal size={16}/> Filters{activeFilters.length>0&&<b>{activeFilters.length}</b>}</button>
      <div className="im-active">{activeFilters.length?activeFilters.map(filter=><button type="button" key={filter.key} aria-label={`Remove filter ${filter.label}`} onClick={filter.clear}>{filter.label}<X size={13}/></button>):<span className="im-hint">Tip: press <kbd>/</kbd> anywhere to search</span>}</div>
      <label className="im-sort"><span>Sort</span><select value={sort} aria-label="Sort products" onChange={event=>setSort(event.target.value)}>{martSorts.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <div className="im-view" role="group" aria-label="Product layout"><button type="button" aria-label="Grid layout" aria-pressed={view==="grid"} className={view==="grid"?"on":""} onClick={()=>setView("grid")}><LayoutGrid size={17}/></button><button type="button" aria-label="List layout" aria-pressed={view==="list"} className={view==="list"?"on":""} onClick={()=>setView("list")}><List size={17}/></button></div>
     </div>
     {loadError?<div className="im-empty"><span className="im-empty-art" aria-hidden="true">📦</span><h3>The shelves didn't load</h3><p>{loadError}</p><button type="button" className="btn btn-primary" onClick={()=>{setLoading(true);load()}}><RefreshCw size={15}/> Try again</button></div>
     :loading?<div className="im-grid">{Array.from({length:8},(_,index)=><div className="im-card im-skeleton" key={index} aria-hidden="true"><span/><i/><i/><i/></div>)}</div>
     :filtered.length===0?<div className="im-empty"><span className="im-empty-art" aria-hidden="true">{savedOnly&&!saved.length?"💚":"🧺"}</span><h3>{savedOnly&&!saved.length?"Nothing saved yet":"No products match"}</h3><p>{savedOnly&&!saved.length?"Tap the heart on any product to keep it here for later.":"Try another search, or clear a filter to see more of the store."}</p><button type="button" className="btn btn-primary" onClick={clearFilters}>Show all products</button></div>
     :<><div className={`im-grid ${view==="list"?"list":""}`}>{filtered.slice(0,limit).map((product,index)=>renderCard(product,index,view==="list"?"row":"grid"))}</div>
      {filtered.length>limit&&<div className="im-more"><span>Showing {limit} of {filtered.length} products</span><i><i style={{width:`${limit/filtered.length*100}%`}}/></i><button type="button" className="btn btn-outline" onClick={()=>setLimit(current=>current+12)}>Show more products <ChevronRight size={16}/></button></div>}</>}
    </div>
   </div>
  </div></section>

  {renderRail({id:"mart-recent",icon:<Eye size={14}/>,eyebrow:"Recently viewed",title:"Pick up where you left off",items:recentlyViewed})}

  <section className="im-section" aria-labelledby="mart-promise-title"><div className="im-wrap">
   <div className="im-head" data-reveal><div><span className="im-eyebrow"><CheckCircle2 size={14}/>The GoFoode Mart promise</span><h2 id="mart-promise-title">Groceries without the hassle</h2></div>{user?.role==="customer"&&<Link to="/customer/grocery-orders" className="btn btn-outline">Your grocery orders <ArrowRight size={15}/></Link>}</div>
   <div className="im-promises">{martPromises.map(({icon:Icon,tone,title,text},index)=><article className={`im-promise ${tone}`} key={title} style={{"--i":index,"--d":`${index*90}ms`}} data-reveal><span><Icon size={24}/></span><b>{title}</b><p>{text}</p></article>)}</div>
  </div></section>
 </main>

 {basketItems.length>0&&!drawerOpen&&<div className="im-basketbar" role="region" aria-label="Basket summary">
  <button type="button" className="im-basketbar-main" onClick={()=>setDrawerOpen(true)} aria-label={`Open basket: ${count} items, ${money(subtotal)}`}>
   <span className="im-basketbar-icon" data-basket-target><ShoppingBasket size={21}/><b key={count}>{count}</b></span>
   <span className="im-basketbar-copy"><b>{count} {count===1?"item":"items"} · {money(subtotal)}</b><small>{remaining>0?`Add ${money(remaining)} more for free delivery`:"🎉 Free delivery unlocked"}</small><span className="im-meter"><i style={{width:`${freeProgress}%`}}/></span></span>
  </button>
  <button type="button" className="im-basketbar-cta" onClick={showCheckout}>Checkout <ArrowRight size={16}/></button>
 </div>}

 {drawerOpen&&<div className="im-overlay drawer" onClick={event=>{if(event.target===event.currentTarget)setDrawerOpen(false)}}>
  <aside className="im-drawer" role="dialog" aria-modal="true" aria-labelledby="im-drawer-title" tabIndex={-1} data-im-dialog>
   <header><span className="im-drawer-icon" data-basket-target><ShoppingBasket size={20}/></span><div><h2 id="im-drawer-title">Your basket</h2><small>{count} {count===1?"item":"items"} · {money(subtotal)}</small></div><button type="button" className="im-close" aria-label="Close basket" onClick={()=>setDrawerOpen(false)}><X size={18}/></button></header>
   <div className={`im-free ${remaining===0?"done":""}`}><p>{remaining>0?<>Add <b>{money(remaining)}</b> more for <b>free delivery</b></>:<>🎉 You've unlocked <b>free delivery</b></>}</p><div className="im-free-bar"><i style={{width:`${freeProgress}%`}}/></div></div>
   <div className="im-drawer-scroll">
    {basketItems.length===0?<div className="im-drawer-empty"><span className="im-empty-art" aria-hidden="true">🧺</span><h3>Your basket is empty</h3><p>Add a few essentials and they'll show up here.</p></div>:<>
     <ul className="im-drawer-items">{basketItems.map(product=><li key={product._id} style={{"--tint":martLook(product.category).tint}}>
      <img src={product.image||imageFallback} alt="" onError={showImageFallback}/>
      <span><b>{product.name}</b><small>{product.unit} · {money(product.price)} each</small></span>
      <span className="im-line-end"><strong>{money(product.price*basket[product._id])}</strong>{renderQty(product,true)}</span>
     </li>)}</ul>
     {savings>0&&<p className="im-drawer-savings"><BadgePercent size={17}/> You're saving <b>{money(savings)}</b> on MRP</p>}
     {topUps.length>0&&<div className="im-topups"><h3>Top up to unlock free delivery</h3><div>{topUps.map(product=><div className="im-topup" key={product._id} style={{"--tint":martLook(product.category).tint}} data-fly-root><img data-fly-img src={product.image||imageFallback} alt="" onError={showImageFallback}/><b>{product.name}</b><small>{product.unit} · {money(product.price)}</small>{renderQty(product,true)}</div>)}</div></div>}
     <div className="im-bill"><div><span>Items subtotal</span><b>{money(subtotal)}</b></div>{savings>0&&<div className="save"><span>Savings on MRP</span><b>−{money(savings)}</b></div>}<div><span>Delivery fee</span><b>{deliveryFee===0?"FREE":money(deliveryFee)}</b></div><div className="total"><span>To pay</span><b>{money(total)}</b></div></div>
    </>}
   </div>
   <footer>{basketItems.length>0?<><button type="button" className="im-clear" onClick={clearBasket}><Trash2 size={15}/> Clear</button><button type="button" className="btn btn-primary" onClick={showCheckout}>Checkout · {money(total)} <ArrowRight size={16}/></button></>:<button type="button" className="btn btn-primary btn-full" onClick={()=>{setDrawerOpen(false);scrollToId("mart-shop")}}>Start shopping</button>}</footer>
  </aside>
 </div>}

 {quickProduct&&<div className="im-overlay" onClick={event=>{if(event.target===event.currentTarget)setQuickId(null)}}>
  <div className="im-modal" role="dialog" aria-modal="true" aria-labelledby="im-qv-title" tabIndex={-1} data-im-dialog data-fly-root key={quickProduct._id}>
   <button type="button" className="im-close" aria-label="Close product details" onClick={()=>setQuickId(null)}><X size={18}/></button>
   <div className="im-qv-media" style={{"--tint":martLook(quickProduct.category).tint}}><img data-fly-img src={quickProduct.image||imageFallback} alt={quickProduct.name} onError={showImageFallback}/>{martDiscount(quickProduct)>0&&<span className="im-off">{martDiscount(quickProduct)}%<small>OFF</small></span>}</div>
   <div className="im-qv-copy">
    <span className="im-eyebrow">{martLook(quickProduct.category).emoji} {quickProduct.category} · {quickProduct.unit}</span>
    <h2 id="im-qv-title">{quickProduct.name}</h2>
    {quickProduct.description&&<p>{quickProduct.description}</p>}
    <div className="im-qv-price"><strong>{money(quickProduct.price)}</strong>{martDiscount(quickProduct)>0&&<><del>MRP {money(quickProduct.mrp)}</del><span className="im-save">You save {money(quickProduct.mrp-quickProduct.price)}</span></>}</div>
    <span className={`im-stock ${quickProduct.stock===0?"out":quickProduct.stock<=10?"low":""}`}>{quickProduct.stock===0?"Out of stock right now":quickProduct.stock<=10?`Hurry, only ${quickProduct.stock} left`:"In stock"}</span>
    <div className="im-qv-actions">{renderQty(quickProduct)}<button type="button" className={`im-save-btn ${saved.includes(quickProduct._id)?"on":""}`} aria-pressed={saved.includes(quickProduct._id)} onClick={()=>toggleSaved(quickProduct)}><Heart size={17} fill={saved.includes(quickProduct._id)?"currentColor":"none"}/>{saved.includes(quickProduct._id)?"Saved":"Save"}</button></div>
    {basket[quickProduct._id]>0&&<button type="button" className="im-link im-qv-basket" onClick={()=>{setQuickId(null);setDrawerOpen(true)}}>View basket · {count} {count===1?"item":"items"} <ArrowRight size={14}/></button>}
    <ul className="im-qv-perks"><li><Truck size={17}/> Free delivery on orders above {money(MART_FREE_DELIVERY)}</li><li><Leaf size={17}/> Freshness guaranteed</li><li><Wallet size={17}/> Pay with cash on delivery</li></ul>
    {similar.length>0&&<div className="im-qv-similar"><h3>More from {quickProduct.category}</h3><div>{similar.map(product=><button type="button" key={product._id} onClick={()=>openQuickView(product)}><img src={product.image||imageFallback} alt="" onError={showImageFallback}/><b>{product.name}</b><small>{money(product.price)}</small></button>)}</div></div>}
   </div>
  </div>
 </div>}

 <div className="im-toast" role="status" aria-live="polite">{toast&&<div className="im-toast-card" key={toast.id}><CheckCircle2 size={18}/><span>{toast.text}</span>{toast.action&&<button type="button" onClick={()=>{toast.action.run();setToast(null)}}>{toast.action.label}</button>}</div>}</div>
 <Footer/></>;
}
// Unknown links get a helpful page instead of silently landing on the homepage.
function NotFoundPage(){
  const { pathname } = useLocation();
  return <><Header/><main className="nf-page">
    <div className="nf-art" aria-hidden="true"><img src={photos.feast} alt=""/><span>404</span></div>
    <div className="nf-copy">
      <span className="fd-eyebrow"><MapPin size={14}/> Page not found</span>
      <h1>This plate is empty.</h1>
      <p>We couldn't find <code>{pathname}</code>. It may have moved, or the link has a typo.</p>
      <div className="nf-actions"><Link className="btn btn-primary" to="/">Back to home <ArrowRight size={16}/></Link><Link className="btn btn-outline" to="/food">Browse food</Link></div>
      <nav className="nf-links" aria-label="Popular pages">{[["Food delivery","/food"],["Instamart","/instamart"],["Dineout","/dineout"],["Offers","/offers"],["Rewards","/rewards"]].map(([label,to])=><Link key={to} to={to}>{label}<ArrowRight size={13}/></Link>)}</nav>
    </div>
  </main><Footer/></>;
}
// The marketplace tabs live in ./tabs; these wrappers add the shared header, footer and support chat.
function DineoutPage(){ return <><Header/><DineoutView/><Footer/><ChatWidget/></>; }
function GeniePage(){ return <><Header/><GenieView MapView={GoogleMap}/><Footer/><ChatWidget/></>; }
function ExperiencesPage(){ return <><Header/><ExperiencesView/><Footer/><ChatWidget/></>; }
function OffersPage(){ return <><Header/><OffersView/><Footer/><ChatWidget/></>; }
function PlusPage(){ return <><Header/><PlusView/><Footer/><ChatWidget/></>; }
function DashboardRouter() {
  const { user } = useAuth();
  if(user?.role==="admin") return <Navigate to="/admin" replace/>;
  if(user?.role==="restaurant_owner") return <Navigate to="/restaurant" replace/>;
  if(user?.role==="delivery_partner") return <Navigate to="/delivery" replace/>;
  return <Navigate to="/customer" replace/>;
}
export default function App() {
  return <><InstallPrompt/><Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/food" element={<FoodDeliveryPage/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/restaurants/:id" element={<RestaurantDetail/>}/>
    <Route path="/orders/:id" element={<Protected roles={["customer"]}><OrderTrackingPage/></Protected>}/>
    <Route path="/cart" element={<Protected roles={["customer"]}><CartPage/></Protected>}/>
    <Route path="/instamart" element={<InstamartPage/>}/>
    <Route path="/dineout" element={<DineoutPage/>}/>
    <Route path="/offers" element={<OffersPage/>}/>
    <Route path="/rewards" element={<><Header/><RewardsPage/><Footer/><ChatWidget/></>}/>
    <Route path="/genie" element={<GeniePage/>}/>
    <Route path="/experiences" element={<ExperiencesPage/>}/>
    <Route path="/plus" element={<PlusPage/>}/>
    <Route path="/dashboard" element={<Protected><DashboardRouter/></Protected>}/>
    <Route path="/profile" element={<Protected><ProfilePage/></Protected>}/>
    <Route path="/customer" element={<Protected roles={["customer"]}><CustomerDashboard/></Protected>}/>
    <Route path="/customer/orders" element={<Protected roles={["customer"]}><CustomerOrders/></Protected>}/>
    <Route path="/customer/grocery-orders" element={<Protected roles={["customer"]}><CustomerGroceryOrders/></Protected>}/>
    <Route path="/instamart/orders/:id" element={<Protected roles={["customer"]}><><Header/><MartOrderView/><Footer/></></Protected>}/>
    <Route path="/customer/notifications" element={<Protected roles={["customer"]}><NotificationsPage/></Protected>}/>
    <Route path="/customer/favourites" element={<Protected roles={["customer"]}><FavoritesPage/></Protected>}/>
    <Route path="/customer/addresses" element={<Protected roles={["customer"]}><CustomerAddresses/></Protected>}/>
    <Route path="/customer/reservations" element={<Protected roles={["customer"]}><CustomerReservations/></Protected>}/>
    <Route path="/customer/membership" element={<Protected roles={["customer"]}><CustomerMembership/></Protected>}/>
    <Route path="/restaurant" element={<Protected roles={["restaurant_owner"]}><OwnerDashboard/></Protected>}/>
    <Route path="/restaurant/places" element={<Protected roles={["restaurant_owner"]}><OwnerPlaces/></Protected>}/>
    <Route path="/restaurant/availability" element={<Protected roles={["restaurant_owner"]}><OwnerAvailability/></Protected>}/>
    <Route path="/restaurant/reviews" element={<Protected roles={["restaurant_owner"]}><OwnerReviews/></Protected>}/>
    <Route path="/restaurant/menu" element={<Protected roles={["restaurant_owner"]}><OwnerMenu/></Protected>}/>
    <Route path="/restaurant/orders" element={<Protected roles={["restaurant_owner"]}><OwnerOrders/></Protected>}/>
    <Route path="/restaurant/reservations" element={<Protected roles={["restaurant_owner"]}><OwnerReservations/></Protected>}/>
    <Route path="/delivery" element={<Protected roles={["delivery_partner"]}><DeliveryDashboard/></Protected>}/>
    <Route path="/delivery/jobs" element={<Protected roles={["delivery_partner"]}><DeliveryJobs/></Protected>}/>
    <Route path="/delivery/earnings" element={<Protected roles={["delivery_partner"]}><DeliveryEarnings/></Protected>}/>
    <Route path="/delivery/availability" element={<Protected roles={["delivery_partner"]}><DeliveryAvailability/></Protected>}/>
    <Route path="/delivery/history" element={<Protected roles={["delivery_partner"]}><DeliveryHistory/></Protected>}/>
    <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard/></Protected>}/>
    {["users","restaurants","orders","transactions","reviews","support","grocery-orders","reservations","activity"].map(t=><Route key={t} path={`/admin/${t}`} element={<Protected roles={["admin"]}><AdminTablePage type={t}/></Protected>}/>)}
    <Route path="*" element={<NotFoundPage/>}/>
  </Routes></>;
}
