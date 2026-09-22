export interface NotificationPreferences {
  enabled: boolean
  taskCompleted: boolean
  connectorApproval: boolean
}

const storageKey = "veloce.notification-preferences"
const legacyStorageKey = "veloce.desktop.notification-preferences"
const defaults: NotificationPreferences = { enabled: true, taskCompleted: true, connectorApproval: true }

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return { ...defaults }
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey) || "{}") as Partial<NotificationPreferences>
    return { enabled: value.enabled !== false, taskCompleted: value.taskCompleted !== false, connectorApproval: value.connectorApproval !== false }
  } catch { return { ...defaults } }
}

export function saveNotificationPreferences(value: NotificationPreferences) {
  if (typeof window !== "undefined") localStorage.setItem(storageKey, JSON.stringify(value))
}

export function notificationEnabled(kind: "taskCompleted" | "connectorApproval") {
  const preferences = getNotificationPreferences()
  return preferences.enabled && preferences[kind]
}

export async function sendWebNotification(input: { title: string; body: string; tag: string; url?: string }) {
  if (typeof window === "undefined" || !notificationEnabled(input.tag.startsWith("connector-") ? "connectorApproval" : "taskCompleted") || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.ready
  registration.active?.postMessage({ type: "veloce.notification", ...input })
}

// Compatibility for integrations that still use the old desktop-oriented name.
export const desktopNotificationEnabled = notificationEnabled
