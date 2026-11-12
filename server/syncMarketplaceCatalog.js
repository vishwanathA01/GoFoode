import mongoose from "mongoose";
import { config } from "./config.js";
import { User, Restaurant, FoodItem, Experience } from "./models.js";

const catalog = [
  {
    name: "Wok & Bowl Express",
    description: "Chinese comfort food, tossed fresh to order with bold sauces and plenty of crunch.",
    cuisine: ["Chinese", "Asian", "Noodles"],
    coverImage: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&q=75&auto=format&fit=crop",
    deliveryTime: 30,
    rating: 4.6,
    items: [
      { name: "Veg Hakka Noodles", description: "Wok-tossed noodles with crisp vegetables, spring onion and a savoury soy-garlic sauce.", price: 179, foodType: "veg", calories: 420, spiceLevel: "Medium", ingredients: ["Noodles", "Cabbage", "Carrot", "Spring onion", "Soy"], allergens: ["Gluten", "Soy"], portionSize: "Serves 1", preparationTime: 16, isBestseller: true, image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=700" },
      { name: "Chicken Schezwan Fried Rice", description: "Fluffy rice with chicken, vegetables and a lively Schezwan chilli finish.", price: 229, foodType: "non-veg", calories: 510, spiceLevel: "Hot", ingredients: ["Rice", "Chicken", "Bell pepper", "Schezwan sauce"], allergens: ["Soy"], portionSize: "Serves 1", preparationTime: 18, image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=700" },
      { name: "Crispy Chilli Paneer", description: "Golden paneer, peppers and onions coated in a sweet, spicy Indo-Chinese glaze.", price: 219, foodType: "veg", calories: 440, spiceLevel: "Hot", ingredients: ["Paneer", "Bell pepper", "Onion", "Chilli sauce"], allergens: ["Milk", "Soy"], portionSize: "Serves 1", preparationTime: 18, isBestseller: true, image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=700" },
      { name: "Veg Manchurian", description: "Vegetable dumplings tossed in a savoury garlic and spring-onion sauce.", price: 189, foodType: "veg", calories: 390, spiceLevel: "Medium", ingredients: ["Cabbage", "Carrot", "Garlic", "Soy sauce"], allergens: ["Gluten", "Soy"], portionSize: "8 pieces", preparationTime: 20, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=700" },
      { name: "Chicken Hakka Noodles", description: "Street-style noodles with chicken, crunchy vegetables and a smoky wok finish.", price: 239, foodType: "non-veg", calories: 520, spiceLevel: "Medium", ingredients: ["Noodles", "Chicken", "Cabbage", "Carrot", "Soy"], allergens: ["Gluten", "Soy"], portionSize: "Serves 1", preparationTime: 18, image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=700" }
    ]
  },
  {
    name: "Chill & Sip Cafe",
    description: "Chilled drinks, fruity refreshers and cafe favourites for a little pick-me-up.",
    cuisine: ["Cold Drinks", "Cafe", "Beverages"],
    coverImage: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=900",
    deliveryTime: 20,
    rating: 4.5,
    items: [
      { name: "Fresh Lime Soda", description: "A bright, fizzy lime refresher. Choose sweet or salted.", price: 79, foodType: "vegan", calories: 95, portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=700" },
      { name: "Mango Smoothie", description: "A cool mango blend with creamy yoghurt and a touch of honey.", price: 149, foodType: "veg", calories: 230, ingredients: ["Mango", "Yoghurt", "Honey"], allergens: ["Milk"], portionSize: "300 ml", preparationTime: 6, isBestseller: true, image: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=700" },
      { name: "Cold Coffee", description: "Chilled coffee blended smooth with milk and a light cocoa finish.", price: 139, foodType: "veg", calories: 210, ingredients: ["Coffee", "Milk", "Cocoa"], allergens: ["Milk"], portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=700" },
      { name: "Watermelon Mint Cooler", description: "Fresh watermelon and mint over ice for an easy summer sip.", price: 119, foodType: "vegan", calories: 105, ingredients: ["Watermelon", "Mint", "Lime"], portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?w=700" },
      { name: "Chocolate Thick Shake", description: "A rich chocolate shake blended cold and topped with cocoa.", price: 169, foodType: "veg", calories: 330, ingredients: ["Milk", "Chocolate", "Cocoa"], allergens: ["Milk"], portionSize: "300 ml", preparationTime: 6, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=700" }
    ]
  }
];
const events = [
  {
    title: "Faridabad Street Food Walk",
    description: "Join a small-group tasting walk through local favourites, with a host sharing the stories and flavours behind each stop.",
    venue: "Sector 15 Market",
    city: "Faridabad",
    daysFromNow: 8,
    time: "5:30 PM",
    price: 349,
    capacity: 24,
    category: "Food walk",
    duration: "2 hours",
    highlights: ["Pani puri to jalebi", "Small group of 24", "Stories from stall owners"],
    image: "https://images.unsplash.com/photo-1760263051323-fcd7da7040b0?w=900&q=75&auto=format&fit=crop"
  },
  {
    title: "Sunday Garden Brunch",
    description: "Ease into the weekend with a relaxed brunch table, seasonal plates and live acoustic music.",
    venue: "The Garden Table",
    city: "Faridabad",
    daysFromNow: 12,
    time: "11:00 AM",
    price: 499,
    capacity: 36,
    category: "Brunch",
    duration: "2.5 hours",
    highlights: ["Outdoor garden seating", "Seasonal sharing plates", "Live music"],
    image: "https://images.unsplash.com/photo-1530062845289-9109b2c9c868?w=900&q=75&auto=format&fit=crop"
  },
  {
    title: "Noodles & Dumplings Workshop",
    description: "Learn a few hands-on kitchen techniques, make dumplings together and finish with a shared Chinese-style meal.",
    venue: "Wok & Bowl Express",
    city: "Faridabad",
    daysFromNow: 18,
    time: "4:00 PM",
    price: 599,
    capacity: 18,
    category: "Workshop",
    duration: "2 hours",
    highlights: ["Fold your own dumplings", "Chef-led session", "Meal included"],
    image: "https://images.unsplash.com/photo-1570604127008-f644337cfb8b?w=900&q=75&auto=format&fit=crop"
  }
];
// Seed events that predate categories and real photos get refreshed too. Only these fields change.
const seedEventDetails = {
  "Sunday Brunch Social": { category: "Brunch", duration: "2.5 hours", highlights: ["Live acoustic set", "Welcome mocktail", "Shared tasting menu"], image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=900&q=75&auto=format&fit=crop" },
  "Pizza & Paint Night": { category: "Workshop", duration: "3 hours", highlights: ["All art supplies included", "3 pizza tasters", "Take your canvas home"], description: "Paint your own mini canvas with a local artist while a pizza tasting menu comes out of the oven.", image: "https://images.unsplash.com/photo-1757085242652-f8cd4d3de889?w=900&q=75&auto=format&fit=crop" },
  "Street Food Trail": { category: "Food walk", duration: "2 hours", highlights: ["6 tasting stops", "Local host", "Vegetarian friendly"], description: "Samosas, chaat and kulhad chai: a hosted tasting walk through the city's best-loved street stalls.", image: "https://images.unsplash.com/photo-1732519970445-8f2d6998961f?w=900&q=75&auto=format&fit=crop" }
};
// Demo restaurants that lost their cover photo get a real one back. Covers an owner uploaded are never touched.
const demoCovers = {
  "GoFoode Demo Burger House": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=900&q=75&auto=format&fit=crop",
  "GoFoode Demo Spice Kitchen": "https://images.unsplash.com/photo-1773419808002-bab9e1f840a0?w=900&q=75&auto=format&fit=crop"
};

await mongoose.connect(config.mongoUri);
try {
  const owner = await User.findOne({ email: "owner@gofoode.demo", role: "restaurant_owner" });
  if (!owner) throw new Error("Demo restaurant owner not found. Create an owner account before syncing the demo marketplace catalog.");

  let restaurantCount = 0;
  let itemCount = 0;
  for (const entry of catalog) {
    let restaurant = await Restaurant.findOne({ owner: owner._id, name: entry.name });
    if (!restaurant) {
      restaurant = await Restaurant.create({
        owner: owner._id,
        name: entry.name,
        description: entry.description,
        cuisine: entry.cuisine,
        coverImage: entry.coverImage,
        deliveryTime: entry.deliveryTime,
        rating: entry.rating,
        address: { city: "Faridabad", state: "Haryana" },
        status: "approved",
        isOpen: true
      });
      restaurantCount += 1;
    }

    for (const item of entry.items) {
      if (await FoodItem.exists({ restaurant: restaurant._id, name: item.name })) continue;
      await FoodItem.create({ ...item, restaurant: restaurant._id, isAvailable: true });
      itemCount += 1;
    }
  }
  // An event called "Sunday …" should actually fall on a Sunday.
  const onSundayIfNamed = (title, date) => {
    if (!/^sunday\b/i.test(title)) return date;
    const moved = new Date(date);
    moved.setDate(moved.getDate() + ((7 - moved.getDay()) % 7));
    return moved;
  };
  for (const event of events) {
    const { daysFromNow, ...details } = event;
    await Experience.updateOne(
      { title: event.title },
      { $set: { ...details, date: onSundayIfNamed(event.title, new Date(Date.now() + daysFromNow * 86400000)), isActive: true } },
      { upsert: true }
    );
  }
  for (const [title, details] of Object.entries(seedEventDetails)) {
    const existing = await Experience.findOne({ title });
    if (existing) await Experience.updateOne({ _id: existing._id }, { $set: { ...details, ...(existing.date ? { date: onSundayIfNamed(title, existing.date) } : {}) } });
  }
  let coversFixed = 0;
  for (const [name, coverImage] of Object.entries(demoCovers)) {
    const result = await Restaurant.updateMany({ owner: owner._id, name, $or: [{ coverImage: null }, { coverImage: "" }, { coverImage: { $exists: false } }] }, { $set: { coverImage } });
    coversFixed += result.modifiedCount;
  }
  // Wok & Bowl Express first shipped with the same dumpling photo as GoFoode Demo Wok & Bowl. Give it its own, unless the owner changed it.
  const wok = await Restaurant.updateOne({ owner: owner._id, name: "Wok & Bowl Express", coverImage: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900" }, { $set: { coverImage: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&q=75&auto=format&fit=crop" } });
  coversFixed += wok.modifiedCount;
  if (coversFixed) console.log(`Restored or de-duplicated ${coversFixed} restaurant cover photo(s).`);
  console.log(`Marketplace catalog synced: ${restaurantCount} restaurants, ${itemCount} menu items and ${events.length} upcoming events added or refreshed.`);
} finally {
  await mongoose.disconnect();
}
