import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Channels from "./pages/Channels";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/settings/channels", component: Channels, protected: true }) }
