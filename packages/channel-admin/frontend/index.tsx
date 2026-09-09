import { Database } from "lucide-react";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import Channels from "./pages/Channels";

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/settings/channels", component: Channels });
  ctx.nav({ id: "channel-admin.settings", label: "AI 服务商与模型", path: "/settings/channels", icon: Database, order: 50, scope: "settings", group: "ai" });
}
export default apply
