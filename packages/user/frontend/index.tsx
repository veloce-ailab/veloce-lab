import { KeyRound, UserCircle } from "lucide-react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import ProfileSettings from "./pages/ProfileSettings"
import SecuritySettings from "./pages/SecuritySettings"

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/profile",
    component: ProfileSettings,
    // Landing page of the settings frame: the shell sends `/settings` here.
    home: true,
    nav: { id: "settings-profile", labelKey: "user.settings", icon: UserCircle, order: 20, scope: "settings", group: "general" },
  })
  // Passwords, passkeys and bindings are account settings, so they live with
  // the account page rather than with the package that authenticates requests.
  ctx.page({
    frame: "settings",
    path: "/settings/security",
    component: SecuritySettings,
    nav: { id: "settings-security", labelKey: "user.security", icon: KeyRound, order: 30, scope: "settings", group: "general" },
  })
}

export default apply
