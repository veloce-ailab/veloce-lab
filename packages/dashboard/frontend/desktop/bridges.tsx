import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/lib/api"

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
