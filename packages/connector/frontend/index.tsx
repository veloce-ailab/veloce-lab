import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDevices, { AdvancedChatDeviceDetail } from "./pages/AdvancedChatDevices"; import { Laptop } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/devices", component: AdvancedChatDevices, nav: { id: "connector-devices", labelKey: "connector.settings", icon: Laptop, order: 30, scope: "settings", group: "chat" } }); ctx.page({ frame: "settings", path: "/settings/devices/:id", component: AdvancedChatDeviceDetail }); }
export default apply
