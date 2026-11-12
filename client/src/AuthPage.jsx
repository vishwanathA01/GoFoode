// Log in and sign up: a branded visual panel beside a focused form card.
import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Bike, Check, Eye, EyeOff, Gift, Lock, Mail, Navigation, Phone, ShieldCheck, ShoppingBag, Sparkles, Store, UserRound, Wallet } from "lucide-react";
import { useAuth } from "./AuthContext";
import { InviteBanner } from "./engagement";
import { photos } from "./media";

const roles = [
  { id: "customer", title: "Customer", detail: "Order food & more", icon: ShoppingBag, cta: "Create my account", pitch: "Order from local kitchens, track every delivery live and win rewards every day." },
  { id: "restaurant_owner", title: "Restaurant", detail: "Sell your food", icon: Store, cta: "Join as a restaurant partner", pitch: "List your restaurant, manage your menu and receive orders in real time." },
  { id: "delivery_partner", title: "Rider", detail: "Earn delivering", icon: Bike, cta: "Join as a delivery partner", pitch: "Go online when it suits you, pick up nearby orders and track your earnings." }
];
// One-click demo logins, shown only on the development server (never in a production build).
const demoAccounts = [
  { label: "Customer", email: "customer@gofoode.demo", password: "Customer123!", icon: ShoppingBag },
  { label: "Restaurant", email: "owner@gofoode.demo", password: "Owner123!", icon: Store },
  { label: "Rider", email: "rider@gofoode.demo", password: "Rider123!", icon: Bike },
  { label: "Admin", email: "admin@gofoode.demo", password: "Admin123!", icon: ShieldCheck }
];
const benefits = [
  { icon: Navigation, text: "Track your rider live on the map" },
  { icon: Gift, text: "Spin daily to win up to ₹100 off" },
  { icon: Wallet, text: "Pay by UPI, card or cash on delivery" }
];

function passwordStrength(password) {
  if (!password) return { score: 0, label: "" };
  if (password.length < 8) return { score: 1, label: "Too short: use at least 8 characters" };
  let score = 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return { score, label: ["", "Weak", "Okay", "Strong", "Very strong"][score] };
}

function Field({ id, label, icon: Icon, hint, children, trailing }) {
  return <div className="au-field">
    <label htmlFor={id}>{label}</label>
    <div className="au-input"><Icon size={18} className="au-input-icon" aria-hidden="true"/>{children}{trailing}</div>
    {hint}
  </div>;
}

export default function AuthPage({ mode }) {
  const { login, register, onboard, user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const isLogin = mode === "login";
  const returnTo = typeof routerLocation.state?.from === "string" && routerLocation.state.from.startsWith("/") ? routerLocation.state.from : null;
  // /register?ref=CODE comes from a friend's invite link; invited customers land on Rewards to see their gift.
  const refParam = (new URLSearchParams(routerLocation.search).get("ref") || "").trim().toUpperCase();
  const inviteCode = isLogin ? "" : refParam;
  // Keep the invite on both tabs, so peeking at "Log in" and coming back doesn't lose the friend's gift.
  const inviteQuery = refParam ? `?ref=${encodeURIComponent(refParam)}` : "";
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", role: "customer", referralCode: inviteCode });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  if (user) return <Navigate to={returnTo || (inviteCode ? "/rewards" : "/dashboard")} replace/>;

  const set = key => event => { setForm(current => ({ ...current, [key]: event.target.value })); if (error) setError(""); };
  const role = roles.find(entry => entry.id === form.role) || roles[0];
  const strength = passwordStrength(form.password);
  const otherState = returnTo ? { from: returnTo } : undefined;
  const checkCaps = event => setCapsLock(Boolean(event.getModifierState?.("CapsLock")));

  const submit = async event => {
    event.preventDefault();
    if (!isLogin && form.password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
    setBusy(true); setError("");
    try {
      if (isLogin) await login(form.email.trim(), form.password);
      else if (form.role === "customer") await register({ ...form, email: form.email.trim(), name: form.name.trim() });
      else await onboard({ ...form, email: form.email.trim(), name: form.name.trim() });
      navigate(returnTo || (inviteCode && form.role === "customer" ? "/rewards" : "/dashboard"), { replace: true });
    } catch (err) {
      const status = err.response?.status;
      setError(!err.response ? "We couldn't reach GoFoode. Check your connection and try again."
        : isLogin && status === 401 ? "That email and password don't match. Check them and try again."
        : status === 429 ? "Too many attempts. Please wait a few minutes and try again."
        : err.response.data?.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  return <div className={`au-shell ${isLogin ? "login" : "register"}`}>
    <aside className="au-visual" aria-hidden="true">
      <div className="au-glow a"/><div className="au-glow b"/>
      <Link to="/" className="au-logo" tabIndex={-1}><img src="/gofoode-logo.png" alt=""/></Link>
      <div className="au-visual-copy">
        <span className="au-kicker"><Sparkles size={14}/>{isLogin ? "Welcome back" : "Join GoFoode free"}</span>
        <h1>{isLogin ? <>Hungry? Your favourites are <em>waiting.</em></> : <>Good food is <em>one tap away.</em></>}</h1>
        <p>{isLogin ? "Log in to reorder in a tap, follow your rider live and spin today's reward wheel." : "Create your account to order from the best local kitchens and unlock daily rewards."}</p>
      </div>
      <div className="au-art">
        <img src={isLogin ? photos.doorstep : photos.scooter} alt=""/>
        <span className="au-float one"><span className="au-float-icon green"><Navigation size={15}/></span><span><b>Order on the way</b><small>Live tracking</small></span></span>
        <span className="au-float two"><span className="au-float-icon"><Gift size={15}/></span><span><b>Daily spin</b><small>Up to ₹100 off</small></span></span>
      </div>
      <ul className="au-benefits">{benefits.map(({ icon: Icon, text }) => <li key={text}><span><Icon size={16}/></span>{text}</li>)}</ul>
    </aside>

    <main className="au-main">
      <div className="au-topbar">
        <Link to="/" className="au-back"><ArrowLeft size={16}/> Back to home</Link>
        <Link to="/" className="au-mobile-logo"><img src="/gofoode-logo.png" alt="GoFoode home"/></Link>
      </div>
      <div className="au-card">
        <div className="au-tabs" role="tablist" aria-label="Account">
          <Link role="tab" aria-selected={isLogin} className={isLogin ? "on" : ""} to={`/login${inviteQuery}`} state={otherState} replace>Log in</Link>
          <Link role="tab" aria-selected={!isLogin} className={!isLogin ? "on" : ""} to={`/register${inviteQuery}`} state={otherState} replace>Create account</Link>
        </div>
        <h2>{isLogin ? "Welcome back 👋" : "Create your account"}</h2>
        <p className="au-sub">{isLogin ? "Log in to continue your food journey." : role.pitch}</p>
        {!isLogin && <InviteBanner code={inviteCode}/>}

        <form onSubmit={submit} noValidate={false}>
          {!isLogin && <fieldset className="au-roles">
            <legend>I'm joining as</legend>
            <div className="au-role-grid">{roles.map(({ id, title, detail, icon: Icon }) => <label key={id} className={`au-role ${form.role === id ? "on" : ""}`}>
              <input type="radio" name="role" value={id} checked={form.role === id} onChange={set("role")}/>
              <span className="au-role-icon"><Icon size={19}/></span><b>{title}</b><small>{detail}</small>
              <span className="au-role-check" aria-hidden="true"><Check size={12} strokeWidth={3.2}/></span>
            </label>)}</div>
          </fieldset>}

          {!isLogin && <Field id="au-name" label="Full name" icon={UserRound}>
            <input id="au-name" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma"/>
          </Field>}
          <Field id="au-email" label="Email address" icon={Mail}>
            <input id="au-email" required type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} placeholder="you@example.com"/>
          </Field>
          {!isLogin && <Field id="au-phone" label={<>Phone number <em>(optional)</em></>} icon={Phone}>
            <input id="au-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210"/>
          </Field>}
          <Field id="au-password" label="Password" icon={Lock}
            trailing={<button type="button" className="au-eye" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>}
            hint={<>
              {capsLock && <p className="au-hint warn">Caps Lock is on</p>}
              {!isLogin && form.password && <div className={`au-strength s${strength.score}`}><span><i/><i/><i/><i/></span><small>{strength.label}</small></div>}
            </>}>
            <input id="au-password" required minLength={isLogin ? undefined : 8} type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"} value={form.password} onChange={set("password")} onKeyUp={checkCaps} onKeyDown={checkCaps} placeholder={isLogin ? "Your password" : "At least 8 characters"}/>
          </Field>

          {error && <p className="au-error" role="alert"><AlertCircle size={17}/>{error}</p>}
          <button className="btn btn-primary au-submit" disabled={busy}>{busy ? <><span className="au-spinner" aria-hidden="true"/>{isLogin ? "Logging you in…" : "Creating your account…"}</> : <>{isLogin ? "Log in" : role.cta}<ArrowRight size={18}/></>}</button>
        </form>

        {isLogin && import.meta.env.DEV && <div className="au-demo">
          <span>Demo accounts · tap to fill</span>
          <div>{demoAccounts.map(({ label, email, password, icon: Icon }) => <button type="button" key={email} className={form.email === email ? "on" : ""} onClick={() => { setForm(current => ({ ...current, email, password })); setError(""); }}><Icon size={14}/>{label}</button>)}</div>
        </div>}

        <p className="au-switch">{isLogin ? "New to GoFoode?" : "Already have an account?"} <Link to={`${isLogin ? "/register" : "/login"}${inviteQuery}`} state={otherState} replace>{isLogin ? "Create a free account" : "Log in"}</Link></p>
        <p className="au-trust"><ShieldCheck size={15}/> Your password is encrypted, and we never share your details.</p>
      </div>
    </main>
  </div>;
}
