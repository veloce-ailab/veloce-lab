import type { DashboardContext } from "@velocelab/dashboard/frontend"; import DesktopNotifications from "./pages/DesktopNotifications"; import { Bell } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/notifications", component: DesktopNotifications, nav: { id: "desktop-notifications", label: "通知", icon: Bell, order: 40, scope: "settings", group: "general" } }); }
export default apply
