import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMemories from "./pages/AdvancedChatMemories"; import { Brain } from "lucide-react";
const MemorySettingsRedirect = () => <Navigate to="/chat/memories" replace />;
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/memories", component: AdvancedChatMemories }); ctx.page({ frame: "settings", path: "/settings/memory", component: MemorySettingsRedirect, layout: "full" }); ctx.nav({ id: "chat-memories", label: "记忆", path: "/chat/memories", icon: Brain, order: 20, scope: "chat", group: "agents" }); }
export default apply
