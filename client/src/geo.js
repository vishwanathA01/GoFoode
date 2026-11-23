// Small geometry helpers for maps. Points are [latitude, longitude]; distances are metres.
const toRad = degrees => degrees * Math.PI / 180;

export function distanceM(a, b) {
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(from, to) {
  const y = Math.sin(toRad(to[1] - from[1])) * Math.cos(toRad(to[0]));
  const x = Math.cos(toRad(from[0])) * Math.sin(toRad(to[0])) - Math.sin(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.cos(toRad(to[1] - from[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export const isPoint = point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) && !(point[0] === 0 && point[1] === 0);

// Distance from the start of the path to each vertex.
export function measurePath(path) {
  const cumulative = [0];
  for (let index = 1; index < path.length; index += 1) cumulative.push(cumulative[index - 1] + distanceM(path[index - 1], path[index]));
  return cumulative;
}

// The point `along` metres into the path, the heading there, and the vertex just before it.
export function pointAlong(path, cumulative, along) {
  if (!path.length) return null;
  const total = cumulative[cumulative.length - 1];
  const target = Math.max(0, Math.min(total, along));
  let index = 1;
  while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
  const start = path[index - 1] || path[0], end = path[index] || start;
  const span = (cumulative[index] ?? 0) - (cumulative[index - 1] ?? 0);
  const t = span > 0 ? (target - cumulative[index - 1]) / span : 0;
  return { point: [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t], heading: bearingDeg(start, end), index: index - 1, along: target };
}

// Where a (possibly off-route) GPS point sits along the path: the nearest spot on any segment.
export function projectOnPath(path, cumulative, point) {
  if (path.length < 2) return { along: 0, offM: path[0] ? distanceM(path[0], point) : 0, index: 0 };
  const scale = Math.cos(toRad(point[0]));
  let best = { along: 0, offM: Infinity, index: 0 };
  for (let index = 1; index < path.length; index += 1) {
    const [aLat, aLng] = path[index - 1], [bLat, bLng] = path[index];
    const ax = aLng * scale, ay = aLat, bx = bLng * scale, by = bLat, px = point[1] * scale, py = point[0];
    const dx = bx - ax, dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
    const nearest = [aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t];
    const offM = distanceM(nearest, point);
    if (offM < best.offM) best = { along: cumulative[index - 1] + (cumulative[index] - cumulative[index - 1]) * t, offM, index: index - 1 };
  }
  return best;
}

export const formatDistance = meters => meters < 950 ? `${Math.max(50, Math.round(meters / 50) * 50)} m` : `${(meters / 1000).toFixed(meters < 9500 ? 1 : 0)} km`;
