import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import api, { clearAuthToken, getAuthToken, getDesktopServerURL, setAuthToken } from "@/lib/api"
import { getTokenFromURL } from "@/desktop/auth"

export function TokenBridge() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const token = getTokenFromURL()
    if (!token) return
    setAuthToken(token)
    localStorage.removeItem("referral_code")
    navigate("/chat", { replace: true })
  }, [location.key, navigate])
  return null
}

export function DesktopConnectorBridge() {
  const location = useLocation()
  useEffect(() => {
    const authToken = getAuthToken()
    if (!authToken || !window.veloceDesktop?.ensureDesktopConnector) return
    void window.veloceDesktop.ensureDesktopConnector({ serverURL: getDesktopServerURL(), authToken })
  }, [location.key])
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
      if (data.type === "veloce-desktop-navigate" && (data.path === "/settings" || data.path === "/settings/wallet")) navigate(data.path)
      if (data.type === "veloce-desktop-logout") {
        clearAuthToken()
        navigate("/login", { replace: true })
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
