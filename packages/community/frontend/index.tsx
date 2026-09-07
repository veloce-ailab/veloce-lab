import { defineExtension } from "@velocelab/dashboard/frontend"; import Community from "./pages/Community";
defineExtension(api => api.route({ path: "/community/*", component: Community, protected: true }));
