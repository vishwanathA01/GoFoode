import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import { config, isAllowedClientOrigin } from "./config.js";
import jwt from "jsonwebtoken";
import { User } from "./models.js";
import { startPaymentMaintenance } from "./payments.js";

const redactedMongoUri = config.mongoUri.replace(/\/\/[^@/]*@/, "//<credentials>@");
try {
  // Fail fast with a useful message instead of hanging for 30 seconds when MongoDB isn't running.
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 6000 });
} catch (error) {
  console.error(`\n✗ Could not connect to MongoDB at ${redactedMongoUri}\n  ${error.message}\n`);
  console.error("  Start MongoDB and try again:");
  console.error("    macOS (Homebrew):  brew services start mongodb-community");
  console.error("    Docker:            docker run -d -p 27017:27017 --name gofoode-mongo mongo:7");
  console.error("  Or set MONGODB_URI in server/.env to a MongoDB Atlas connection string.\n");
  process.exit(1);
}
console.log("MongoDB connected");
let shuttingDown = false;
mongoose.connection.on("disconnected", () => { if (!shuttingDown) console.warn("MongoDB disconnected; requests will fail until it reconnects."); });
mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedClientOrigin(origin)),
    credentials: true
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const payload = jwt.verify(token, config.accessSecret);
    const user = await User.findById(payload.sub).select("_id role isActive");
    if (!user || !user.isActive) return next(new Error("Unauthorized"));
    socket.user = user;
    next();
  } catch { next(new Error("Invalid socket token")); }
});
io.on("connection", socket => {
  socket.join(`user:${socket.user._id}`);
  socket.join(`role:${socket.user.role}`);
});
app.set("io", io);
startPaymentMaintenance(app);
const gatewayMode = config.payments.gateway === "razorpay" ? "Razorpay" : config.payments.gateway === "mock" ? "built-in test gateway (no real money)" : "disabled (cash on delivery only)";
console.log(`Online payments: ${gatewayMode}`);
if (config.payments.gateway === "razorpay" && !config.payments.razorpayWebhookSecret) console.warn("RAZORPAY_WEBHOOK_SECRET is not set: payments still settle through browser confirmation and reconciliation, but webhooks are disabled.");

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n✗ Port ${config.port} is already in use, probably by another copy of this API or another project.`);
    console.error(`  Find it with:  lsof -iTCP:${config.port} -sTCP:LISTEN`);
    console.error("  Then stop it, or set PORT in server/.env (or run `npm run dev` from the project root, which picks a free port).\n");
  } else {
    console.error("✗ The API server failed to start:", error.message);
  }
  process.exit(1);
});
server.listen(config.port, () => console.log(`GoFoode API listening on http://localhost:${config.port}`));

// Release the port and the database cleanly so nodemon restarts don't trip over the old process.
const shutdown = signal => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down…`);
  io.close();
  server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 4000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", reason => console.error("Unhandled promise rejection:", reason));
