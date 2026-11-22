// Public identity of the demo restaurants: brand name, street address, map position and photos.
// `npm run seed` creates them from here, and `npm run sync-marketplace` brings existing databases in line
// (renaming the older "GoFoode Demo …" placeholders) without touching orders, menus or owner uploads.
const photo = (id, width = 900) => `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;

// location is [latitude, longitude]. All demo kitchens are in Faridabad, within about 4 km of each other.
export const demoRestaurants = [
  { legacyName: "GoFoode Demo Burger House", name: "Smash & Co. Burgers", description: "Smash burgers, loaded fries and thick shakes, cooked to order.", street: "SCF 21, Sector 15 Market", postalCode: "121007", location: [28.3962, 77.3166], coverImage: photo("1550547660-d9450f859349") },
  { legacyName: "GoFoode Demo Spice Kitchen", name: "Spice Route Kitchen", description: "North Indian curries, biryani and tandoor favourites, slow-cooked every morning.", street: "Shop 4, Sector 16 Market", postalCode: "121002", location: [28.4103, 77.3172], coverImage: photo("1773419808002-bab9e1f840a0") },
  { legacyName: "GoFoode Demo Pizza Oven", name: "Stone Oven Pizzeria", description: "Hand-stretched pizzas baked in a stone oven, with fresh, generous toppings.", street: "Main Market, Sector 21C", postalCode: "121001", location: [28.4232, 77.3071], coverImage: photo("1579751626657-72bc17010498") },
  { legacyName: "GoFoode Demo Wok & Bowl", name: "Lotus Wok House", description: "Momos, wok-tossed noodles and Indo-Chinese classics.", street: "1A Market, NIT", postalCode: "121001", location: [28.3929, 77.2979], coverImage: photo("1563245372-f21724e3856d") },
  { legacyName: "GoFoode Demo Green Bowl", name: "The Green Bowl Co.", description: "Grain bowls, salads and cold-pressed juices made with fresh produce.", street: "Sector 14 Market", postalCode: "121007", location: [28.4011, 77.3249], coverImage: photo("1512621776951-a57141f2eefd") },
  { legacyName: "GoFoode Demo Sweet Studio", name: "Sugar & Crumb Bakery", description: "Small-batch cakes, brownies and cheesecakes, baked fresh every day.", street: "Sector 11 Main Road", postalCode: "121006", location: [28.3874, 77.3226], coverImage: photo("1578985545062-69928b1d9587") },
  { name: "Wok & Bowl Express", street: "Sector 17 Market", postalCode: "121002", location: [28.4139, 77.3262] },
  { name: "Chill & Sip Cafe", street: "Near Town Park, Sector 12", postalCode: "121007", location: [28.3846, 77.3093] }
];
export const demoRestaurantNames = demoRestaurants.flatMap(entry => [entry.name, entry.legacyName].filter(Boolean));
export const demoAddress = entry => ({
  street: entry.street, city: "Faridabad", state: "Haryana", postalCode: entry.postalCode,
  location: { type: "Point", coordinates: [entry.location[1], entry.location[0]] }
});

// Menu photos that had stopped loading or showed a different dish. Applied by dish name, and only while
// the dish still has one of the old photos, so a photo an owner uploaded is never replaced.
export const dishPhotoFixes = [
  { dish: "Smoky BBQ Chicken Burger", from: /1553979459-d2229ba7433a/, image: photo("1571091718767-18b5b1457add", 700) },
  { dish: "Chicken Dum Biryani", from: /1563379091339-03246963d51a/, image: photo("1563379091339-03b21ab4a4f8", 700) },
  { dish: "Chilli Garlic Noodles", from: /1569718212165-3a8278d5f624/, image: photo("1612929633738-8fe44f7ec841", 700) },
  { dish: "Veg Hakka Noodles", from: /1569718212165-3a8278d5f624/, image: photo("1674516584901-e6d78a62f0df", 700) },
  { dish: "Chicken Hakka Noodles", from: /1612929633738-8fe44f7ec841/, image: photo("1569718212165-3a8278d5f624", 700) },
  { dish: "Veg Manchurian", from: /1603894584373-5ac82b2ae398/, image: photo("1525755662778-989d0524087e", 700) },
  { dish: "Mediterranean Falafel Bowl", from: /1512621776951-a57141f2eefd/, image: photo("1546069901-ba9599a7e63c", 700) }
];
export const fixedDishPhoto = (name, image) => dishPhotoFixes.find(fix => fix.dish === name && fix.from.test(image || ""))?.image || image;
