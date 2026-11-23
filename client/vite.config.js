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

// GoFoode uses its own port. Vite's default 5173 is shared by other local projects, and on macOS two
// servers can both hold 5173 (one on 127.0.0.1, one on all addresses), so "localhost:5173" may open the wrong site.
const webPort = Number(process.env.WEB_PORT || 5180);

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: webPort, proxy },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely, so browsers keep them cached across GoFoode releases.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          maps: ["leaflet"],
          realtime: ["socket.io-client", "axios"]
        }
      }
    }
  },
  preview: { host: "0.0.0.0", proxy }
});
