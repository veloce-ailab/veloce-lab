import { defineExtension } from "@velocelab/dashboard/frontend"; import DesktopNotifications from "./pages/DesktopNotifications";
defineExtension(api => api.route({ path: "/settings/notifications", component: DesktopNotifications, protected: true }));
