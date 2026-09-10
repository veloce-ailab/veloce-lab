import { SettingsPage, type DashboardContext } from "@velocelab/dashboard/frontend"
import Login from "./pages/Login"
import { Shield } from "lucide-react"

const SecuritySettings = () => <SettingsPage section="security" />

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/login", component: Login })
  ctx.page({ frame: "settings", path: "/settings/security", component: SecuritySettings })
  ctx.nav({ id: "settings-security", label: "安全", path: "/settings/security", icon: Shield, order: 30, scope: "settings", group: "general" })
}
export default apply
