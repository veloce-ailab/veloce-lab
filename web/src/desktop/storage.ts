import { getDesktopServerURL, normalizeServerURL } from "@/lib/api"
import type { DesktopTab } from "@/desktop/types"

const desktopServersStorageKey = "veloce.desktop.servers"
const desktopServerAccountPrefix = "veloce.desktop.server_account."
const desktopTabsStorageKey = "veloce.desktop.tabs"
const desktopActiveTabStorageKey = "veloce.desktop.active_tab"

export function serverAccountKey(serverURL: string) {
  return `${desktopServerAccountPrefix}${encodeURIComponent(normalizeServerURL(serverURL))}`
}

export function readServerList() {
  const currentServer = getDesktopServerURL()
  try {
    const parsed = JSON.parse(localStorage.getItem(desktopServersStorageKey) || "[]")
    const values = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
    return Array.from(new Set([currentServer, ...values.map(normalizeServerURL)]))
  } catch {
    return [currentServer]
  }
}

export function writeServerList(values: string[]) {
  localStorage.setItem(desktopServersStorageKey, JSON.stringify(Array.from(new Set(values.map(normalizeServerURL)))))
}

export function newDesktopTab(serverURL = getDesktopServerURL()): DesktopTab {
  return {
    id: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: "Chat",
    serverURL: normalizeServerURL(serverURL),
    path: "/chat",
  }
}

export function readDesktopTabs(): DesktopTab[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(desktopTabsStorageKey) || "[]")
    const tabs = Array.isArray(parsed)
      ? parsed
        .map((item): DesktopTab | null => {
          if (!item || typeof item !== "object") return null
          const raw = item as Record<string, unknown>
          const id = typeof raw.id === "string" && raw.id ? raw.id : ""
          if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null
          return {
            id,
            title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 40) : "Chat",
            serverURL: normalizeServerURL(typeof raw.serverURL === "string" ? raw.serverURL : getDesktopServerURL()),
            path: normalizeDesktopTabPath(raw.path),
          }
        })
        .filter((item): item is DesktopTab => Boolean(item))
      : []
    return tabs.length ? tabs : [newDesktopTab()]
  } catch {
    return [newDesktopTab()]
  }
}

export function writeDesktopTabs(tabs: DesktopTab[]) {
  localStorage.setItem(desktopTabsStorageKey, JSON.stringify(tabs))
}

export function readActiveDesktopTabID(tabs: DesktopTab[]) {
  const stored = localStorage.getItem(desktopActiveTabStorageKey) || ""
  return tabs.some((tab) => tab.id === stored) ? stored : tabs[0]?.id || ""
}

export function writeActiveDesktopTabID(tabID: string) {
  localStorage.setItem(desktopActiveTabStorageKey, tabID)
}

export function normalizeDesktopTabPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") ? value.slice(0, 1024) : "/chat"
}
