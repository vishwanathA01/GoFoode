// Interactive maps (Leaflet + OpenStreetMap): the live delivery route with a moving rider, and the
// drag-the-map pin picker used to set a delivery location.
import React, { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bike, House, LocateFixed, Store } from "lucide-react";
import { bearingDeg, measurePath, pointAlong, projectOnPath } from "./geo";

// OpenStreetMap's own tiles need no key (fair use, attribution required). For production traffic, point
// VITE_MAP_TILE_URL at a hosted tile service (for example Stadia Maps or MapTiler, with your key in the URL).
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const CUSTOM_TILES = Boolean(import.meta.env.VITE_MAP_TILE_URL);

// Lucide icons rendered once to SVG markup, for use inside Leaflet's HTML markers.
function iconMarkup(Icon, size) {
  const holder = document.createElement("div");
  const root = createRoot(holder);
  flushSync(() => root.render(<Icon size={size} strokeWidth={2.2} aria-hidden="true"/>));
  const markup = holder.innerHTML;
  root.unmount();
  return markup;
}
const ICONS = typeof document === "undefined" ? {} : { store: iconMarkup(Store, 17), home: iconMarkup(House, 17), bike: iconMarkup(Bike, 19) };
const escapeHtml = text => String(text || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const placeIcon = (kind, label) => L.divIcon({
  className: `gm-place gm-${kind}`,
  html: `<span class="gm-place-pin">${ICONS[kind] || ""}</span>${label ? `<span class="gm-place-label">${escapeHtml(label)}</span>` : ""}`,
  iconSize: [40, 48],
  iconAnchor: [20, 46]
});
const riderIcon = () => L.divIcon({
  className: "gm-rider",
  html: `<span class="gm-rider-halo"></span><span class="gm-rider-cone"></span><span class="gm-rider-dot">${ICONS.bike || ""}</span>`,
  iconSize: [56, 56],
  iconAnchor: [28, 28]
});

function createMap(element, { interactive = true, ...options } = {}) {
  const map = L.map(element, {
    zoomControl: false, attributionControl: true, scrollWheelZoom: interactive ? "center" : false,
    dragging: interactive, touchZoom: interactive ? "center" : false, doubleClickZoom: interactive ? "center" : false, boxZoom: false, keyboard: interactive,
    zoomSnap: 0.25, ...options
  });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, className: CUSTOM_TILES ? "" : "gm-osm-tiles" }).addTo(map);
  map.attributionControl.setPrefix(false);
  if (interactive) L.control.zoom({ position: "bottomright" }).addTo(map);
  return map;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = t => 1 - (1 - t) ** 3;

// Where the rider should be drawn right now, and how far along the route that is.
function riderTarget(rider, route) {
  const { path, cumulative, total } = route;
  const start = { point: path[0], heading: bearingDeg(path[0], path[1] || path[0]), along: 0 };
  if (rider.mode === "at-pickup") return start;
  if (rider.mode === "at-drop") return { point: path[path.length - 1], heading: bearingDeg(path[Math.max(0, path.length - 2)], path[path.length - 1]), along: total };
  if (rider.mode === "estimated") {
    let progress = (Date.now() - rider.startAt) / 1000 / Math.max(1, rider.durationS);
    progress = rider.loop ? ((progress % 1) + 1) % 1 : clamp(progress, 0, rider.cap ?? 0.97);
    return pointAlong(path, cumulative, progress * total);
  }
  const projected = projectOnPath(path, cumulative, rider.point);
  return { point: rider.point, heading: Number.isFinite(rider.heading) ? rider.heading : null, along: projected.along, snapped: pointAlong(path, cumulative, projected.along) };
}

/**
 * A road route from pickup to drop, with the rider drawn on it.
 * rider: null | { mode: "live", point, heading } | { mode: "estimated", startAt, durationS, cap?, loop? }
 *        | { mode: "at-pickup" } | { mode: "at-drop" }
 */
export function RouteMap({ geometry, rider, labels = {}, interactive = true, className = "", fitPadding }) {
  const boxRef = useRef(null);
  const state = useRef({});

  useEffect(() => {
    const map = createMap(boxRef.current, { interactive });
    state.current.map = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(boxRef.current);
    return () => { resize.disconnect(); map.remove(); state.current = {}; };
  }, [interactive]);

  const pathKey = geometry?.path?.length ? `${geometry.path.length}:${geometry.path[0]}:${geometry.path[geometry.path.length - 1]}` : "";
  useEffect(() => {
    const current = state.current, map = current.map;
    if (!map || !pathKey) return;
    current.layers?.forEach(layer => layer.remove());
    current.riderMarker?.remove();
    current.riderMarker = null;
    current.shown = null;
    const path = geometry.path;
    const cumulative = measurePath(path);
    current.route = { path, cumulative, total: cumulative[cumulative.length - 1] };
    const line = { lineCap: "round", lineJoin: "round", interactive: false };
    const casing = L.polyline(path, { ...line, color: "#ffffff", weight: 10, opacity: 0.95 });
    const done = L.polyline([], { ...line, color: "#9aa6b8", weight: 5, opacity: 0.9 });
    const remaining = L.polyline(path, { ...line, color: "#13213a", weight: 5 });
    const pickup = L.marker(geometry.pickup || path[0], { icon: placeIcon("store", labels.pickup), keyboard: false, interactive: false, zIndexOffset: 300 });
    const drop = L.marker(geometry.drop || path[path.length - 1], { icon: placeIcon("home", labels.drop), keyboard: false, interactive: false, zIndexOffset: 400 });
    current.layers = [casing, done, remaining, pickup, drop].map(layer => layer.addTo(map));
    current.done = done;
    current.remaining = remaining;
    // Padding keeps the route clear of overlays such as status chips or a card along the bottom edge.
    const pad = { top: 64, right: 40, bottom: 32, left: 40, ...fitPadding };
    current.fit = (animate = false) => map.fitBounds(L.latLngBounds(path), { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], maxZoom: 16.5, animate });
    current.fit();
  }, [pathKey, labels.pickup, labels.drop]);

  const riderKey = rider ? [rider.mode, rider.startAt, rider.durationS, rider.cap, rider.point?.[0], rider.point?.[1], rider.heading].join("|") : "none";
  useEffect(() => {
    const current = state.current, map = current.map, route = current.route;
    if (!map || !route) return undefined;
    if (!rider) {
      current.riderMarker?.remove();
      current.riderMarker = null;
      current.done.setLatLngs([]);
      current.remaining.setLatLngs(route.path);
      return undefined;
    }
    if (!current.riderMarker) current.riderMarker = L.marker(route.path[0], { icon: riderIcon(), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);
    const from = current.shown;
    const startedAt = performance.now();
    const animateLive = rider.mode === "live" && from;
    let frame = 0, lastSplit = -1;
    const tick = now => {
      const goal = riderTarget(rider, route);
      let point = goal.point;
      if (animateLive) {
        const k = ease(clamp((now - startedAt) / 1400, 0, 1));
        point = [from[0] + (goal.point[0] - from[0]) * k, from[1] + (goal.point[1] - from[1]) * k];
      }
      current.shown = point;
      current.riderMarker.setLatLng(point);
      const heading = goal.heading ?? (from ? bearingDeg(from, goal.point) : null);
      if (heading != null) current.riderMarker.getElement()?.style.setProperty("--heading", `${heading}deg`);
      // Split the route into the part already ridden (grey) and what's left (dark).
      if (now - lastSplit > 120) {
        lastSplit = now;
        const cut = goal.snapped || pointAlong(route.path, route.cumulative, goal.along);
        current.done.setLatLngs([...route.path.slice(0, cut.index + 1), cut.point]);
        current.remaining.setLatLngs([cut.point, ...route.path.slice(cut.index + 1)]);
      }
      const keepGoing = rider.mode === "estimated" || (animateLive && now - startedAt < 1500);
      if (keepGoing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [riderKey, pathKey]);

  return <div className={`gm-map ${className}`}>
    <div ref={boxRef} className="gm-canvas" role="img" aria-label={`Map of the delivery route${labels.pickup ? ` from ${labels.pickup}` : ""}${labels.drop ? ` to ${labels.drop}` : ""}`}/>
    {interactive && <button type="button" className="gm-recenter" onClick={() => state.current.fit?.(true)} aria-label="Show the whole route"><LocateFixed size={18}/></button>}
  </div>;
}

// A map you drag under a fixed centre pin, like the location pickers in quick-commerce apps.
export function PinMap({ center, zoom = 17, onMoveStart, onMoveEnd, className = "" }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const handlers = useRef({ onMoveStart, onMoveEnd });
  handlers.current = { onMoveStart, onMoveEnd };
  useEffect(() => {
    const map = createMap(boxRef.current, { center, zoom });
    mapRef.current = map;
    map.on("movestart", () => handlers.current.onMoveStart?.());
    map.on("moveend", () => { const middle = map.getCenter(); handlers.current.onMoveEnd?.([middle.lat, middle.lng]); });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(boxRef.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);
  // Jump when the caller moves the pin (for example after "use my location").
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const here = map.getCenter();
    if (Math.abs(here.lat - center[0]) > 1e-6 || Math.abs(here.lng - center[1]) > 1e-6) map.setView(center, Math.max(map.getZoom(), zoom), { animate: true });
  }, [center?.[0], center?.[1]]);
  return <div ref={boxRef} className={`gm-canvas ${className}`}/>;
}
