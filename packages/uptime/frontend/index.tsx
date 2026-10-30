import { Activity } from "lucide-react"
import { type DashboardContext } from "@velocelab/dashboard/frontend"
import SettingsStatistics from "./pages/SettingsStatistics"

export default function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/statistics",
    component: SettingsStatistics,
    minimumPermissionLevel: 10,
    nav: { id: "uptime.settings", labelKey: "uptime.settings", icon: Activity, order: 10, minimumPermissionLevel: 10, scope: "settings", group: "general" },
  })
}
