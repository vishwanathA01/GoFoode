import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import { config } from "./config.js";
import jwt from "jsonwebtoken";
import { User } from "./models.js";

await mongoose.connect(config.mongoUri);
console.log("MongoDB connected");
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.clientUrl, credentials: true } });

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

server.listen(config.port, () => console.log(`DineFlow API listening on ${config.port}`));
