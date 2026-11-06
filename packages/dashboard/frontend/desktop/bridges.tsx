import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/lib/api"

// A desktop window has no account of its own: the panel it renders is served by
// the server that owns it, so the device token the server issues for this
// installation is the only credential the connector needs.
let desktopConnectorRequest: Promise<void> | null = null

async function requestDesktopDeviceToken() {
  const bridge = window.veloceDesktop
  if (!bridge) return
  const info = await bridge.getDesktopSystemInfo()
  // The bridge reports the hostname, the platform and the installation id; the
  // other device columns are left to the server, which keeps what it already
  // stored for this installation instead of being sent a made-up value.
  const response = await api.post("/user/advanced-chat/devices/token", {
    kind: "desktop",
    desktop_instance_id: info.instanceID,
    name: info.hostname,
    hostname: info.hostname,
    os: info.platform,
  })
  const token = typeof response.data?.token === "string" ? response.data.token : ""
  const deviceID = typeof response.data?.id === "string" ? response.data.id : ""
  if (!token) throw new Error("The server returned no desktop device token")
  await bridge.ensureDesktopConnector({
    serverURL: window.location.origin,
    token,
    ...(deviceID ? { deviceID } : {}),
  })
}

export function DesktopConnectorBridge() {
  useEffect(() => {
    if (!window.veloceDesktop) return
    // One window reload is one device token: the request is shared so a second
    // mount (strict mode) rotates the same credential instead of racing for it.
    desktopConnectorRequest ??= requestDesktopDeviceToken().catch((error) => {
      // The connector is an accessory of the panel: a server that refuses the
      // token must not take the window down with it.
      console.warn("Desktop connector is unavailable", error)
    })
  }, [])
  return null
}

export function DesktopApprovalDecisionBridge() {
  useEffect(() => window.veloceDesktop?.onConnectorApprovalDecision(({ taskID, approved }) => {
    void api.post(`/user/advanced-chat/connector-tasks/${encodeURIComponent(taskID)}/decision`, { approved })
  }), [])
  return null
}

export function DesktopNavigationBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    const receiveNavigation = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== "object") return
      if (data.type === "veloce-desktop-navigate" && typeof data.path === "string" && data.path.startsWith("/")) {
        navigate(data.path)
      }
    }
    window.addEventListener("message", receiveNavigation)
    return () => window.removeEventListener("message", receiveNavigation)
  }, [navigate])
  return null
}

export function DesktopTransparency() {
  useEffect(() => {
    document.documentElement.classList.add("desktop-acrylic-app")
    return () => document.documentElement.classList.remove("desktop-acrylic-app")
  }, [])
  return null
}
