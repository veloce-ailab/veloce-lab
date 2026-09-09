import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMemories from "./pages/AdvancedChatMemories"; import { Brain } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/memories", component: AdvancedChatMemories }); ctx.nav({ id: "chat-memories", label: "记忆", path: "/chat/memories", icon: Brain, order: 20, scope: "chat", group: "agents" }); }
export default apply
