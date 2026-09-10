import { SettingsPage, type DashboardContext } from "@velocelab/dashboard/frontend"
import { UserCircle } from "lucide-react"

const ProfileSettings = () => <SettingsPage section="profile" />

export function apply(ctx: DashboardContext) {
  ctx.page({ frame: "settings", path: "/settings/profile", component: ProfileSettings })
  ctx.nav({ id: "settings-profile", label: "账户", path: "/settings/profile", icon: UserCircle, order: 20, scope: "settings", group: "general" })
}

export default apply
