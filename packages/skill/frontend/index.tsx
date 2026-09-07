import { defineExtension } from "@velocelab/dashboard/frontend"; import Skills from "./pages/Skills";
defineExtension(api => api.route({ path: "/chat/skills", component: Skills, protected: true }));
