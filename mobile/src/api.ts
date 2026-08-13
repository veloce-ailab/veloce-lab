import AsyncStorage from "@react-native-async-storage/async-storage"

const SERVER_KEY = "veloce.mobile.server"
const TOKEN_KEY = "veloce.mobile.token"
const PROXY_KEY = "veloce.mobile.network-proxy"
export const DEFAULT_SERVER = "http://10.0.2.2:8080"

let serverURL = DEFAULT_SERVER
let proxyURL = ""
let token = ""

export function normalizeServerURL(value: string) {
  const next = value.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(next)) throw new Error("请输入以 http:// 或 https:// 开头的服务地址")
  return next
}
export async function restoreConnection() {
  const [savedServer, savedToken, savedProxy] = await Promise.all([AsyncStorage.getItem(SERVER_KEY), AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(PROXY_KEY)])
  serverURL = savedServer ? normalizeServerURL(savedServer) : DEFAULT_SERVER
  proxyURL = savedProxy ? normalizeServerURL(savedProxy) : ""
  token = savedToken || ""
  return { serverURL, proxyURL, token }
}
export function getServerURL() { return serverURL }
export function getNetworkProxy() { return proxyURL }
export function getToken() { return token }
export async function configureServer(url: string) { serverURL = normalizeServerURL(url); await AsyncStorage.setItem(SERVER_KEY, serverURL) }
export async function configureNetworkProxy(url: string) { proxyURL = url.trim() ? normalizeServerURL(url) : ""; if (proxyURL) await AsyncStorage.setItem(PROXY_KEY, proxyURL); else await AsyncStorage.removeItem(PROXY_KEY) }
export async function setToken(next: string) { token = next; await AsyncStorage.setItem(TOKEN_KEY, next) }
export async function clearToken() { token = ""; await AsyncStorage.removeItem(TOKEN_KEY) }

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown }
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${proxyURL || serverURL}/api${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `请求失败（${response.status}）`)
  return payload as T
}

export type StreamEvent = { type: string; payload: any }

export async function streamRequest(path: string, body: unknown, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch(`${proxyURL || serverURL}/api${path}`, {
    method: "POST", signal,
    headers: { Accept: "text/event-stream, application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(typeof payload?.error === "string" ? payload.error : `请求失败（${response.status}）`)
  }
  const parse = (raw: string) => {
    let type = "message"; const data: string[] = []
    for (const line of raw.split(/\r?\n/)) { if (line.startsWith("event:")) type = line.slice(6).trim(); if (line.startsWith("data:")) data.push(line.slice(5).trimStart()) }
    if (!data.length) return
    let payload: any
    try { payload = JSON.parse(data.join("\n")) } catch { return /* ignore malformed keep-alive frames */ }
    onEvent({ type, payload })
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    onEvent({ type: "done", payload: await response.json().catch(() => ({})) })
    return
  }
  if (!response.body) { (await response.text()).split(/\r?\n\r?\n/).forEach(parse); return }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() || ""; events.forEach(parse)
  }
  if (buffer.trim()) parse(buffer)
}

export async function uploadFile(path: string, asset: { uri: string; name: string; mimeType?: string | null }) {
  const form = new FormData()
  form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType || "application/octet-stream" } as any)
  const response = await fetch(`${proxyURL || serverURL}/api${path}`, { method: "POST", headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `上传失败（${response.status}）`)
  return payload as { file?: { id?: string; name?: string; type?: string; size?: number }; content?: { text?: string; truncated?: boolean; binary?: boolean } }
}
export async function login(identifier: string, password: string) {
  const response = await fetch(`${proxyURL || serverURL}/auth/password/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ identifier, password, agreement_accepted: true }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.token) throw new Error(payload.error || "登录失败")
  await setToken(payload.token)
}
