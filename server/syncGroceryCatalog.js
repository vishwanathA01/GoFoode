import mongoose from "mongoose";
import { config } from "./config.js";
import { GroceryProduct } from "./models.js";
import { groceryProducts } from "./groceryProducts.js";

await mongoose.connect(config.mongoUri);
try {
  const result = await GroceryProduct.bulkWrite(groceryProducts.map(product => ({
    updateOne: {
      filter: { name: product.name },
      update: { $set: { ...product, isActive: true }, $setOnInsert: { stock: 100 } },
      upsert: true
    }
  })), { ordered: false });
  console.log(`Grocery catalog synced: ${result.upsertedCount} added, ${result.modifiedCount} updated. Existing stock levels were preserved.`);
} finally {
  await mongoose.disconnect();
}
