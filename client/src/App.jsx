import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { Search, ShoppingBag, MapPin, Star, Clock, ArrowRight, Utensils, Menu, X, LogOut, LayoutDashboard, Store, Bike, Users, ClipboardList, Bell, Plus, Minus, CheckCircle2, TrendingUp, Package, Wallet, ChefHat, Settings, ShieldCheck, Heart, ShoppingBasket, TicketPercent, CalendarDays, Crown, Trash2, PackageOpen, RefreshCw, UserRound, Mail, Phone, MessageCircle, Send, Power, History, Activity, CreditCard, LayoutGrid, List, Truck } from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";

const money = n => `₹${Number(n || 0).toFixed(0)}`;
const imageFallback = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800";
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
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
  if (loading) return <div className="loading">Loading GoFoode...</div>;
  if (!user) return <Navigate to="/login" replace />;
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
function Header() {
  const { user, logout, location, locationStatus, locationError, requestLocation, saveManualLocation } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [manualLocation, setManualLocation] = useState({ area: location?.area || "", city: location?.city || "", state: location?.state || "", postalCode: location?.postalCode || "" });
  const [manualLocationError, setManualLocationError] = useState("");
  const chooseLocation = event => {
    event.preventDefault();
    setManualLocationError("");
    try {
      if (!saveManualLocation(manualLocation)) {
        setManualLocationError("Enter a city to set your delivery location.");
        return;
      }
      setLocationOpen(false);
    } catch (error) {
      setManualLocationError(error.message || "Could not save your delivery location.");
    }
  };
  return <><div className="announcement"><span>✦</span> Fresh cravings, happy moments — delivered to your door <span className="announcement-link">Explore today’s picks</span></div>
  <header className="topbar">
    <Brand />
    <div className="location-control">
      <button className="location-pill" type="button" aria-expanded={locationOpen} aria-controls="location-panel" onClick={()=>{setManualLocation({area:location?.area||"",city:location?.city||"",state:location?.state||"",postalCode:location?.postalCode||""});setManualLocationError("");setLocationOpen(value=>!value)}} title={locationError || "Choose your delivery location"}>
        <MapPin size={16}/><span>Delivering to</span><b>{locationStatus==="loading"||locationStatus==="retrying"?"Locating…":location?.label || "Choose location"}</b><RefreshCw size={12}/>
      </button>
      {locationOpen&&<section className="location-panel" id="location-panel" aria-label="Choose delivery location">
        <div className="location-panel-heading"><div><b>Set your delivery location</b><small>Use GPS or enter your area manually.</small></div><button type="button" className="icon-button" aria-label="Close location panel" onClick={()=>setLocationOpen(false)}><X size={17}/></button></div>
        <button type="button" className="btn btn-outline btn-full location-gps-button" disabled={locationStatus==="loading"||locationStatus==="retrying"} onClick={async()=>{const result=await requestLocation();if(result)setLocationOpen(false)}}>
          <MapPin size={15}/>{locationStatus==="loading"||locationStatus==="retrying"?"Finding your location…":"Use my current location"}
        </button>
        {locationError&&<p className="location-panel-error" role="alert">{locationError}</p>}
        <form className="location-manual-form" onSubmit={chooseLocation}>
          <label>Area or neighbourhood<input value={manualLocation.area} onChange={event=>setManualLocation({...manualLocation,area:event.target.value})} placeholder="Sector 15"/></label>
          <label>City<input required value={manualLocation.city} onChange={event=>setManualLocation({...manualLocation,city:event.target.value})} placeholder="Faridabad"/></label>
          <div className="location-manual-row"><label>State<input value={manualLocation.state} onChange={event=>setManualLocation({...manualLocation,state:event.target.value})} placeholder="Haryana"/></label><label>PIN code<input inputMode="numeric" value={manualLocation.postalCode} onChange={event=>setManualLocation({...manualLocation,postalCode:event.target.value})} placeholder="Optional"/></label></div>
          {manualLocationError&&<p className="location-panel-error" role="alert">{manualLocationError}</p>}
          <button type="submit" className="btn btn-primary btn-full">Save delivery location</button>
        </form>
      </section>}
    </div>
    <nav className={mobile ? "nav-links open" : "nav-links"}>
      <Link to="/">Home</Link><a href="/#popular-dishes">Food</a><Link to="/instamart">Instamart</Link><Link to="/dineout">Dineout</Link><Link to="/genie">Pickup & drop</Link><Link to="/experiences">Events</Link><Link to="/offers">Offers</Link>
    </nav>
    <div className="top-actions">
      {user ? <><Link className="cart-nav" to="/cart"><ShoppingBag size={18}/><span>Cart</span></Link>{user.role==="customer"&&<Link className="text-button track-nav" to="/customer/orders"><MapPin size={14}/> Track order</Link>}<Link className="text-button" to="/dashboard">Dashboard</Link><Link className="top-profile" to="/profile" aria-label="Profile"><span className="top-profile-avatar">{user.profileImage?<img src={user.profileImage} alt=""/>:user.name?.[0]?.toUpperCase()}</span><span>Profile</span></Link><button className="icon-button" title="Logout" onClick={logout}><LogOut size={18}/></button></> : <><Link className="text-button" to="/login">Log in</Link><Link className="btn btn-primary btn-small" to="/register">Get started <ArrowRight size={14}/></Link></>}
      <button className="mobile-toggle" onClick={() => setMobile(!mobile)}>{mobile ? <X/> : <Menu/>}</button>
    </div>
  </header></>;
}
function RestaurantCard({ restaurant }) {
  return <Link to={`/restaurants/${restaurant._id}`} className="restaurant-card">
    <div className="restaurant-photo"><img src={restaurant.coverImage || imageFallback} alt={restaurant.name} onError={e => e.currentTarget.src = imageFallback}/><span className="photo-tag">POPULAR</span></div>
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
function Home() {
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
  useEffect(() => {
    api.get("/restaurants").then(r => setRestaurants(r.data)).catch(() => setRestaurantError("Restaurants could not be loaded. Please try again later.")).finally(() => setLoading(false));
    api.get("/food-items").then(r => setDishes(r.data)).catch(() => setDishError("Popular dishes could not be loaded. Please try again later.")).finally(() => setDishLoading(false));
    api.get("/reviews/featured").then(r => setReviews(r.data)).catch(() => setReviewError("Customer feedback could not be loaded right now."));
  }, []);
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
  return <><Header/><main className="gofoode-home">
    <section className="hero gofoode-hero">
      <div className="hero-copy">
        <span className="eyebrow"><span className="eyebrow-dot"/> GOOD FOOD. GREAT MOOD.</span>
        <h1>Crave it.<br/>Tap it.<br/><em>Love every bite.</em></h1>
        <p>Your city’s favourite kitchens, delicious discoveries and feel-good food moments — all delivered fresh to your doorstep.</p>
        <div className="hero-search"><MapPin size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes, restaurants or cuisines..."/><a href="#restaurants" className="btn btn-primary">Find food <ArrowRight size={16}/></a></div>
        <div className="hero-proof"><div className="avatar-stack"><i>🍔</i><i>🍕</i><i>🥗</i></div><span><b>Made for your cravings</b><br/>Local kitchens, one happy place</span><span className="proof-rating"><Star size={14} fill="currentColor"/> Loved by foodies</span></div>
        <div className="hero-perks"><span><CheckCircle2 size={15}/> Easy ordering</span><span><CheckCircle2 size={15}/> Freshly prepared</span><span><CheckCircle2 size={15}/> Doorstep delivery</span></div>
      </div>
      <div className="hero-art gofoode-hero-art">
        <img src="/gofoode-sunrise-delivery.png" alt="GoFoode delivery partner bringing a food order to a customer"/>
        <div className="hero-sticker gofoode-sticker"><span>GOOD FOOD</span><b>GOOD MOOD!</b><small>EVERY SINGLE DAY</small></div>
        <div className="floating-note"><span className="note-icon">✦</span><div><b>Happiness is on the way</b><small>Fresh food. Fast delivery.</small></div></div>
        <div className="hero-delivery-card"><span className="delivery-emoji">🛵</span><div><b>At your doorstep</b><small>Track every tasty moment</small></div><span className="live-dot"/></div>
      </div>
    </section>
    <section className="trust-strip">
      <div><strong>01</strong><span><b>Plenty of choice</b><small>Explore local favourites</small></span></div>
      <div><strong>02</strong><span><b>Simple ordering</b><small>Your meal in a few taps</small></span></div>
      <div><strong>03</strong><span><b>Every bite matters</b><small>Made fresh, delivered with care</small></span></div>
    </section>
    <section className="service-hub">
      <div className="service-hub-head"><span className="eyebrow">ONE APP. MORE CONVENIENCE.</span><h2>What are we helping with today?</h2><p>More than a meal — your everyday convenience, all in one place.</p></div>
      <div className="service-hub-grid">
        <Link to="/#popular-dishes" className="service-card service-food"><span className="service-icon">🍽️</span><div><b>Food delivery</b><small>Restaurant favourites to your door</small><strong>Explore food <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1547592180-85f173990554?w=500" alt="Food delivery"/></Link>
        <Link to="/instamart" className="service-card service-grocery"><span className="service-icon">🛒</span><div><b>GoFoode Mart</b><small>Groceries and daily essentials</small><strong>Shop essentials <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=500" alt="Fresh groceries"/></Link>
        <Link to="/dineout" className="service-card service-dine"><span className="service-icon">🥂</span><div><b>Dineout</b><small>Discover restaurants and book tables</small><strong>Find a table <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500" alt="Restaurant dining"/></Link>
        <Link to="/genie" className="service-card service-genie"><span className="service-icon">📦</span><div><b>GoFoode Genie</b><small>Send a parcel across your city</small><strong>Request pickup <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=500" alt="Parcel delivery"/></Link>
        <Link to="/experiences" className="service-card service-scenes"><span className="service-icon">🎟️</span><div><b>Experiences</b><small>Book food events and local experiences</small><strong>Explore events <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=500" alt="Event experience"/></Link>
        <Link to="/offers" className="service-card service-offers"><span className="service-icon">🎁</span><div><b>Offers &amp; rewards</b><small>Find coupon codes and savings for your next order</small><strong>Browse offers <ArrowRight size={14}/></strong></div><img src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500" alt="Special food offers"/></Link>
      </div>
    </section>
    <section className="section category-section">
      <div className="section-head"><div><span className="eyebrow">WHAT ARE YOU IN THE MOOD FOR?</span><h2>Pick your kind of delicious<span className="orange">.</span></h2><p>From comfort food to something a little adventurous.</p></div></div>
      <div className="category-tiles">{[["🍛","Indian","Rich & comforting"],["🍕","Pizza","Cheesy favourites"],["🍔","Burgers","Big, juicy bites"],["🥡","Chinese","Wok-tossed goodness"],["🥤","Cold Drinks","Cool sips and refreshers"],["🥗","Healthy","Fresh & vibrant"],["🍰","Desserts","A sweet finish"]].map(([emoji,name,desc])=><button className={category===name?"category-tile selected":"category-tile"} key={name} aria-pressed={category===name} onClick={()=>{setCategory(category===name?"All":name);document.getElementById("popular-dishes")?.scrollIntoView({behavior:"smooth"})}}><span>{emoji}</span><b>{name}</b><small>{desc}</small></button>)}</div>
    </section>
    <section className="section featured-dishes-section" id="popular-dishes">
      <div className="section-head"><div><span className="eyebrow">MADE FRESH BY LOCAL KITCHENS</span><h2>Food delivery for every craving<span className="orange">.</span></h2><p>Explore local menus, discover new favourites and order a freshly prepared meal to your door.</p></div><span className="muted">{filteredDishes.length} dishes</span></div>
      <div className="food-delivery-details">
        <div className="food-delivery-intro"><span className="food-delivery-mark"><Utensils size={19}/></span><div><b>A little more than takeout</b><p>Choose from real restaurant menus with dish descriptions, ingredients, dietary details and preparation times.</p></div></div>
        <div className="food-delivery-points"><article><span><ChefHat size={16}/></span><b>Made to order</b><small>Prepared by local kitchens</small></article><article><span><Clock size={16}/></span><b>Know the wait</b><small>See prep time before ordering</small></article><article><span><MapPin size={16}/></span><b>Follow your order</b><small>Get updates as it comes to you</small></article></div>
        <a className="food-delivery-link" href="#restaurants">Meet local restaurants <ArrowRight size={14}/></a>
      </div>
      {dishLoading ? <div className="loading">Finding dishes for you...</div> : dishError ? <div className="empty-state"><Utensils size={30}/><p>{dishError}</p></div> : featuredDishes.length ? <><div className="featured-dish-grid">{featuredDishes.map(dish=><article className="featured-dish-card" key={dish._id}>
        <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-image"><img src={dish.image||imageFallback} alt={dish.name} loading="lazy"/>{dish.isBestseller&&<span className="bestseller-tag">Bestseller</span>}</Link>
        <div className="featured-dish-copy"><div className="food-tags"><span className={dish.foodType==="non-veg"?"food-type nonveg":"food-type"}>{dish.foodType==="non-veg"?"● Non-veg":dish.foodType==="vegan"?"● Vegan":"● Vegetarian"}</span><span className="featured-dish-price">{money(dish.discountPrice??dish.price)}</span></div>
          <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-name">{dish.name}</Link>
          <p>{dish.description||"Freshly prepared by a local kitchen."}</p>
          <small className="featured-dish-restaurant">{dish.restaurant.name} · {dish.restaurant.rating||"New"} ★</small>
          <div className="featured-dish-meta"><span><Clock size={13}/>{dish.preparationTime||20} min</span>{dish.calories&&<span>{dish.calories} kcal</span>}{dish.portionSize&&<span>{dish.portionSize}</span>}</div>
          {dish.ingredients?.length>0&&<small className="featured-dish-detail"><b>Ingredients:</b> {dish.ingredients.join(", ")}</small>}
          {dish.allergens?.length>0&&<small className="featured-dish-detail allergen-note"><b>Allergens:</b> {dish.allergens.join(", ")}</small>}
          <Link to={`/restaurants/${dish.restaurant._id}`} className="featured-dish-link">View menu <ArrowRight size={14}/></Link>
        </div>
      </article>)}</div>{filteredDishes.length>featuredDishLimit&&<button type="button" className="btn btn-outline btn-small featured-dishes-toggle" onClick={()=>setShowAllDishes(value=>!value)}>{showAllDishes?"Show fewer dishes":"Show all dishes"} <ArrowRight size={14}/></button>}</> : <div className="empty-state"><Utensils size={30}/><h3>No dishes match this selection yet</h3><p>Try another cuisine or search term, or explore all restaurants while local menus are being updated.</p><button className="btn btn-outline btn-small" onClick={()=>{setSearch("");setCategory("All")}}>Show all dishes</button></div>}
    </section>
    <section className="section restaurants-section" id="restaurants">
      <div className="section-head"><div><span className="eyebrow">HANDPICKED FOR YOUR HUNGER</span><h2>Explore restaurants<span className="orange">.</span></h2><p>Good places. Great plates. Right around your city.</p></div><span className="muted">{filtered.length} places</span></div>
      <div className="filter-row">{categories.map(c=><button key={c} className={category===c?"filter-chip active":"filter-chip"} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      {loading ? <div className="loading">Finding delicious places...</div> : restaurantError ? <div className="empty-state"><Utensils size={34}/><p>{restaurantError}</p></div> : filtered.length ? <div className="restaurant-grid">{filtered.map(r=><RestaurantCard key={r._id} restaurant={r}/>)}</div> : <div className="empty-state"><Utensils size={34}/><h3>No restaurants found just yet</h3><p>Try another cuisine or search term. Restaurant partners can join GoFoode to list their kitchens.</p><Link className="btn btn-primary" to="/register">Join GoFoode <ArrowRight size={15}/></Link></div>}
    </section>
    <section className="offer-banner" id="offers"><div className="offer-copy"><span className="eyebrow">A LITTLE EXTRA JOY</span><h2>Big cravings.<br/><em>Beautifully easy.</em></h2><p>Discover new neighbourhood favourites and make every meal feel like a treat.</p><Link to="/register" className="btn btn-white">Start exploring <ArrowRight size={16}/></Link></div><div className="offer-art"><img src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=900" alt="Delicious grilled food platter"/><span>GOOD FOOD<br/><b>IS ALWAYS</b><br/>A GOOD IDEA</span></div></section>
    <section className="home-about"><div className="home-about-intro"><span className="eyebrow">MORE THAN A MEAL</span><h2>Your everyday plans,<br/><em>made deliciously simple.</em></h2><p>GoFoode brings neighbourhood food, quick grocery top-ups, table bookings and local experiences together in one easy place. Browse at your pace, choose what suits you and follow every order along the way.</p><Link to="/register" className="btn btn-primary">Get started <ArrowRight size={15}/></Link></div><div className="home-about-points"><article><span>01</span><div><b>Local food, made fresh</b><p>Explore independent kitchens, detailed menus and dishes for every kind of craving.</p></div></article><article><span>02</span><div><b>One place for the little things</b><p>Shop daily essentials, request local pickup and discover something fun to do.</p></div></article><article><span>03</span><div><b>Stay in the know</b><p>See order updates and, when a delivery partner shares GPS, follow progress on the map.</p></div></article></div></section>
    <section className="home-community" id="community"><div className="section-head"><div><span className="eyebrow">GOOD FOOD, GOOD PEOPLE</span><h2>Local businesses on GoFoode<span className="orange">.</span></h2><p>Meet neighbourhood kitchens and growing food businesses available on the platform.</p></div><Link to="/#restaurants" className="link-orange">Explore all restaurants <ArrowRight size={14}/></Link></div>{restaurants.length?<div className="partner-strip">{restaurants.slice(0,4).map(restaurant=><Link className="partner-card" key={restaurant._id} to={`/restaurants/${restaurant._id}`}><img src={restaurant.logo||restaurant.coverImage||imageFallback} alt={`${restaurant.name} profile`} onError={event=>event.currentTarget.src=imageFallback}/><span><b>{restaurant.name}</b><small>{(restaurant.cuisine||[]).slice(0,2).join(" · ")||"Local restaurant"} · {restaurant.address?.city||"Nearby"}</small></span><ArrowRight size={15}/></Link>)}</div>:<p className="muted">Local restaurant partners will appear here as they join.</p>}<Link to="/register" className="community-join">Have a food business? <b>Partner with GoFoode</b> <ArrowRight size={14}/></Link></section>
    <section className="home-feedback"><div className="section-head"><div><span className="eyebrow">FROM THE COMMUNITY</span><h2>Customer feedback<span className="orange">.</span></h2><p>Real notes shared by customers after their orders.</p></div><span className="feedback-count">{reviews.length?`${reviews.length} recent reviews`:"Customer reviews"}</span></div>{reviewError?<p className="error-box" role="status">{reviewError}</p>:reviews.length?<div className="feedback-grid">{reviews.slice(0,3).map(review=><article className="feedback-card" key={review._id}><div className="feedback-stars" aria-label={`${review.rating} out of 5 stars`}>{Array.from({length:5},(_,index)=><Star key={index} size={14} fill={index<review.rating?"currentColor":"none"}/>)}</div><p>“{review.comment}”</p><div className="feedback-author"><span className="feedback-avatar">{review.user?.profileImage?<img src={review.user.profileImage} alt=""/>:review.user?.name?.[0]?.toUpperCase()||"G"}</span><span><b>{review.user?.name||"GoFoode customer"}</b><small>{review.restaurant?.name||"Local restaurant"}</small></span></div></article>)}</div>:<div className="feedback-empty"><span className="feedback-avatar"><Star size={16}/></span><div><b>Your experience could be the first story here.</b><p>After a food order is delivered, leave a review and help others discover a local favourite.</p></div><Link to="/customer/orders">View my orders <ArrowRight size={14}/></Link></div>}</section>
    <section className="plus-teaser"><div className="plus-crown"><Crown size={28}/></div><div><span className="eyebrow">A LITTLE MORE LOVE</span><h2>Meet GoFoode Plus</h2><p>Enjoy member-only deals, delivery perks and more reasons to order your favourites.</p></div><Link to="/plus" className="btn btn-primary">Explore membership <ArrowRight size={15}/></Link></section>
    <section className="how-section" id="how"><span className="eyebrow">THE GOFOODE WAY</span><h2>Three steps to your happy place.</h2><p className="how-lead">Less planning, more enjoying. Your next favourite meal is closer than you think.</p><div className="steps-grid"><div><b>01</b><h3>Discover your craving</h3><p>Browse trusted local restaurants, explore cuisines and find something you’ll love.</p></div><div><b>02</b><h3>Order in a few taps</h3><p>Choose your favourites, customise your basket and place your order with ease.</p></div><div><b>03</b><h3>Follow the flavour</h3><p>Stay updated as your food is prepared and delivered right to your door.</p></div></div></section>
    <section className="join-section"><div><span className="eyebrow">GROW WITH GOFOODE</span><h2>Have a kitchen or love being on the move?</h2><p>Partner with GoFoode as a restaurant or delivery professional and be part of a growing food community.</p></div><div className="join-actions"><Link to="/register" className="btn btn-primary">Become a partner <ArrowRight size={16}/></Link><Link to="/login" className="join-link">Already a partner? Sign in</Link></div></section>
  </main><Footer/><ChatWidget/></>;
}
function Footer() { return <footer className="footer gofoode-footer"><div><Brand/><p>Bringing good food and good people together.</p></div><div className="footer-links"><a href="/#restaurants">Explore restaurants</a><a href="/#offers">Offers</a><a href="/#how">How it works</a><Link to="/register">Become a partner</Link></div><small>© 2026 GoFoode. Made for every craving.</small></footer>; }

function AuthPage({ mode }) {
  const { login, register, onboard, user } = useAuth(); const nav = useNavigate(); const authLocation = useLocation();
  const returnTo = typeof authLocation.state?.from === "string" && authLocation.state.from.startsWith("/") ? authLocation.state.from : null;
  const [form, setForm] = useState({ name:"", email:"", password:"", phone:"", role:"customer" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={returnTo||"/dashboard"} replace/>;
  const submit = async e => { e.preventDefault(); setBusy(true); setError(""); try { if(mode==="login") await login(form.email,form.password); else if(form.role==="customer") await register(form); else await onboard(form); nav(returnTo||"/dashboard",{replace:true}); } catch(err) { setError(err.response?.data?.message || "Something went wrong"); } finally { setBusy(false); } };
  return <div className="auth-shell"><div className="auth-visual"><Brand light /><div><span className="eyebrow light">A BETTER WAY TO EAT</span><h1>Bring the<br/><em>good stuff</em><br/>to your table.</h1><p>One platform. Local favourites. More moments worth sharing.</p></div><small>Discover. Order. Track. Enjoy.</small></div><div className="auth-panel"><Link to="/" className="back-link">← Back to home</Link><div className="auth-form-wrap"><span className="eyebrow">WELCOME TO GOFOODE</span><h2>{mode==="login"?"Welcome back.":"Create your account."}</h2><p>{mode==="login"?"Log in to continue your food journey.":"Join GoFoode and discover your next favourite."}</p><form onSubmit={submit}>{mode==="register"&&<><label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name"/></label><label>Join GoFoode as<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="customer">Customer</option><option value="restaurant_owner">Restaurant partner</option><option value="delivery_partner">Delivery partner</option></select></label></>}<label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label>{mode==="register"&&<label>Phone number<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+91"/></label>}<label>Password<input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="At least 8 characters"/></label>{error&&<div className="error-box">{error}</div>}<button disabled={busy} className="btn btn-primary btn-full">{busy?"Please wait...":mode==="login"?"Log in":"Create account"} <ArrowRight size={17}/></button></form><div className="auth-switch">{mode==="login"?"New to GoFoode?":"Already have an account?"} <Link to={mode==="login"?"/register":"/login"} state={returnTo?{from:returnTo}:undefined}>{mode==="login"?"Create an account":"Log in"}</Link></div><div className="demo-box"><b>Demo access</b><small>Use the seeded demo accounts listed in README.md to test each dashboard.</small></div></div></div></div>;
}
function RestaurantDetail() {
  const { id: restaurantId } = useParams(); const navigate = useNavigate();
  const [data,setData] = useState(null); const [msg,setMsg] = useState(""); const [saved,setSaved] = useState(false);
  useEffect(()=>{api.get(`/restaurants/${restaurantId}`).then(r=>setData(r.data)).catch(()=>setData({error:true}));},[restaurantId]);
  const add = async foodItemId => { try { await api.post("/cart/items",{foodItemId,quantity:1}); navigate("/cart?step=1"); } catch(e){setMsg(e.response?.data?.message||"Please log in as a customer to add items");} };
  const saveRestaurant = async () => { try { if(saved){await api.delete(`/favorites/${restaurantId}`);setSaved(false);setMsg("Removed from favourites")}else{await api.post(`/favorites/${restaurantId}`);setSaved(true);setMsg("Saved to favourites")} } catch(e){setMsg(e.response?.data?.message||"Log in as a customer to save favourites")} };
  if(!data) return <><Header/><div className="loading">Loading restaurant...</div></>;
  if(data.error) return <><Header/><div className="empty-state">Restaurant not found.</div></>;
  return <><Header/><main className="page-container"><Link to="/" className="back-link">← All restaurants</Link><div className="detail-hero"><img src={data.restaurant.coverImage||imageFallback}/><div><span className="eyebrow">DISCOVER THE MENU</span><h1>{data.restaurant.name}</h1><button className="btn btn-outline btn-small" onClick={saveRestaurant}><Heart size={15}/> {saved?"Saved":"Save favourite"}</button><p>{data.restaurant.description}</p><div className="card-meta"><span><Star size={14}/> {data.restaurant.rating||"New"}</span><span><Clock size={14}/> {data.restaurant.deliveryTime} min</span><span>{(data.restaurant.cuisine||[]).join(" · ")}</span></div></div></div>{msg&&<div className="success-box">{msg}</div>}<h2>Menu</h2><div className="menu-grid">{data.menu.map(item=><div className="menu-item menu-item-rich" key={item._id}><img src={item.image||imageFallback}/><div className="menu-item-copy"><div className="food-tags"><span className={item.foodType==="non-veg"?"food-type nonveg":"food-type"}>{item.foodType==="non-veg"?"● Non-veg":"● Vegetarian"}</span>{item.isBestseller&&<span className="bestseller-tag">Bestseller</span>}</div><h3>{item.name}</h3><p>{item.description}</p><b>{money(item.discountPrice??item.price)}</b><div className="food-meta"><span>{item.calories?`${item.calories} kcal`:"Freshly prepared"}</span><span>{item.preparationTime||20} min prep</span>{item.spiceLevel&&<span>{item.spiceLevel} spice</span>}</div>{item.ingredients?.length>0&&<small>Ingredients: {item.ingredients.join(", ")}</small>}{item.allergens?.length>0&&<small className="allergen-note">Allergens: {item.allergens.join(", ")}</small>}</div><button className="add-button" onClick={()=>add(item._id)}>ADD <Plus size={15}/></button></div>)}</div></main><Footer/></>;
}
function DashboardLayout({ title, subtitle, items, children }) {
  const { user, logout } = useAuth(); const [open,setOpen] = useState(false); const { pathname } = useLocation();
  return <div className="dashboard-shell"><aside className={open?"sidebar show":"sidebar"}><Brand /><div className="side-user"><div className="user-avatar">{user?.profileImage?<img src={user.profileImage} alt=""/>:user?.name?.[0]?.toUpperCase()}</div><div><b>{user?.name}</b><small>{user?.role?.replaceAll("_"," ")}</small></div></div><div className="side-label">WORKSPACE</div><nav>{items.map(item=><Link key={item.to} to={item.to} className={pathname===item.to?"side-link active":"side-link"}><item.icon size={18}/>{item.label}</Link>)}<Link to="/profile" className={pathname==="/profile"?"side-link active":"side-link"}><UserRound size={18}/>Profile</Link></nav><div className="sidebar-bottom"><Link to="/" className="side-link"><Store size={18}/> Visit marketplace</Link><button className="side-link" onClick={logout}><LogOut size={18}/> Sign out</button></div></aside><div className="dash-main"><header className="dash-top"><button className="mobile-toggle" onClick={()=>setOpen(!open)}><Menu/></button><div><span className="eyebrow">GOFOODE WORKSPACE</span><h2>{title}</h2></div><div className="dash-top-right"><span className="status-dot"/> <span>System online</span><Link to="/profile" className="profile-shortcut" aria-label="Open your profile"><div className="user-avatar small">{user?.profileImage?<img src={user.profileImage} alt=""/>:user?.name?.[0]?.toUpperCase()}</div></Link></div></header><main className="dash-content"><div className="dash-intro"><div><h1>{title}</h1><p>{subtitle}</p></div><span className="date-chip">{new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span></div>{children}</main></div></div>;
}
const customerNav=[{label:"Overview",to:"/customer",icon:LayoutDashboard},{label:"My orders",to:"/customer/orders",icon:ClipboardList},{label:"Grocery orders",to:"/customer/grocery-orders",icon:ShoppingBasket},{label:"Saved addresses",to:"/customer/addresses",icon:MapPin},{label:"Dineout bookings",to:"/customer/reservations",icon:CalendarDays},{label:"GoFoode Plus",to:"/customer/membership",icon:CreditCard},{label:"Notifications",to:"/customer/notifications",icon:Bell},{label:"Favourites",to:"/customer/favourites",icon:Heart}];
const ownerNav=[{label:"Overview",to:"/restaurant",icon:LayoutDashboard},{label:"My restaurants",to:"/restaurant/places",icon:Store},{label:"Menu manager",to:"/restaurant/menu",icon:Utensils},{label:"Orders",to:"/restaurant/orders",icon:ClipboardList},{label:"Reservations",to:"/restaurant/reservations",icon:CalendarDays},{label:"Customer reviews",to:"/restaurant/reviews",icon:Star}];
const deliveryNav=[{label:"Overview",to:"/delivery",icon:LayoutDashboard},{label:"Assignments",to:"/delivery/jobs",icon:Bike},{label:"Availability",to:"/delivery/availability",icon:Power},{label:"Delivery history",to:"/delivery/history",icon:History},{label:"Earnings",to:"/delivery/earnings",icon:Wallet}];
const adminNav=[{label:"Overview",to:"/admin",icon:LayoutDashboard},{label:"Users",to:"/admin/users",icon:Users},{label:"Restaurants",to:"/admin/restaurants",icon:Store},{label:"Orders",to:"/admin/orders",icon:ClipboardList},{label:"Transactions",to:"/admin/transactions",icon:Wallet},{label:"Reviews",to:"/admin/reviews",icon:Star},{label:"Support",to:"/admin/support",icon:ShieldCheck},{label:"Grocery orders",to:"/admin/grocery-orders",icon:ShoppingBasket},{label:"Reservations",to:"/admin/reservations",icon:CalendarDays},{label:"Activity log",to:"/admin/activity",icon:Activity}];
const roleNavigation={customer:customerNav,restaurant_owner:ownerNav,delivery_partner:deliveryNav,admin:adminNav};

function ProfilePage() {
  const { user, location, locationStatus, locationError, requestLocation, updateProfile } = useAuth();
  const [roleData,setRoleData]=useState(null),[roleError,setRoleError]=useState(""),[loading,setLoading]=useState(true);
  const [profileImage,setProfileImage]=useState(user.profileImage||""),[profileMessage,setProfileMessage]=useState(""),[profileError,setProfileError]=useState(""),[profileBusy,setProfileBusy]=useState(false);
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
    restaurant_owner:<div className="panel"><div className="panel-head"><div><h3>Your restaurants</h3><p>Application and approval status for your kitchens.</p></div><Link to="/restaurant/places" className="link-orange">Manage restaurants <ArrowRight size={14}/></Link></div>{roleData?.length?roleData.map(restaurant=><div className="list-row" key={restaurant._id}><div className="list-icon"><Store size={18}/></div><div className="list-grow"><b>{restaurant.name}</b><small>{[restaurant.address?.city,restaurant.address?.state].filter(Boolean).join(", ")||"Location not set"}</small></div><Badge>{restaurant.status}</Badge></div>):<p className="muted">No restaurant applications yet.</p>}</div>,
    delivery_partner:<div className="stats-grid"><Stat label="Completed deliveries" value={roleData?.earnings?.completed||0} icon={CheckCircle2} tone="green"/><Stat label="Active deliveries" value={activeDeliveries} icon={Bike} tone="blue"/><Stat label="Estimated earnings" value={money(roleData?.earnings?.estimatedEarnings)} icon={Wallet}/></div>,
    admin:<div className="stats-grid"><Stat label="Platform users" value={roleData?.users||0} icon={Users}/><Stat label="Restaurants" value={roleData?.restaurants||0} icon={Store} tone="blue"/><Stat label="Orders" value={roleData?.orders||0} icon={Package} tone="purple"/></div>
  }[user.role];

  return <DashboardLayout title="Your profile" subtitle="Your account details and role-specific GoFoode activity." items={roleNavigation[user.role]||customerNav}>
    <section className="profile-card panel">
      <div className="profile-avatar">{profileImage?<img src={profileImage} alt="Profile preview"/>:<span>{user.name?.[0]?.toUpperCase()||"G"}</span>}</div>
      <div className="profile-heading"><span className="eyebrow">GOFOODE ACCOUNT</span><h2>{user.name}</h2><p>{details.label}</p></div>
      <span className="badge badge-active">Signed in</span>
    </section>
    <section className="panel profile-photo-panel"><div><span className="eyebrow">YOUR ACCOUNT PHOTO</span><h3>Make your profile yours</h3><p>Customers, restaurant owners, delivery partners and admins can add a profile image.</p></div><div className="profile-photo-actions"><label className="btn btn-outline btn-small">Choose photo<input className="visually-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage}/></label>{profileImage&&<button type="button" className="btn btn-outline btn-small" onClick={()=>setProfileImage("")}>Remove photo</button>}<button type="button" className="btn btn-primary btn-small" disabled={profileBusy||profileImage===(user.profileImage||"")} onClick={saveProfileImage}>{profileBusy?"Saving…":"Save photo"}</button></div>{profileMessage&&<p className="success-box" role="status">{profileMessage}</p>}{profileError&&<p className="error-box" role="alert">{profileError}</p>}</section>
    <div className="profile-grid">
      <section className="panel profile-details"><h3>Personal information</h3>
        <div className="profile-detail-row"><UserRound size={17}/><div><small>Full name</small><b>{user.name||"Not provided"}</b></div></div>
        <div className="profile-detail-row"><Mail size={17}/><div><small>Email address</small><b>{user.email||"Not provided"}</b></div></div>
        <div className="profile-detail-row"><Phone size={17}/><div><small>Phone number</small><b>{user.phone||"Not provided"}</b></div></div>
        <div className="profile-detail-row"><RoleIcon size={17}/><div><small>Account type</small><b>{details.label}</b></div></div>
      </section>
      <section className="panel profile-location"><div className="panel-head"><div><h3>Your current location</h3><p>Used to prefill the delivery city and checkout coordinates.</p></div><MapPin size={19}/></div>
        <div className="profile-location-value"><b>{location?.label||"Location not detected yet"}</b>{location?.accuracy&&<small>Accuracy within about {Math.round(location.accuracy)} metres</small>}{location?.updatedAt&&<small>Updated {new Date(location.updatedAt).toLocaleString()}</small>}</div>
        {locationError&&<p className="error-box location-error" role="status">{locationError}</p>}
        <button className="btn btn-outline btn-small" onClick={requestLocation} disabled={locationStatus==="loading"||locationStatus==="retrying"}><RefreshCw size={14}/>{locationStatus==="loading"||locationStatus==="retrying"?"Finding your location…":"Use my current location"}</button>
        {!locationError&&!location&&<small className="location-help">Allow location access when your browser asks. If it was blocked, enable it in the site settings and try again.</small>}
      </section>
    </div>
    {roleError&&<p className="error-box" role="status">{roleError}</p>}
    <section className="profile-role-section"><div className="panel-head"><div><h3>Your GoFoode activity</h3><p>{details.summary}</p></div></div>{roleStats}</section>
  </DashboardLayout>;
}

function Stat({ label,value,icon:Icon, tone="orange", hint }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function DataTable({ columns, rows, empty="No records found." }) { return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={row._id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(row):row[c.key]??"—"}</td>)}</tr>):<tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>}</tbody></table></div>; }
function Badge({ children }) { return <span className={`badge badge-${String(children).toLowerCase().replaceAll(" ","-")}`}>{children}</span>; }
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
function CustomerGroceryOrders(){
 const [orders,setOrders]=useState([]),[error,setError]=useState("");
 const load=()=>api.get("/grocery/orders/mine").then(response=>{setOrders(response.data);setError("")}).catch(err=>setError(err.response?.data?.message||"Could not load grocery order history."));
 useEffect(()=>{load()},[]);
 return <DashboardLayout title="Grocery orders" subtitle="Your GoFoode Mart order history and delivery status." items={customerNav}>
  {error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Retry</button></p>}
  <div className="panel"><div className="panel-head"><div><h3>Order history</h3><p>{orders.length} grocery orders</p></div><Link to="/instamart" className="btn btn-primary btn-small">Shop groceries <ArrowRight size={14}/></Link></div>
   <DataTable columns={[{key:"orderNumber",label:"Order reference"},{key:"items",label:"Products",render:r=>r.items?.map(item=>`${item.name} × ${item.quantity}`).join(", ")||"—"},{key:"totalAmount",label:"Total",render:r=>money(r.totalAmount)},{key:"paymentMethod",label:"Payment",render:r=>r.paymentMethod==="cod"?"Cash on delivery":`${r.paymentMethod?.toUpperCase()} · ${r.paymentStatus||"pending"}`},{key:"status",label:"Delivery",render:r=><Badge>{r.status}</Badge>},{key:"createdAt",label:"Placed",render:r=>new Date(r.createdAt).toLocaleString()}]} rows={orders}/>
  </div>
  {!orders.length&&!error&&<div className="empty-feature"><ShoppingBasket size={36}/><h3>No grocery orders yet</h3><p>Your GoFoode Mart orders will show here when you place them.</p><Link to="/instamart" className="btn btn-primary">Browse groceries</Link></div>}
 </DashboardLayout>;
}
function CustomerOrders() {
  const [orders,setOrders]=useState([]); useEffect(()=>{api.get("/orders/my-orders").then(r=>setOrders(r.data)).catch(()=>{})},[]);
  return <DashboardLayout title="My orders" subtitle="Your past and current orders." items={customerNav}><div className="panel"><DataTable columns={[{key:"orderNumber",label:"Order ID"},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"totalAmount",label:"Total",render:r=>money(r.totalAmount)},{key:"paymentStatus",label:"Payment",render:r=><Badge>{r.paymentStatus}</Badge>},{key:"orderStatus",label:"Order status",render:r=><Badge>{r.orderStatus}</Badge>},{key:"createdAt",label:"Placed",render:r=>new Date(r.createdAt).toLocaleString()},{key:"track",label:"Track",render:r=><Link className="link-orange" to={`/orders/${r._id}`}>Track order <ArrowRight size={13}/></Link>}]} rows={orders}/></div></DashboardLayout>;
}
function NotificationsPage() {
  const [rows,setRows]=useState([]); useEffect(()=>{api.get("/notifications").then(r=>setRows(r.data)).catch(()=>{})},[]);
  return <DashboardLayout title="Notifications" subtitle="Updates from your GoFoode account." items={customerNav}><div className="panel">{rows.map(n=><div className="notification-row" key={n._id}><span className="notification-dot"/><div><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div></div>)}</div></DashboardLayout>;
}
function OrderTrackingPage(){
 const {id}=useParams();const [order,setOrder]=useState(null),[error,setError]=useState("");
 const [rating,setRating]=useState(5),[comment,setComment]=useState(""),[reviewMessage,setReviewMessage]=useState(""),[reviewError,setReviewError]=useState(""),[reviewBusy,setReviewBusy]=useState(false),[submittedReview,setSubmittedReview]=useState(null);
 const load=()=>api.get(`/orders/${id}`).then(r=>setOrder(r.data)).catch(e=>setError(e.response?.data?.message||"Unable to load order"));
 useEffect(()=>{load();const timer=setInterval(load,7000);return()=>clearInterval(timer)},[id]);
 const submitReview=async event=>{
  event.preventDefault();setReviewError("");setReviewMessage("");setReviewBusy(true);
  try{const response=await api.post("/reviews",{restaurantId:order.restaurant?._id,orderId:id,rating,comment});setSubmittedReview(response.data);setReviewMessage("Thanks for sharing your feedback with the GoFoode community.")}
  catch(error){setReviewError(error.response?.data?.message||"Could not submit your review. Please try again.")}
  finally{setReviewBusy(false)}
 };
 const steps=["placed","accepted","preparing","ready","picked_up","on_the_way","delivered"];const current=steps.indexOf(order?.orderStatus);
 const gps=order?.delivery?.currentLocation?.coordinates;const rider=order?.delivery?.deliveryPartner;
 const drop=order?.delivery?.dropLocation||order?.deliveryAddress;
 const destination=[drop?.street,drop?.city,drop?.state,drop?.postalCode].filter(Boolean).join(", ");
 return <><Header/><main className="feature-page">{!order?<div className="loading">{error||"Loading your order…"}</div>:<><div className="feature-title"><span className="eyebrow">LIVE ORDER TRACKING</span><h1>Your food is <em>on its way.</em></h1><p>Order reference: {order.orderNumber} · Updates refresh automatically.</p></div><CheckoutProgress step={3}/><section className="feature-panel tracking-panel"><div className="tracking-top"><div><small>ORDER STATUS</small><h2>{String(order.orderStatus).replaceAll("_"," ")}</h2></div><strong>{money(order.totalAmount)}</strong></div><div className="tracking-steps">{steps.map((step,i)=><div className={i<=current?"tracking-step done":"tracking-step"} key={step}><span>{i<current?"✓":i+1}</span><b>{step.replaceAll("_"," ")}</b></div>)}</div><div className="tracking-info"><div><b>{order.restaurant?.name}</b><small>Restaurant</small></div><div><b>{order.deliveryAddress?.street}, {order.deliveryAddress?.city}</b><small>Delivery address</small></div><div><b>{order.paymentMethod==="cod"?"Cash on delivery":`${order.paymentMethod.toUpperCase()} · ${order.paymentStatus}${order.paymentMethod==="razorpay"?"":" (demo)"}`}</b><small>Payment</small></div></div>
 <div className="gps-tracking-card"><div className="gps-card-head"><div><span className="eyebrow">DELIVERY PARTNER GPS</span><h3>{gps?"Rider location received":"Waiting for rider location"}</h3><p>{rider?`${rider.name} is assigned to your order.`:"Your restaurant is preparing the order. GPS appears after a delivery partner accepts and shares location."}</p></div><span className={gps?"gps-live":"gps-waiting"}><i/>{gps?"LIVE GPS":"GPS PENDING"}</span></div>{gps||destination?<GoogleMap title="Delivery partner location and destination" latitude={gps?.[1]} longitude={gps?.[0]} destination={destination}/>:<div className="map-placeholder"><MapPin size={28}/><b>Map will appear when delivery location details are available</b><small>Allow location access on the delivery partner's device.</small></div>}</div>
 <button className="btn btn-outline" onClick={load}><RefreshCw size={14}/> Refresh order</button>{order.orderStatus==="delivered"&&(order.customerReview||submittedReview?<div className="review-thanks"><CheckCircle2 size={18}/><span><b>Thanks for your feedback.</b><small>Your review helps other customers discover local favourites.</small></span></div>:<form className="order-review-form" onSubmit={submitReview}><span className="eyebrow">HOW WAS YOUR ORDER?</span><h3>Leave a review for {order.restaurant?.name}</h3><div className="review-rating-picker" role="radiogroup" aria-label="Rate your order">{[1,2,3,4,5].map(value=><button type="button" key={value} role="radio" aria-checked={rating===value} aria-label={`${value} star${value===1?"":"s"}`} className={value<=rating?"selected":""} onClick={()=>setRating(value)}><Star size={20} fill={value<=rating?"currentColor":"none"}/></button>)}</div><label>Your feedback<textarea required maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)} placeholder="Share what you enjoyed or what could be better."/></label>{reviewError&&<p className="error-box" role="alert">{reviewError}</p>}{reviewMessage&&<p className="success-box" role="status">{reviewMessage}</p>}<button className="btn btn-primary" disabled={reviewBusy}>{reviewBusy?"Sending review…":"Share feedback"}</button></form>)}</section></>}</main><Footer/></>;
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
    <div className="panel"><div className="panel-head"><div><h3>Your restaurants</h3><p>Approval and service status for each kitchen.</p></div><Link to="/restaurant/places" className="btn btn-primary btn-small"><Plus size={15}/> Add restaurant</Link></div>{stats.restaurants.length?stats.restaurants.map(r=><div className="list-row" key={r._id}><div className="list-icon"><ChefHat/></div><div className="list-grow"><b>{r.name}</b><small>{r.status==="approved"?(r.isOpen?"Accepting orders":"Temporarily closed"):r.status}</small></div><Badge>{r.status}</Badge></div>):<div className="empty-feature"><Store size={32}/><h3>Set up your first restaurant</h3><p>Add your kitchen details and submit them for approval.</p><Link to="/restaurant/places" className="btn btn-primary">Add restaurant</Link></div>}</div>
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
      {restaurants.map(restaurant=><article className="availability-row" key={restaurant._id}><div className="list-icon"><Store size={18}/></div><div className="list-grow"><b>{restaurant.name}</b><small>{[restaurant.address?.city,restaurant.address?.state].filter(Boolean).join(", ")||"Location not set"}</small></div><Badge>{restaurant.status}</Badge>{restaurant.status==="approved"&&<button className={restaurant.isOpen?"btn btn-outline btn-small":"btn btn-primary btn-small"} disabled={busy===restaurant._id} onClick={()=>toggle(restaurant)}>{busy===restaurant._id?"Saving…":restaurant.isOpen?"Close restaurant":"Open restaurant"}</button>}</article>)}
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
  return <DashboardLayout title="My restaurants" subtitle="Register and manage your restaurant locations." items={ownerNav}><div className="two-col"><div className="panel"><h3>Register a restaurant</h3><form className="stack-form" onSubmit={submit}><label>Restaurant name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Cuisines<input value={form.cuisine} onChange={e=>setForm({...form,cuisine:e.target.value})}/></label><label>Street address<input value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label><div className="form-row"><label>City<input required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>Postal code<input value={form.postalCode} onChange={e=>setForm({...form,postalCode:e.target.value})}/></label></div><button className="btn btn-primary">Submit for approval</button>{message&&<p className="form-message">{message}</p>}</form></div><div className="panel"><h3>Applications</h3>{rows.map(r=><div className="list-row" key={r._id}><div className="list-icon"><Store/></div><div className="list-grow"><b>{r.name}</b><small>{r.address?.city}</small></div><Badge>{r.status}</Badge></div>)}</div></div></DashboardLayout>;
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
  return <DashboardLayout title="Order management" subtitle="Review incoming orders and update kitchen progress." items={ownerNav}><div className="panel">{message&&<p className="form-message">{message}</p>}<DataTable columns={[{key:"orderNumber",label:"Order"},{key:"customer",label:"Customer",render:r=>r.customer?.name},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"orderStatus",label:"Status",render:r=><Badge>{r.orderStatus}</Badge>},{key:"actions",label:"Action",render:r=>next[r.orderStatus]?<button className="btn btn-primary btn-small" onClick={()=>advance(r,next[r.orderStatus])}>{next[r.orderStatus]}</button>:r.orderStatus==="placed"?<button className="btn btn-outline btn-small" onClick={()=>advance(r,"rejected")}>Reject</button>:"—"}]} rows={rows}/></div></DashboardLayout>;
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
  const configs={
    users:{title:"User management",subtitle:"Manage customer, owner and delivery accounts.",columns:[{key:"name",label:"Name"},{key:"email",label:"Email"},{key:"role",label:"Role"},{key:"isActive",label:"Account",render:r=><Badge>{r.isActive?"active":"disabled"}</Badge>},{key:"action",label:"Action",render:r=><button className="btn btn-outline btn-small" onClick={()=>update(`/admin/users/${r._id}/status`,{isActive:!r.isActive})}>{r.isActive?"Disable":"Enable"}</button>}]},
    restaurants:{title:"Restaurant approvals",subtitle:"Review restaurant applications and marketplace listings.",columns:[{key:"name",label:"Restaurant"},{key:"owner",label:"Owner",render:r=>r.owner?.name},{key:"address",label:"City",render:r=>r.address?.city},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"action",label:"Action",render:r=><div className="inline-actions"><button className="btn btn-primary btn-small" onClick={()=>update(`/admin/restaurants/${r._id}/status`,{status:"approved"})}>Approve</button><button className="btn btn-outline btn-small" onClick={()=>update(`/admin/restaurants/${r._id}/status`,{status:"rejected"})}>Reject</button></div>}]},
    orders:{title:"Order monitoring",subtitle:"Monitor restaurant orders across the platform.",columns:[{key:"orderNumber",label:"Order"},{key:"customer",label:"Customer",render:r=>r.customer?.name},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"orderStatus",label:"Status",render:r=><Badge>{r.orderStatus}</Badge>}]},
    transactions:{title:"Transactions",subtitle:"Payment records and transaction statuses.",columns:[{key:"groupOrderId",label:"Checkout"},{key:"customer",label:"Customer",render:r=>r.customer?.name},{key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"method",label:"Method"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>}]},
    reviews:{title:"Reviews",subtitle:"Customer ratings and feedback.",columns:[{key:"user",label:"Customer",render:r=>r.user?.name},{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"rating",label:"Rating",render:r=>`${r.rating}/5`},{key:"comment",label:"Comment"}]},
    "grocery-orders":{title:"GoFoode Mart orders",subtitle:"Monitor grocery and daily-essential orders.",columns:[{key:"orderNumber",label:"Order"},{key:"user",label:"Customer",render:r=>r.user?.name},{key:"totalAmount",label:"Amount",render:r=>money(r.totalAmount)},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"createdAt",label:"Placed",render:r=>new Date(r.createdAt).toLocaleString()}]},
    reservations:{title:"Dineout reservations",subtitle:"Monitor table requests across restaurants.",columns:[{key:"restaurant",label:"Restaurant",render:r=>r.restaurant?.name},{key:"user",label:"Guest",render:r=>r.user?.name},{key:"date",label:"Date",render:r=>new Date(r.date).toLocaleDateString()},{key:"time",label:"Time"},{key:"guests",label:"Guests"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>}]},
    support:{title:"Support tickets",subtitle:"Review customer requests and track each resolution stage.",columns:[{key:"user",label:"Customer",render:r=><span>{r.user?.name}<small className="table-subtext">{r.user?.email}</small></span>},{key:"subject",label:"Subject"},{key:"message",label:"Message"},{key:"status",label:"Status",render:r=><Badge>{r.status}</Badge>},{key:"action",label:"Update status",render:r=><select aria-label={`Update status for ${r.subject}`} value={r.status} onChange={event=>update(`/admin/support/${r._id}`,{status:event.target.value})}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>}]},
    activity:{title:"Admin activity log",subtitle:"Recent administrative and account events across GoFoode.",columns:[{key:"actor",label:"Actor",render:r=>r.actor?.name||"System"},{key:"action",label:"Action"},{key:"entityType",label:"Record type"},{key:"entityId",label:"Record ID"},{key:"createdAt",label:"Time",render:r=>new Date(r.createdAt).toLocaleString()}]}
  };
  const c=configs[type];
  return <DashboardLayout title={c.title} subtitle={c.subtitle} items={adminNav}>{message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error} <button className="btn btn-outline btn-small" onClick={load}>Retry</button></p>}<div className="panel"><DataTable columns={c.columns} rows={rows}/></div></DashboardLayout>;
}

function CheckoutProgress({step}){
 const labels=["Your items","Delivery address","Review & place order"];
 return <div className="checkout-progress">{labels.map((label,i)=><div className={step>=i+1?"checkout-progress-step active":"checkout-progress-step"} key={label}><span>{step>i+1?"✓":i+1}</span><b>{label}</b></div>)}</div>;
}
function PaymentOptions({value,onChange,idPrefix}){
 const options=[
  {id:"cod",title:"Cash on delivery",detail:"Pay when your order arrives."},
  {id:"upi",title:"UPI",detail:"Demo only · order remains payment pending."},
  {id:"netbanking",title:"Net banking",detail:"Demo only · order remains payment pending."}
 ];
 return <fieldset className="payment-options"><legend>Payment method</legend>{options.map(option=><label className={`payment-option ${value===option.id?"selected":""}`} key={option.id}><input type="radio" name={`${idPrefix}-payment`} value={option.id} checked={value===option.id} onChange={()=>onChange(option.id)}/><span><b>{option.title}</b><small>{option.detail}</small></span></label>)}<p className="payment-demo-note">Online payment is not connected in this demo. UPI and net banking selections do not collect money; use cash on delivery for a completed payment at the door.</p></fieldset>;
}
function CartPage(){
 const {location}=useAuth(); const navigate=useNavigate(); const routerLocation=useLocation();
 const [cart,setCart]=useState({items:[]}),[step,setStep]=useState(1),[address,setAddress]=useState(()=>{const saved=routerLocation.state?.deliveryAddress;return saved?{...saved,latitude:saved.location?.coordinates?.[1]??null,longitude:saved.location?.coordinates?.[0]??null,instructions:""}:{name:"",phone:"",street:"",city:location?.city||"",state:location?.state||"",postalCode:location?.postalCode||"",instructions:"",latitude:location?.latitude??null,longitude:location?.longitude??null}}),[coupon,setCoupon]=useState(""),[couponMsg,setCouponMsg]=useState(""),[discount,setDiscount]=useState(0),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[paymentMethod,setPaymentMethod]=useState("cod");
 const load=()=>api.get("/cart").then(r=>setCart(r.data)).catch(()=>{});
 useEffect(()=>{load()},[]);
 useEffect(()=>{const saved=routerLocation.state?.deliveryAddress;if(saved){setAddress({...saved,latitude:saved.location?.coordinates?.[1]??null,longitude:saved.location?.coordinates?.[0]??null,instructions:""});return}if(location){setAddress(a=>({...a,city:a.city||location.city||"",state:a.state||location.state||"",postalCode:a.postalCode||location.postalCode||"",latitude:a.latitude??location.latitude,longitude:a.longitude??location.longitude}))}},[location,routerLocation.state]);
 const subtotal=(cart.items||[]).reduce((sum,x)=>sum+(x.foodItem?.discountPrice??x.foodItem?.price??0)*x.quantity,0);
 const update=async(id,quantity)=>{if(quantity<1)await api.delete(`/cart/items/${id}`);else await api.patch(`/cart/items/${id}`,{quantity});setDiscount(0);load()};
 const apply=async()=>{try{const {data}=await api.post("/coupons/validate",{code:coupon});setDiscount(data.discount);setCouponMsg(data.message)}catch(e){setDiscount(0);setCouponMsg(e.response?.data?.message||"Coupon could not be applied")}};
 const checkout=async()=>{setBusy(true);setMessage("");try{const {data}=await api.post("/checkout",{deliveryAddress:address,paymentMethod,couponCode:coupon});setCart({items:[]});setDiscount(0);navigate(`/orders/${data.orders?.[0]?._id||""}`)}catch(e){setMessage(e.response?.data?.message||"Checkout failed")}finally{setBusy(false)}};
 const continueAddress=()=>{if(!cart.items?.length)return;if(!address.name||!address.phone||!address.street||!address.city){setMessage("Please complete your delivery details.");return}setMessage("");setStep(3)};
 return <><Header/><main className="feature-page"><div className="feature-title"><span className="eyebrow">YOUR GOFOODE ORDER</span><h1>One step closer to <em>delicious.</em></h1><p>Choose your dishes, confirm the delivery address and place your order.</p></div>{!cart.items?.length?<div className="empty-feature"><ShoppingBag size={42}/><h2>Your cart is waiting for something delicious</h2><p>Explore local restaurants and add your favourite dishes.</p><Link className="btn btn-primary" to="/#restaurants">Explore restaurants</Link></div>:<><CheckoutProgress step={step}/><div className="checkout-layout checkout-wizard">
 {step===1&&<section className="feature-panel"><div className="panel-head"><div><h2>Step 1 · Review your food</h2><p>Check portions and add any last-minute favourites.</p></div><span className="badge">{cart.items.length} dishes</span></div>{cart.items.map(x=><div className="cart-line" key={x.foodItem?._id}><img src={x.foodItem?.image||imageFallback}/><div className="cart-line-info"><b>{x.foodItem?.name}</b><small>{x.restaurant?.name}</small><strong>{money((x.foodItem?.discountPrice??x.foodItem?.price)*x.quantity)}</strong></div><div className="quantity-control"><button onClick={()=>update(x.foodItem._id,x.quantity-1)}><Minus size={14}/></button><b>{x.quantity}</b><button onClick={()=>update(x.foodItem._id,x.quantity+1)}><Plus size={14}/></button></div></div>)}<div className="coupon-row"><TicketPercent/><input value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())} placeholder="Enter coupon code"/><button className="btn btn-outline btn-small" onClick={apply}>Apply</button></div>{couponMsg&&<p className="coupon-message">{couponMsg}</p>}<button className="btn btn-primary btn-full" onClick={()=>{setMessage("");setStep(2)}}>Continue to delivery address <ArrowRight size={15}/></button></section>}
 {step===2&&<section className="feature-panel"><h2>Step 2 · Where should we deliver?</h2><p className="muted">Your browser location can help prefill your city. Please enter the complete street address.</p>{location&&<div className="detected-location"><MapPin size={16}/><span><b>Detected location</b><small>{location.label}</small></span><span className="badge gps-ready">GPS ready</span></div>}<form className="stack-form" onSubmit={e=>{e.preventDefault();continueAddress()}}><label>Full name<input required value={address.name} onChange={e=>setAddress({...address,name:e.target.value})}/></label><label>Phone number<input required value={address.phone} onChange={e=>setAddress({...address,phone:e.target.value})} placeholder="+91"/></label><label>Full delivery address<input required value={address.street} onChange={e=>setAddress({...address,street:e.target.value})} placeholder="House / flat, street, landmark"/></label><div className="form-row"><label>City<input required value={address.city} onChange={e=>setAddress({...address,city:e.target.value})}/></label><label>PIN code<input value={address.postalCode} onChange={e=>setAddress({...address,postalCode:e.target.value})}/></label></div><label>Delivery instructions<input value={address.instructions} onChange={e=>setAddress({...address,instructions:e.target.value})} placeholder="Optional"/></label><div className="wizard-actions"><button type="button" className="btn btn-outline" onClick={()=>setStep(1)}>Back</button><button className="btn btn-primary">Review order <ArrowRight size={15}/></button></div></form></section>}
 {step===3&&<section className="feature-panel"><h2>Step 3 · Confirm your order</h2><div className="review-address"><MapPin/><div><b>{address.name} · {address.phone}</b><small>{address.street}, {address.city} {address.postalCode}</small></div><button className="link-orange" onClick={()=>setStep(2)}>Edit</button></div>{cart.items.map(x=><div className="cart-line" key={x.foodItem?._id}><img src={x.foodItem?.image||imageFallback}/><div className="cart-line-info"><b>{x.foodItem?.name}</b><small>{x.restaurant?.name} · Qty {x.quantity}</small></div><strong>{money((x.foodItem?.discountPrice??x.foodItem?.price)*x.quantity)}</strong></div>)}<div className="bill-box"><div><span>Item total</span><b>{money(subtotal)}</b></div><div><span>Delivery fee</span><b>{subtotal>=499?"FREE":money(35)}</b></div><div><span>Taxes (estimated)</span><b>{money(Math.round(subtotal*.05))}</b></div><div><span>Discount</span><b className="discount-value">−{money(discount)}</b></div><div className="bill-total"><span>Order total</span><b>{money(Math.max(0,subtotal+(subtotal>=499?0:35)+Math.round(subtotal*.05)-discount))}</b></div></div><PaymentOptions value={paymentMethod} onChange={setPaymentMethod} idPrefix="food"/>{message&&<p className="coupon-message error-message">{message}</p>}<div className="wizard-actions"><button className="btn btn-outline" onClick={()=>setStep(2)}>Back</button><button disabled={busy} className="btn btn-primary" onClick={checkout}>{busy?"Placing order…":"Place order"}</button></div></section>}
 <aside className="feature-panel order-summary"><h3>Order summary</h3><div><span>Items</span><b>{cart.items.reduce((n,x)=>n+x.quantity,0)}</b></div><div><span>Restaurants</span><b>{new Set(cart.items.map(x=>x.restaurant?._id)).size}</b></div><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="bill-total"><span>Item total</span><b>{money(subtotal)}</b></div><p>Secure checkout · Cash on delivery</p></aside>
 </div>{message&&step!==3&&<p className="coupon-message">{message}</p>}</>}</main><Footer/></>;
}
function MartCheckoutWizard({step,setStep,items,basket,changeQuantity,delivery,setDelivery,count,subtotal,deliveryFee,total,user,busy,message,setMessage,paymentMethod,setPaymentMethod,onBackToShop,onPlace}){
 const steps=["Basket","Delivery details","Confirm order"];
 const saveAddress=event=>{event.preventDefault();if(!delivery.name.trim()||!delivery.phone.trim()||!delivery.street.trim()||!delivery.city.trim()){setMessage("Enter your name, phone, street address and city to continue.");return}setMessage("");setStep(3)};
 return <><Header/><main className="feature-page mart-page mart-checkout-page">
  <div className="mart-checkout-heading"><div><span className="eyebrow">GOFOODE MART CHECKOUT</span><h1>{steps[step-1]}</h1><p>{count} {count===1?"item":"items"} · {paymentMethod==="cod"?"Cash on delivery":paymentMethod==="upi"?"UPI":"Net banking"}</p></div><button type="button" className="btn btn-outline btn-small" onClick={onBackToShop}>Back to shopping</button></div>
  <div className="mart-checkout-progress">{steps.map((label,index)=><div key={label} className={step>=index+1?"active":""}><span>{step>index+1?"✓":index+1}</span><b>{label}</b></div>)}</div>
  {message&&<p className={`mart-message ${message.includes("successfully")?"success":""}`} role="status">{message}</p>}
  {step===1&&<div className="mart-wizard-layout"><section className="feature-panel mart-basket-panel"><h2>Review your items</h2>{items.map(product=><div className="mart-basket-item" key={product._id}><img src={product.image||imageFallback} alt={product.name}/><div><b>{product.name}</b><small>{product.unit} · {money(product.price)} each</small></div><span className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]-1)}><Minus size={13}/></button><b>{basket[product._id]}</b><button type="button" aria-label={`Add one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]+1)}><Plus size={13}/></button></span><strong>{money(product.price*basket[product._id])}</strong></div>)}<button type="button" className="btn btn-primary btn-full" onClick={()=>{setMessage("");setStep(2)}}>Continue to delivery details <ArrowRight size={15}/></button></section>
   <aside className="feature-panel mart-order-summary"><h2>Bill details</h2><div><span>Items ({count})</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{deliveryFee===0?"FREE":money(deliveryFee)}</b></div><div className="mart-summary-total"><span>Pay on delivery</span><b>{money(total)}</b></div><p>Free delivery on grocery orders above ₹299.</p></aside>
  </div>}
  {step===2&&<form className="feature-panel mart-address-step" onSubmit={saveAddress}><h2>Where should we deliver?</h2>{delivery.city&&<div className="detected-location"><MapPin size={16}/><span><b>Delivery area</b><small>{[delivery.city,delivery.state,delivery.postalCode].filter(Boolean).join(", ")}</small></span><span className="badge gps-ready">Prefilled</span></div>}<div className="mart-form-grid"><label>Full name<input required autoComplete="name" value={delivery.name} onChange={event=>setDelivery({...delivery,name:event.target.value})} placeholder="Your name"/></label><label>Phone number<input required type="tel" autoComplete="tel" value={delivery.phone} onChange={event=>setDelivery({...delivery,phone:event.target.value})} placeholder="+91 mobile number"/></label><label className="wide">Street address<input required autoComplete="street-address" value={delivery.street} onChange={event=>setDelivery({...delivery,street:event.target.value})} placeholder="Flat, street, landmark"/></label><label>City<input required autoComplete="address-level2" value={delivery.city} onChange={event=>setDelivery({...delivery,city:event.target.value})} placeholder="Your city"/></label><label>PIN code<input inputMode="numeric" autoComplete="postal-code" value={delivery.postalCode} onChange={event=>setDelivery({...delivery,postalCode:event.target.value})} placeholder="Optional"/></label></div>{!user&&<p className="mart-signin-note">Sign in as a customer to place this order: <Link to="/login" state={{from:"/instamart"}}>Continue to sign in</Link>. Your basket will be saved.</p>}<div className="wizard-actions"><button type="button" className="btn btn-outline" onClick={()=>setStep(1)}>Back to basket</button><button className="btn btn-primary">Review order <ArrowRight size={15}/></button></div></form>}
  {step===3&&<div className="mart-wizard-layout"><section className="feature-panel mart-confirm-panel"><h2>Delivery address</h2><div className="review-address"><MapPin size={18}/><div><b>{delivery.name} · {delivery.phone}</b><small>{delivery.street}, {delivery.city}{delivery.state?`, ${delivery.state}`:""} {delivery.postalCode}</small></div><button type="button" className="link-orange" onClick={()=>setStep(2)}>Edit</button></div><h2>Your items</h2>{items.map(product=><div className="mart-confirm-item" key={product._id}><span>{product.name} × {basket[product._id]}</span><b>{money(product.price*basket[product._id])}</b></div>)}<div className="mart-bill"><div><span>Items subtotal</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{deliveryFee===0?"FREE":money(deliveryFee)}</b></div><div className="mart-bill-total"><span>Order total</span><b>{money(total)}</b></div></div><PaymentOptions value={paymentMethod} onChange={setPaymentMethod} idPrefix="mart"/>{!user&&<p className="mart-signin-note">Sign in as a customer to place this order: <Link to="/login" state={{from:"/instamart"}}>Continue to sign in</Link>. Your basket will be saved.</p>}{message&&!message.includes("successfully")&&<p className="mart-message" role="alert">{message}</p>}<div className="wizard-actions"><button type="button" className="btn btn-outline" onClick={()=>setStep(2)}>Edit delivery details</button><button type="button" className="btn btn-primary" disabled={busy||!user} onClick={onPlace}>{busy?"Placing order…":paymentMethod==="cod"?"Place grocery order · COD":"Place demo order · payment pending"}</button></div></section><aside className="feature-panel mart-order-summary"><h2>Order total</h2><div><span>Items ({count})</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{deliveryFee===0?"FREE":money(deliveryFee)}</b></div><div className="mart-summary-total"><span>Total</span><b>{money(total)}</b></div><p>Free delivery on grocery orders above ₹299.</p></aside></div>}
 </main><Footer/></>;
}
function InstamartPage(){
 const {user,location}=useAuth();
 const [products,setProducts]=useState([]),[search,setSearch]=useState(""),[category,setCategory]=useState("All"),[sort,setSort]=useState("name"),[view,setView]=useState("grid"),[checkoutOpen,setCheckoutOpen]=useState(()=>{try{return Object.values(JSON.parse(localStorage.getItem("gofoode-mart-basket")||"{}")).some(quantity=>quantity>0)}catch{return false}}),[checkoutStep,setCheckoutStep]=useState(1),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState("");
 const checkoutRef=useRef(null);
 const [basket,setBasket]=useState(()=>{try{return JSON.parse(localStorage.getItem("gofoode-mart-basket")||"{}")}catch{return {}}});
 const [delivery,setDelivery]=useState(()=>{try{return {...{name:user?.name||"",phone:user?.phone||"",street:"",city:"",state:"",postalCode:""},...JSON.parse(sessionStorage.getItem("gofoode-mart-delivery")||"{}")}}catch{return {name:user?.name||"",phone:user?.phone||"",street:"",city:"",state:"",postalCode:""}}});
 const [message,setMessage]=useState(""),[paymentMethod,setPaymentMethod]=useState("cod"),[placedOrder,setPlacedOrder]=useState(()=>{try{return JSON.parse(sessionStorage.getItem("gofoode-mart-order")||"null")}catch{return null}});
 const load=async()=>{try{const {data}=await api.get("/grocery/products");setProducts(data);setLoadError("")}catch{setLoadError("We couldn't load grocery products. Check your connection and try again.")}};
 useEffect(()=>{load()},[]);
 useEffect(()=>{localStorage.setItem("gofoode-mart-basket",JSON.stringify(basket))},[basket]);
 useEffect(()=>{sessionStorage.setItem("gofoode-mart-delivery",JSON.stringify(delivery))},[delivery]);
 useEffect(()=>{if(user)setDelivery(current=>({...current,name:current.name||user.name||"",phone:current.phone||user.phone||""}))},[user]);
 useEffect(()=>{if(location)setDelivery(current=>({...current,city:current.city||location.city||"",state:current.state||location.state||"",postalCode:current.postalCode||location.postalCode||""}))},[location]);
 const groups=["All",...new Set(products.map(p=>p.category))];
 const filtered=useMemo(()=>products.filter(p=>(category==="All"||p.category===category)&&`${p.name} ${p.description||""}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="price-asc"?a.price-b.price:sort==="price-desc"?b.price-a.price:a.name.localeCompare(b.name)),[products,category,search,sort]);
 const count=Object.values(basket).reduce((sum,quantity)=>sum+quantity,0);
 const basketItems=products.filter(product=>basket[product._id]>0);
 const subtotal=basketItems.reduce((sum,product)=>sum+product.price*basket[product._id],0);
 const deliveryFee=subtotal>=299?0:25;
 const total=subtotal+deliveryFee;
 const changeQuantity=(product,quantity)=>{setBasket(current=>{const next={...current};if(quantity<=0)delete next[product._id];else next[product._id]=Math.min(20,quantity);return next});setMessage("");setPlacedOrder(null)};
 const showCheckout=()=>{setCheckoutStep(1);setCheckoutOpen(true);window.scrollTo({top:0,behavior:"smooth"})};
 const continueToAddress=()=>{if(!basketItems.length)return;setMessage("");setCheckoutStep(2)};
 const continueToReview=event=>{event.preventDefault();if(!delivery.name.trim()||!delivery.phone.trim()||!delivery.street.trim()||!delivery.city.trim()){setMessage("Enter your name, phone, street address and city to continue.");return}setMessage("");setCheckoutStep(3)};
 const place=async()=>{if(!count||!basketItems.length){setMessage("Your basket has no available products. Return to the shop and refresh your basket.");return}if(!user){setMessage("Sign in as a customer to place this grocery order.");return}setBusy(true);setMessage("");try{const {data}=await api.post("/grocery/orders",{items:Object.entries(basket).filter(([,quantity])=>quantity>0).map(([product,quantity])=>({product,quantity})),address:delivery,paymentMethod});sessionStorage.setItem("gofoode-mart-order",JSON.stringify(data));setPlacedOrder(data);sessionStorage.removeItem("gofoode-mart-delivery");setDelivery({name:user.name||"",phone:user.phone||"",street:"",city:location?.city||"",state:location?.state||"",postalCode:location?.postalCode||""});setBasket({});setCheckoutOpen(false);setCheckoutStep(1);await load()}catch(error){console.error("Grocery order failed",{message:error.message,status:error.response?.status});setMessage(error.response?.data?.message||(error.request?"We couldn't reach the grocery service. Check your connection and try again.":"We couldn't prepare your order. Please try again."))}finally{setBusy(false)}};
 if(placedOrder)return <><Header/><main className="feature-page mart-page"><section className="feature-panel order-success-panel"><span className="order-success-icon"><CheckCircle2 size={30}/></span><span className="eyebrow">GOFOODE MART ORDER</span><h1>Order placed successfully.</h1><p>Your order <b>{placedOrder.orderNumber}</b> is confirmed. {placedOrder.paymentMethod==="cod"?`Pay ${money(placedOrder.totalAmount)} in cash when it arrives.`:`Your ${placedOrder.paymentMethod==="upi"?"UPI":"net banking"} payment is pending. This demo did not collect any money.`}</p><div className="order-success-summary"><span>Order total</span><b>{money(placedOrder.totalAmount)}</b><span>Payment</span><b>{placedOrder.paymentMethod==="cod"?"Cash on delivery":`${placedOrder.paymentMethod==="upi"?"UPI":"Net banking"} · pending (demo)`}</b><span>Order status</span><b>{String(placedOrder.status||"placed").replaceAll("_"," ")}</b></div><div className="wizard-actions"><Link to="/customer/grocery-orders" className="btn btn-outline">View grocery orders</Link><button className="btn btn-primary" onClick={()=>{sessionStorage.removeItem("gofoode-mart-order");setPlacedOrder(null)}}>Continue shopping</button></div></section></main><Footer/></>;
 if(checkoutOpen&&count>0)return <MartCheckoutWizard step={checkoutStep} setStep={setCheckoutStep} items={basketItems} basket={basket} changeQuantity={changeQuantity} delivery={delivery} setDelivery={setDelivery} count={count} subtotal={subtotal} deliveryFee={deliveryFee} total={total} user={user} busy={busy} message={message} setMessage={setMessage} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} onBackToShop={()=>setCheckoutOpen(false)} onPlace={place}/>;
 return <><Header/><main className="feature-page mart-page">
  <div className="mart-hero"><div><span className="eyebrow">GOFOODE MART · DAILY ESSENTIALS</span><h1>Little things.<br/><em>Right on time.</em></h1><p>Fresh groceries and everyday favourites, delivered to your door.</p><div className="mart-search"><Search/><input aria-label="Search groceries" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search milk, fruits, snacks…"/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}><X size={16}/></button>}</div><div className="mart-trust"><span><Truck size={15}/> Free delivery over ₹299</span><span><CheckCircle2 size={15}/> Freshness guaranteed</span></div></div><img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=900" alt="Fresh market produce"/></div>
  {message&&<p className={`mart-message ${message.includes("successfully")?"success":""}`} role="status">{message}</p>}
  <div className="mart-toolbar"><div><span className="eyebrow">THE EVERYDAY SHOP</span><h2>Fresh picks, ready for you</h2><p>{filtered.length} products {category!=="All"?`in ${category}`:"available today"}</p></div><div className="mart-controls"><label>Sort<select aria-label="Sort groceries" value={sort} onChange={event=>setSort(event.target.value)}><option value="name">Name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label><div className="mart-view-switch" aria-label="Product layout"><button type="button" aria-label="Grid layout" aria-pressed={view==="grid"} className={view==="grid"?"active":""} onClick={()=>setView("grid")}><LayoutGrid size={17}/></button><button type="button" aria-label="List layout" aria-pressed={view==="list"} className={view==="list"?"active":""} onClick={()=>setView("list")}><List size={17}/></button></div></div></div>
  <div className="mart-categories" aria-label="Grocery categories">{groups.map(group=><button type="button" className={category===group?"filter-chip active":"filter-chip"} key={group} onClick={()=>setCategory(group)}>{group}</button>)}</div>
  {loadError?<div className="mart-empty"><PackageOpen size={32}/><p>{loadError}</p><button className="btn btn-outline btn-small" onClick={load}>Try again</button></div>:filtered.length===0?<div className="mart-empty"><Search size={30}/><p>No products match your search. Try another item or category.</p><button className="btn btn-outline btn-small" onClick={()=>{setSearch("");setCategory("All")}}>Show all products</button></div>:<div className={`grocery-grid ${view==="list"?"list-view":""}`}>{filtered.map(product=><article className="grocery-card" key={product._id}><div className="grocery-photo"><img src={product.image||imageFallback} alt={product.name} loading="lazy"/>{product.mrp>product.price&&<span className="grocery-discount">{Math.round((1-product.price/product.mrp)*100)}% OFF</span>}</div><small>{product.category} · {product.unit}</small><b>{product.name}</b><p>{product.description}</p><div className="grocery-card-actions"><span><strong>{money(product.price)}</strong>{product.mrp>product.price&&<del>{money(product.mrp)}</del>}</span>{product.stock===0?<span className="grocery-out-of-stock">Out of stock</span>:basket[product._id]?<span className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]-1)}><Minus size={13}/></button><b>{basket[product._id]}</b><button type="button" aria-label={`Add one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]+1)}><Plus size={13}/></button></span>:<button type="button" className="add-grocery" onClick={()=>changeQuantity(product,1)}>ADD +</button>}</div></article>)}</div>}
  {checkoutOpen&&count>0&&<section className="mart-checkout" ref={checkoutRef}><div className="mart-checkout-heading"><div><span className="eyebrow">YOUR GOFOODE MART ORDER</span><h2>Review your basket</h2><p>{count} items · Cash on delivery</p></div><button type="button" className="btn btn-outline btn-small" onClick={()=>setCheckoutOpen(false)}>Continue shopping</button></div><div className="mart-checkout-layout"><section className="feature-panel mart-basket-panel"><h3>Your items</h3>{basketItems.map(product=><div className="mart-basket-item" key={product._id}><img src={product.image||imageFallback} alt=""/><div><b>{product.name}</b><small>{product.unit} · {money(product.price)} each</small></div><span className="quantity-control"><button type="button" aria-label={`Remove one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]-1)}><Minus size={13}/></button><b>{basket[product._id]}</b><button type="button" aria-label={`Add one ${product.name}`} onClick={()=>changeQuantity(product,basket[product._id]+1)}><Plus size={13}/></button></span><strong>{money(product.price*basket[product._id])}</strong></div>)}</section><form className="feature-panel mart-delivery-panel" onSubmit={place}><h3>Delivery details</h3><div className="mart-form-grid"><label>Full name<input required value={delivery.name} onChange={event=>setDelivery({...delivery,name:event.target.value})} placeholder="Your name"/></label><label>Phone number<input required type="tel" value={delivery.phone} onChange={event=>setDelivery({...delivery,phone:event.target.value})} placeholder="+91 mobile number"/></label><label className="wide">Street address<input required value={delivery.street} onChange={event=>setDelivery({...delivery,street:event.target.value})} placeholder="Flat, street, landmark"/></label><label>City<input required value={delivery.city} onChange={event=>setDelivery({...delivery,city:event.target.value})} placeholder="Your city"/></label><label>PIN code<input value={delivery.postalCode} onChange={event=>setDelivery({...delivery,postalCode:event.target.value})} placeholder="Optional"/></label></div>{!user&&<p className="mart-signin-note">Please <Link to="/login" state={{from:"/instamart"}}>sign in</Link> as a customer before placing your order.</p>}<div className="mart-bill"><div><span>Items subtotal</span><b>{money(subtotal)}</b></div><div><span>Delivery</span><b>{deliveryFee===0?"FREE":money(deliveryFee)}</b></div><div className="mart-bill-total"><span>Pay on delivery</span><b>{money(total)}</b></div></div><button className="btn btn-primary btn-full" disabled={busy||!user}>{busy?"Placing order…":"Place grocery order"} <ArrowRight size={15}/></button></form></div></section>}
  {count>0&&<div className="mart-sticky-cart"><span><b>{count} {count===1?"item":"items"} in your basket</b><small>{money(subtotal)} subtotal · {deliveryFee===0?"Free delivery":`${money(deliveryFee)} delivery`}</small></span><button className="btn btn-primary" onClick={showCheckout}>Go to checkout · {money(total)} <ArrowRight size={15}/></button></div>}
 </main><Footer/></>;
}
function DineoutPage(){
 const [restaurants,setRestaurants]=useState([]),[form,setForm]=useState({restaurantId:"",date:"",time:"19:00",guests:2,occasion:"",notes:""}),[rows,setRows]=useState([]),[message,setMessage]=useState("");
 const formRef=useRef(null);
 useEffect(()=>{api.get("/restaurants").then(r=>setRestaurants(r.data)).catch(()=>{});api.get("/reservations/mine").then(r=>setRows(r.data)).catch(()=>{})},[]);
 const selectedRestaurant=restaurants.find(restaurant=>restaurant._id===form.restaurantId);
 const chooseRestaurant=id=>{setForm(current=>({...current,restaurantId:id}));requestAnimationFrame(()=>formRef.current?.scrollIntoView({behavior:"smooth",block:"start"}))};
 const book=async e=>{e.preventDefault();try{await api.post("/reservations",form);setMessage("Table request sent! The restaurant will confirm your reservation.");api.get("/reservations/mine").then(r=>setRows(r.data))}catch(e){setMessage(e.response?.data?.message||"Please log in as a customer to reserve a table")}};
 return <><Header/><main className="feature-page dineout-page"><div className="dineout-hero"><img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200" alt="A warmly lit restaurant dining room"/><div className="dineout-hero-copy"><span className="eyebrow">GOFOODE DINEOUT · YOUR NEXT NIGHT OUT</span><h1>Make room for<br/><em>good times.</em></h1><p>Find a table that fits the moment — a relaxed dinner, a celebration or a spontaneous catch-up with friends.</p><a className="btn btn-primary" href="#dineout-booking">Plan a table <ArrowRight size={15}/></a></div><div className="dineout-hero-note"><span>✦</span><b>Good evenings start around the table</b><small>Explore local spots and send a reservation request in a few taps.</small></div></div>
  <div className="dineout-highlights"><article><span>01</span><b>Find your atmosphere</b><small>Browse restaurant photos, cuisine and location.</small></article><article><span>02</span><b>Choose the details</b><small>Pick a date, time and party size that works.</small></article><article><span>03</span><b>Send a request</b><small>The restaurant can confirm or follow up on your booking.</small></article></div>
  <section className="dineout-restaurant-section"><div className="section-head"><div><span className="eyebrow">TABLES WORTH GATHERING AROUND</span><h2>Choose a restaurant<span className="orange">.</span></h2><p>See the place, cuisine and details before you book.</p></div><span className="muted">{restaurants.length} places</span></div>{restaurants.length?<div className="dineout-restaurant-grid">{restaurants.map(restaurant=><article className={`dineout-restaurant-card ${form.restaurantId===restaurant._id?"selected":""}`} key={restaurant._id}><img src={restaurant.coverImage||imageFallback} alt={restaurant.name} onError={event=>event.currentTarget.src=imageFallback}/><div className="dineout-restaurant-copy"><div className="dineout-restaurant-rating"><Star size={14} fill="currentColor"/>{restaurant.rating||"New"} <span>·</span> {restaurant.deliveryTime||35} min away</div><h3>{restaurant.name}</h3><p>{restaurant.description||"Explore this local restaurant and its menu."}</p><small>{(restaurant.cuisine||[]).join(" · ")||"Multi-cuisine"}{restaurant.address?.city?` · ${restaurant.address.city}`:""}</small><button type="button" className={form.restaurantId===restaurant._id?"btn btn-outline btn-small":"btn btn-primary btn-small"} onClick={()=>chooseRestaurant(restaurant._id)}>{form.restaurantId===restaurant._id?"Selected":"Book this restaurant"} <ArrowRight size={14}/></button></div></article>)}</div>:<div className="mart-empty"><Utensils size={30}/><p>Restaurants are unavailable right now. Please try again later.</p></div>}</section>
  <div className="checkout-layout dineout-booking-layout" id="dineout-booking"><section className="feature-panel" ref={formRef}><span className="eyebrow">A FEW DETAILS, THEN YOU’RE SET</span><h2>Request a table</h2>{selectedRestaurant&&<div className="dineout-selected"><img src={selectedRestaurant.coverImage||imageFallback} alt={selectedRestaurant.name} onError={event=>event.currentTarget.src=imageFallback}/><div><b>{selectedRestaurant.name}</b><small>{(selectedRestaurant.cuisine||[]).join(" · ")} · ★ {selectedRestaurant.rating||"New"}</small></div></div>}<form className="stack-form" onSubmit={book}><label>Restaurant<select required value={form.restaurantId} onChange={e=>setForm({...form,restaurantId:e.target.value})}><option value="">Choose a restaurant</option>{restaurants.map(r=><option key={r._id} value={r._id}>{r.name}</option>)}</select></label><div className="form-row"><label>Date<input type="date" required min={new Date().toISOString().slice(0,10)} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Time<input type="time" required value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></label></div><label>Guests<select value={form.guests} onChange={e=>setForm({...form,guests:Number(e.target.value)})}>{[1,2,3,4,5,6,7,8,9,10,12].map(n=><option key={n}>{n}</option>)}</select></label><label>Occasion<input value={form.occasion} onChange={e=>setForm({...form,occasion:e.target.value})} placeholder="Birthday, anniversary…"/></label><label>Special request<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes for the restaurant"/></label><button className="btn btn-primary">Request reservation</button>{message&&<p className="coupon-message">{message}</p>}</form></section><section className="feature-panel"><span className="eyebrow">YOUR GOFOODE DINEOUT PLANS</span><h2>Your reservations</h2>{rows.length?rows.map(r=><div className="reservation-row" key={r._id}><b>{r.restaurant?.name}</b><small>{new Date(r.date).toLocaleDateString()} · {r.time} · {r.guests} guests</small><span className="badge">{r.status}</span></div>):<p className="muted">Your table bookings will appear here after you sign in.</p>}</section></div></main><Footer/></>;
}

function GeniePage(){
 const {user}=useAuth();
 const blankForm={pickup:{name:user?.name||"",phone:user?.phone||"",address:""},drop:{name:"",phone:"",address:""},itemDescription:"",instructions:""};
 const [form,setForm]=useState(blankForm),[rows,setRows]=useState([]),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const load=()=>api.get("/genie/requests/mine").then(r=>{setRows(r.data);setError("")}).catch(e=>setError(e.response?.data?.message||"Sign in as a customer to view pickup requests."));
 useEffect(()=>{load();const timer=setInterval(load,20000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(user)setForm(current=>({...current,pickup:{...current.pickup,name:current.pickup.name||user.name||"",phone:current.pickup.phone||user.phone||""}}))},[user]);
 const change=(section,key,value)=>setForm(current=>({...current,[section]:{...current[section],[key]:value}}));
 const submit=async event=>{
  event.preventDefault();setError("");setMessage("");setBusy(true);
  try{const response=await api.post("/genie/requests",form);setMessage(`Pickup request ${response.data._id.slice(-6).toUpperCase()} created. A delivery partner can accept it shortly.`);setForm({...blankForm,pickup:{...blankForm.pickup}});await load()}
  catch(e){setError(e.response?.data?.message||"Could not create this pickup request. Check the details and try again.")}
  finally{setBusy(false)}
 };
 const cancel=async request=>{setError("");try{await api.patch(`/genie/requests/${request._id}/cancel`);await load()}catch(e){setError(e.response?.data?.message||"This request can no longer be cancelled.")}};
 const statusLabel=status=>({requested:"Finding a delivery partner",accepted:"Partner accepted",picked_up:"Parcel picked up",on_the_way:"On the way",delivered:"Delivered",cancelled:"Cancelled"}[status]||status);
 return <><Header/><main className="feature-page genie-page">
  <section className="genie-hero"><div className="genie-hero-copy"><span className="eyebrow">GOFOODE GENIE · PICKUP & DROP</span><h1>Across town,<br/><em>without the runaround.</em></h1><p>Send documents, keys and small parcels with clear pickup details, delivery progress and a simple flat demo fee.</p><div className="genie-hero-actions"><a href="#pickup-form" className="btn btn-primary">Book a pickup <ArrowRight size={15}/></a><span><ShieldCheck size={16}/> Request tracking in your account</span></div></div><img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1000" alt="Parcel ready for local pickup"/></section>
  <section className="genie-steps"><div><span>01</span><b>Pickup address</b><small>Who and where to collect from</small></div><div><span>02</span><b>Drop address</b><small>Recipient and delivery location</small></div><div><span>03</span><b>Follow the trip</b><small>See acceptance and delivery status</small></div></section>
  {message&&<p className="success-box" role="status">{message}</p>}{error&&<p className="error-box" role="alert">{error}{!user&&<> <Link to="/login" state={{from:"/genie"}}>Sign in to continue</Link></>}</p>}
  <div className="genie-content"><section className="panel genie-booking-panel" id="pickup-form"><div className="panel-head"><div><span className="eyebrow">SCHEDULE A LOCAL DELIVERY</span><h2>Pickup and drop details</h2><p>Enter a reachable contact and a complete address for both ends.</p></div><span className="genie-fee-badge">₹49 <small>demo fee</small></span></div>
   <form className="stack-form" onSubmit={submit}>
    <div className="genie-address-block pickup"><div className="genie-address-heading"><span>1</span><div><b>Pickup point</b><small>Where the parcel will be collected</small></div></div><div className="form-row"><label>Contact name<input required maxLength="100" autoComplete="name" value={form.pickup.name} onChange={e=>change("pickup","name",e.target.value)} placeholder="Sender's name"/></label><label>Phone number<input required type="tel" maxLength="30" value={form.pickup.phone} onChange={e=>change("pickup","phone",e.target.value)} placeholder="Reachable phone"/></label></div><label>Full pickup address<textarea required maxLength="400" value={form.pickup.address} onChange={e=>change("pickup","address",e.target.value)} placeholder="Flat or building, street, area, city"/></label></div>
    <div className="genie-address-block drop"><div className="genie-address-heading"><span>2</span><div><b>Drop point</b><small>Who should receive the parcel</small></div></div><div className="form-row"><label>Recipient name<input required maxLength="100" value={form.drop.name} onChange={e=>change("drop","name",e.target.value)} placeholder="Recipient's name"/></label><label>Recipient phone<input required type="tel" maxLength="30" value={form.drop.phone} onChange={e=>change("drop","phone",e.target.value)} placeholder="Reachable phone"/></label></div><label>Full delivery address<textarea required maxLength="400" value={form.drop.address} onChange={e=>change("drop","address",e.target.value)} placeholder="Flat or building, street, area, city"/></label></div>
    <div className="form-row"><label>What are you sending?<input required maxLength="120" value={form.itemDescription} onChange={e=>setForm(current=>({...current,itemDescription:e.target.value}))} placeholder="Documents, keys, small parcel"/></label><label>Delivery instructions<input maxLength="300" value={form.instructions} onChange={e=>setForm(current=>({...current,instructions:e.target.value}))} placeholder="Landmark, gate code…"/></label></div>
    <div className="genie-demo-note"><Package size={18}/><span><b>Small parcels and documents only</b><small>Do not send cash, restricted goods, fragile or oversized items. ₹49 is a demo estimate; this app does not dispatch a real courier.</small></span></div>
    <button className="btn btn-primary" disabled={busy||!user}>{busy?"Submitting request…":"Request pickup · ₹49 demo fee"} <ArrowRight size={15}/></button>
   </form>
  </section>
  <section className="genie-requests-panel"><div className="panel-head"><div><span className="eyebrow">YOUR GOFOODE GENIE ACTIVITY</span><h2>Pickup requests</h2><p>Updates refresh automatically while this page is open.</p></div><button className="btn btn-outline btn-small" onClick={load}>Refresh</button></div>
   {rows.length?rows.map(request=><article className="genie-request-card" key={request._id}><div className="genie-request-top"><div><span className="eyebrow">REQUEST #{request._id.slice(-6).toUpperCase()}</span><b>{request.itemDescription}</b><small>{new Date(request.createdAt).toLocaleString()}</small></div><span className={`genie-status status-${request.status}`}>{statusLabel(request.status)}</span></div><div className="genie-route"><div><i className="pickup-dot"/><span><small>PICKUP</small><b>{request.pickup?.name} · {request.pickup?.phone}</b><p>{request.pickup?.address}</p></span></div><div><i className="drop-dot"/><span><small>DROP</small><b>{request.drop?.name} · {request.drop?.phone}</b><p>{request.drop?.address}</p></span></div></div>{request.deliveryPartner&&<p className="genie-partner"><Bike size={14}/> Delivery partner: {request.deliveryPartner.name}</p>}{request.currentLocation?.coordinates&&<GoogleMap title="Pickup and drop delivery location" latitude={request.currentLocation.coordinates[1]} longitude={request.currentLocation.coordinates[0]} destination={request.drop?.address} />}{request.status==="requested"&&<button className="btn btn-outline btn-small" onClick={()=>cancel(request)}>Cancel request</button>}</article>):<div className="genie-empty"><PackageOpen size={30}/><b>No pickup requests yet</b><p>Your parcel requests and delivery progress will appear here.</p></div>}
  </section></div>
 </main><Footer/></>;
}
function ExperiencesPage(){
 const [events,setEvents]=useState([]),[bookings,setBookings]=useState([]),[message,setMessage]=useState("");
 const load=()=>{api.get("/experiences").then(r=>setEvents(r.data)).catch(()=>{});api.get("/experiences/bookings/mine").then(r=>setBookings(r.data)).catch(()=>{})};
 useEffect(()=>{load()},[]);
 const book=async id=>{try{const {data}=await api.post(`/experiences/${id}/book`,{tickets:1});setMessage(`Booking confirmed. Reference: ${data._id}`);load()}catch(e){setMessage(e.response?.data?.message||"Please log in as a customer to book")}};
 return <><Header/><main className="feature-page experiences-page"><section className="experiences-hero"><img src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1400" alt="Friends sharing an evening at a local event"/><div><span className="eyebrow">GOFOODE EXPERIENCES · GATHER A LITTLE CLOSER</span><h1>Make memories.<br/><em>Not just plans.</em></h1><p>Discover food events, social dining and local experiences worth putting on the calendar.</p><a className="btn btn-primary" href="#upcoming-events">Explore upcoming events <ArrowRight size={15}/></a></div><aside className="experience-hero-note"><CalendarDays size={18}/><span><b>Make room for something memorable</b><small>Browse local plans and book a spot in a few taps.</small></span></aside></section><section className="events-intro"><div><span className="eyebrow">A GOOD REASON TO GET TOGETHER</span><h2>Experiences for your kind of day</h2><p>From slow brunches to hands-on food nights, discover upcoming events and the details before you book.</p></div><div className="events-intro-tags"><span>🍽️ Shared tables</span><span>🎨 Hands-on fun</span><span>📍 Local hosts</span></div></section><div className="experience-grid" id="upcoming-events">{events.map(e=><article className="experience-card" key={e._id}><div className="experience-photo"><img src={e.image||imageFallback} alt={e.title} onError={event=>event.currentTarget.src=imageFallback}/><span className="experience-date">{new Date(e.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</span></div><div><span className="eyebrow">{e.city} · {e.time}</span><h2>{e.title}</h2><p>{e.description}</p><small><MapPin size={13}/>{e.venue} · {e.capacity||"Limited"} spots</small><div><b>{e.price?money(e.price):"Free"} <small>per person</small></b><button className="btn btn-primary btn-small" onClick={()=>book(e._id)}>Book a spot</button></div></div></article>)}</div>{!events.length&&<div className="mart-empty"><CalendarDays size={30}/><p>No upcoming events are listed right now. Please check back soon.</p></div>}{message&&<p className="coupon-message">{message}</p>}<section className="feature-panel event-bookings"><span className="eyebrow">YOUR GOFOODE PLANS</span><h2>Your bookings</h2>{bookings.length?bookings.map(b=><div className="reservation-row" key={b._id}><b>{b.experience?.title}</b><small>{b.tickets} ticket(s) · {money(b.amount)}</small><span className="badge">{b.status}</span></div>):<p className="muted">Your experience bookings will appear here after you sign in.</p>}</section></main><Footer/></>;
}
function OffersPage(){
 const [offers,setOffers]=useState([]);
 useEffect(()=>{api.get("/offers").then(r=>setOffers(r.data)).catch(()=>{})},[]);
 return <><Header/><main className="feature-page"><div className="feature-title"><span className="eyebrow">MORE JOY IN EVERY ORDER</span><h1>Offers worth <em>sharing.</em></h1><p>Use these demo coupons at checkout. Validity and minimum order conditions apply.</p></div><div className="offers-grid">{offers.map(o=><article className="offer-card" key={o._id}><TicketPercent size={28}/><h2>{o.code}</h2><b>{o.discountType==="percentage"?`${o.discountValue}% OFF`:`₹${o.discountValue} OFF`}</b><p>On orders above {money(o.minOrder)} · Max saving {money(o.maxDiscount||o.discountValue)}</p><button onClick={()=>{navigator.clipboard?.writeText(o.code)}}>Copy code</button></article>)}</div><p className="muted">Demo coupons: WELCOME50 · TASTY20 · GOFOODE100</p></main><Footer/></>;
}
function PlusPage(){
 const [data,setData]=useState({plans:[]}),[message,setMessage]=useState("");
 useEffect(()=>{api.get("/membership").then(r=>setData(r.data)).catch(()=>{})},[]);
 const join=async()=>{try{const {data}=await api.post("/membership/subscribe");setMessage(data.message);setData({...data,plans:data.plans||[]})}catch(e){setMessage(e.response?.data?.message||"Please log in as a customer to activate GoFoode Plus")}};
 return <><Header/><main className="feature-page plus-page"><div className="plus-hero"><Crown size={45}/><span className="eyebrow">THE GOOD LIFE, WITH EXTRAS</span><h1>GoFoode <em>Plus</em></h1><p>More perks. More savings. More reasons to make every meal a moment.</p><h2>₹299 <small>/ 90 days</small></h2><button className="btn btn-white" onClick={join}>Activate demo membership</button>{message&&<p>{message}</p>}</div><div className="plus-benefits">{["Free delivery on eligible orders","Exclusive member-only offers","Priority customer support","Special dining-out perks"].map((x,i)=><div key={x}><CheckCircle2/><b>{x}</b></div>)}</div><p className="muted">Membership activation is a demonstration. Connect a payment gateway before accepting real subscription payments.</p></main><Footer/></>;
}
function DashboardRouter() {
  const { user } = useAuth();
  if(user?.role==="admin") return <Navigate to="/admin" replace/>;
  if(user?.role==="restaurant_owner") return <Navigate to="/restaurant" replace/>;
  if(user?.role==="delivery_partner") return <Navigate to="/delivery" replace/>;
  return <Navigate to="/customer" replace/>;
}
export default function App() {
  return <Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/restaurants/:id" element={<Protected roles={["customer"]}><RestaurantDetail/></Protected>}/>
    <Route path="/orders/:id" element={<Protected roles={["customer"]}><OrderTrackingPage/></Protected>}/>
    <Route path="/cart" element={<Protected roles={["customer"]}><CartPage/></Protected>}/>
    <Route path="/instamart" element={<InstamartPage/>}/>
    <Route path="/dineout" element={<DineoutPage/>}/>
    <Route path="/offers" element={<OffersPage/>}/>
    <Route path="/genie" element={<GeniePage/>}/>
    <Route path="/experiences" element={<ExperiencesPage/>}/>
    <Route path="/plus" element={<Protected roles={["customer"]}><PlusPage/></Protected>}/>
    <Route path="/dashboard" element={<Protected><DashboardRouter/></Protected>}/>
    <Route path="/profile" element={<Protected><ProfilePage/></Protected>}/>
    <Route path="/customer" element={<Protected roles={["customer"]}><CustomerDashboard/></Protected>}/>
    <Route path="/customer/orders" element={<Protected roles={["customer"]}><CustomerOrders/></Protected>}/>
    <Route path="/customer/grocery-orders" element={<Protected roles={["customer"]}><CustomerGroceryOrders/></Protected>}/>
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
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
