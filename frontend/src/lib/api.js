import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const api = {
  // auth
  register: (data) => client.post("/auth/register", data).then((r) => r.data),
  login: (data) => client.post("/auth/login", data).then((r) => r.data),
  logout: () => client.post("/auth/logout").then((r) => r.data),
  me: () => client.get("/auth/me").then((r) => r.data),
  googleExchange: (session_id) =>
    client.post("/auth/google/session", { session_id }).then((r) => r.data),

  // terabox + quota
  extract: (url) => client.post("/terabox/extract", { url }).then((r) => r.data),
  quota: () => client.get("/quota").then((r) => r.data),

  // subscription
  subscribeConfig: () => client.get("/subscribe/config").then((r) => r.data),
  createOrder: () =>
    client.post("/subscribe/create-order", { plan: "pro_monthly" }).then((r) => r.data),
  verifyPayment: (body) => client.post("/subscribe/verify", body).then((r) => r.data),
  subscribeMock: () =>
    client.post("/subscribe/mock", { plan: "pro_monthly" }).then((r) => r.data),
  subscriptionStatus: () => client.get("/subscribe/status").then((r) => r.data),

  // history / favorites / continue-watching
  listHistory: () => client.get("/history").then((r) => r.data),
  saveHistory: (item) => client.post("/history", item).then((r) => r.data),
  clearHistory: () => client.delete("/history").then((r) => r.data),
  listFavorites: () => client.get("/favorites").then((r) => r.data),
  addFavorite: (item) => client.post("/favorites", item).then((r) => r.data),
  removeFavorite: (source_url) =>
    client.delete("/favorites", { params: { source_url } }).then((r) => r.data),
  listContinue: () => client.get("/continue-watching").then((r) => r.data),
  saveContinue: (item) => client.post("/continue-watching", item).then((r) => r.data),
  removeContinue: (source_url) =>
    client
      .delete("/continue-watching", { params: source_url ? { source_url } : {} })
      .then((r) => r.data),

  // preferences
  getPreferences: () => client.get("/preferences").then((r) => r.data),
  updatePreferences: (prefs) =>
    client.patch("/preferences", prefs).then((r) => r.data),
};

export default client;
