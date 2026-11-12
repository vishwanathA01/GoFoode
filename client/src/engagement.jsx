// Visitor-facing features: daily spin & streaks, refer & earn, coupon wallet, the live order pulse,
// the food mood finder and the "install the app" prompt.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Copy, Flame, Gift, Lock, Share2, Shuffle, Sparkles, Ticket, Timer, Trophy, Users, X, Zap } from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";

const money = n => `₹${Math.round(Number(n || 0) * 100) / 100}`;
const imageFallback = "/food-placeholder.svg";
const onImageError = event => { event.currentTarget.onerror = null; event.currentTarget.src = imageFallback; };
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const couponSummary = c => `${c.discountType === "percentage" ? `${c.discountValue}% off${c.maxDiscount ? `, up to ${money(c.maxDiscount)}` : ""}` : `${money(c.discountValue)} off`}${c.minOrder ? ` on orders above ${money(c.minOrder)}` : ""}`;
const copyText = text => navigator.clipboard?.writeText(text).then(() => true).catch(() => false) ?? Promise.resolve(false);
function useTicker(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(timer); }, [ms]);
  return now;
}
function timeLeft(target, now) {
  const ms = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
const ago = date => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
};

// ---------------------------------------------------------------------------------------------------------
// Spin wheel
// ---------------------------------------------------------------------------------------------------------
function SpinWheel({ prizes, rotation, spinning, onSettled }) {
  const n = prizes.length || 6;
  const slice = 360 / n;
  const point = (angle, radius) => { const rad = (angle - 90) * Math.PI / 180; return [150 + radius * Math.cos(rad), 150 + radius * Math.sin(rad)]; };
  return <div className="eg-wheel">
    <span className="eg-wheel-pointer" aria-hidden="true"/>
    <svg viewBox="0 0 300 300" className={`eg-wheel-disc ${spinning ? "spinning" : ""}`} style={{ transform: `rotate(${rotation}deg)` }} onTransitionEnd={onSettled} role="img" aria-label={`Prize wheel with ${prizes.map(prize => prize.label).join(", ")}`}>
      <circle cx="150" cy="150" r="148" fill="#fff"/>
      {prizes.map((prize, index) => {
        const [x1, y1] = point(index * slice, 140), [x2, y2] = point((index + 1) * slice, 140);
        const mid = index * slice + slice / 2;
        const [tx, ty] = point(mid, 92);
        return <g key={prize.id}>
          <path d={`M150 150 L${x1} ${y1} A140 140 0 0 1 ${x2} ${y2} Z`} fill={prize.color} stroke="#fff" strokeWidth="3"/>
          <text x={tx} y={ty} transform={`rotate(${mid} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" className="eg-wheel-label">{prize.label}</text>
          {prize.jackpot && <text x={point(mid, 122)[0]} y={point(mid, 122)[1]} transform={`rotate(${mid} ${point(mid, 122)[0]} ${point(mid, 122)[1]})`} textAnchor="middle" dominantBaseline="middle" fontSize="14">👑</text>}
        </g>;
      })}
      {Array.from({ length: n * 2 }, (_, index) => { const [x, y] = point(index * slice / 2, 145); return <circle key={index} cx={x} cy={y} r="3" fill="#fff" opacity=".9"/>; })}
    </svg>
    <span className="eg-wheel-hub" aria-hidden="true"><Gift size={26}/></span>
  </div>;
}

function Confetti() {
  return <div className="eg-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--d": `${((index * 53) % 17) * 0.06}s`, "--r": `${(index * 71) % 360}deg`, "--c": ["#ff9d00", "#ff5c16", "#1a9a52", "#7c4dff", "#e8437a", "#0878df"][index % 6] }}/>)}</div>;
}

function StreakDots({ progress, length }) {
  return <ol className="eg-streak" aria-label={`Streak: day ${progress} of ${length}`}>
    {Array.from({ length }, (_, index) => <li key={index} className={index < progress ? "on" : ""}>{index === length - 1 ? <Trophy size={13}/> : index < progress ? <Check size={12} strokeWidth={3}/> : index + 1}</li>)}
  </ol>;
}

function CouponCard({ coupon, now, onUse }) {
  const [copied, setCopied] = useState(false);
  const urgent = new Date(coupon.expiresAt).getTime() - now < 24 * 3600000;
  return <article className={`eg-coupon ${coupon.source}`}>
    <span className="eg-coupon-icon" aria-hidden="true">{coupon.source === "referral" ? <Users size={18}/> : coupon.source === "welcome" ? <Gift size={18}/> : coupon.source === "streak" ? <Flame size={18}/> : <Ticket size={18}/>}</span>
    <div className="eg-coupon-copy"><b>{coupon.title || couponSummary(coupon)}</b><small>{couponSummary(coupon)}</small>
      <span className={`eg-expiry ${urgent ? "urgent" : ""}`}><Timer size={12}/> Expires in {timeLeft(coupon.expiresAt, now)}</span></div>
    <div className="eg-coupon-actions">
      <button type="button" className="eg-code" onClick={() => copyText(coupon.code).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); } })} title="Copy code">{coupon.code}{copied ? <Check size={13} strokeWidth={3}/> : <Copy size={13}/>}</button>
      <button type="button" className="btn btn-primary btn-small" onClick={onUse}>Use now</button>
    </div>
  </article>;
}

function ReferralCard({ referral }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/register?ref=${referral.code}`;
  const message = `I order food on GoFoode 🍔 Sign up with my link and get ${referral.friendReward}: ${link}`;
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "GoFoode", text: message, url: link }); return; } catch { /* closed */ } }
    if (await copyText(link)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  return <section className="eg-card eg-referral" aria-labelledby="eg-referral-title">
    <span className="eg-kicker"><Users size={14}/> Refer & earn</span>
    <h2 id="eg-referral-title">Share the food love, <em>get ₹100 off.</em></h2>
    <p>Your friends get <b>{referral.friendReward}</b>. You get <b>{referral.yourReward}</b>.</p>
    <div className="eg-ref-link"><code>{link.replace(/^https?:\/\//, "")}</code><button type="button" onClick={() => copyText(link).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } })}>{copied ? <><Check size={14} strokeWidth={3}/> Copied</> : <><Copy size={14}/> Copy</>}</button></div>
    <div className="eg-ref-actions">
      <a className="btn eg-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      <button type="button" className="btn btn-outline" onClick={share}><Share2 size={15}/> More ways to share</button>
    </div>
    <dl className="eg-ref-stats">
      <div><dt>Friends joined</dt><dd>{referral.invited}</dd></div>
      <div><dt>Ordered</dt><dd>{referral.rewarded}</dd></div>
      <div><dt>Rewards earned</dt><dd>{referral.earnedCoupons}</dd></div>
    </dl>
  </section>;
}

export function RewardsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCustomer = user?.role === "customer";
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [rotation, setRotation] = useState(0), [spinning, setSpinning] = useState(false), [result, setResult] = useState(null), [pending, setPending] = useState(null);
  const now = useTicker();
  const load = () => api.get("/rewards").then(response => { setData(response.data); setError(""); }).catch(err => setError(err.response?.data?.message || "We couldn't load your rewards. Please try again."));
  useEffect(() => { if (isCustomer) load(); }, [isCustomer]);
  const preview = [
    { id: "off10", label: "10% OFF", color: "#ff9d00" }, { id: "flat30", label: "₹30 OFF", color: "#ff6a13" }, { id: "off15", label: "15% OFF", color: "#e8437a" },
    { id: "flat50", label: "₹50 OFF", color: "#7c4dff" }, { id: "off20", label: "20% OFF", color: "#1a9a52" }, { id: "flat100", label: "₹100 OFF", color: "#13213a", jackpot: true }
  ];
  const prizes = data?.prizes || preview;

  const spin = async () => {
    if (spinning || !data?.spin.available) return;
    setSpinning(true); setResult(null); setError("");
    try {
      const { data: won } = await api.post("/rewards/spin");
      const slice = 360 / prizes.length;
      const target = 360 - (won.prizeIndex * slice + slice / 2);
      // Several full turns, then land with the winning slice under the pointer.
      setRotation(current => current - (current % 360) + 360 * (reducedMotion() ? 1 : 6) + target);
      setPending(won);
    } catch (err) {
      setSpinning(false);
      setError(err.response?.data?.message || "The wheel got stuck. Please try again.");
      load();
    }
  };
  const settled = () => { if (!pending) return; setSpinning(false); setResult(pending); setPending(null); load(); };

  if (!isCustomer) {
    return <main className="eg-page">
      <section className="eg-hero"><div className="eg-wrap eg-hero-grid">
        <div><span className="eg-kicker light"><Sparkles size={14}/> GoFoode Rewards</span><h1>Spin daily. <em>Eat for less.</em></h1>
          <p>Win a new coupon every day, build a 7-day streak for a guaranteed jackpot, and earn ₹100 for every friend you invite.</p>
          {user ? <p className="eg-note">Rewards are for customer accounts. Sign in with a customer account to play.</p>
            : <div className="eg-hero-actions"><Link to="/register" state={{ from: "/rewards" }} className="btn btn-primary">Join free & spin <ArrowRight size={16}/></Link><Link to="/login" state={{ from: "/rewards" }} className="btn eg-ghost">I have an account</Link></div>}
        </div>
        <div className="eg-wheel-stage locked"><SpinWheel prizes={preview} rotation={-18} spinning={false} onSettled={() => {}}/><span className="eg-lock"><Lock size={18}/> Sign in to spin</span></div>
      </div></section>
      <RewardsHowItWorks/>
    </main>;
  }

  const spinState = data?.spin;
  return <main className="eg-page">
    <section className="eg-hero"><div className="eg-wrap eg-hero-grid">
      <div>
        <span className="eg-kicker light"><Sparkles size={14}/> GoFoode Rewards</span>
        <h1>Hi {user.name?.split(" ")[0]}, <em>spin to win.</em></h1>
        <p>One free spin every day. Keep your streak going for 7 days in a row to unlock a guaranteed top prize.</p>
        {spinState && <div className="eg-streak-box">
          <div className="eg-streak-head"><b><Flame size={16}/> {spinState.streak ? `${spinState.streak}-day streak` : "Start your streak today"}</b><small>{spinState.progress === spinState.streakLength ? "Bonus won! A new streak starts tomorrow." : `${spinState.spinsToBonus} more ${spinState.spinsToBonus === 1 ? "spin" : "spins"} to the jackpot`}</small></div>
          <StreakDots progress={spinState.progress} length={spinState.streakLength}/>
        </div>}
      </div>
      <div className="eg-wheel-stage">
        <SpinWheel prizes={prizes} rotation={rotation} spinning={spinning} onSettled={settled}/>
        {!data ? <button type="button" className="btn btn-primary eg-spin-btn" disabled>Loading…</button>
          : spinState.available ? <button type="button" className="btn btn-primary eg-spin-btn" disabled={spinning} onClick={spin}>{spinning ? "Spinning…" : <><Zap size={16}/> Spin the wheel</>}</button>
          : <div className="eg-next-spin"><Timer size={15}/> Next spin in <b>{timeLeft(spinState.nextSpinAt, now)}</b>{spinState.today && <small>Today you won {spinState.today.label}</small>}</div>}
        {error && <p className="eg-error" role="alert">{error}</p>}
      </div>
    </div></section>

    {result && <div className="eg-overlay" role="dialog" aria-modal="true" aria-labelledby="eg-win-title" onClick={event => { if (event.target === event.currentTarget) setResult(null); }}>
      <div className="eg-win">
        <Confetti/>
        <button type="button" className="eg-win-close" aria-label="Close" onClick={() => setResult(null)}><X size={18}/></button>
        <span className="eg-win-badge">{result.bonus ? "🔥" : "🎉"}</span>
        <small>{result.bonus ? "7-day streak bonus" : "You won"}</small>
        <h2 id="eg-win-title">{result.prize.label}</h2>
        <p>{result.prize.detail}. It's in your wallet and valid for 3 days.</p>
        <div className="eg-win-code"><code>{result.coupon.code}</code><button type="button" onClick={() => copyText(result.coupon.code)}><Copy size={14}/> Copy</button></div>
        <button type="button" className="btn btn-primary btn-full" onClick={() => navigate("/food")}>Order now and save <ArrowRight size={16}/></button>
      </div>
    </div>}

    <div className="eg-wrap eg-grid">
      <section className="eg-card eg-wallet" aria-labelledby="eg-wallet-title">
        <div className="eg-card-head"><div><span className="eg-kicker"><Ticket size={14}/> Your wallet</span><h2 id="eg-wallet-title">Coupons ready to use</h2></div><span className="eg-count">{data?.coupons.length || 0}</span></div>
        {!data ? <div className="eg-skeleton"><i/><i/></div>
          : data.coupons.length ? <div className="eg-coupons">{data.coupons.map(coupon => <CouponCard key={coupon._id} coupon={coupon} now={now} onUse={() => navigate("/food")}/>)}</div>
          : <div className="eg-empty"><span aria-hidden="true">🎟️</span><p>No coupons yet. Spin the wheel or invite a friend to fill your wallet.</p></div>}
        <p className="eg-fine">Your coupons also appear at checkout under “Offers & coupons”. Each one can be used once.</p>
      </section>
      {data ? <ReferralCard referral={data.referral}/> : <section className="eg-card eg-skeleton"><i/><i/><i/></section>}
    </div>
    <RewardsHowItWorks/>
  </main>;
}

function RewardsHowItWorks() {
  const steps = [
    { icon: Zap, title: "Spin once a day", text: "Every spin wins a coupon worth up to ₹100, valid for 3 days." },
    { icon: Flame, title: "Build a streak", text: "Spin 7 days in a row and the 7th spin is guaranteed to be a top prize." },
    { icon: Users, title: "Invite friends", text: "They get ₹75 off their first order; you get ₹100 off when they order." },
    { icon: Ticket, title: "Save at checkout", text: "Your coupons show up automatically when you pay. No codes to remember." }
  ];
  return <section className="eg-wrap eg-how" aria-labelledby="eg-how-title">
    <h2 id="eg-how-title">How GoFoode Rewards works</h2>
    <ol>{steps.map(({ icon: Icon, title, text }, index) => <li key={title}><span className="eg-how-icon"><Icon size={18}/></span><b>{index + 1}. {title}</b><p>{text}</p></li>)}</ol>
  </section>;
}

// ---------------------------------------------------------------------------------------------------------
// Homepage: rewards teaser
// ---------------------------------------------------------------------------------------------------------
export function RewardsTeaser() {
  const { user } = useAuth();
  return <section className="hx-wrap eg-teaser" aria-label="GoFoode Rewards">
    <div className="eg-teaser-copy">
      <span className="eg-kicker light"><Gift size={14}/> New · GoFoode Rewards</span>
      <h2>Spin the wheel every day. <em>Win up to ₹100 off.</em></h2>
      <p>Free daily spins, a 7-day streak jackpot, and ₹100 for every friend you bring.</p>
      <Link to="/rewards" className="btn btn-primary">{user?.role === "customer" ? "Spin today's wheel" : "Join free & spin"} <ArrowRight size={16}/></Link>
    </div>
    <div className="eg-teaser-wheel" aria-hidden="true"><SpinWheel prizes={[
      { id: "a", label: "10% OFF", color: "#ff9d00" }, { id: "b", label: "₹30 OFF", color: "#ff6a13" }, { id: "c", label: "15% OFF", color: "#e8437a" },
      { id: "d", label: "₹50 OFF", color: "#7c4dff" }, { id: "e", label: "20% OFF", color: "#1a9a52" }, { id: "f", label: "₹100 OFF", color: "#13213a", jackpot: true }
    ]} rotation={0} spinning={false} onSettled={() => {}}/></div>
  </section>;
}

// ---------------------------------------------------------------------------------------------------------
// Homepage: live pulse (trending dishes + recent orders)
// ---------------------------------------------------------------------------------------------------------
export function PulseSection() {
  const [pulse, setPulse] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => api.get("/discover/pulse").then(response => { if (live) setPulse(response.data); }).catch(() => {});
    load();
    const refresh = setInterval(load, 60000);
    return () => { live = false; clearInterval(refresh); };
  }, []);
  const recent = pulse?.recent || [];
  useEffect(() => { if (recent.length < 2 || reducedMotion()) return; const timer = setInterval(() => setTick(value => value + 1), 3800); return () => clearInterval(timer); }, [recent.length]);
  if (!pulse?.trending?.length) return null;
  const current = recent.length ? recent[tick % recent.length] : null;
  return <section className="hx-section eg-pulse" id="trending">
    <div className="hx-wrap">
      <div className="hx-head"><div><span className="hx-kicker"><Flame size={13}/> Trending this week</span><h2>What everyone's <em>ordering right now.</em></h2><p>Ranked by real orders from the last 7 days. Tap a dish to see what's in it.</p></div><Link to="/food" className="hx-link">See all dishes <ArrowRight size={15}/></Link></div>
      {current && <div className="eg-ticker" role="status" aria-live="polite">
        <span className="eg-live"><i/> Live</span>
        <span className="eg-ticker-text" key={tick}>🛵 <b>{current.dish}</b>{current.more > 0 && ` + ${current.more} more`} from {current.restaurant}{current.city && ` · ${current.city}`} <em>· {ago(current.at)}</em></span>
        {pulse.ordersToday > 0 && <span className="eg-today">{pulse.ordersToday} {pulse.ordersToday === 1 ? "order" : "orders"} today</span>}
      </div>}
      <div className="eg-trending">{pulse.trending.slice(0, 8).map((dish, index) => <Link to={`/food?dish=${dish._id}`} className="eg-trend" key={dish._id}>
        <span className="eg-trend-media"><img src={dish.image || imageFallback} alt="" loading="lazy" onError={onImageError}/><span className="eg-rank">#{index + 1}</span></span>
        <span className="eg-trend-copy"><b>{dish.name}</b><small>{dish.restaurant.name}</small>
          <span className="eg-trend-meta"><span>{money(dish.price)}</span>{dish.orderedThisWeek > 0 ? <em className="hot"><Flame size={12}/> {dish.orderedThisWeek} ordered</em> : dish.isBestseller ? <em>★ Bestseller</em> : <em>{dish.restaurant.deliveryTime || 30} min</em>}</span></span>
      </Link>)}</div>
    </div>
  </section>;
}

// ---------------------------------------------------------------------------------------------------------
// Homepage: food mood finder
// ---------------------------------------------------------------------------------------------------------
const moods = [
  { id: "comfort", emoji: "🍲", label: "Comfort food", test: /butter|cheese|biryani|dal|masala|burger|pizza|paneer|makhani|noodle/ , cuisines: /indian|burger|pizza|italian|fast food/ },
  { id: "healthy", emoji: "🥗", label: "Light & healthy", test: /salad|bowl|quinoa|grilled|fresh|avocado|green/, cuisines: /healthy|salad/ },
  { id: "spicy", emoji: "🌶️", label: "Something spicy", test: /chilli|chili|spicy|pepper|tandoori|hot|schezwan/, cuisines: /chinese|indian/ },
  { id: "sweet", emoji: "🍰", label: "Sweet tooth", test: /chocolate|cake|sweet|brownie|cheesecake|tiramisu|dessert/, cuisines: /dessert|bakery/ },
  { id: "quick", emoji: "⚡", label: "Super quick", test: /./, cuisines: /./ },
  { id: "treat", emoji: "👑", label: "Treat myself", test: /special|premium|pesto|biryani|cheesecake|tikka/, cuisines: /./ }
];
function moodScore(dish, mood) {
  const text = `${dish.name} ${dish.description || ""} ${(dish.ingredients || []).join(" ")}`.toLowerCase();
  const cuisine = (dish.restaurant?.cuisine || []).join(" ").toLowerCase();
  const price = dish.discountPrice ?? dish.price ?? 0;
  let score = (dish.isBestseller ? 2 : 0) + Number(dish.restaurant?.rating || 0) / 2;
  if (mood.id === "quick") score += dish.preparationTime <= 12 ? 6 : dish.preparationTime <= 18 ? 4 : dish.preparationTime <= 22 ? 1 : -3;
  else if (mood.id === "spicy") score += ({ "Extra hot": 7, Hot: 6, Medium: 3 }[dish.spiceLevel] || 0) + (mood.test.test(text) ? 2 : 0);
  else if (mood.id === "healthy") score += (mood.test.test(text) ? 4 : 0) + (mood.cuisines.test(cuisine) ? 3 : 0) + (dish.foodType === "vegan" ? 2 : 0) + (dish.calories && dish.calories <= 420 ? 2 : dish.calories > 600 ? -3 : 0);
  else if (mood.id === "treat") score += (price >= 250 ? 4 : price >= 200 ? 2 : 0) + (mood.test.test(text) ? 2 : 0) + (dish.calories > 500 ? 1 : 0);
  else score += (mood.test.test(text) ? 5 : 0) + (mood.cuisines.test(cuisine) ? 3 : 0);
  return score;
}
function moodReasons(dish, mood) {
  const reasons = [];
  if (dish.preparationTime) reasons.push(`Ready in ${dish.preparationTime} min`);
  if (mood.id === "spicy" && dish.spiceLevel) reasons.push(`${dish.spiceLevel} 🌶️`);
  if (mood.id === "healthy" && dish.calories) reasons.push(`${dish.calories} kcal`);
  if (dish.isBestseller) reasons.push("Bestseller");
  return reasons.slice(0, 2);
}
export function MoodFinder({ dishes }) {
  const [mood, setMood] = useState(moods[0]), [diet, setDiet] = useState("any"), [budget, setBudget] = useState(0), [seed, setSeed] = useState(0);
  const resultsRef = useRef(null);
  const picks = useMemo(() => {
    const pool = (dishes || []).filter(dish => {
      const price = dish.discountPrice ?? dish.price ?? 0;
      if (diet === "veg" && dish.foodType === "non-veg") return false;
      if (diet === "nonveg" && dish.foodType !== "non-veg") return false;
      return !budget || price <= budget;
    }).map(dish => ({ dish, score: moodScore(dish, mood) })).sort((a, b) => b.score - a.score).slice(0, 9);
    if (!seed) return pool.slice(0, 3).map(entry => entry.dish);
    // "Surprise me": a different, still well-matched trio each time.
    const shuffled = [...pool].sort((a, b) => ((a.dish._id.charCodeAt(a.dish._id.length - 1) * (seed + 7)) % 13) - ((b.dish._id.charCodeAt(b.dish._id.length - 1) * (seed + 7)) % 13));
    return shuffled.slice(0, 3).map(entry => entry.dish);
  }, [dishes, mood, diet, budget, seed]);
  if (!dishes?.length) return null;
  return <section className="hx-section eg-mood" id="mood">
    <div className="hx-wrap">
      <div className="hx-head"><div><span className="hx-kicker"><Sparkles size={13}/> Can't decide?</span><h2>What are you <em>in the mood for?</em></h2><p>Pick a mood and we'll match you with dishes from kitchens near you.</p></div></div>
      <div className="eg-mood-panel">
        <div className="eg-moods" role="radiogroup" aria-label="Mood">{moods.map(entry => <button type="button" role="radio" aria-checked={mood.id === entry.id} key={entry.id} className={mood.id === entry.id ? "on" : ""} onClick={() => { setMood(entry); setSeed(0); }}><span aria-hidden="true">{entry.emoji}</span>{entry.label}</button>)}</div>
        <div className="eg-mood-filters">
          <div className="eg-seg" role="radiogroup" aria-label="Diet">{[["any", "Any"], ["veg", "🟢 Veg"], ["nonveg", "🔴 Non-veg"]].map(([id, label]) => <button type="button" role="radio" aria-checked={diet === id} key={id} className={diet === id ? "on" : ""} onClick={() => setDiet(id)}>{label}</button>)}</div>
          <div className="eg-seg" role="radiogroup" aria-label="Budget">{[[0, "Any budget"], [200, "Under ₹200"], [300, "Under ₹300"]].map(([value, label]) => <button type="button" role="radio" aria-checked={budget === value} key={value} className={budget === value ? "on" : ""} onClick={() => setBudget(value)}>{label}</button>)}</div>
          <button type="button" className="eg-surprise" onClick={() => setSeed(value => value + 1)}><Shuffle size={15}/> Surprise me</button>
        </div>
        <div className="eg-picks" ref={resultsRef} aria-live="polite">
          {picks.length ? picks.map((dish, index) => <Link to={`/food?dish=${dish._id}`} className="eg-pick" key={`${dish._id}-${seed}`} style={{ "--i": index }}>
            <img src={dish.image || imageFallback} alt="" loading="lazy" onError={onImageError}/>
            <span className="eg-pick-copy"><small>{index === 0 ? "Best match" : "Also great"}</small><b>{dish.name}</b><span>{dish.restaurant?.name}</span>
              <span className="eg-pick-tags">{moodReasons(dish, mood).map(reason => <em key={reason}>{reason}</em>)}</span></span>
            <span className="eg-pick-price">{money(dish.discountPrice ?? dish.price)}<ArrowRight size={15}/></span>
          </Link>)
          : <p className="eg-empty-line">Nothing matches all of that. Try a bigger budget or another mood.</p>}
        </div>
      </div>
    </div>
  </section>;
}

// ---------------------------------------------------------------------------------------------------------
// Invite banner on the sign-up page
// ---------------------------------------------------------------------------------------------------------
export function InviteBanner({ code }) {
  const [invite, setInvite] = useState(null);
  useEffect(() => { if (code) api.get(`/referrals/${encodeURIComponent(code)}`).then(response => setInvite(response.data)).catch(() => setInvite({ valid: false })); }, [code]);
  if (!code || !invite) return null;
  if (!invite.valid) return <p className="eg-invite invalid">This invite link has expired, but you can still sign up.</p>;
  return <p className="eg-invite"><Gift size={18}/><span><b>{invite.inviter} invited you!</b> Sign up to get {invite.reward}.</span></p>;
}

// ---------------------------------------------------------------------------------------------------------
// "Install the app" prompt (browsers that support installing web apps)
// ---------------------------------------------------------------------------------------------------------
export function InstallPrompt() {
  const [event, setEvent] = useState(null);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("gofoode-install-dismissed") === "1"; } catch { return false; } });
  useEffect(() => {
    const capture = installEvent => { installEvent.preventDefault(); setEvent(installEvent); };
    const installed = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    // Don't greet people with a pop-up: offer the app once they've spent a little time browsing.
    const timer = setTimeout(() => setReady(true), 25000);
    return () => { clearTimeout(timer); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);
  if (!event || hidden || !ready) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("gofoode-install-dismissed", "1"); } catch { /* private mode */ } };
  return <div className="eg-install" role="dialog" aria-label="Install the GoFoode app">
    <img src="/icons/icon-192.png" alt="" width="40" height="40"/>
    <span><b>Get the GoFoode app</b><small>Faster ordering, right from your home screen.</small></span>
    <button type="button" className="btn btn-primary btn-small" onClick={async () => { event.prompt(); await event.userChoice.catch(() => null); setEvent(null); }}>Install</button>
    <button type="button" className="eg-install-close" aria-label="Not now" onClick={dismiss}><X size={16}/></button>
  </div>;
}
