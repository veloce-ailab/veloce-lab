import type { DashboardContext } from "@velocelab/dashboard/frontend"; import DesktopNotifications from "./pages/DesktopNotifications"; import { Bell } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/notifications", component: DesktopNotifications }); ctx.nav({ id: "desktop-notifications", label: "通知", path: "/settings/notifications", icon: Bell, order: 40, scope: "settings", group: "general" }); }
export default apply
