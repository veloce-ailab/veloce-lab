import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatMemories from "./pages/AdvancedChatMemories";
defineExtension(api => api.route({ path: "/chat/memories", component: AdvancedChatMemories, protected: true }));
