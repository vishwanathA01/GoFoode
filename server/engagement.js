// Features that bring people to GoFoode and bring them back: a daily spin with streaks, refer & earn,
// a personal coupon wallet, and a live "what people are ordering" pulse built from real orders.
// Prizes are always decided on the server, so they can't be influenced from the browser.
import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User, Coupon, DailySpin, Order, FoodItem, Notification } from "./models.js";
import { protect, allow, asyncHandler } from "./middleware.js";
import { config } from "./config.js";

const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60000;
const HIDDEN_RESTAURANTS = /^DineFlow Demo\b/i;
const firstName = name => String(name || "").trim().split(/\s+/)[0] || "A friend";
const rupees = amount => `₹${Math.round(Number(amount || 0) * 100) / 100}`;
const notify = (user, title, message, data = {}) =>
  Notification.create({ user, title, message, type: "reward", data }).catch(error => console.error("[rewards] notification failed:", error.message));

// Calendar days are counted in India time, so "one spin a day" resets at local midnight.
export const dayKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const shiftDay = (key, days) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const startOfDay = key => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS); };

// ---------------------------------------------------------------------------------------------------------
// Personal coupons
// ---------------------------------------------------------------------------------------------------------
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = length => Array.from({ length }, () => codeChars[crypto.randomInt(codeChars.length)]).join("");

async function issueCoupon(owner, { prefix, title, source, discountType, discountValue, maxDiscount, minOrder, validDays }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Coupon.create({
        code: `${prefix}-${randomCode(6)}`, owner, title, source, discountType, discountValue,
        maxDiscount: maxDiscount ?? discountValue, minOrder, isActive: true,
        expiresAt: new Date(Date.now() + validDays * 86400000)
      });
    } catch (error) {
      if (error.code !== 11000) throw error; // code collision: try another
    }
  }
  throw new Error("Couldn't generate a unique coupon code.");
}

export const publicCoupon = coupon => ({
  _id: coupon._id, code: coupon.code, title: coupon.title, source: coupon.source, discountType: coupon.discountType,
  discountValue: coupon.discountValue, maxDiscount: coupon.maxDiscount, minOrder: coupon.minOrder, expiresAt: coupon.expiresAt,
  usedAt: coupon.usedAt, personal: Boolean(coupon.owner)
});
export const activePersonalCoupons = owner => Coupon.find({ owner, isActive: true, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 });

// Called when an online checkout closes unpaid, so a spin prize used on it can be used again.
export const releaseCouponFor = groupOrderId => Coupon.updateMany({ usedFor: groupOrderId, owner: { $ne: null } }, { $set: { usedAt: null, usedFor: null } });

// ---------------------------------------------------------------------------------------------------------
// Daily spin
// ---------------------------------------------------------------------------------------------------------
export const SPIN_PRIZES = [
  { id: "off10", label: "10% OFF", detail: "10% off, up to ₹60, on orders above ₹149", discountType: "percentage", discountValue: 10, maxDiscount: 60, minOrder: 149, weight: 30, color: "#ff9d00" },
  { id: "flat30", label: "₹30 OFF", detail: "₹30 off orders above ₹199", discountType: "fixed", discountValue: 30, minOrder: 199, weight: 26, color: "#ff6a13" },
  { id: "off15", label: "15% OFF", detail: "15% off, up to ₹90, on orders above ₹249", discountType: "percentage", discountValue: 15, maxDiscount: 90, minOrder: 249, weight: 18, color: "#e8437a" },
  { id: "flat50", label: "₹50 OFF", detail: "₹50 off orders above ₹299", discountType: "fixed", discountValue: 50, minOrder: 299, weight: 14, color: "#7c4dff" },
  { id: "off20", label: "20% OFF", detail: "20% off, up to ₹120, on orders above ₹299", discountType: "percentage", discountValue: 20, maxDiscount: 120, minOrder: 299, weight: 8, color: "#1a9a52" },
  { id: "flat100", label: "₹100 OFF", detail: "₹100 off orders above ₹399", discountType: "fixed", discountValue: 100, minOrder: 399, weight: 4, color: "#13213a", jackpot: true }
];
const STREAK_LENGTH = 7;
const pickWeighted = prizes => {
  let roll = crypto.randomInt(prizes.reduce((total, prize) => total + prize.weight, 0));
  for (const prize of prizes) { roll -= prize.weight; if (roll < 0) return prize; }
  return prizes[0];
};

async function spinState(userId) {
  const today = dayKey();
  const last = await DailySpin.findOne({ user: userId }).sort({ day: -1 }).populate("coupon");
  const spunToday = last?.day === today;
  // The streak survives as long as the last spin was today or yesterday.
  const streak = last && (spunToday || last.day === shiftDay(today, -1)) ? last.streak : 0;
  // progress: filled dots in the current 7-day cycle (7 on the day the bonus is won).
  const progress = streak ? ((streak - 1) % STREAK_LENGTH) + 1 : 0;
  return {
    available: !spunToday,
    streak,
    streakLength: STREAK_LENGTH,
    progress,
    spinsToBonus: progress === STREAK_LENGTH ? STREAK_LENGTH : STREAK_LENGTH - progress,
    nextSpinAt: startOfDay(shiftDay(today, 1)),
    today: spunToday ? { label: last.label, prizeId: last.prizeId, coupon: last.coupon ? publicCoupon(last.coupon) : null } : null
  };
}

// ---------------------------------------------------------------------------------------------------------
// Refer & earn
// ---------------------------------------------------------------------------------------------------------
export const REFERRAL = {
  friend: { prefix: "HELLO", title: "Welcome gift", source: "welcome", discountType: "fixed", discountValue: 75, minOrder: 199, validDays: 7 },
  referrer: { prefix: "THANKS", title: "Thanks for inviting a friend", source: "referral", discountType: "fixed", discountValue: 100, minOrder: 299, validDays: 14 }
};

async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  const stem = String(user.name || "").replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase() || "FOOD";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const updated = await User.findOneAndUpdate({ _id: user._id, referralCode: null }, { $set: { referralCode: `${stem}${randomCode(4)}` } }, { new: true });
      return (updated || await User.findById(user._id)).referralCode;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new Error("Couldn't create a referral code.");
}

// Links a new customer to whoever invited them and gives the newcomer a welcome coupon.
export async function applyReferralOnSignup(newUser, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(code)) return null;
  const inviter = await User.findOne({ referralCode: code, role: "customer", isActive: true });
  if (!inviter || String(inviter._id) === String(newUser._id)) return null;
  const linked = await User.findOneAndUpdate({ _id: newUser._id, referredBy: null }, { $set: { referredBy: inviter._id } });
  if (!linked) return null;
  const coupon = await issueCoupon(newUser._id, { ...REFERRAL.friend, title: `Welcome gift from ${firstName(inviter.name)}` });
  notify(newUser._id, "Your welcome gift is ready", `${firstName(inviter.name)} invited you, so here's ${rupees(REFERRAL.friend.discountValue)} off your first order. Use code ${coupon.code} within ${REFERRAL.friend.validDays} days.`, { couponId: coupon._id });
  notify(inviter._id, "Your friend joined GoFoode", `${firstName(newUser.name)} signed up with your invite. You'll get ${rupees(REFERRAL.referrer.discountValue)} off as soon as they place their first order.`);
  return coupon;
}

// Rewards the inviter once, when the invited customer's first order reaches a kitchen.
export async function rewardReferrerOnFirstOrder(customerId) {
  const customer = await User.findOneAndUpdate(
    { _id: customerId, referredBy: { $ne: null }, referralRewardedAt: null },
    { $set: { referralRewardedAt: new Date() } },
    { new: true }
  );
  if (!customer) return null;
  const coupon = await issueCoupon(customer.referredBy, { ...REFERRAL.referrer, title: `Thanks for inviting ${firstName(customer.name)}` });
  notify(customer.referredBy, "You earned a referral reward 🎉", `${firstName(customer.name)} placed their first order. Here's ${rupees(REFERRAL.referrer.discountValue)} off your next order: code ${coupon.code}.`, { couponId: coupon._id });
  return coupon;
}

// Lets a public route include the caller's own coupons when a valid token is present.
export function optionalUserId(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try { return jwt.verify(header.slice(7), config.accessSecret).sub; } catch { return null; }
}

// ---------------------------------------------------------------------------------------------------------
// Live pulse: trending dishes and recent orders (dish, restaurant and city only, never customer details)
// ---------------------------------------------------------------------------------------------------------
let pulseCache = { at: 0, data: null };
const LIVE_ORDER = { orderStatus: { $nin: ["awaiting_payment", "cancelled", "rejected"] } };
async function buildPulse() {
  const now = Date.now();
  const [ranked, recent, ordersToday] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: new Date(now - 7 * 86400000) }, ...LIVE_ORDER } },
      { $unwind: "$items" },
      { $group: { _id: "$items.foodItem", ordered: { $sum: "$items.quantity" } } },
      { $sort: { ordered: -1 } },
      { $limit: 12 }
    ]),
    Order.find({ createdAt: { $gte: new Date(now - 24 * 3600000) }, ...LIVE_ORDER }).sort({ createdAt: -1 }).limit(12).select("items restaurant deliveryAddress.city createdAt").populate("restaurant", "name"),
    Order.countDocuments({ createdAt: { $gte: startOfDay(dayKey()) }, ...LIVE_ORDER })
  ]);
  const counts = new Map(ranked.filter(row => row._id).map(row => [String(row._id), row.ordered]));
  const visible = dish => dish.restaurant?.status === "approved" && dish.restaurant?.isOpen && !HIDDEN_RESTAURANTS.test(dish.restaurant.name);
  const popular = (await FoodItem.find({ _id: { $in: [...counts.keys()] }, isAvailable: true }).populate("restaurant", "name status isOpen deliveryTime rating")).filter(visible);
  popular.sort((a, b) => counts.get(String(b._id)) - counts.get(String(a._id)));
  let trending = popular.slice(0, 8);
  if (trending.length < 6) {
    // Quiet week: top up with bestsellers so the section is never empty.
    const extra = (await FoodItem.find({ isAvailable: true, _id: { $nin: trending.map(dish => dish._id) } }).sort({ isBestseller: -1, updatedAt: -1 }).limit(30).populate("restaurant", "name status isOpen deliveryTime rating")).filter(visible);
    trending = [...trending, ...extra.slice(0, 8 - trending.length)];
  }
  return {
    trending: trending.map(dish => ({
      _id: dish._id, name: dish.name, image: dish.image, price: dish.discountPrice ?? dish.price, foodType: dish.foodType, isBestseller: dish.isBestseller,
      restaurant: { _id: dish.restaurant._id, name: dish.restaurant.name, deliveryTime: dish.restaurant.deliveryTime, rating: dish.restaurant.rating },
      orderedThisWeek: counts.get(String(dish._id)) || 0
    })),
    recent: recent.filter(order => order.restaurant && !HIDDEN_RESTAURANTS.test(order.restaurant.name) && order.items?.length).map(order => ({
      dish: order.items[0].name, more: order.items.length - 1, restaurant: order.restaurant.name, city: order.deliveryAddress?.city || "", at: order.createdAt
    })),
    ordersToday,
    generatedAt: new Date(now)
  };
}

// ---------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------
const router = express.Router();

router.get("/discover/pulse", asyncHandler(async (_req, res) => {
  if (!pulseCache.data || Date.now() - pulseCache.at > 60000) pulseCache = { at: Date.now(), data: await buildPulse() };
  res.set("Cache-Control", "public, max-age=30").json(pulseCache.data);
}));

router.get("/referrals/:code", asyncHandler(async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  const inviter = /^[A-Z0-9]{5,12}$/.test(code) ? await User.findOne({ referralCode: code, role: "customer", isActive: true }).select("name") : null;
  // Answer "not valid" rather than 404: an old or mistyped invite link isn't an error, the page just skips the gift.
  if (!inviter) return res.json({ valid: false, message: "This invite link isn't valid any more." });
  res.json({ valid: true, inviter: firstName(inviter.name), reward: `${rupees(REFERRAL.friend.discountValue)} off your first order`, minOrder: REFERRAL.friend.minOrder });
}));

router.get("/rewards", protect, allow("customer"), asyncHandler(async (req, res) => {
  const [spin, coupons, referralCode, invited, rewarded, earned] = await Promise.all([
    spinState(req.user._id),
    activePersonalCoupons(req.user._id),
    ensureReferralCode(req.user),
    User.countDocuments({ referredBy: req.user._id }),
    User.countDocuments({ referredBy: req.user._id, referralRewardedAt: { $ne: null } }),
    Coupon.countDocuments({ owner: req.user._id, source: "referral" })
  ]);
  res.json({
    spin,
    prizes: SPIN_PRIZES.map(({ id, label, detail, color, jackpot }) => ({ id, label, detail, color, jackpot: Boolean(jackpot) })),
    coupons: coupons.map(publicCoupon),
    referral: {
      code: referralCode, invited, rewarded, pending: invited - rewarded, earnedCoupons: earned,
      friendReward: `${rupees(REFERRAL.friend.discountValue)} off their first order`,
      yourReward: `${rupees(REFERRAL.referrer.discountValue)} off for every friend who orders`
    }
  });
}));

router.post("/rewards/spin", protect, allow("customer"), asyncHandler(async (req, res) => {
  const today = dayKey();
  const state = await spinState(req.user._id);
  if (!state.available) return res.status(409).json({ code: "ALREADY_SPUN", message: "You've already spun today. Come back tomorrow for another prize!", nextSpinAt: state.nextSpinAt });
  const streak = state.streak + 1;
  const bonus = streak % STREAK_LENGTH === 0;
  // A full week's streak guarantees one of the two best prizes.
  const prize = bonus ? pickWeighted(SPIN_PRIZES.filter(entry => entry.id === "off20" || entry.id === "flat100").map(entry => ({ ...entry, weight: 1 }))) : pickWeighted(SPIN_PRIZES);
  let spin;
  try {
    spin = await DailySpin.create({ user: req.user._id, day: today, streak, prizeId: prize.id, label: prize.label });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ code: "ALREADY_SPUN", message: "You've already spun today. Come back tomorrow for another prize!", nextSpinAt: state.nextSpinAt });
    throw error;
  }
  let coupon;
  try {
    coupon = await issueCoupon(req.user._id, {
      prefix: bonus ? "STREAK" : "SPIN", title: bonus ? `${STREAK_LENGTH}-day streak bonus: ${prize.label}` : `Daily spin: ${prize.label}`,
      source: bonus ? "streak" : "spin", discountType: prize.discountType, discountValue: prize.discountValue,
      maxDiscount: prize.maxDiscount, minOrder: prize.minOrder, validDays: 3
    });
  } catch (error) {
    await DailySpin.deleteOne({ _id: spin._id }); // give the spin back rather than lose the prize
    throw error;
  }
  await DailySpin.updateOne({ _id: spin._id }, { $set: { coupon: coupon._id } });
  notify(req.user._id, bonus ? "Streak bonus unlocked! 🔥" : "You won a prize 🎉", `${prize.label} is yours: use code ${coupon.code} within 3 days (${prize.detail}).`, { couponId: coupon._id });
  res.status(201).json({
    prize: { id: prize.id, label: prize.label, detail: prize.detail },
    prizeIndex: SPIN_PRIZES.findIndex(entry => entry.id === prize.id),
    coupon: publicCoupon(coupon),
    streak,
    bonus,
    nextSpinAt: startOfDay(shiftDay(today, 1))
  });
}));

export default router;
