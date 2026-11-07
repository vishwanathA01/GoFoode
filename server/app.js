import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import routes from "./routes.js";
import { isAllowedClientOrigin } from "./config.js";

const app = express();
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedClientOrigin(origin)),
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === "/v1/health" || req.path.startsWith("/v1/auth")
}));
app.use("/api/v1/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
}));
app.use("/api/v1/chatbot", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
}));
app.get("/api/v1/health", (_req, res) => res.json({ success: true, service: "DineFlow API", timestamp: new Date().toISOString() }));
app.use("/api/v1", routes);
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use((err, req, res, _next) => {
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: "A record with this value already exists" });
  res.status(err.status || 500).json({ message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
});
export default app;
