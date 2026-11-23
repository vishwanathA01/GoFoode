// Serverless entry (Vercel): the same Express app as `npm start`, with one MongoDB connection reused across
// invocations of a warm function. Socket.IO and the background payment sweep need a long-running server,
// so they don't run here: the website falls back to polling, and overdue payments expire when they're read.
import "./vercelEnv.js";
import mongoose from "mongoose";
import app from "./app.js";
import { config } from "./config.js";

let connecting = null;
async function connect() {
  if (mongoose.connection.readyState === 1) return;
  connecting ||= mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
    .catch(error => { connecting = null; throw error; });
  await connecting;
}

export default async function handler(req, res) {
  try {
    await connect();
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "The database isn't reachable right now. Please try again in a moment." }));
    return;
  }
  return app(req, res);
}
