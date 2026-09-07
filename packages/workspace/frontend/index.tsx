import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatFiles from "./pages/AdvancedChatFiles";
defineExtension(api => api.route({ path: "/chat/files", component: AdvancedChatFiles, protected: true }));
