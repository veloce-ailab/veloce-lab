import { Shield } from "lucide-react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import Login from "./pages/Login"
import SecuritySettings from "./pages/SecuritySettings"

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/login", component: Login })
  ctx.page({
    frame: "settings",
    path: "/settings/security",
    component: SecuritySettings,
    nav: { id: "settings-security", labelKey: "auth.settings", icon: Shield, order: 30, scope: "settings", group: "general" },
  })
}

export default apply
