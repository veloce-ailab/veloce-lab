import { UserCircle } from "lucide-react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import ProfileSettings from "./pages/ProfileSettings"

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/profile",
    component: ProfileSettings,
    // Landing page of the settings frame: the shell sends `/settings` here.
    home: true,
    nav: { id: "settings-profile", labelKey: "user.settings", icon: UserCircle, order: 20, scope: "settings", group: "general" },
  })
}

export default apply
