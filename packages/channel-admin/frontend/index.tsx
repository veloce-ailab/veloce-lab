import { Database } from "lucide-react";
import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend";
import Channels from "./pages/Channels";

const ModelsRedirect = () => <Navigate to="/settings/channels" replace />;

export function apply(ctx: DashboardContext) {
  ctx.page({ frame: "settings", path: "/settings/channels", component: Channels });
  ctx.page({ frame: "settings", path: "/settings/models", component: ModelsRedirect });
  ctx.nav({ id: "channel-admin.settings", label: "AI 服务商与模型", path: "/settings/channels", icon: Database, order: 50, scope: "settings", group: "ai" });
}
export default apply
