import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatScheduledTasks from "./pages/AdvancedChatScheduledTasks"; import { CalendarClock } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/scheduled-tasks", component: AdvancedChatScheduledTasks }); ctx.nav({ id: "chat-scheduled-tasks", label: "任务", path: "/chat/scheduled-tasks", icon: CalendarClock, order: 20, scope: "chat", group: "workflow" }); }
export default apply
