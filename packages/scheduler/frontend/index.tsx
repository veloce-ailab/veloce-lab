import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatScheduledTasks from "./pages/AdvancedChatScheduledTasks";
defineExtension(api => api.route({ path: "/chat/scheduled-tasks", component: AdvancedChatScheduledTasks, protected: true }));
