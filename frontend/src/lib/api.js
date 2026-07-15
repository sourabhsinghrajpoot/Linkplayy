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
  register: (data) => client.post("/auth/register", data).then((r) => r.data),
  login: (data) => client.post("/auth/login", data).then((r) => r.data),
  logout: () => client.post("/auth/logout").then((r) => r.data),
  me: () => client.get("/auth/me").then((r) => r.data),
  extract: (url) => client.post("/terabox/extract", { url }).then((r) => r.data),
  subscribeMock: () =>
    client.post("/subscribe/mock", { plan: "pro_monthly" }).then((r) => r.data),
  subscriptionStatus: () => client.get("/subscribe/status").then((r) => r.data),
};

export default client;
