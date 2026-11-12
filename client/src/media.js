// Real photography used across the site. Every remote photo is from Unsplash (free under the Unsplash License).
const unsplash = (id, width = 900) => `https://images.unsplash.com/photo-${id}?w=${width}&q=75&auto=format&fit=crop`;

export const photos = {
  doorstep: "/images/delivery-doorstep.jpg",
  scooter: "/images/delivery-scooter.jpg",
  dining: unsplash("1414235077428-338989a2e8c0", 1600),
  gathering: unsplash("1511795409834-ef04bbd61622", 1600),
  feast: unsplash("1504674900247-0877df9cc836", 1400),
  spread: unsplash("1555939594-58d7cb561ad1", 1400)
};

// A restaurant without its own cover photo gets a real photo of what it cooks, never an illustration.
const cuisinePhotos = [
  [/burger|fast ?food|american/i, "1550547660-d9450f859349"],
  [/pizza|italian/i, "1579751626657-72bc17010498"],
  [/indian|biryani|mughlai|punjabi|thali|tandoor/i, "1773419808002-bab9e1f840a0"],
  [/chinese|asian|noodle|momo|thai|wok/i, "1563245372-f21724e3856d"],
  [/healthy|salad|bowl|vegan/i, "1512621776951-a57141f2eefd"],
  [/dessert|bakery|cake|sweet|ice ?cream/i, "1578985545062-69928b1d9587"],
  [/drink|cafe|coffee|beverage|juice|shake/i, "1497534446932-c925b458314e"],
  [/street|chaat|snack/i, "1732519970445-8f2d6998961f"]
];
export function cuisinePhoto(cuisine, width = 900) {
  const text = [].concat(cuisine || []).join(" ");
  const match = cuisinePhotos.find(([pattern]) => pattern.test(text));
  return unsplash(match ? match[1] : "1504674900247-0877df9cc836", width);
}
export const restaurantCover = (restaurant, width) => restaurant?.coverImage || cuisinePhoto(restaurant?.cuisine, width);

// Warm, readable initials for people without a profile photo.
const avatarTones = [["#fff1e4", "#c2410c"], ["#e8f6ee", "#15803d"], ["#eaf2ff", "#1d4ed8"], ["#f6ecff", "#7e22ce"], ["#fff6d8", "#a16207"], ["#ffe9ee", "#be123c"]];
export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "G") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
export function avatarTone(name = "") {
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarTones[hash % avatarTones.length];
}
