// Live order tracking: the map geometry (kitchen, address, road route), the rider's position and the
// status timeline. Customers poll GET /orders/:id/tracking once and then follow Socket.IO events;
// riders use GET /delivery/assignments/:id/route for their own navigation map.
import express from "express";
import mongoose from "mongoose";
import { Delivery, Order, Restaurant } from "./models.js";
import { allow, asyncHandler, protect } from "./middleware.js";
import { MAX_DELIVERY_KM, distanceM, fromGeoJson, geocodeAddress, isPoint, offsetPoint, roadRoute } from "./geo.js";

const router = express.Router();
// A rider position older than this is shown as "last seen" instead of live.
const LIVE_GPS_MAX_AGE_MS = 3 * 60000;
const inflight = new Map();

async function restaurantPoint(restaurant) {
  const stored = fromGeoJson(restaurant?.address?.location?.coordinates);
  if (isPoint(stored)) return stored;
  const hit = await geocodeAddress(restaurant?.address || {});
  if (!hit) return null;
  await Restaurant.updateOne({ _id: restaurant._id }, { $set: { "address.location": { type: "Point", coordinates: [hit.point[1], hit.point[0]] } } });
  return hit.point;
}

async function dropPoint(order) {
  const address = order.deliveryAddress || {};
  const pinned = [Number(address.latitude), Number(address.longitude)];
  if (address.latitude != null && address.longitude != null && isPoint(pinned)) return { point: pinned, precision: "pin" };
  return geocodeAddress(address);
}

// The same order always gets the same stand-in kitchen point, whoever is looking at it.
const seededBearing = id => [...String(id)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);

// Works out (once) where the order goes from and to, and the road between them.
export function ensureTracking(order) {
  if (order.tracking?.path?.length) return Promise.resolve(order.tracking);
  const key = String(order._id);
  if (!inflight.has(key)) inflight.set(key, (async () => {
    const restaurant = order.restaurant?.address ? order.restaurant : await Restaurant.findById(order.restaurant?._id || order.restaurant);
    const drop = await dropPoint(order);
    if (!drop) return null;
    let pickup = restaurant ? await restaurantPoint(restaurant) : null;
    const kitchenDistanceM = pickup ? Math.round(distanceM(pickup, drop.point)) : null;
    // Demo kitchens are in one city while testers order from anywhere; draw a believable local route instead
    // of a 1,000 km line, and tell the customer the kitchen marker is a stand-in.
    const approximatePickup = !pickup || kitchenDistanceM > MAX_DELIVERY_KM * 1000;
    if (approximatePickup) {
      const bearing = seededBearing(order._id);
      pickup = offsetPoint(drop.point, 1800 + (bearing * 7) % 1600, bearing);
    }
    const route = await roadRoute(pickup, drop.point);
    const tracking = {
      pickup, drop: drop.point, path: route.path, distanceM: route.distanceM, durationS: route.durationS, source: route.source,
      dropPrecision: drop.precision, approximatePickup, kitchenDistanceM, computedAt: new Date()
    };
    // A fallback (curved estimate) route is used now but not saved, so a real road route can replace it later.
    if (route.source === "osrm") await Order.updateOne({ _id: order._id }, { $set: { tracking } });
    return tracking;
  })().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

// When each step happened. Older orders have no history, so known timestamps fill the gaps.
function stepTimes(order, delivery) {
  const times = {};
  for (const entry of order.statusHistory || []) if (entry?.status && entry.at && !times[entry.status]) times[entry.status] = entry.at;
  times.placed ||= order.placedAt || (order.payment ? null : order.createdAt);
  if (order.orderStatus === "delivered") times.delivered ||= delivery?.actualDeliveryTime || order.updatedAt;
  if (["cancelled", "rejected"].includes(order.orderStatus)) times[order.orderStatus] ||= order.cancelledAt || order.updatedAt;
  if (["picked_up", "on_the_way", "delivered"].includes(order.orderStatus)) times.picked_up ||= times.on_the_way || delivery?.updatedAt || order.updatedAt;
  return times;
}

function riderPosition(delivery) {
  const point = fromGeoJson(delivery?.currentLocation?.coordinates);
  if (!isPoint(point)) return null;
  const updatedAt = delivery.locationUpdatedAt || delivery.updatedAt;
  return { point, heading: delivery.heading ?? null, updatedAt, live: Date.now() - new Date(updatedAt).getTime() < LIVE_GPS_MAX_AGE_MS };
}

const geometryView = tracking => tracking && {
  pickup: tracking.pickup, drop: tracking.drop, path: tracking.path, distanceM: tracking.distanceM, durationS: tracking.durationS,
  source: tracking.source, dropPrecision: tracking.dropPrecision, approximatePickup: Boolean(tracking.approximatePickup), kitchenDistanceM: tracking.kitchenDistanceM ?? null
};

router.get("/orders/:id/tracking", protect, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Order not found" });
  const order = await Order.findById(req.params.id).populate("restaurant", "name address owner deliveryTime coverImage cuisine")
    .populate({ path: "delivery", populate: { path: "deliveryPartner", select: "name phone profileImage" } });
  if (!order) return res.status(404).json({ message: "Order not found" });
  const delivery = order.delivery;
  const permitted = req.user.role === "admin"
    || String(order.customer) === String(req.user._id)
    || (req.user.role === "restaurant_owner" && String(order.restaurant?.owner) === String(req.user._id))
    || (req.user.role === "delivery_partner" && delivery && String(delivery.deliveryPartner?._id || delivery.deliveryPartner) === String(req.user._id));
  if (!permitted) return res.status(403).json({ message: "Forbidden" });

  const tracking = ["awaiting_payment", "cancelled", "rejected"].includes(order.orderStatus) ? null : await ensureTracking(order).catch(() => null);
  const times = stepTimes(order, delivery);
  const partner = delivery?.deliveryPartner;
  res.json({
    orderId: order._id,
    status: order.orderStatus,
    placedAt: order.placedAt || order.createdAt,
    promisedMinutes: order.restaurant?.deliveryTime || 35,
    restaurant: order.restaurant && { name: order.restaurant.name, address: order.restaurant.address, coverImage: order.restaurant.coverImage, cuisine: order.restaurant.cuisine },
    geometry: geometryView(tracking),
    delivery: delivery && { status: delivery.status, assignedAt: times.rider_assigned || null },
    rider: partner && { name: partner.name, phone: partner.phone, profileImage: partner.profileImage },
    position: riderPosition(delivery),
    times,
    serverTime: new Date()
  });
}));

// The rider's navigation map: the kitchen, the customer's address and the road between them.
router.get("/delivery/assignments/:id/route", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Delivery not found" });
  const delivery = await Delivery.findOne({ _id: req.params.id, $or: [{ deliveryPartner: req.user._id }, { deliveryPartner: null }] });
  if (!delivery) return res.status(404).json({ message: "Delivery not found" });
  const order = await Order.findById(delivery.order).populate("restaurant", "name address deliveryTime");
  if (!order) return res.status(404).json({ message: "Order not found" });
  const tracking = await ensureTracking(order).catch(() => null);
  if (!tracking) return res.status(422).json({ message: "We couldn't place this address on the map. Call the customer for directions." });
  res.json({ geometry: geometryView(tracking), position: riderPosition(delivery), restaurant: { name: order.restaurant?.name }, status: delivery.status });
}));

// Bearing in degrees (0 = north) from one point to the next, for pointing the rider marker.
export function bearingDeg(from, to) {
  const toRad = degrees => degrees * Math.PI / 180;
  const y = Math.sin(toRad(to[1] - from[1])) * Math.cos(toRad(to[0]));
  const x = Math.cos(toRad(from[0])) * Math.sin(toRad(to[0])) - Math.sin(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.cos(toRad(to[1] - from[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default router;
