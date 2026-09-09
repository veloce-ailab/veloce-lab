import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatScheduledTasks from "./pages/AdvancedChatScheduledTasks";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/scheduled-tasks", component: AdvancedChatScheduledTasks, protected: true }) }
