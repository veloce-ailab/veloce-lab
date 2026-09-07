import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatMCP from "./pages/AdvancedChatMCP";
defineExtension(api => api.route({ path: "/chat/mcp", component: AdvancedChatMCP, protected: true }));
