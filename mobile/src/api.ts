import AsyncStorage from "@react-native-async-storage/async-storage"

const SERVER_KEY = "veloce.mobile.server"
const TOKEN_KEY = "veloce.mobile.token"
export const DEFAULT_SERVER = "http://10.0.2.2:8080"

let serverURL = DEFAULT_SERVER
let token = ""

export function normalizeServerURL(value: string) {
  const next = value.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(next)) throw new Error("请输入以 http:// 或 https:// 开头的服务地址")
  return next
}
export async function restoreConnection() {
  const [savedServer, savedToken] = await Promise.all([AsyncStorage.getItem(SERVER_KEY), AsyncStorage.getItem(TOKEN_KEY)])
  serverURL = savedServer ? normalizeServerURL(savedServer) : DEFAULT_SERVER
  token = savedToken || ""
  return { serverURL, token }
}
export function getServerURL() { return serverURL }
export function getToken() { return token }
export async function configureServer(url: string) { serverURL = normalizeServerURL(url); await AsyncStorage.setItem(SERVER_KEY, serverURL) }
export async function setToken(next: string) { token = next; await AsyncStorage.setItem(TOKEN_KEY, next) }
export async function clearToken() { token = ""; await AsyncStorage.removeItem(TOKEN_KEY) }

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown }
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${serverURL}/api${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `请求失败（${response.status}）`)
  return payload as T
}
export async function login(identifier: string, password: string) {
  const response = await fetch(`${serverURL}/auth/password/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier, password, agreement_accepted: true }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.token) throw new Error(payload.error || "登录失败")
  await setToken(payload.token)
}

