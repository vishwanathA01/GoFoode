import React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gofoode_location") || "null"); } catch { return null; }
  });
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const requestLocation = async () => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationError("This browser does not support location access.");
      return null;
    }
    setLocationStatus("loading");
    setLocationError("");
    try {
      let position;
      try {
        position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 12000, maximumAge: 30000
        }));
      } catch (error) {
        if (error.code === 1) throw error;
        setLocationStatus("retrying");
        position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 15000, maximumAge: 60000
        }));
      }

      const { latitude, longitude, accuracy } = position.coords;
      const coords = { latitude, longitude, accuracy };
      let label = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      let city = "";
      let state = "";
      let postalCode = "";
      let lookupError = "";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.search = new URLSearchParams({ format: "jsonv2", lat: String(latitude), lon: String(longitude) });
        const response = await fetch(url, { signal: controller.signal, headers: { "Accept-Language": navigator.language } });
        if (!response.ok) throw new Error(`Place lookup failed (${response.status}).`);
        const place = await response.json();
        const address = place.address || {};
        city = address.city || address.town || address.village || address.city_district || address.county || "";
        state = address.state || "";
        postalCode = address.postcode || "";
        label = [
          address.suburb || address.neighbourhood || address.village || address.town || address.city_district,
          city,
          state
        ].filter((value, index, values) => value && values.indexOf(value) === index).join(", ") || label;
      } catch {
        lookupError = "Your coordinates were found, but the place name could not be loaded. You can still use the coordinates.";
      } finally {
        clearTimeout(timeout);
      }

      const next = { ...coords, city, state, postalCode, label, updatedAt: new Date().toISOString() };
      localStorage.setItem("gofoode_location", JSON.stringify(next));
      setLocation(next);
      setLocationStatus("ready");
      setLocationError(lookupError);
      return next;
    } catch (error) {
      if (error.code === 1) {
        setLocationStatus("denied");
        setLocationError("Location access is blocked. Allow it in your browser's site settings, then try again.");
      } else if (error.code === 2) {
        setLocationStatus("unavailable");
        setLocationError("Your device could not determine your location. Check that device location services are enabled.");
      } else if (error.code === 3) {
        setLocationStatus("error");
        setLocationError("The location request timed out. Check your connection and location services, then try again.");
      } else {
        setLocationStatus("error");
        setLocationError(error.message || "Could not get your location. Check your browser and device permissions, then try again.");
      }
      return null;
    }
  };
  const saveManualLocation = fields => {
    const area = String(fields.area || "").trim();
    const city = String(fields.city || "").trim();
    const state = String(fields.state || "").trim();
    const postalCode = String(fields.postalCode || "").trim();
    if (!city) return null;
    const label = [area, city, state].filter(Boolean).join(", ");
    const next = { area, city, state, postalCode, label, source: "manual", updatedAt: new Date().toISOString() };
    localStorage.setItem("gofoode_location", JSON.stringify(next));
    setLocation(next);
    setLocationStatus("manual");
    setLocationError("");
    return next;
  };
  useEffect(() => {
    const token = localStorage.getItem("dineflow_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me").then(r => {
      setUser(r.data.user);
      const savedLocation = localStorage.getItem("gofoode_location");
      let updatedAt = NaN;
      let savedLocationData = null;
      try {
        savedLocationData = JSON.parse(savedLocation || "null");
        updatedAt = Date.parse(savedLocationData?.updatedAt || "");
      } catch { localStorage.removeItem("gofoode_location"); }
      if (savedLocationData?.source !== "manual" && (!Number.isFinite(updatedAt) || Date.now() - updatedAt > 60 * 60 * 1000)) requestLocation();
    }).catch(() => {
      localStorage.removeItem("dineflow_token");
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("dineflow_token", data.accessToken); setUser(data.user); if (!location) requestLocation(); return data.user;
  };
  const register = async form => {
    const { data } = await api.post("/auth/register", form);
    localStorage.setItem("dineflow_token", data.accessToken); setUser(data.user); if (!location) requestLocation(); return data.user;
  };
  const onboard = async form => {
    const { data } = await api.post("/auth/onboard", form);
    localStorage.setItem("dineflow_token", data.accessToken); setUser(data.user); if (!location) requestLocation(); return data.user;
  };
  const updateProfile = async changes => {
    const { data } = await api.patch("/profile", changes);
    setUser(data.user);
    return data.user;
  };
  const logout = () => {
    localStorage.removeItem("dineflow_token");
    localStorage.removeItem("gofoode_location");
    setUser(null);
    setLocation(null);
    setLocationStatus("idle");
    setLocationError("");
  };
  return <AuthContext.Provider value={{ user, loading, login, register, onboard, updateProfile, logout, location, locationStatus, locationError, requestLocation, saveManualLocation }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
