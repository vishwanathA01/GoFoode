import jwt from "jsonwebtoken";
import { User } from "./models.js";
import { config } from "./config.js";

export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, config.accessSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ message: "Account unavailable" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired access token" });
  }
};

export const allow = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "Insufficient permissions" });
  next();
};

export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
