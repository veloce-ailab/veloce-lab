import type { DashboardContext } from "@velocelab/dashboard/frontend"; import KnowledgeBases from "./pages/KnowledgeBases"; import { Database } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/knowledge", component: KnowledgeBases }); ctx.nav({ id: "chat-knowledge", label: "知识库", path: "/chat/knowledge", icon: Database, order: 20, scope: "chat", group: "library" }); }
export default apply
