import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser always talks to its own origin (/api), and Vite forwards to the API. This avoids CORS
// problems and keeps the app working when opened from a phone via the Network URL.
// `npm run dev` from the project root sets GOFOODE_API_PORT to whichever port the API actually got.
const apiTarget = process.env.GOFOODE_API_URL || `http://127.0.0.1:${process.env.GOFOODE_API_PORT || 5001}`;
const proxy = {
  "/api": { target: apiTarget, changeOrigin: true },
  "/socket.io": { target: apiTarget, changeOrigin: true, ws: true }
};

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", proxy },
  preview: { host: "0.0.0.0", proxy }
});
