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
export const getPriceSeries  = (id, limit=80) => api.get(`/price/${id}/series?limit=${limit}`);

// ── Orders ────────────────────────────────────────────────────────────────────
export const placeOrder     = (body) => api.post("/orders/", body);
export const getRecentOrders= ()     => api.get("/orders/recent");
export const getLiveOrderItems = (limit=200) => api.get(`/orders/live-items?limit=${limit}`);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboardStats    = () => api.get("/dashboard/stats");
export const getNearExpiry        = () => api.get("/dashboard/near-expiry");
export const getRedistribution    = () => api.get("/dashboard/redistribution");
export const getAnimalShelterRouting = () => api.get("/dashboard/animal-shelter-routing");
export const getRescueRouting     = () => api.get("/dashboard/rescue-routing");

// ── Phase A: demand events ────────────────────────────────────────────────────
export const recordEvent   = (body)          => api.post("/events/", body);
export const getViewStats  = (id)            => api.get(`/events/stats/${id}`);
export const getViewSeries = (id, minutes=30, bucketSec=15) => api.get(`/events/stats-series/${id}?minutes=${minutes}&bucket_sec=${bucketSec}`);
export const simulateSpike = (id, count=30)  => api.get(`/events/spike-simulator/${id}?count=${count}`);
