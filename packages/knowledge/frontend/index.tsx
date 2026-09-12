import type { DashboardContext } from "@velocelab/dashboard/frontend"; import KnowledgeBases from "./pages/KnowledgeBases"; import { Database } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/knowledge", component: KnowledgeBases, nav: { id: "chat-knowledge", label: "知识库", icon: Database, order: 20, scope: "chat", group: "library" } }); }
export default apply
