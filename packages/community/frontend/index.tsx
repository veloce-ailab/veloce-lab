import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Community from "./pages/Community"; import { Users } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/community/*", component: Community }); ctx.nav({ id: "chat-community", label: "社区", path: "/chat/community", icon: Users, order: 10, scope: "chat", group: "direct" }); }
export default apply
