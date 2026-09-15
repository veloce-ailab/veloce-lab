export interface DesktopNotificationPreferences {
  enabled: boolean
  taskCompleted: boolean
  connectorApproval: boolean
}

const storageKey = "veloce.desktop.notification-preferences"
const defaults: DesktopNotificationPreferences = {
  enabled: true,
  taskCompleted: true,
  connectorApproval: true,
}

export function getDesktopNotificationPreferences(): DesktopNotificationPreferences {
  if (typeof window === "undefined") return { ...defaults }
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<DesktopNotificationPreferences>
    return {
      enabled: value.enabled !== false,
      taskCompleted: value.taskCompleted !== false,
      connectorApproval: value.connectorApproval !== false,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveDesktopNotificationPreferences(value: DesktopNotificationPreferences) {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey, JSON.stringify(value))
}

export function desktopNotificationEnabled(kind: "taskCompleted" | "connectorApproval") {
  const preferences = getDesktopNotificationPreferences()
  return preferences.enabled && preferences[kind]
}
