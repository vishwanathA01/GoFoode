// Map helpers for live order tracking: distances, geocoding (OpenStreetMap Nominatim) and road routes (OSRM).
// Both services are free public endpoints with fair-use limits, so every lookup is cached and Nominatim calls
// are queued to at most one per second. Results are also stored on the order, so a route is fetched once.
const USER_AGENT = "GoFoode/1.0 (food delivery platform; order tracking)";
const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const OSRM_URL = process.env.OSRM_URL || "https://router.project-osrm.org";

// Two-wheeler delivery in Indian city traffic averages roughly 20–24 km/h door to door.
export const RIDER_SPEED_MPS = 6.2;
// Beyond this, a kitchen can't realistically deliver to the address (it happens with demo data).
export const MAX_DELIVERY_KM = 30;

const toRad = degrees => degrees * Math.PI / 180;
export function distanceM(a, b) {
  const [lat1, lng1] = a, [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const isPoint = point => Array.isArray(point) && point.length >= 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180
  && !(point[0] === 0 && point[1] === 0);
// GeoJSON stores [longitude, latitude]; everything else here uses [latitude, longitude].
export const fromGeoJson = coordinates => Array.isArray(coordinates) ? [Number(coordinates[1]), Number(coordinates[0])] : null;

// A point `meters` away from `origin` in the direction `bearingDeg` (0 = north).
export function offsetPoint([lat, lng], meters, bearingDeg) {
  const bearing = toRad(bearingDeg);
  return [lat + meters * Math.cos(bearing) / 111320, lng + meters * Math.sin(bearing) / (111320 * Math.cos(toRad(lat)))];
}
export function pathLengthM(path) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += distanceM(path[index - 1], path[index]);
  return total;
}

async function fetchJson(url, timeoutMs) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.json();
}

// ---- Geocoding -----------------------------------------------------------------------------------------
const geocodeCache = new Map();
let nominatimQueue = Promise.resolve();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function geocode(query) {
  const key = String(query || "").trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  const cached = geocodeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = nominatimQueue.then(async () => {
    try {
      const url = new URL(`${NOMINATIM_URL}/search`);
      url.search = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "in", q: query });
      const [hit] = await fetchJson(url, 6000);
      return hit ? [Number(hit.lat), Number(hit.lon)] : null;
    } finally {
      await sleep(1100);
    }
  }).catch(() => null);
  nominatimQueue = result.then(() => {}, () => {});
  // Misses are retried after ten minutes; hits are kept for the life of the process.
  geocodeCache.set(key, { result, expires: Date.now() + 24 * 3600000 });
  result.then(point => { if (!point) geocodeCache.set(key, { result, expires: Date.now() + 10 * 60000 }); });
  return result;
}

// Tries the full address first, then the PIN code area, then the city.
export async function geocodeAddress({ street, city, state, postalCode } = {}) {
  const attempts = [
    [street, city, state, postalCode],
    [postalCode, city, state],
    [city, state]
  ].map(parts => parts.filter(Boolean).join(", ")).filter((query, index, all) => query && all.indexOf(query) === index);
  for (const [index, query] of attempts.entries()) {
    const point = await geocode(query);
    if (point) return { point, precision: index === 0 && street ? "address" : "area" };
  }
  return null;
}

// ---- Routing -------------------------------------------------------------------------------------------
const routeCache = new Map();
const routeKey = (from, to) => [...from, ...to].map(value => value.toFixed(5)).join(",");

// Keeps long OSRM geometries light: drops points closer than `minGapM` to the previous kept point.
function thin(path, minGapM = 12) {
  if (path.length < 3) return path;
  const kept = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) if (distanceM(kept[kept.length - 1], path[index]) >= minGapM) kept.push(path[index]);
  kept.push(path[path.length - 1]);
  return kept;
}

// A gentle curve between two points, for when the routing service can't be reached.
function estimatedRoute(from, to) {
  const straight = distanceM(from, to);
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const bend = offsetPoint(mid, straight * 0.12, (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI) + 90);
  const path = Array.from({ length: 25 }, (_, step) => {
    const t = step / 24;
    return [(1 - t) ** 2 * from[0] + 2 * (1 - t) * t * bend[0] + t ** 2 * to[0], (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * bend[1] + t ** 2 * to[1]];
  });
  const length = pathLengthM(path);
  return { path, distanceM: Math.round(length), durationS: Math.round(length / RIDER_SPEED_MPS), source: "estimate" };
}

export async function roadRoute(from, to) {
  const key = routeKey(from, to);
  if (routeCache.has(key)) return routeCache.get(key);
  let route;
  try {
    const data = await fetchJson(`${OSRM_URL}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, 8000);
    const best = data.routes?.[0];
    if (data.code !== "Ok" || !best?.geometry?.coordinates?.length) throw new Error("no route");
    const path = thin(best.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
    // OSRM's timings are for cars on empty roads; a scooter in traffic is the better estimate.
    route = { path, distanceM: Math.round(best.distance), durationS: Math.round(Math.max(best.duration, best.distance / RIDER_SPEED_MPS)), source: "osrm" };
  } catch {
    route = estimatedRoute(from, to);
  }
  if (route.source === "osrm") {
    if (routeCache.size > 500) routeCache.delete(routeCache.keys().next().value);
    routeCache.set(key, route);
  }
  return route;
}
