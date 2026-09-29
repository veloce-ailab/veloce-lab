import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { Bell } from "lucide-react"
import { useEffect } from "react"
import { api, sendWebNotification } from "@velocelab/dashboard/frontend"
import NotificationSettings from "./page"
function NotificationBridge() { useEffect(() => { let active = true; const poll = async () => { try { const response = await api.get("/user/notifications/pending"); for (const item of response.data.notifications || []) void sendWebNotification({ title: item.title, body: item.body || "", tag: item.tag || "message", url: item.url || "/" }) } catch {} }; void poll(); const timer = window.setInterval(() => { if (active) void poll() }, 10000); return () => { active = false; window.clearInterval(timer) } }, []); return null }
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/notifications", component: NotificationSettings, nav: { id: "notification.settings", label: "通知", icon: Bell, order: 40, scope: "settings", group: "general" } }); ctx.slot("app.after", NotificationBridge, "notification.bridge", 20) }
export default apply
