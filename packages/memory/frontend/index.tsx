import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMemories from "./pages/AdvancedChatMemories"; import { Brain } from "lucide-react";
const MemorySettingsRedirect = () => <Navigate to="/chat/memories" replace />;
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/memories", component: AdvancedChatMemories, layout: "full", nav: { id: "chat-memories", label: "记忆", icon: Brain, order: 20, scope: "chat", group: "agents" } }); ctx.page({ frame: "settings", path: "/settings/memory", component: MemorySettingsRedirect, layout: "full" }); }
export default apply
