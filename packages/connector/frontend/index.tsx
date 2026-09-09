import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDevices from "./pages/AdvancedChatDevices"; import { Laptop } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/settings/devices", component: AdvancedChatDevices }); ctx.nav({ id: "advanced-chat-devices", label: "设备管理", path: "/settings/devices", icon: Laptop, order: 30, scope: "settings", group: "chat" }); }
export default apply
