import { defineExtension } from "@velocelab/dashboard/frontend"; import KnowledgeBases from "./pages/KnowledgeBases";
defineExtension(api => api.route({ path: "/chat/knowledge", component: KnowledgeBases, protected: true }));
