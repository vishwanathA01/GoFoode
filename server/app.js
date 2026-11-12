import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import routes from "./routes.js";
import jwt from "jsonwebtoken";
import { config, isAllowedClientOrigin } from "./config.js";

// Payment limits apply per signed-in customer, so people sharing an IP (offices, mobile carriers) don't
// exhaust each other's allowance, and signing in again doesn't reset it.
const paymentRateKey = req => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try { return `user:${jwt.verify(header.slice(7), config.accessSecret).sub}`; } catch { /* fall back to IP */ }
  }
  return `ip:${req.ip}`;
};

const app = express();
app.set("trust proxy", 1);
// Strict security headers for the JSON API. The website itself is served below with a CSP-free variant,
// because it loads fonts, food photos, maps and the Razorpay checkout from other origins.
app.use("/api", helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedClientOrigin(origin)),
  credentials: true
}));
app.use(express.json({
  limit: "1mb",
  // Webhook signatures are computed over the exact bytes received, so keep them for that route.
  verify: (req, _res, buffer) => { if (req.originalUrl.startsWith("/api/v1/payments/webhooks/")) req.rawBody = buffer; }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === "/v1/health" || req.path.startsWith("/v1/auth") || req.path.startsWith("/v1/payments/webhooks/")
}));
app.use("/api/v1/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
}));
app.use("/api/v1/payments", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path.startsWith("/webhooks/"),
  keyGenerator: paymentRateKey,
  message: { code: "RATE_LIMITED", message: "Too many payment requests. Please wait a few minutes and try again." }
}));
app.use("/api/v1/chatbot", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
}));
app.get("/api/v1/health", (_req, res) => res.json({ success: true, service: "GoFoode API", timestamp: new Date().toISOString() }));
app.use("/api/v1", routes);
app.use("/api", (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));

// After `npm run build`, the API also serves the website, so one `npm start` runs everything on one port.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.static(clientDist, {
    index: false,
    setHeaders: (res, file) => {
      if (/[/\\]assets[/\\]/.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "no-cache");
    }
  }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(clientDist, "index.html")); });
}
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: "A record with this value already exists" });
  const body = { message: err.expose || status < 500 || process.env.NODE_ENV !== "production" ? err.message : "Internal server error" };
  // Machine-readable codes let the client decide whether a retry is safe.
  if (typeof err.code === "string") body.code = err.code;
  if (err.retryable) body.retryable = true;
  if (err.details) Object.assign(body, err.details);
  res.status(status).json(body);
});
export default app;
