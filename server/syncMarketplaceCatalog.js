import mongoose from "mongoose";
import { config } from "./config.js";
import { User, Restaurant, FoodItem, Experience } from "./models.js";

const catalog = [
  {
    name: "Wok & Bowl Express",
    description: "Chinese comfort food, tossed fresh to order with bold sauces and plenty of crunch.",
    cuisine: ["Chinese", "Asian", "Noodles"],
    coverImage: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900",
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
    coverImage: "https://images.unsplash.com/photo-1513558161293-cdaf765edfd7?w=900",
    deliveryTime: 20,
    rating: 4.5,
    items: [
      { name: "Fresh Lime Soda", description: "A bright, fizzy lime refresher. Choose sweet or salted.", price: 79, foodType: "vegan", calories: 95, portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1513558161293-cdaf765edfd7?w=700" },
      { name: "Mango Smoothie", description: "A cool mango blend with creamy yoghurt and a touch of honey.", price: 149, foodType: "veg", calories: 230, ingredients: ["Mango", "Yoghurt", "Honey"], allergens: ["Milk"], portionSize: "300 ml", preparationTime: 6, isBestseller: true, image: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=700" },
      { name: "Cold Coffee", description: "Chilled coffee blended smooth with milk and a light cocoa finish.", price: 139, foodType: "veg", calories: 210, ingredients: ["Coffee", "Milk", "Cocoa"], allergens: ["Milk"], portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=700" },
      { name: "Watermelon Mint Cooler", description: "Fresh watermelon and mint over ice for an easy summer sip.", price: 119, foodType: "vegan", calories: 105, ingredients: ["Watermelon", "Mint", "Lime"], portionSize: "300 ml", preparationTime: 5, image: "https://images.unsplash.com/photo-1513558161293-cdaf765edfd7?w=700" },
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
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=900"
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
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=900"
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
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900"
  }
];

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
  for (const event of events) {
    const { daysFromNow, ...details } = event;
    await Experience.updateOne(
      { title: event.title },
      { $set: { ...details, date: new Date(Date.now() + daysFromNow * 86400000), isActive: true } },
      { upsert: true }
    );
  }
  console.log(`Marketplace catalog synced: ${restaurantCount} restaurants, ${itemCount} menu items and ${events.length} upcoming events added or refreshed.`);
} finally {
  await mongoose.disconnect();
}
