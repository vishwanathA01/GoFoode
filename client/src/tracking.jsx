// Live order tracking in the style of quick-commerce apps: a big arrival countdown, a four-step progress
// bar, the road route with the rider moving on it, and a timeline of when each step happened.
// Rider positions arrive over Socket.IO the moment the rider's phone sends them; without live GPS the
// rider is drawn where they should be by now (and the map says it's an estimate).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bike, Check, ChefHat, ExternalLink, House, Info, Loader2, MapPin, Navigation, Phone, Play, Square, Store } from "lucide-react";
import api from "./api";
import { RouteMap } from "./maps";
import { formatDistance, measurePath, pointAlong, projectOnPath } from "./geo";
import { avatarTone, initials } from "./media";
import { useSocketConnected, useSocketEvent } from "./socket";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = date => new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
const RIDING = ["picked_up", "on_the_way"];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer); }, [intervalMs]);
  return now;
}

const STEPS = [
  { label: "Confirmed", icon: Check },
  { label: "Preparing", icon: ChefHat },
  { label: "On the way", icon: Bike },
  { label: "Delivered", icon: House }
];
const stepOf = status => ({ placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2, on_the_way: 2, delivered: 3 })[status] ?? 0;
const TIMELINE = [
  ["placed", "Order placed"],
  ["accepted", "Accepted by the restaurant"],
  ["preparing", "Food is being prepared"],
  ["ready", "Packed and ready for pickup"],
  ["rider_assigned", "Delivery partner assigned"],
  ["picked_up", "Picked up by your rider"],
  ["delivered", "Delivered"]
];
const statusRank = { placed: 0, accepted: 1, preparing: 2, ready: 3, picked_up: 5, on_the_way: 5, delivered: 6 };

function Avatar({ person, size = 46 }) {
  const [background, color] = avatarTone(person?.name || "");
  return <span className="lt-avatar" style={{ width: size, height: size, ...(person?.profileImage ? {} : { background, color }) }}>
    {person?.profileImage ? <img src={person.profileImage} alt=""/> : initials(person?.name || "Rider")}
  </span>;
}

// Fetches the tracking view of an order and keeps it current from socket events (or polling as a fallback).
function useTracking(order, onOrderEvent) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const offset = useRef(0);
  const orderId = order._id;
  const load = () => api.get(`/orders/${orderId}/tracking`)
    .then(response => { offset.current = new Date(response.data.serverTime).getTime() - Date.now(); setData(response.data); setError(""); })
    .catch(err => setError(err.response?.data?.message || "Live tracking isn't available right now."));
  useEffect(() => { load(); }, [orderId, order.orderStatus, order.delivery?.status, order.delivery?.deliveryPartner?._id]);
  const connected = useSocketConnected();
  const final = ["delivered", "cancelled", "rejected"].includes(order.orderStatus);
  useEffect(() => {
    if (final) return undefined;
    const timer = setInterval(load, connected ? 30000 : 8000);
    return () => clearInterval(timer);
  }, [orderId, connected, final]);
  useSocketEvent("delivery:location", payload => {
    if (String(payload?.orderId) !== String(orderId) || !Array.isArray(payload.coordinates)) return;
    setData(current => current && { ...current, position: { point: [payload.coordinates[1], payload.coordinates[0]], heading: payload.heading, updatedAt: payload.updatedAt, live: true } });
  });
  useSocketEvent(["order:updated", "delivery:updated"], payload => {
    if (String(payload?.orderId) !== String(orderId)) return;
    onOrderEvent?.();
    load();
  });
  // Server timestamps converted to this device's clock.
  const toLocal = value => value ? new Date(value).getTime() - offset.current : null;
  return { data, error, connected, toLocal };
}

export function LiveTracker({ order, onOrderEvent }) {
  const { data, error, connected, toLocal } = useTracking(order, onOrderEvent);
  const now = useNow(1000);
  const status = order.orderStatus;
  const geometry = data?.geometry;
  const route = useMemo(() => {
    if (!geometry?.path?.length) return null;
    const cumulative = measurePath(geometry.path);
    return { path: geometry.path, cumulative, total: cumulative[cumulative.length - 1] };
  }, [geometry?.path]);

  const rider = data?.rider || (order.delivery?.deliveryPartner && typeof order.delivery.deliveryPartner === "object" ? order.delivery.deliveryPartner : null);
  const position = data?.position;
  const livePosition = position?.live && RIDING.concat("ready").includes(status) ? position : null;
  const riding = RIDING.includes(status);
  const delivered = status === "delivered";
  const rideStart = toLocal(data?.times?.picked_up || data?.times?.on_the_way);

  // Rider model for the map.
  const riderModel = !route ? null
    : delivered ? { mode: "at-drop" }
    : livePosition ? { mode: "live", point: livePosition.point, heading: livePosition.heading }
    : riding && rideStart ? { mode: "estimated", startAt: rideStart, durationS: geometry.durationS, cap: 0.96 }
    : rider && status === "ready" ? { mode: "at-pickup" }
    : null;

  // How far along the route the rider is, in metres.
  const along = !route ? 0
    : delivered ? route.total
    : livePosition ? projectOnPath(route.path, route.cumulative, livePosition.point).along
    : riding && rideStart ? clamp((now - rideStart) / 1000 / Math.max(1, geometry.durationS), 0, 0.96) * route.total
    : 0;
  const remainingM = route ? Math.max(0, route.total - along) : null;
  const speed = geometry ? geometry.distanceM / Math.max(1, geometry.durationS) : 6.2;
  const rideS = geometry?.durationS || 900;

  let etaS = null;
  if (!delivered && !["cancelled", "rejected", "awaiting_payment"].includes(status)) {
    if (riding) etaS = (remainingM ?? rideS * speed) / speed + 45;
    else {
      const placed = toLocal(data?.placedAt || order.placedAt || order.createdAt);
      const promised = placed + (data?.promisedMinutes || 35) * 60000;
      const kitchenLeft = { placed: 600, accepted: 480, preparing: 300, ready: rider ? 150 : 300 }[status] ?? 300;
      etaS = Math.max((promised - now) / 1000, rideS + kitchenLeft);
    }
  }
  const minutes = etaS == null ? null : Math.max(1, Math.ceil(etaS / 60));
  const arrivingNow = riding && (etaS < 100 || (remainingM != null && remainingM < 150));
  const arriveBy = etaS == null ? null : new Date(now + etaS * 1000);
  const riderFirst = rider?.name?.split(" ")[0] || "Your rider";

  const restaurantName = data?.restaurant?.name || order.restaurant?.name || "The restaurant";
  const copy = delivered
    ? { title: "Delivered", sub: `Delivered${data?.times?.delivered ? ` at ${timeLabel(data.times.delivered)}` : ""}. Enjoy your meal!` }
    : arrivingNow ? { title: "Arriving now", sub: `${riderFirst} is almost at your door. Keep your phone handy.` }
    : status === "on_the_way" || status === "picked_up" ? { title: status === "picked_up" ? "Order picked up" : "On the way", sub: `${riderFirst} is ${remainingM != null ? `${formatDistance(remainingM)} away` : "heading to you"}.` }
    : status === "ready" ? (rider ? { title: "Rider at the restaurant", sub: `${riderFirst} is collecting your order from ${restaurantName}.` } : { title: "Packed and ready", sub: "We're assigning a delivery partner near the restaurant." })
    : status === "preparing" ? { title: "Preparing your order", sub: `${restaurantName} is cooking your food.` }
    : status === "accepted" ? { title: "Order confirmed", sub: `${restaurantName} has accepted your order.` }
    : { title: "Order received", sub: `Waiting for ${restaurantName} to confirm.` };

  const step = stepOf(status);
  const doneRank = statusRank[status] ?? 0;
  const timeline = TIMELINE.map(([key, label]) => {
    const done = key === "rider_assigned" ? Boolean(rider) && doneRank >= 3 : (statusRank[key] ?? 0) <= doneRank;
    return { key, label, done, at: data?.times?.[key] };
  });
  const currentKey = timeline.find(entry => !entry.done)?.key;
  const gpsAgeS = livePosition ? Math.max(0, Math.round((now - toLocal(livePosition.updatedAt)) / 1000)) : null;
  const address = order.deliveryAddress || {};
  const dropLabel = /home/i.test(address.label || "") ? "Home" : "You";

  return <section className={`lt ${riding || delivered ? "riding" : ""} ${delivered ? "done" : ""}`} aria-label="Live order tracking">
    <header className="lt-head">
      <div className="lt-eta" aria-live="polite">
        {delivered ? <><small>Delivered</small><b className="lt-eta-done"><Check size={34} strokeWidth={3}/></b><span>{data?.times?.delivered ? timeLabel(data.times.delivered) : "Order complete"}</span></>
          : arrivingNow ? <><small>Arriving</small><b>Now</b><span>Rider is nearby</span></>
          : minutes != null ? <><small>Arriving in</small><b>{minutes}<i>min</i></b><span>by {timeLabel(arriveBy)}</span></>
          : <><small>Estimating</small><b>…</b><span>One moment</span></>}
      </div>
      <div className="lt-headline">
        <h1>{copy.title}</h1>
        <p>{copy.sub}</p>
        <ol className="lt-steps" aria-label={`Step ${step + 1} of 4: ${STEPS[step].label}`}>
          {STEPS.map((entry, index) => {
            const state = delivered || index < step ? "done" : index === step ? "now" : "";
            return <li key={entry.label} className={state}><span className="lt-step-bar"><i/></span><span className="lt-step-label"><entry.icon size={13}/>{entry.label}</span></li>;
          })}
        </ol>
      </div>
    </header>

    <div className="lt-body">
      <div className="lt-map">
        {route ? <RouteMap geometry={geometry} rider={riderModel} labels={{ pickup: restaurantName, drop: dropLabel }} fitPadding={{ top: 70, right: 60, bottom: 40, left: 40 }}/>
          : <div className="lt-map-empty">{error || data ? <><MapPin size={26}/><b>{error || "We couldn't place this address on the map"}</b><small>Status updates still appear here as they happen.</small></> : <><Loader2 size={26} className="lt-spin"/><b>Loading the map…</b></>}</div>}
        {route && <div className="lt-map-chips">
          {livePosition ? <span className="lt-chip live"><i/>Live GPS · {gpsAgeS < 5 ? "just now" : `${gpsAgeS}s ago`}</span>
            : riding ? <span className="lt-chip"><Navigation size={13}/>Estimated position</span>
            : delivered ? <span className="lt-chip ok"><Check size={13}/>Delivered</span>
            : <span className="lt-chip"><Store size={13}/>{formatDistance(geometry.distanceM)} from the kitchen</span>}
          {!connected && !delivered && <span className="lt-chip muted">Reconnecting…</span>}
        </div>}
      </div>

      <aside className="lt-side">
        <div className="lt-card lt-rider">
          {rider ? <>
            <Avatar person={rider}/>
            <div><b>{rider.name}</b><small>{livePosition ? "Sharing live location" : riding ? "Delivering your order" : "Your delivery partner"}</small></div>
            {rider.phone && <a className="lt-call" href={`tel:${rider.phone}`} aria-label={`Call ${rider.name}`}><Phone size={18}/></a>}
          </> : <>
            <span className="lt-avatar pending"><Bike size={20}/></span>
            <div><b>{status === "ready" ? "Finding a delivery partner" : "Delivery partner"}</b><small>{status === "ready" ? "Riders near the restaurant have been notified." : "Assigned when your food is nearly ready."}</small></div>
            {status === "ready" && <Loader2 size={18} className="lt-spin"/>}
          </>}
        </div>

        <div className="lt-card">
          <h2>Order timeline</h2>
          <ol className="lt-timeline">
            {timeline.map(entry => <li key={entry.key} className={entry.done ? "done" : entry.key === currentKey ? "now" : ""}>
              <span className="lt-dot">{entry.done ? <Check size={11} strokeWidth={3.5}/> : null}</span>
              <span className="lt-tl-label">{entry.label}</span>
              {entry.at && entry.done && <time dateTime={new Date(entry.at).toISOString()}>{timeLabel(entry.at)}</time>}
            </li>)}
          </ol>
        </div>

        <div className="lt-card lt-address">
          <span className="lt-address-icon"><MapPin size={17}/></span>
          <div>
            <small>Delivering to</small>
            <b>{address.name || "Your address"}</b>
            <p>{[address.street, address.city, address.postalCode].filter(Boolean).join(", ")}</p>
            {address.instructions && <p className="lt-note-line">“{address.instructions}”</p>}
          </div>
        </div>

        {(geometry?.approximatePickup || geometry?.dropPrecision === "area" || geometry?.source === "estimate") && <p className="lt-footnote"><Info size={14}/><span>
          {geometry.approximatePickup && geometry.kitchenDistanceM ? `${restaurantName} is ${formatDistance(geometry.kitchenDistanceM)} from this address, so the map shows a nearby stand-in for the kitchen (demo data). ` : ""}
          {geometry.dropPrecision === "area" ? "Your pin is placed from the PIN code; set an exact pin from “Delivering to” next time. " : ""}
          {geometry.source === "estimate" ? "Road routing is unavailable right now, so the path is approximate." : ""}
        </span></p>}
      </aside>
    </div>
  </section>;
}

// ---------------------------------------------------------------------------------------------------------
// Rider side: the route for an active job, a Google Maps hand-off, and a demo ride for testing tracking.
// ---------------------------------------------------------------------------------------------------------
const DEMO_STEP_M = 40; // metres per update while simulating, so a 3 km route takes a little over a minute

export function RiderRoute({ job, demoTools = false, simulating, onSimulate }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [sent, setSent] = useState(null), [simError, setSimError] = useState("");
  useEffect(() => {
    api.get(`/delivery/assignments/${job._id}/route`).then(response => { setData(response.data); setError(""); })
      .catch(err => setError(err.response?.data?.message || "The route couldn't be loaded."));
  }, [job._id]);
  const geometry = data?.geometry;
  const route = useMemo(() => geometry?.path?.length ? { path: geometry.path, cumulative: measurePath(geometry.path) } : null, [geometry?.path]);
  const stored = job.currentLocation?.coordinates;
  const position = sent || (Array.isArray(stored) && (stored[0] || stored[1]) ? { point: [stored[1], stored[0]], heading: job.heading } : null);

  // Demo ride: walk the route and send each point through the same endpoint a phone would use.
  useEffect(() => {
    if (!simulating || !route) return undefined;
    const total = route.cumulative[route.cumulative.length - 1];
    let along = position ? Math.min(total, projectOnPath(route.path, route.cumulative, position.point).along) : 0;
    if (total - along < 60) along = 0; // already at the door: replay the ride from the kitchen
    let cancelled = false;
    const step = async () => {
      if (cancelled) return;
      along = Math.min(total, along + DEMO_STEP_M);
      const here = pointAlong(route.path, route.cumulative, along);
      setSent({ point: here.point, heading: here.heading });
      try { await api.post("/delivery/location", { deliveryId: job._id, latitude: here.point[0], longitude: here.point[1], heading: here.heading }); setSimError(""); }
      catch (err) { setSimError(err.response?.data?.message || "Couldn't send the demo location."); }
      if (along >= total) onSimulate(null);
    };
    step();
    const timer = setInterval(step, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [simulating, route]);

  const canRide = RIDING.includes(job.status);
  const drop = geometry?.drop;
  const directions = drop ? `https://www.google.com/maps/dir/?api=1&destination=${drop[0]},${drop[1]}&travelmode=two-wheeler` : null;
  return <div className="lt-rider-route">
    {route ? <RouteMap className="compact" geometry={geometry} rider={position ? { mode: "live", point: position.point, heading: position.heading } : job.status === "accepted" ? null : { mode: "at-pickup" }} labels={{ pickup: data.restaurant?.name, drop: "Customer" }}/>
      : <div className="lt-map-empty small">{error ? <><MapPin size={22}/><b>{error}</b></> : <><Loader2 size={22} className="lt-spin"/><b>Loading route…</b></>}</div>}
    <div className="lt-rider-actions">
      {geometry && <span className="lt-chip"><Navigation size={13}/>{formatDistance(geometry.distanceM)} · about {Math.max(1, Math.round(geometry.durationS / 60))} min</span>}
      {directions && <a className="btn btn-outline btn-small" href={directions} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Navigate</a>}
      {demoTools && route && (canRide
        ? <button type="button" className={`btn btn-small ${simulating ? "btn-outline" : "btn-primary"}`} onClick={() => onSimulate(simulating ? null : job._id)}>{simulating ? <><Square size={13}/> Stop demo ride</> : <><Play size={13}/> Demo ride</>}</button>
        : <small className="muted">Mark the order picked up to start the ride.</small>)}
    </div>
    {simError && <p className="error-box" role="status">{simError}</p>}
    {demoTools && simulating && <p className="lt-footnote"><Info size={14}/><span>Demo ride: sending a point along the route every second, exactly as a rider's phone would. Open the customer's order page to watch it move.</span></p>}
  </div>;
}

// ---------------------------------------------------------------------------------------------------------
// Homepage preview: a real road route in Faridabad with a rider looping along it.
// ---------------------------------------------------------------------------------------------------------
const PREVIEW_ROUTE = [[28.39522,77.31206],[28.39582,77.31201],[28.39638,77.31195],[28.39746,77.31184],[28.39797,77.31179],[28.39852,77.31183],[28.40047,77.31176],[28.40160,77.31167],[28.40224,77.31163],[28.40408,77.31150],[28.40461,77.31145],[28.40562,77.31136],[28.40685,77.31126],[28.40734,77.31121],[28.41033,77.31096],[28.41101,77.31090],[28.41177,77.31074],[28.41281,77.31065],[28.41384,77.31058],[28.41492,77.31047],[28.41536,77.31044],[28.41595,77.31039],[28.41589,77.30992],[28.41570,77.30944],[28.41535,77.30855],[28.41523,77.30787],[28.41513,77.30738],[28.41507,77.30657],[28.41508,77.30580]];
const PREVIEW_GEOMETRY = { path: PREVIEW_ROUTE, pickup: PREVIEW_ROUTE[0], drop: PREVIEW_ROUTE[PREVIEW_ROUTE.length - 1] };
const PREVIEW_LOOP_S = 42;
const PREVIEW_RIDE_MIN = 9;

export function TrackingPreview() {
  const [startAt] = useState(() => Date.now());
  const now = useNow(1000);
  const progress = (((now - startAt) / 1000) % PREVIEW_LOOP_S) / PREVIEW_LOOP_S;
  const minutes = Math.max(1, Math.ceil((1 - progress) * PREVIEW_RIDE_MIN));
  return <div className="lt-preview" aria-label="Example of live order tracking">
    <RouteMap interactive={false} geometry={PREVIEW_GEOMETRY} rider={{ mode: "estimated", startAt, durationS: PREVIEW_LOOP_S, loop: true }} labels={{ pickup: "Smash & Co.", drop: "Home" }} fitPadding={{ top: 60, right: 40, bottom: 150, left: 40 }}/>
    <div className="lt-preview-card">
      <span className="lt-chip live"><i/>Live</span>
      <b>{progress > 0.93 ? "Arriving now" : `Arriving in ${minutes} min`}</b>
      <small><Bike size={13}/> Your rider is {formatDistance((1 - progress) * 2600)} away</small>
    </div>
  </div>;
}

