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
  isAvailable: { type: Boolean, default: false }
}, { timestamps: true });

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
  paymentMethod: { type: String, enum: ["cod", "upi", "netbanking", "razorpay"], default: "cod" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  orderStatus: { type: String, enum: ["placed", "accepted", "rejected", "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled"], default: "placed" },
  delivery: { type: Schema.Types.ObjectId, ref: "Delivery", default: null }
}, { timestamps: true });

const paymentSchema = new Schema({
  groupOrderId: { type: String, required: true, index: true },
  order: { type: Schema.Types.ObjectId, ref: "Order" },
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  amount: Number,
  currency: { type: String, default: "INR" },
  method: { type: String, enum: ["cod", "upi", "netbanking", "razorpay"], default: "cod" },
  status: { type: String, enum: ["created", "pending", "paid", "failed", "refunded"], default: "pending" },
  providerOrderId: String,
  providerPaymentId: String,
  providerSignature: String
}, { timestamps: true });

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
  maxDiscount: Number, expiresAt: Date, isActive: { type: Boolean, default: true }
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
  items: [{ product: { type: Schema.Types.ObjectId, ref: "GroceryProduct" }, name: String, quantity: Number, price: Number }],
  address: { name: String, phone: String, street: String, city: String, state: String, postalCode: String },
  subtotal: Number, deliveryFee: Number, totalAmount: Number,
  paymentMethod: { type: String, enum: ["cod", "upi", "netbanking", "razorpay"], default: "cod" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  status: { type: String, enum: ["placed", "packed", "out_for_delivery", "delivered", "cancelled"], default: "placed" }
}, { timestamps: true });

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
  price: { type: Number, default: 0 },
  capacity: { type: Number, default: 50 },
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
