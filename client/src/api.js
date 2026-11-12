import axios from "axios";

const api = axios.create({
  // Relative by default: the Vite dev server (and the API itself in production) serve /api on the same origin.
  // Set VITE_API_URL only when the API lives on a different host.
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  timeout: 30000,
  headers: { "Content-Type": "application/json" }
});
api.interceptors.request.use(config => {
  const token = localStorage.getItem("dineflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default api;
