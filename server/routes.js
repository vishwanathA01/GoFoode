import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import {
  User, Restaurant, FoodItem, Cart, Order, Payment, Delivery, Address,
  Review, Coupon, Notification, Settlement, SupportTicket, AuditLog, Favorite, Reservation, GroceryProduct, GroceryOrder, Membership, PickupRequest, Experience, ExperienceBooking
} from "./models.js";
import { protect, allow, asyncHandler } from "./middleware.js";
import { config } from "./config.js";

const router = express.Router();
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, profileImage: user.profileImage, isAvailable: user.isAvailable });
const tokenFor = user => jwt.sign({ sub: user._id, role: user.role }, config.accessSecret, { expiresIn: config.accessExpires });
const notify = async (user, title, message, type="info", data={}) => {
  const n = await Notification.create({ user, title, message, type, data });
  return n;
};
const emit = (req, room, event, payload) => req.app.get("io")?.to(room).emit(event, payload);

router.post("/chatbot", asyncHandler(async (req, res) => {
  if (!config.chatbotApiKey) return res.status(503).json({ message: "The AI assistant is not configured. Add CHATBOT_API_KEY to the server environment and restart the API." });
  if (!Array.isArray(req.body.messages) || req.body.messages.length === 0) return res.status(400).json({ message: "Send at least one chat message." });
  if (!["gemini", "openai-compatible"].includes(config.chatbotProvider)) {
    return res.status(503).json({ message: "Unsupported chatbot provider. Set CHATBOT_PROVIDER to gemini or openai-compatible." });
  }

  const messages = req.body.messages.slice(-12).map(message => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return null;
    const content = message.content.trim();
    return content && content.length <= 2000 ? { role: message.role, content } : null;
  });
  if (messages.some(message => !message) || messages.at(-1)?.role !== "user") {
    return res.status(400).json({ message: "Chat messages must be valid and end with a user message of at most 2,000 characters." });
  }

  const systemPrompt = "You are GoFoode's concise customer support assistant. Help with ordering, delivery, account navigation, reservations, and offers. Do not claim to access private account data or place/cancel orders. Direct account-specific requests to sign in and use the relevant dashboard. For health, allergy, or food-safety questions, advise the user to contact the restaurant or a qualified professional.";
  const isGemini = config.chatbotProvider === "gemini";
  const apiUrl = isGemini
    ? `${config.chatbotApiUrl.replace(/\/+$/, "")}/${encodeURIComponent(config.chatbotModel)}:generateContent`
    : config.chatbotApiUrl;
  const headers = isGemini
    ? { "Content-Type": "application/json", "x-goog-api-key": config.chatbotApiKey }
    : { Authorization: `Bearer ${config.chatbotApiKey}`, "Content-Type": "application/json" };
  const body = isGemini
    ? {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(message => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }]
        })),
        generationConfig: { maxOutputTokens: 256, temperature: 0.2 }
      }
    : {
        model: config.chatbotModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      };

  let upstream;
  try {
    upstream = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const errorCode = error?.cause?.code;
    console.error(`Chatbot provider request ${timedOut ? "timed out" : "failed"}${errorCode ? ` (${errorCode})` : ""}.`);
    return res.status(502).json({
      message: timedOut
        ? "Gemini took too long to respond. Please try again shortly."
        : "The AI assistant could not connect to Gemini. Check the server's internet connection and try again."
    });
  }
  if (!upstream.ok) {
    let errorData;
    try {
      errorData = await upstream.json();
    } catch {
      return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}). Check the API key and chatbot model configuration.` });
    }
    let detail = errorData?.error?.message || errorData?.message || "";
    if (typeof detail === "string" && detail) {
      detail = detail.replaceAll(config.chatbotApiKey, "[redacted]").slice(0, 300);
      return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}): ${detail}` });
    }
    return res.status(502).json({ message: `${isGemini ? "Gemini" : "The AI provider"} rejected the request (${upstream.status}). Check the API key and chatbot model configuration.` });
  }
  let data;
  try { data = await upstream.json(); }
  catch { return res.status(502).json({ message: "The AI provider returned an unreadable response. Please try again." }); }
  const reply = isGemini
    ? data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("")
    : data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) return res.status(502).json({ message: "The AI provider returned an empty reply. Please try again." });
  res.json({ reply: reply.trim() });
}));

router.post("/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Name, email and password (8+ characters) are required" });
  if (role && role !== "customer") return res.status(403).json({ message: "Use the relevant onboarding process for this role" });
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 12), role: "customer" });
  res.status(201).json({ user: safeUser(user), accessToken: tokenFor(user) });
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || "").toLowerCase() }).select("+password");
  if (!user || !user.isActive || !(await bcrypt.compare(password || "", user.password))) return res.status(401).json({ message: "Invalid email or password" });
  res.json({ user: safeUser(user), accessToken: tokenFor(user) });
}));
router.get("/auth/me", protect, (req, res) => res.json({ user: safeUser(req.user) }));
router.patch("/profile", protect, asyncHandler(async (req, res) => {
  const { profileImage } = req.body;
  if (typeof profileImage !== "string" || profileImage.length > 950000) {
    return res.status(400).json({ message: "Choose an image smaller than 680 KB." });
  }
  if (profileImage && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(profileImage)) {
    return res.status(400).json({ message: "Profile photos must be a JPEG, PNG or WebP image." });
  }
  req.user.profileImage = profileImage;
  await req.user.save();
  res.json({ user: safeUser(req.user) });
}));

router.post("/auth/onboard", asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!["restaurant_owner", "delivery_partner"].includes(role)) return res.status(400).json({ message: "Invalid onboarding role" });
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Complete all required fields" });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name, email, phone, role, password: await bcrypt.hash(password, 12) });
  res.status(201).json({ user: safeUser(user), accessToken: tokenFor(user) });
}));

router.get("/restaurants", asyncHandler(async (req, res) => {
  const { search, cuisine } = req.query;
  const query = { status: "approved", isOpen: true };
  if (search) query.$or = [{ name: new RegExp(String(search), "i") }, { cuisine: new RegExp(String(search), "i") }];
  if (cuisine) query.cuisine = new RegExp(String(cuisine), "i");
  const rows = await Restaurant.find(query).sort({ rating: -1, createdAt: -1 }).limit(100);
  res.json(rows);
}));
router.get("/restaurants/:id", asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, status: "approved", isOpen: true });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  const menu = await FoodItem.find({ restaurant: restaurant._id, isAvailable: true });
  res.json({ restaurant, menu });
}));
router.get("/food-items", asyncHandler(async (req, res) => {
  const query = { isAvailable: true };
  if (req.query.search) query.name = new RegExp(String(req.query.search), "i");
  if (req.query.restaurant) query.restaurant = req.query.restaurant;
  const items = await FoodItem.find(query).populate("restaurant", "name rating deliveryTime status cuisine isOpen").limit(100);
  res.json(items.filter(x => x.restaurant?.status === "approved" && x.restaurant?.isOpen));
}));

router.post("/restaurants", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const { name, description, cuisine, street, city, state, postalCode } = req.body;
  if (!name || !city) return res.status(400).json({ message: "Restaurant name and city are required" });
  const restaurant = await Restaurant.create({
    owner: req.user._id, name, description,
    cuisine: Array.isArray(cuisine) ? cuisine : String(cuisine || "").split(",").map(x => x.trim()).filter(Boolean),
    address: { street, city, state, postalCode }
  });
  await AuditLog.create({ actor: req.user._id, action: "restaurant.created", entityType: "Restaurant", entityId: restaurant._id });
  res.status(201).json(restaurant);
}));
router.get("/restaurant/mine", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  res.json(await Restaurant.find({ owner: req.user._id }).sort({ createdAt: -1 }));
}));
router.patch("/restaurant/:id/availability", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  if (typeof req.body.isOpen !== "boolean") return res.status(400).json({ message: "isOpen must be true or false." });
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, status: "approved" },
    { isOpen: req.body.isOpen },
    { new: true }
  );
  if (!restaurant) return res.status(404).json({ message: "Approved restaurant not found." });
  res.json(restaurant);
}));
router.get("/restaurant/reviews", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await Review.find({ restaurant: { $in: restaurants.map(restaurant => restaurant._id) } })
    .populate("user", "name profileImage")
    .populate("restaurant", "name")
    .sort({ createdAt: -1 })
    .limit(200));
}));
router.get("/restaurant/dashboard", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).select("_id name status isOpen");
  const ids = restaurants.map(r => r._id);
  const [orders, recentOrders, menuItems] = await Promise.all([
    Order.find({ restaurant: { $in: ids } }),
    Order.find({ restaurant: { $in: ids } }).populate("customer", "name").populate("restaurant", "name").sort({ createdAt: -1 }).limit(6),
    FoodItem.countDocuments({ restaurant: { $in: ids } })
  ]);
  const revenue = orders.filter(o => o.paymentStatus === "paid" || o.orderStatus === "delivered").reduce((s,o) => s + o.totalAmount, 0);
  res.json({ restaurants, totalOrders: orders.length, pendingOrders: orders.filter(o => ["placed","accepted","preparing","ready"].includes(o.orderStatus)).length, completedOrders: orders.filter(o => o.orderStatus === "delivered").length, revenue, menuItems, recentOrders });
}));
router.post("/restaurant/menu", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const { restaurant, name, description, price, discountPrice, image, foodType, category, dietaryTags, calories, spiceLevel, ingredients, allergens, portionSize, preparationTime, isBestseller } = req.body;
  const owned = await Restaurant.findOne({ _id: restaurant, owner: req.user._id, status: "approved" });
  if (!owned) return res.status(403).json({ message: "Approved restaurant ownership required" });
  if (!String(name||"").trim() || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ message: "Valid name and price are required" });
  if (discountPrice !== undefined && discountPrice !== null && discountPrice !== "" && (!Number.isFinite(Number(discountPrice)) || Number(discountPrice) < 0 || Number(discountPrice) > Number(price))) return res.status(400).json({ message: "Offer price must be a valid amount no greater than the menu price." });
  res.status(201).json(await FoodItem.create({ restaurant, name:String(name).trim(), description, price:Number(price), discountPrice:discountPrice===""?null:discountPrice, image, foodType, category:category||null, dietaryTags, calories, spiceLevel, ingredients, allergens, portionSize, preparationTime, isBestseller }));
}));
router.get("/restaurant/menu", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const owned = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await FoodItem.find({ restaurant: { $in: owned.map(x => x._id) } }).populate("restaurant", "name"));
}));
router.patch("/restaurant/menu/:id", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const item = await FoodItem.findById(req.params.id).populate("restaurant");
  if (!item || String(item.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Menu item not found" });
  const allowed = ["name","description","price","image","foodType","isAvailable","discountPrice","preparationTime","calories","spiceLevel","ingredients","allergens","isBestseller","portionSize","dietaryTags"];
  allowed.forEach(k => { if (req.body[k] !== undefined) item[k] = req.body[k]; });
  if (!String(item.name||"").trim() || !Number.isFinite(Number(item.price)) || Number(item.price)<0 || (item.discountPrice!=null && Number(item.discountPrice)>Number(item.price))) return res.status(400).json({message:"Enter a valid item name and price. An offer price cannot exceed the menu price."});
  await item.save(); res.json(item);
}));
router.delete("/restaurant/menu/:id", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const item = await FoodItem.findById(req.params.id).populate("restaurant");
  if (!item || String(item.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Menu item not found" });
  await item.deleteOne(); res.json({ message: "Menu item deleted" });
}));
router.get("/restaurant/orders", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const owned = await Restaurant.find({ owner: req.user._id }).select("_id");
  res.json(await Order.find({ restaurant: { $in: owned.map(x => x._id) } }).populate("customer", "name phone").populate("restaurant", "name").sort({ createdAt: -1 }));
}));
router.patch("/restaurant/orders/:id/status", protect, allow("restaurant_owner"), asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("restaurant");
  if (!order || String(order.restaurant.owner) !== String(req.user._id)) return res.status(404).json({ message: "Order not found" });
  const transitions = { placed: ["accepted","rejected"], accepted: ["preparing"], preparing: ["ready"], ready: [] };
  const next = req.body.status;
  if (!(transitions[order.orderStatus] || []).includes(next)) return res.status(400).json({ message: "Invalid order status transition" });
  order.orderStatus = next; await order.save();
  await notify(order.customer, "Order update", `Your order ${order.orderNumber} is ${next}.`, "order", { orderId: order._id });
  emit(req, `user:${order.customer}`, "order:updated", { orderId: order._id, status: next });
  if (next === "ready") {
    const delivery = await Delivery.findOneAndUpdate({ order: order._id }, { $setOnInsert: { order: order._id, pickupLocation: order.restaurant.address, dropLocation: order.deliveryAddress } }, { upsert: true, new: true });
    order.delivery = delivery._id; await order.save();
    const availablePartners = await User.find({ role: "delivery_partner", isActive: true, isAvailable: true }).select("_id");
    await Promise.all(availablePartners.map(partner => notify(partner._id, "Delivery available", `Order ${order.orderNumber} is ready for pickup from ${order.restaurant.name}.`, "delivery", { orderId: order._id, deliveryId: delivery._id })));
    emit(req, "role:delivery_partner", "delivery:available", { orderId: order._id, deliveryId: delivery._id, orderNumber: order.orderNumber });
  }
  res.json(order);
}));

router.get("/cart", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.foodItem").populate("items.restaurant");
  res.json(cart || { user: req.user._id, items: [] });
}));
router.post("/cart/items", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { foodItemId, quantity = 1 } = req.body;
  const food = await FoodItem.findById(foodItemId).populate("restaurant");
  if (!food || !food.isAvailable || food.restaurant.status !== "approved" || !food.restaurant.isOpen) return res.status(404).json({ message: "Food item unavailable" });
  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
  const existing = cart.items.find(i => String(i.foodItem) === String(food._id));
  if (existing) existing.quantity += Math.max(1, Number(quantity));
  else cart.items.push({ foodItem: food._id, restaurant: food.restaurant._id, quantity: Math.max(1, Number(quantity)) });
  await cart.save();
  res.json(await Cart.findById(cart._id).populate("items.foodItem").populate("items.restaurant"));
}));
router.patch("/cart/items/:foodId", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });
  const item = cart.items.find(i => String(i.foodItem) === req.params.foodId);
  if (!item) return res.status(404).json({ message: "Cart item not found" });
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ message: "Quantity must be between 1 and 20" });
  item.quantity = quantity; await cart.save();
  res.json(await Cart.findById(cart._id).populate("items.foodItem").populate("items.restaurant"));
}));
router.delete("/cart/items/:foodId", protect, allow("customer"), asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) { cart.items = cart.items.filter(i => String(i.foodItem) !== req.params.foodId); await cart.save(); }
  res.json(cart || { items: [] });
}));

router.post("/checkout", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { deliveryAddress, paymentMethod = "cod", couponCode = "" } = req.body;
  if (!deliveryAddress?.street || !deliveryAddress?.city || !deliveryAddress?.phone) return res.status(400).json({ message: "A complete delivery address is required" });
  if (!["cod","upi","netbanking","razorpay"].includes(paymentMethod)) return res.status(400).json({ message: "Unsupported payment method" });
  if (paymentMethod === "razorpay") return res.status(501).json({ message: "Online payment is not configured. Add Razorpay credentials and complete provider verification before enabling this option." });
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.foodItem").populate("items.restaurant");
  if (!cart?.items?.length) return res.status(400).json({ message: "Your cart is empty" });
  const grouped = new Map();
  for (const line of cart.items) {
    if (!line.foodItem || !line.foodItem.isAvailable || line.restaurant.status !== "approved" || !line.restaurant.isOpen) return res.status(400).json({ message: "A cart item is no longer available" });
    const key = String(line.restaurant._id);
    if (!grouped.has(key)) grouped.set(key, { restaurant: line.restaurant, items: [] });
    const price = line.foodItem.discountPrice ?? line.foodItem.price;
    grouped.get(key).items.push({ foodItem: line.foodItem._id, name: line.foodItem.name, quantity: line.quantity, unitPrice: price, subtotal: price * line.quantity });
  }
  let coupon = null;
  if (couponCode) {
    coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase(), isActive: true });
    if (!coupon || (coupon.expiresAt && coupon.expiresAt < new Date())) return res.status(400).json({ message: "This coupon is invalid or expired" });
  }
  const cartSubtotal = cart.items.reduce((sum,line) => sum + (line.foodItem.discountPrice ?? line.foodItem.price) * line.quantity, 0);
  if (coupon && cartSubtotal < coupon.minOrder) return res.status(400).json({ message: `Coupon requires a minimum order of ₹${coupon.minOrder}` });
  const groupOrderId = `GF-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const created = [];
  for (const group of grouped.values()) {
    const subtotal = group.items.reduce((s,i) => s + i.subtotal, 0);
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const deliveryFee = 35;
    const eligibleDiscount = coupon && created.length === 0
      ? Math.min(coupon.discountType === "percentage" ? cartSubtotal * coupon.discountValue / 100 : coupon.discountValue, coupon.maxDiscount || cartSubtotal, subtotal + tax + deliveryFee)
      : 0;
    const discount = Math.round(eligibleDiscount * 100) / 100;
    const order = await Order.create({
      groupOrderId, orderNumber: `${groupOrderId}-${created.length + 1}`,
      customer: req.user._id, restaurant: group.restaurant._id, items: group.items,
      deliveryAddress, subtotal, tax, deliveryFee, discount,
      totalAmount: Math.max(0, subtotal + tax + deliveryFee - discount), paymentMethod, paymentStatus: "pending", orderStatus: "placed"
    });
    created.push(order);
    await notify(group.restaurant.owner, "New order received", `New order ${order.orderNumber} has arrived.`, "order", { orderId: order._id });
    emit(req, `user:${group.restaurant.owner}`, "order:new", { orderId: order._id, orderNumber: order.orderNumber });
  }
  const total = created.reduce((s,o) => s + o.totalAmount, 0);
  if (coupon && created.some(o => o.discount > 0)) await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
  await Payment.create({ groupOrderId, customer: req.user._id, amount: total, method: paymentMethod, status: "pending" });
  cart.items = []; await cart.save();
  const paymentMessage = paymentMethod === "cod"
    ? "Orders placed. Pay cash on delivery."
    : `Demo order placed with ${paymentMethod === "upi" ? "UPI" : "net banking"} selected. Payment is pending; no money was collected.`;
  res.status(201).json({ groupOrderId, orders: created, totalAmount: total, paymentStatus: "pending", message: paymentMessage });
}));
router.get("/orders/my-orders", protect, allow("customer"), asyncHandler(async (req, res) => {
  res.json(await Order.find({ customer: req.user._id }).populate("restaurant", "name logo address").populate("delivery").sort({ createdAt: -1 }));
}));
router.get("/orders/:id", protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("restaurant", "name address").populate("customer", "name phone").populate({ path: "delivery", populate: { path: "deliveryPartner", select: "name phone profileImage" } });
  if (!order) return res.status(404).json({ message: "Order not found" });
  const permitted = req.user.role === "admin" || String(order.customer?._id || order.customer) === String(req.user._id) || (req.user.role === "restaurant_owner" && String(order.restaurant?.owner) === String(req.user._id));
  if (!permitted) return res.status(403).json({ message: "Forbidden" });
  const customerReview = req.user.role === "customer" ? await Review.findOne({ order: order._id, user: req.user._id }) : null;
  res.json({ ...order.toObject(), customerReview });
}));

router.get("/delivery/assignments", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  res.json(await Delivery.find({ $or: [{ deliveryPartner: req.user._id }, { deliveryPartner: null }] }).populate({ path: "order", populate: [{ path: "restaurant", select: "name address" }, { path: "customer", select: "name phone" }] }).sort({ createdAt: -1 }));
}));
router.get("/delivery/genie-requests", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  res.json(await PickupRequest.find({$or:[{deliveryPartner:req.user._id},{deliveryPartner:null}],status:{$in:["requested","accepted","picked_up","on_the_way"]}})
    .populate("user","name phone")
    .populate("deliveryPartner","name phone")
    .sort({createdAt:-1})
    .limit(100));
}));
router.patch("/delivery/genie-requests/:id/accept", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const driver=await User.findOneAndUpdate({_id:req.user._id,isAvailable:true},{isAvailable:false},{new:true});
  if(!driver) return res.status(409).json({message:"Go online before accepting a pickup request."});
  const request=await PickupRequest.findOneAndUpdate(
    {_id:req.params.id,status:"requested",deliveryPartner:null},
    {deliveryPartner:req.user._id,status:"accepted"},
    {new:true}
  ).populate("user","name phone").populate("deliveryPartner","name phone");
  if(!request){
    await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
    return res.status(409).json({message:"This pickup request is no longer available."});
  }
  await notify(request.user._id,"Pickup request accepted","A delivery partner accepted your pickup and drop request.","delivery",{requestId:request._id});
  res.json(request);
}));
router.patch("/delivery/genie-requests/:id/status", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const request=await PickupRequest.findOne({_id:req.params.id,deliveryPartner:req.user._id});
  if(!request) return res.status(404).json({message:"Pickup request not found."});
  const next=req.body.status;
  const transitions={accepted:"picked_up",picked_up:"on_the_way",on_the_way:"delivered"};
  if(transitions[request.status]!==next) return res.status(400).json({message:"Pickup requests must progress from accepted to picked up, on the way, and delivered."});
  request.status=next;
  await request.save();
  await notify(request.user,"Pickup delivery update",`Your pickup and drop request is ${next.replaceAll("_"," ")}.`,"delivery",{requestId:request._id});
  if(next==="delivered") await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
  res.json(request);
}));
router.post("/delivery/genie-location", protect, allow("delivery_partner"), asyncHandler(async(req,res)=>{
  const {requestId,longitude,latitude}=req.body;
  if(!mongoose.isValidObjectId(requestId)||!Number.isFinite(Number(longitude))||!Number.isFinite(Number(latitude))||Math.abs(Number(longitude))>180||Math.abs(Number(latitude))>90) return res.status(400).json({message:"Valid pickup request ID and GPS coordinates are required."});
  const request=await PickupRequest.findOne({_id:requestId,deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}});
  if(!request) return res.status(404).json({message:"Active pickup request not found."});
  request.currentLocation={type:"Point",coordinates:[Number(longitude),Number(latitude)]};
  await request.save();
  res.json({message:"Pickup delivery location updated."});
}));
router.get("/delivery/availability", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const activeDelivery = await Delivery.exists({
    deliveryPartner: req.user._id,
    status: { $in: ["accepted", "picked_up", "on_the_way"] }
  });
  const activePickup=await PickupRequest.exists({deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}});
  res.json({ isAvailable: req.user.isAvailable, hasActiveDelivery: Boolean(activeDelivery||activePickup) });
}));
router.patch("/delivery/availability", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  if (typeof req.body.isAvailable !== "boolean") return res.status(400).json({ message: "isAvailable must be true or false." });
  if (!req.body.isAvailable && (await Delivery.exists({
    deliveryPartner: req.user._id,
    status: { $in: ["accepted", "picked_up", "on_the_way"] }
  }) || await PickupRequest.exists({deliveryPartner:req.user._id,status:{$in:["accepted","picked_up","on_the_way"]}}))) return res.status(409).json({ message: "Complete your active delivery before going offline." });
  const user = await User.findByIdAndUpdate(req.user._id, { isAvailable: req.body.isAvailable }, { new: true }).select("isAvailable");
  res.json({ isAvailable: user.isAvailable });
}));
router.patch("/delivery/assignments/:id/accept", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const driver=await User.findOneAndUpdate({_id:req.user._id,isAvailable:true},{isAvailable:false},{new:true});
  if (!driver) return res.status(409).json({ message: "Go online before accepting a delivery." });
  const delivery = await Delivery.findOneAndUpdate({ _id: req.params.id, deliveryPartner: null }, { deliveryPartner: req.user._id, status: "accepted" }, { new: true });
  if (!delivery) {
    await User.findByIdAndUpdate(req.user._id,{isAvailable:true});
    return res.status(409).json({ message: "Assignment is no longer available" });
  }
  const order = await Order.findById(delivery.order).populate("restaurant", "owner name");
  if (order) {
    await notify(order.customer, "Delivery partner assigned", `A delivery partner accepted order ${order.orderNumber}. You can follow updates and shared GPS on the order tracking page.`, "delivery", { orderId: order._id });
    await notify(order.restaurant.owner, "Delivery partner assigned", `A delivery partner accepted order ${order.orderNumber}.`, "delivery", { orderId: order._id });
    emit(req, `user:${order.customer}`, "delivery:updated", { orderId: order._id, status: "accepted" });
  }
  res.json(delivery);
}));
router.patch("/delivery/assignments/:id/status", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const delivery = await Delivery.findOne({ _id: req.params.id, deliveryPartner: req.user._id });
  if (!delivery) return res.status(404).json({ message: "Delivery not found" });
  const transitions = { accepted: ["picked_up"], picked_up: ["on_the_way"], on_the_way: ["delivered"] };
  const next = req.body.status;
  if (!(transitions[delivery.status] || []).includes(next)) return res.status(400).json({ message: "Invalid delivery transition" });
  delivery.status = next;
  if (next === "delivered") delivery.actualDeliveryTime = new Date();
  await delivery.save();
  const order = await Order.findById(delivery.order);
  order.orderStatus = next; if (next === "delivered" && order.paymentMethod === "cod") order.paymentStatus = "paid";
  await order.save();
  if (next === "delivered") await User.findByIdAndUpdate(req.user._id, { isAvailable: true });
  await notify(order.customer, "Delivery update", `Your order is ${next.replace("_"," ")}.`, "delivery", { orderId: order._id });
  emit(req, `user:${order.customer}`, "delivery:updated", { orderId: order._id, status: next });
  res.json(delivery);
}));
router.post("/delivery/location", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const { deliveryId, longitude, latitude } = req.body;
  if (!deliveryId || !Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude)) || Math.abs(Number(longitude)) > 180 || Math.abs(Number(latitude)) > 90) return res.status(400).json({ message: "Valid delivery ID and GPS coordinates are required" });
  const delivery = await Delivery.findOne({ _id: deliveryId, deliveryPartner: req.user._id, status: { $in: ["accepted","picked_up","on_the_way"] } });
  if (!delivery) return res.status(404).json({ message: "Delivery not found" });
  delivery.currentLocation = { type: "Point", coordinates: [Number(longitude), Number(latitude)] };
  await delivery.save();
  const order = await Order.findById(delivery.order);
  emit(req, `user:${order.customer}`, "delivery:location", { orderId: order._id, coordinates: delivery.currentLocation.coordinates, updatedAt: new Date() });
  res.json({ message: "Location updated" });
}));
router.get("/delivery/earnings", protect, allow("delivery_partner"), asyncHandler(async (req, res) => {
  const deliveries = await Delivery.find({ deliveryPartner: req.user._id, status: "delivered" }).populate({ path: "order", populate: { path: "restaurant", select: "name" } }).sort({ actualDeliveryTime: -1 }).limit(200);
  res.json({ completed: deliveries.length, estimatedEarnings: deliveries.length * 35, deliveries });
}));

router.get("/reviews/featured", asyncHandler(async (_req, res) => {
  const reviews = await Review.find({ comment: { $regex: /\S/ } })
    .populate("user", "name profileImage")
    .populate("restaurant", "name")
    .sort({ createdAt: -1 })
    .limit(6);
  res.json(reviews);
}));
router.post("/reviews", protect, allow("customer"), asyncHandler(async (req, res) => {
  const { restaurantId, orderId, rating, comment } = req.body;
  if (!mongoose.isValidObjectId(restaurantId) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 || typeof comment !== "string" || comment.trim().length > 1000) return res.status(400).json({ message: "Choose a restaurant, a rating from 1 to 5, and a comment of up to 1,000 characters." });
  if (orderId) {
    const order = await Order.findOne({ _id: orderId, customer: req.user._id, orderStatus: "delivered", restaurant: restaurantId });
    if (!order) return res.status(403).json({ message: "Only completed orders can be reviewed for that restaurant." });
    if (await Review.exists({ order: order._id, user: req.user._id })) return res.status(409).json({ message: "You already reviewed this order." });
  }
  const review = await Review.create({ user: req.user._id, restaurant: restaurantId, order: orderId, rating: Number(rating), comment: comment.trim() });
  const stats = await Review.aggregate([{ $match: { restaurant: review.restaurant } }, { $group: { _id: "$restaurant", average: { $avg: "$rating" } } }]);
  if (stats[0]) await Restaurant.findByIdAndUpdate(restaurantId, { rating: Math.round(stats[0].average * 10) / 10 });
  res.status(201).json(review);
}));
router.get("/notifications", protect, asyncHandler(async (req, res) => res.json(await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50))));
router.patch("/notifications/:id/read", protect, asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { readAt: new Date() }, { new: true });
  if (!n) return res.status(404).json({ message: "Notification not found" });
  res.json(n);
}));
router.post("/support", protect, asyncHandler(async (req, res) => res.status(201).json(await SupportTicket.create({ user: req.user._id, subject: req.body.subject, message: req.body.message }))));


// Customer convenience features: saved places, favourites, reservations, offers and membership.
router.get("/addresses", protect, allow("customer"), asyncHandler(async (req,res) =>
  res.json(await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 }))
));
router.post("/addresses", protect, allow("customer"), asyncHandler(async (req,res) => {
  const { label="Home", name, phone, street, city, state, postalCode, isDefault=false } = req.body;
  if (!name || !phone || !street || !city) return res.status(400).json({message:"Name, phone, street and city are required"});
  if (isDefault) await Address.updateMany({user:req.user._id},{isDefault:false});
  res.status(201).json(await Address.create({user:req.user._id,label,name,phone,street,city,state,postalCode,isDefault}));
}));
router.patch("/addresses/:id", protect, allow("customer"), asyncHandler(async (req,res) => {
  const address=await Address.findOne({_id:req.params.id,user:req.user._id});
  if(!address) return res.status(404).json({message:"Address not found"});
  if(req.body.isDefault) await Address.updateMany({user:req.user._id},{isDefault:false});
  ["label","name","phone","street","city","state","postalCode","isDefault"].forEach(k=>{if(req.body[k]!==undefined)address[k]=req.body[k]});
  await address.save(); res.json(address);
}));
router.delete("/addresses/:id", protect, allow("customer"), asyncHandler(async(req,res)=>{
  await Address.deleteOne({_id:req.params.id,user:req.user._id}); res.json({message:"Address deleted"});
}));

router.get("/favorites", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await Favorite.find({user:req.user._id}).populate("restaurant").sort({createdAt:-1}))
));
router.post("/favorites/:restaurantId", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const restaurant=await Restaurant.findOne({_id:req.params.restaurantId,status:"approved"});
  if(!restaurant) return res.status(404).json({message:"Restaurant not found"});
  await Favorite.updateOne({user:req.user._id,restaurant:restaurant._id},{$setOnInsert:{user:req.user._id,restaurant:restaurant._id}},{upsert:true});
  res.json({message:"Saved to favourites"});
}));
router.delete("/favorites/:restaurantId", protect, allow("customer"), asyncHandler(async(req,res)=>{
  await Favorite.deleteOne({user:req.user._id,restaurant:req.params.restaurantId}); res.json({message:"Removed from favourites"});
}));

router.get("/reservations/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await Reservation.find({user:req.user._id}).populate("restaurant","name address coverImage").sort({date:1}))
));
router.post("/reservations", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const {restaurantId,date,time,guests=2,occasion="",notes=""}=req.body;
  const restaurant=await Restaurant.findOne({_id:restaurantId,status:"approved"});
  if(!restaurant) return res.status(404).json({message:"Restaurant not found"});
  const when=new Date(date);
  if(Number.isNaN(when.getTime()) || when < new Date(new Date().setHours(0,0,0,0))) return res.status(400).json({message:"Choose a future date"});
  const reservation=await Reservation.create({user:req.user._id,restaurant:restaurant._id,date:when,time,guests,occasion,notes});
  await notify(restaurant.owner,"New table reservation",`A table request for ${guests} guest(s) has been received.`,"reservation",{reservationId:reservation._id});
  res.status(201).json(reservation);
}));
router.patch("/reservations/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const row=await Reservation.findOneAndUpdate({_id:req.params.id,user:req.user._id,status:"requested"},{status:"cancelled"},{new:true});
  if(!row) return res.status(404).json({message:"Reservation cannot be cancelled"});
  res.json(row);
}));

router.get("/offers", asyncHandler(async(req,res)=>res.json(await Coupon.find({isActive:true,$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}).select("code discountType discountValue minOrder maxDiscount expiresAt").sort({createdAt:-1}))));
router.post("/coupons/validate", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const coupon=await Coupon.findOne({code:String(req.body.code||"").toUpperCase(),isActive:true});
  if(!coupon || (coupon.expiresAt && coupon.expiresAt<new Date())) return res.status(404).json({valid:false,message:"Coupon is invalid or expired"});
  const cart=await Cart.findOne({user:req.user._id}).populate("items.foodItem");
  const subtotal=(cart?.items||[]).reduce((sum,line)=>sum+(line.foodItem?.discountPrice??line.foodItem?.price??0)*line.quantity,0);
  if(subtotal<coupon.minOrder) return res.status(400).json({valid:false,message:`Minimum order is ₹${coupon.minOrder}`});
  const discount=Math.min(coupon.discountType==="percentage"?subtotal*coupon.discountValue/100:coupon.discountValue,coupon.maxDiscount||subtotal);
  res.json({valid:true,code:coupon.code,discount:Math.round(discount),message:`Coupon applied. You save ₹${Math.round(discount)}.`});
}));

router.get("/grocery/products", asyncHandler(async(req,res)=>{
  const query={isActive:true};
  if(req.query.search) query.name=new RegExp(String(req.query.search),"i");
  if(req.query.category) query.category=new RegExp(String(req.query.category),"i");
  res.json(await GroceryProduct.find(query).sort({category:1,name:1}).limit(150));
}));
router.post("/grocery/orders", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const {items=[],address,paymentMethod="cod"}=req.body;
  if(!Array.isArray(items) || !items.length || !address?.name || !address?.street || !address?.city || !address?.phone) return res.status(400).json({message:"Add products and a complete delivery address"});
  if(!["cod","upi","netbanking","razorpay"].includes(paymentMethod)) return res.status(400).json({message:"Unsupported payment method"});
  if(paymentMethod==="razorpay") return res.status(501).json({message:"Online payments require Razorpay configuration"});
  const requested=new Map();
  for(const line of items){
    const quantity=Number(line?.quantity);
    if(!mongoose.isValidObjectId(line?.product) || !Number.isInteger(quantity) || quantity<1 || quantity>20) return res.status(400).json({message:"Each item must have a valid product and a quantity from 1 to 20"});
    requested.set(String(line.product),(requested.get(String(line.product))||0)+quantity);
  }
  if([...requested.values()].some(quantity=>quantity>20)) return res.status(400).json({message:"You can order up to 20 of each product"});
  const products=await GroceryProduct.find({_id:{$in:[...requested.keys()]},isActive:true});
  if(products.length!==requested.size) return res.status(409).json({message:"A product is no longer available. Refresh your basket and try again."});
  const lines=products.map(product=>({product:product._id,name:product.name,quantity:requested.get(String(product._id)),price:product.price}));
  const subtotal=lines.reduce((sum,line)=>sum+line.price*line.quantity,0);
  const deliveryFee=subtotal>=299?0:25;
  const decremented=[];
  const restoreStock=async()=>{
    for(const entry of decremented) await GroceryProduct.updateOne({_id:entry.product},{$inc:{stock:entry.quantity}});
    decremented.length=0;
  };
  try{
    for(const line of lines){
      const updated=await GroceryProduct.findOneAndUpdate({_id:line.product,isActive:true,stock:{$gte:line.quantity}},{$inc:{stock:-line.quantity}},{new:true});
      if(!updated){
        await restoreStock();
        return res.status(409).json({message:`${line.name} is out of stock. Refresh your basket and try again.`});
      }
      decremented.push({product:line.product,quantity:line.quantity});
    }
    const order=await GroceryOrder.create({
      orderNumber:`GFG-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      user:req.user._id,items:lines,address,subtotal,deliveryFee,totalAmount:subtotal+deliveryFee,paymentMethod,paymentStatus:"pending"
    });
    res.status(201).json(order);
  }catch(error){
    await restoreStock();
    throw error;
  }
}));
router.get("/grocery/orders/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await GroceryOrder.find({user:req.user._id}).sort({createdAt:-1}))
));

router.get("/membership", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const membership=await Membership.findOne({user:req.user._id});
  res.json({membership,plans:[{id:"gofoode_plus",name:"GoFoode Plus",price:299,period:"3 months",benefits:["Free delivery on eligible orders","Exclusive member-only offers","Priority customer support","Special dining-out perks"]}]});
}));
router.post("/membership/subscribe", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const expiresAt=new Date(); expiresAt.setDate(expiresAt.getDate()+90);
  const membership=await Membership.findOneAndUpdate({user:req.user._id},{user:req.user._id,plan:"gofoode_plus",status:"active",startedAt:new Date(),expiresAt,amount:299},{upsert:true,new:true});
  res.status(201).json({membership,message:"GoFoode Plus demo membership activated. Configure a payment provider before collecting real payments."});
}));


router.get("/restaurant/reservations", protect, allow("restaurant_owner"), asyncHandler(async(req,res)=>{
  const owned=await Restaurant.find({owner:req.user._id}).select("_id");
  res.json(await Reservation.find({restaurant:{$in:owned.map(x=>x._id)}}).populate("restaurant","name").populate("user","name phone").sort({date:1}));
}));
router.patch("/restaurant/reservations/:id", protect, allow("restaurant_owner"), asyncHandler(async(req,res)=>{
  const row=await Reservation.findById(req.params.id).populate("restaurant");
  if(!row || String(row.restaurant.owner)!==String(req.user._id)) return res.status(404).json({message:"Reservation not found"});
  if(!["confirmed","cancelled","completed"].includes(req.body.status)) return res.status(400).json({message:"Invalid reservation status"});
  row.status=req.body.status; await row.save();
  await notify(row.user,"Reservation update",`Your table reservation is ${row.status}.`,"reservation",{reservationId:row._id});
  res.json(row);
}));
router.get("/admin/grocery-orders", protect, allow("admin"), asyncHandler(async(req,res)=>
  res.json(await GroceryOrder.find().populate("user","name phone email").sort({createdAt:-1}).limit(300))
));
router.get("/admin/reservations", protect, allow("admin"), asyncHandler(async(req,res)=>
  res.json(await Reservation.find().populate("user","name phone").populate("restaurant","name").sort({date:-1}).limit(300))
));

router.post("/genie/requests", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const {pickup,drop,itemDescription,instructions=""}=req.body;
  if(!pickup?.name||!pickup?.phone||!pickup?.address||!drop?.name||!drop?.phone||!drop?.address||!itemDescription) return res.status(400).json({message:"Complete pickup, drop and item details"});
  const request=await PickupRequest.create({user:req.user._id,pickup,drop,itemDescription,instructions,fee:49});
  res.status(201).json(request);
}));
router.get("/genie/requests/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await PickupRequest.find({user:req.user._id}).populate("deliveryPartner","name phone").sort({createdAt:-1}))
));
router.patch("/genie/requests/:id/cancel", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const request=await PickupRequest.findOneAndUpdate({_id:req.params.id,user:req.user._id,status:"requested"},{status:"cancelled"},{new:true});
  if(!request) return res.status(409).json({message:"Only unassigned pickup requests can be cancelled."});
  res.json(request);
}));
router.get("/experiences", asyncHandler(async(req,res)=>
  res.json(await Experience.find({isActive:true}).sort({date:1}))
));
router.post("/experiences/:id/book", protect, allow("customer"), asyncHandler(async(req,res)=>{
  const experience=await Experience.findOne({_id:req.params.id,isActive:true});
  const tickets=Math.max(1,Math.min(10,Number(req.body.tickets)||1));
  if(!experience) return res.status(404).json({message:"Experience not found"});
  const booked=await ExperienceBooking.aggregate([{$match:{experience:experience._id,status:"confirmed"}},{$group:{_id:null,total:{$sum:"$tickets"}}}]);
  if((booked[0]?.total||0)+tickets>experience.capacity) return res.status(409).json({message:"Not enough tickets remaining"});
  const booking=await ExperienceBooking.create({user:req.user._id,experience:experience._id,tickets,amount:tickets*experience.price});
  res.status(201).json(booking);
}));
router.get("/experiences/bookings/mine", protect, allow("customer"), asyncHandler(async(req,res)=>
  res.json(await ExperienceBooking.find({user:req.user._id}).populate("experience").sort({createdAt:-1}))
));
router.get("/admin/dashboard", protect, allow("admin"), asyncHandler(async (req, res) => {
  const [users, restaurants, orders, revenue] = await Promise.all([
    User.countDocuments(), Restaurant.countDocuments(), Order.countDocuments(),
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }])
  ]);
  const byStatus = await Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]);
  res.json({ users, restaurants, orders, revenue: revenue[0]?.total || 0, byStatus });
}));
router.get("/admin/audit-logs", protect, allow("admin"), asyncHandler(async (req, res) => {
  res.json(await AuditLog.find()
    .populate("actor", "name email role")
    .sort({ createdAt: -1 })
    .limit(200));
}));
router.get("/admin/users", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await User.find().sort({ createdAt: -1 }).limit(200))));
router.patch("/admin/users/:id/status", protect, allow("admin"), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: Boolean(req.body.isActive) }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(safeUser(user));
}));
router.get("/admin/restaurants", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Restaurant.find().populate("owner", "name email").sort({ createdAt: -1 }))));
router.patch("/admin/restaurants/:id/status", protect, allow("admin"), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!["approved","rejected","suspended","pending"].includes(status)) return res.status(400).json({ message: "Invalid status" });
  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  await notify(restaurant.owner, "Restaurant application update", `Your restaurant is ${status}.`, "system");
  await AuditLog.create({ actor: req.user._id, action: `restaurant.${status}`, entityType: "Restaurant", entityId: restaurant._id });
  res.json(restaurant);
}));
router.get("/admin/orders", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Order.find().populate("customer", "name email").populate("restaurant", "name").sort({ createdAt: -1 }).limit(300))));
router.get("/admin/transactions", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Payment.find().populate("customer", "name email").sort({ createdAt: -1 }).limit(300))));
router.post("/admin/coupons", protect, allow("admin"), asyncHandler(async (req, res) => {
  const coupon = await Coupon.create({ code: req.body.code?.toUpperCase(), discountType: req.body.discountType, discountValue: req.body.discountValue, minOrder: req.body.minOrder || 0, maxDiscount: req.body.maxDiscount, expiresAt: req.body.expiresAt });
  res.status(201).json(coupon);
}));
router.get("/admin/coupons", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Coupon.find().sort({ createdAt: -1 }))));
router.get("/admin/reviews", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await Review.find().populate("user", "name").populate("restaurant", "name").sort({ createdAt: -1 }))));
router.get("/admin/support", protect, allow("admin"), asyncHandler(async (req, res) => res.json(await SupportTicket.find().populate("user", "name email").sort({ createdAt: -1 }))));
router.patch("/admin/support/:id", protect, allow("admin"), asyncHandler(async (req, res) => {
  if (!["open", "in_progress", "resolved"].includes(req.body.status)) return res.status(400).json({ message: "Invalid support ticket status." });
  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!ticket) return res.status(404).json({ message: "Support ticket not found." });
  await AuditLog.create({ actor: req.user._id, action: `support.${ticket.status}`, entityType: "SupportTicket", entityId: ticket._id });
  res.json(ticket);
}));

export default router;
