// One shared Socket.IO connection for the signed-in user. The API puts each socket in a `user:<id>` room,
// so order, delivery and rider-location events arrive here as they happen.
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

let socket = null;
let socketToken = null;

function apiOrigin() {
  const configured = import.meta.env.VITE_API_URL;
  if (!configured) return undefined; // same origin: the dev server proxies /socket.io to the API
  try { return new URL(configured, window.location.href).origin; } catch { return undefined; }
}

// Hosts without long-lived connections (Vercel) set VITE_DISABLE_SOCKETS=true; pages then poll instead.
const SOCKETS_DISABLED = import.meta.env.VITE_DISABLE_SOCKETS === "true";

export function getSocket() {
  if (SOCKETS_DISABLED) return null;
  let token = null;
  try { token = localStorage.getItem("dineflow_token"); } catch { /* storage blocked */ }
  if (!token) { socket?.disconnect(); socket = null; socketToken = null; return null; }
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(apiOrigin(), { auth: { token }, transports: ["websocket", "polling"], reconnectionDelayMax: 10000 });
  return socket;
}

// Calls `handler` for each of `events` while the component is mounted.
export function useSocketEvent(events, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const names = [].concat(events).join("|");
  useEffect(() => {
    if (!enabled) return undefined;
    const connection = getSocket();
    if (!connection) return undefined;
    const listener = (...args) => handlerRef.current(...args);
    const list = names.split("|");
    list.forEach(name => connection.on(name, listener));
    return () => list.forEach(name => connection.off(name, listener));
  }, [names, enabled]);
}

// Whether live updates are flowing, so pages can fall back to polling when they aren't.
export function useSocketConnected() {
  const [connected, setConnected] = useState(() => Boolean(getSocket()?.connected));
  useEffect(() => {
    const connection = getSocket();
    if (!connection) return undefined;
    const up = () => setConnected(true), down = () => setConnected(false);
    connection.on("connect", up);
    connection.on("disconnect", down);
    connection.on("connect_error", down);
    setConnected(connection.connected);
    return () => { connection.off("connect", up); connection.off("disconnect", down); connection.off("connect_error", down); };
  }, []);
  return connected;
}
