import mongoose from "mongoose";

const { Schema, model } = mongoose;
const pointSchema = new Schema({
  type: { type: String, enum: ["Point"], default: "Point" },
  coordinates: { type: [Number], default: [0, 0] }
}, { _id: false });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  phone: { type: String, default: "" },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["customer", "restaurant_owner", "delivery_partner", "admin"], default: "customer" },
  profileImage: { type: String, default: "" },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: false },
  // Refer & earn: every customer gets a shareable code; referralRewardedAt marks that the referrer was paid.
  referralCode: { type: String, default: undefined },
  referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  referralRewardedAt: { type: Date, default: null }
}, { timestamps: true });
userSchema.index({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: "string" } } });

const restaurantSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  cuisine: [{ type: String }],
  logo: { type: String, default: "" },
  coverImage: { type: String, default: "" },
  address: {
    street: String, city: String, state: String, postalCode: String,
    location: { type: pointSchema, default: () => ({ type: "Point", coordinates: [0,0] }) }
  },
  openingHours: { type: String, default: "10:00 AM - 10:00 PM" },
  rating: { type: Number, default: 0 },
  deliveryTime: { type: Number, default: 35 },
  minimumOrder: { type: Number, default: 0 },
  commissionRate: { type: Number, default: 15 },
  status: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: "pending" },
  isOpen: { type: Boolean, default: true }
}, { timestamps: true });

const categorySchema = new Schema({
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  name: { type: String, required: true },
  image: String
}, { timestamps: true });

const foodItemSchema = new Schema({
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null },
  foodType: { type: String, enum: ["veg", "non-veg", "vegan"], default: "veg" },
  isAvailable: { type: Boolean, default: true },
  preparationTime: { type: Number, default: 20 },
  calories: { type: Number, default: null },
  spiceLevel: { type: String, enum: ["Mild", "Medium", "Hot", "Extra hot", ""], default: "" },
  ingredients: { type: [String], default: [] },
  allergens: { type: [String], default: [] },
  isBestseller: { type: Boolean, default: false },
  portionSize: { type: String, default: "" },
  dietaryTags: { type: [String], default: [] }
}, { timestamps: true });

const cartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  items: [{
    foodItem: { type: Schema.Types.ObjectId, ref: "FoodItem" },
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant" },
    quantity: { type: Number, min: 1, default: 1 }
  }]
}, { timestamps: true });

const PAYMENT_METHOD_VALUES = ["cod", "upi", "card", "netbanking", "razorpay"];
const orderSchema = new Schema({
  groupOrderId: { type: String, required: true, index: true },
  orderNumber: { type: String, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  items: [{
    foodItem: { type: Schema.Types.ObjectId, ref: "FoodItem" },
    name: String, quantity: Number, unitPrice: Number, subtotal: Number
  }],
  deliveryAddress: { name: String, phone: String, street: String, city: String, state: String, postalCode: String, instructions: String, latitude: Number, longitude: Number },
  subtotal: Number, tax: Number, deliveryFee: Number, discount: { type: Number, default: 0 },
  totalAmount: Number,
  payment: { type: Schema.Types.ObjectId, ref: "Payment", default: null, index: true },
  paymentMethod: { type: String, enum: PAYMENT_METHOD_VALUES, default: "cod" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refund_pending", "partially_refunded", "refunded", "cancelled"], default: "pending" },
  refundedAmount: { type: Number, default: 0 },
  // awaiting_payment: an online checkout that hasn't been paid yet, so the restaurant can't see it.
  orderStatus: { type: String, enum: ["awaiting_payment", "placed", "accepted", "rejected", "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled"], default: "placed" },
  // When the order reached the restaurant: at checkout for COD, once paid for online orders.
  placedAt: { type: Date, default: null },
  cancelledAt: Date,
  cancelledBy: { type: String, enum: ["customer", "restaurant", "system", "admin", null], default: null },
  cancellationReason: String,
  delivery: { type: Schema.Types.ObjectId, ref: "Delivery", default: null }
}, { timestamps: true });

// Every state change is appended here so support can see exactly what happened to a payment.
const paymentEventSchema = new Schema({
  type: { type: String, required: true },
  message: String,
  source: { type: String, default: "system" },
  data: Schema.Types.Mixed,
  at: { type: Date, default: Date.now }
}, { _id: false });

// "started" marks an open gateway session; each failed try is recorded as its own "failed" entry.
const paymentAttemptSchema = new Schema({
  status: { type: String, enum: ["started", "failed", "captured", "dismissed"], default: "started" },
  method: String,
  providerPaymentId: String,
  errorCode: String,
  errorReason: String,
  startedAt: { type: Date, default: Date.now },
  completedAt: Date
});

const refundSchema = new Schema({
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: "" },
  // late_capture: money that arrived after the checkout had closed, returned automatically.
  kind: { type: String, enum: ["order", "manual", "late_capture"], default: "order" },
  status: { type: String, enum: ["pending", "processed", "failed"], default: "pending" },
  providerPaymentId: String,
  providerRefundId: String,
  failureReason: String,
  initiatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  processedAt: Date
});

const paymentSchema = new Schema({
  groupOrderId: { type: String, required: true, index: true },
  // "food" payments settle restaurant Orders; "grocery" payments settle one GroceryOrder.
  kind: { type: String, enum: ["food", "grocery"], default: "food" },
  groceryOrder: { type: Schema.Types.ObjectId, ref: "GroceryOrder", default: null },
  order: { type: Schema.Types.ObjectId, ref: "Order" },
  orders: [{ type: Schema.Types.ObjectId, ref: "Order" }],
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: Number,
  currency: { type: String, default: "INR" },
  method: { type: String, enum: PAYMENT_METHOD_VALUES, default: "cod" },
  gateway: { type: String, enum: ["cash", "razorpay", "mock"], default: "cash" },
  // created: checkout still being assembled. pending: awaiting money. failed: last try failed, still retryable.
  status: { type: String, enum: ["created", "pending", "authorized", "paid", "failed", "expired", "cancelled", "partially_refunded", "refunded"], default: "pending" },
  idempotencyKey: { type: String, default: undefined },
  requestHash: String,
  cartSnapshot: [{ _id: false, foodItem: { type: Schema.Types.ObjectId, ref: "FoodItem" }, restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant" }, quantity: Number }],
  amountPaid: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },
  providerOrderId: { type: String, index: true, sparse: true },
  providerPaymentId: String,
  providerSignature: String,
  attempts: { type: [paymentAttemptSchema], default: [] },
  refunds: { type: [refundSchema], default: [] },
  events: { type: [paymentEventSchema], default: [] },
  expiresAt: { type: Date, default: null },
  paidAt: Date,
  lastError: String
}, { timestamps: true });
paymentSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
paymentSchema.index({ status: 1, expiresAt: 1 });
paymentSchema.index({ "refunds.status": 1 });
paymentSchema.index({ "refunds.providerRefundId": 1 }, { sparse: true });

// One row per customer per day: the unique index makes "one spin a day" impossible to bypass with parallel requests.
const dailySpinSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true },
  streak: { type: Number, default: 1 },
  prizeId: String,
  label: String,
  coupon: { type: Schema.Types.ObjectId, ref: "Coupon", default: null }
}, { timestamps: true });
dailySpinSchema.index({ user: 1, day: 1 }, { unique: true });

// Gateways retry webhook deliveries; remembering event IDs makes processing exactly-once.
const webhookEventSchema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  type: String,
  processedAt: { type: Date, default: Date.now }
});
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const deliverySchema = new Schema({
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  deliveryPartner: { type: Schema.Types.ObjectId, ref: "User", default: null },
  pickupLocation: { type: Object, default: {} },
  dropLocation: { type: Object, default: {} },
  status: { type: String, enum: ["assigned", "accepted", "picked_up", "on_the_way", "delivered", "failed"], default: "assigned" },
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  currentLocation: { type: pointSchema, default: undefined }
}, { timestamps: true });

const addressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  label: { type: String, default: "Home" },
  name: String, phone: String, street: String, city: String, state: String, postalCode: String,
  location: pointSchema,
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

const reviewSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order" },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: "" }
}, { timestamps: true });

const couponSchema = new Schema({
  code: { type: String, unique: true, uppercase: true },
  discountType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  discountValue: Number, minOrder: { type: Number, default: 0 },
  maxDiscount: Number, expiresAt: Date, isActive: { type: Boolean, default: true },
  usedCount: { type: Number, default: 0 },
  // Personal, single-use coupons (spin prizes, referral rewards). Public campaign coupons have no owner.
  owner: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  title: { type: String, default: "" },
  source: { type: String, enum: ["campaign", "spin", "streak", "welcome", "referral"], default: "campaign" },
  usedAt: { type: Date, default: null },
  usedFor: { type: String, default: null }
}, { timestamps: true });

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: String, message: String, type: { type: String, default: "info" },
  readAt: Date, data: Schema.Types.Mixed
}, { timestamps: true });

const settlementSchema = new Schema({
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order" },
  grossAmount: Number, commissionAmount: Number, netAmount: Number,
  status: { type: String, enum: ["pending", "paid"], default: "pending" }
}, { timestamps: true });

const supportSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  subject: String, message: String,
  status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open" }
}, { timestamps: true });

const auditSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: "User" },
  action: String, entityType: String, entityId: String, metadata: Schema.Types.Mixed
}, { timestamps: true });


const favoriteSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true }
}, { timestamps: true });
favoriteSchema.index({ user: 1, restaurant: 1 }, { unique: true });

const reservationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  guests: { type: Number, min: 1, max: 20, default: 2 },
  occasion: { type: String, default: "" },
  notes: { type: String, default: "" },
  status: { type: String, enum: ["requested", "confirmed", "cancelled", "completed"], default: "requested" }
}, { timestamps: true });

const groceryProductSchema = new Schema({
  name: { type: String, required: true },
  category: { type: String, default: "Essentials" },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, default: 0 },
  unit: { type: String, default: "1 pack" },
  stock: { type: Number, default: 100 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const groceryOrderSchema = new Schema({
  orderNumber: { type: String, unique: true, required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: [{ product: { type: Schema.Types.ObjectId, ref: "GroceryProduct" }, name: String, quantity: Number, price: Number, mrp: Number, unit: String, image: String }],
  address: { label: String, name: String, phone: String, street: String, city: String, state: String, postalCode: String },
  subtotal: Number, deliveryFee: Number, tip: { type: Number, default: 0 }, totalAmount: Number,
  // express: as soon as possible; scheduled: a two-hour window the customer picked.
  deliverySlot: { kind: { type: String, enum: ["express", "scheduled"], default: "express" }, label: String, start: Date, end: Date },
  instructions: { type: String, default: "" },
  substitution: { type: String, enum: ["call", "similar", "remove"], default: "call" },
  paymentMethod: { type: String, enum: ["cod", "upi", "card", "netbanking", "razorpay"], default: "cod" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "cancelled", "refund_pending", "partially_refunded", "refunded"], default: "pending" },
  payment: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
  refundedAmount: { type: Number, default: 0 },
  // awaiting_payment: stock is reserved but the shop doesn't pack it until the online payment succeeds.
  status: { type: String, enum: ["awaiting_payment", "placed", "packed", "out_for_delivery", "delivered", "cancelled"], default: "placed" },
  placedAt: Date, cancelledAt: Date, cancelledBy: String, cancellationReason: String,
  idempotencyKey: { type: String, default: undefined },
  requestHash: String
}, { timestamps: true });
groceryOrderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

const membershipSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  plan: { type: String, enum: ["gofoode_plus"], default: "gofoode_plus" },
  status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  amount: { type: Number, default: 299 }
}, { timestamps: true });


const pickupRequestSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  deliveryPartner: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  pickup: { name: String, phone: String, address: String },
  drop: { name: String, phone: String, address: String },
  itemDescription: { type: String, required: true },
  instructions: String,
  fee: { type: Number, default: 49 },
  currentLocation: { type: pointSchema, default: undefined },
  status: { type: String, enum: ["requested", "accepted", "picked_up", "on_the_way", "delivered", "cancelled"], default: "requested" }
}, { timestamps: true });

const experienceSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  venue: String,
  city: { type: String, default: "Faridabad" },
  date: Date,
  time: String,
  image: String,
  category: { type: String, default: "Food & drinks" },
  duration: String,
  highlights: { type: [String], default: undefined },
  price: { type: Number, default: 0 },
  capacity: { type: Number, default: 50 },
  // Seats taken by confirmed bookings. Updated atomically so two people can't both get the last seat.
  booked: { type: Number, min: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const experienceBookingSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  experience: { type: Schema.Types.ObjectId, ref: "Experience", required: true },
  tickets: { type: Number, min: 1, max: 10, default: 1 },
  amount: Number,
  status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed" }
}, { timestamps: true });

export const User = model("User", userSchema);
export const Restaurant = model("Restaurant", restaurantSchema);
export const Category = model("Category", categorySchema);
export const FoodItem = model("FoodItem", foodItemSchema);
export const Cart = model("Cart", cartSchema);
export const Order = model("Order", orderSchema);
export const Payment = model("Payment", paymentSchema);
export const WebhookEvent = model("WebhookEvent", webhookEventSchema);
export const DailySpin = model("DailySpin", dailySpinSchema);
export const Delivery = model("Delivery", deliverySchema);
export const Address = model("Address", addressSchema);
export const Review = model("Review", reviewSchema);
export const Coupon = model("Coupon", couponSchema);
export const Notification = model("Notification", notificationSchema);
export const Settlement = model("Settlement", settlementSchema);
export const SupportTicket = model("SupportTicket", supportSchema);
export const AuditLog = model("AuditLog", auditSchema);

export const Favorite = model("Favorite", favoriteSchema);
export const Reservation = model("Reservation", reservationSchema);
export const GroceryProduct = model("GroceryProduct", groceryProductSchema);
export const GroceryOrder = model("GroceryOrder", groceryOrderSchema);
export const Membership = model("Membership", membershipSchema);

export const PickupRequest = model("PickupRequest", pickupRequestSchema);
export const Experience = model("Experience", experienceSchema);
export const ExperienceBooking = model("ExperienceBooking", experienceBookingSchema);
