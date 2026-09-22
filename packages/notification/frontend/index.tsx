import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { Bell } from "lucide-react"
import NotificationSettings from "./page"
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/notifications", component: NotificationSettings, nav: { id: "notification.settings", label: "通知", icon: Bell, order: 40, scope: "settings", group: "general" } }) }
export default apply
