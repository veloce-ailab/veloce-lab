import axios from "axios";

export const desktopServerStorageKey = "veloce.desktop.server_url";
export const defaultDesktopServerURL = "http://localhost:8080";
const desktopServerTokenPrefix = "veloce.desktop.server_token.";
const desktopTabServerPrefix = "veloce.desktop.tab_server.";
export const isDesktopTarget = () =>
  import.meta.env.VITE_APP_TARGET === "desktop";
export const isDemoMode = () => false;
const configuredBackendURL = () =>
  (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");
export const getDesktopTabID = () => {
  if (typeof window === "undefined") return "";
  const value =
    new URLSearchParams(window.location.search).get("desktop_tab_id") || "";
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : "";
};
const desktopTabServerStorageKey = (tabID = getDesktopTabID()) =>
  tabID ? `${desktopTabServerPrefix}${tabID}` : desktopServerStorageKey;
export const normalizeServerURL = (value: string | null | undefined) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return defaultDesktopServerURL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return defaultDesktopServerURL;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return defaultDesktopServerURL;
  }
};
export const getDesktopServerURL = (tabID = getDesktopTabID()) =>
  typeof window === "undefined"
    ? defaultDesktopServerURL
    : normalizeServerURL(
        localStorage.getItem(desktopTabServerStorageKey(tabID)) ||
          localStorage.getItem(desktopServerStorageKey),
      );
export const desktopServerTokenKey = (serverURL = getDesktopServerURL()) =>
  `${desktopServerTokenPrefix}${encodeURIComponent(normalizeServerURL(serverURL))}`;
export const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  return isDesktopTarget()
    ? localStorage.getItem(desktopServerTokenKey()) ||
        localStorage.getItem("token") ||
        ""
    : localStorage.getItem("token") || "";
};
export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
  if (isDesktopTarget()) localStorage.setItem(desktopServerTokenKey(), token);
};
export const clearAuthToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  if (isDesktopTarget()) localStorage.removeItem(desktopServerTokenKey());
};
export const setDesktopServerURL = (
  serverURL: string,
  tabID = getDesktopTabID(),
) => {
  if (typeof window === "undefined") return defaultDesktopServerURL;
  const currentToken = localStorage.getItem("token");
  if (currentToken) localStorage.setItem(desktopServerTokenKey(), currentToken);
  const nextURL = normalizeServerURL(serverURL);
  localStorage.setItem(desktopTabServerStorageKey(tabID), nextURL);
  if (!tabID) localStorage.setItem(desktopServerStorageKey, nextURL);
  const nextToken = localStorage.getItem(desktopServerTokenKey(nextURL));
  if (nextToken) localStorage.setItem("token", nextToken);
  else localStorage.removeItem("token");
  return nextURL;
};
export const setDesktopTabServerURL = (tabID: string, serverURL: string) => {
  const nextURL = normalizeServerURL(serverURL);
  if (typeof window !== "undefined" && tabID)
    localStorage.setItem(desktopTabServerStorageKey(tabID), nextURL);
  return nextURL;
};
export const apiURL = (pathOrURL: string) => {
  if (/^https?:\/\//i.test(pathOrURL)) return pathOrURL;
  const path = pathOrURL.startsWith("/") ? pathOrURL : `/${pathOrURL}`;
  if (isDesktopTarget()) return `${getDesktopServerURL()}${path}`;
  const backend = configuredBackendURL();
  return backend ? `${backend}${path}` : pathOrURL;
};
const api = axios.create({ baseURL: apiURL("/api") });
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
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// Authentication happens in front of the application: a 401 means the session
// is gone, so the browser is sent back through the authentication page, which
// the auth package serves on its own.
api.interceptors.response.use(undefined, (error) => {
  const status = error?.response?.status;
  const url = String(error?.config?.url ?? "");
  if (status === 401 && typeof window !== "undefined" && !url.includes("/auth/password/")) {
    clearAuthToken();
    const here = `${window.location.pathname}${window.location.search}`;
    const login = apiURL(`/login?next=${encodeURIComponent(here)}`);
    if (window.location.pathname !== "/login") window.location.assign(login);
  }
  return Promise.reject(error);
});
export default api;
