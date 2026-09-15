import { Users } from "lucide-react";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import UsersSettings from "./pages/UsersSettings";

const GENERAL = { scope: "settings", group: { id: "general", labelKey: "settings.group.general", order: 10 } } as const;

/**
 * Authentication owns the accounts, so the page that manages them lives here
 * and takes its place in the settings frame next to the other account pages.
 */
export default function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/users",
    component: UsersSettings,
    nav: { id: "auth.users", labelKey: "auth.users.title", icon: Users, order: 35, ...GENERAL },
  });
}
