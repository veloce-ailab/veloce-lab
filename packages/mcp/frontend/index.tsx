import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMCP from "./pages/AdvancedChatMCP"; import { Bot } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/mcp", component: AdvancedChatMCP, nav: { id: "chat-mcp", label: "MCP", icon: Bot, order: 50, scope: "chat", group: "agents" } }); }
export default apply
