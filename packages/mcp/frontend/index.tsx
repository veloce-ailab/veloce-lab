import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMCP from "./pages/AdvancedChatMCP"; import { Bot } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/mcp", component: AdvancedChatMCP }); ctx.nav({ id: "chat-mcp", label: "MCP", path: "/chat/mcp", icon: Bot, order: 50, scope: "chat", group: "agents" }); }
export default apply
