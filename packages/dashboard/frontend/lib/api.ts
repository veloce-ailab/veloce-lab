import axios from "axios";

export const defaultDesktopServerURL = "http://localhost:8080";
// The desktop shell is decided at runtime: the same bundle is served to a
// browser and loaded by Electron, and only the preload bridge tells them apart.
export const isDesktopTarget = () =>
  typeof window !== "undefined" && Boolean(window.veloceDesktop);
export const isDemoMode = () => false;
const configuredBackendURL = () =>
  (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");
// A desktop window always shows the panel its own server serves, so the page
// origin is the server address. There is no server to pick and nothing to
// remember between launches.
export const getDesktopServerURL = () =>
  typeof window === "undefined"
    ? defaultDesktopServerURL
    : window.location.origin.replace(/\/+$/, "");
export const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
};
export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
};
export const clearAuthToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
};
export const apiURL = (pathOrURL: string) => {
  if (/^https?:\/\//i.test(pathOrURL)) return pathOrURL;
  const path = pathOrURL.startsWith("/") ? pathOrURL : `/${pathOrURL}`;
  if (isDesktopTarget()) return `${getDesktopServerURL()}${path}`;
  const backend = configuredBackendURL();
  return backend ? `${backend}${path}` : pathOrURL;
};
// Plugins import this by name as well as through the default export; without
// the named export a development server refuses the module outright.
export const api = axios.create({ baseURL: apiURL("/api") });
export const getAuthLoginURL = (
  referralCode?: string | null,
  agreementAccepted = false,
) => getOAuthLoginURL("/auth/login", referralCode, agreementAccepted);
export const getOAuthLoginURL = (
  loginURL: string,
  referralCode?: string | null,
  agreementAccepted = false,
) => {
  const params = new URLSearchParams();
  const code = (
    referralCode ||
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("referral_code")
      : "") ||
    ""
  ).trim();
  if (code) params.set("ref", code);
  if (agreementAccepted) params.set("agreement_accepted", "true");
  const query = params.toString();
  return apiURL(
    query
      ? `${loginURL}${loginURL.includes("?") ? "&" : "?"}${query}`
      : loginURL,
  );
};
api.interceptors.request.use((config) => {
  config.baseURL = apiURL("/api");
  const language = typeof window !== "undefined" ? localStorage.getItem("language") : "";
  if (language === "zh" || language === "en" || language === "ja") {
    config.headers["Accept-Language"] = language;
  }
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// Authentication happens in front of the application: a 401 means the session
// is gone, so the browser is sent back through the authentication page, which
// the auth package serves on its own. The desktop server has no sign-in at all,
// so there is nowhere to send a desktop window and the rejection is passed on
// unchanged.
api.interceptors.response.use(undefined, (error) => {
  const status = error?.response?.status;
  const url = String(error?.config?.url ?? "");
  if (status === 401 && typeof window !== "undefined" && !isDesktopTarget() && !url.includes("/auth/password/")) {
    clearAuthToken();
    const here = `${window.location.pathname}${window.location.search}`;
    const login = apiURL(`/login?next=${encodeURIComponent(here)}`);
    if (window.location.pathname !== "/login") window.location.assign(login);
  }
  return Promise.reject(error);
});
export default api;
