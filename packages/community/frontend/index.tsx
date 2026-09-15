import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Community from "./pages/Community"; import { Users } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/community/*", component: Community, nav: { id: "chat-community", label: "社区", icon: Users, order: 10, scope: "chat", group: "direct" } }); }
export default apply
