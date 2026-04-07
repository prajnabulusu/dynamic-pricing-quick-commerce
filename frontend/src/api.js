import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 10000,
});

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts    = ()     => api.get("/products/");
export const getProduct     = (id)   => api.get(`/products/${id}`);
export const getPriceHistory= (id)   => api.get(`/products/${id}/price-history`);

// ── Pricing ───────────────────────────────────────────────────────────────────
export const getPrice       = (id)   => api.get(`/price/${id}`);
export const getAllPrices    = ()     => api.get("/price/all/latest");

// ── Orders ────────────────────────────────────────────────────────────────────
export const placeOrder     = (body) => api.post("/orders/", body);
export const getRecentOrders= ()     => api.get("/orders/recent");

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboardStats    = () => api.get("/dashboard/stats");
export const getNearExpiry        = () => api.get("/dashboard/near-expiry");
export const getRedistribution    = () => api.get("/dashboard/redistribution");

// ── Phase A: demand events ────────────────────────────────────────────────────
export const recordEvent   = (body)          => api.post("/events/", body);
export const getViewStats  = (id)            => api.get(`/events/stats/${id}`);
export const simulateSpike = (id, count=30)  => api.get(`/events/spike-simulator/${id}?count=${count}`);