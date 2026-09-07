import { defineExtension } from "@velocelab/dashboard/frontend"; import SettingsStatistics from "./pages/SettingsStatistics";
defineExtension(api => api.route({ path: "/settings/statistics", component: SettingsStatistics, protected: true }));
