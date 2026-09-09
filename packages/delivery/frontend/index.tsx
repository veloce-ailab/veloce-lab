import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDeliveries from "./pages/AdvancedChatDeliveries";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/deliveries", component: AdvancedChatDeliveries, protected: true }) }
