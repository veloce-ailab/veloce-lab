import { Activity } from "lucide-react"
import { NavLink, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"
import SettingsStatistics from "./pages/SettingsStatistics"

function UptimeSettingsItem() {
  const { t } = useI18n()
  return <NavLink to="/settings/statistics" className={({ isActive }) => `flex h-9 items-center gap-3 rounded-md px-3 text-sm ${isActive ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Activity size={16} /><span>{t("uptime.settings")}</span></NavLink>
}

export default function apply(ctx: DashboardContext) {
  ctx.page({ frame: "settings", path: "/settings/statistics", component: SettingsStatistics })
  ctx.slot("settings.sidebar", UptimeSettingsItem, "uptime.settings", 10, "settings")
}
