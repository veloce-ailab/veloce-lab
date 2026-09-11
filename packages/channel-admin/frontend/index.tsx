import { Database } from "lucide-react";
import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend";
import Channels from "./pages/Channels";

const ModelsRedirect = () => <Navigate to="/settings/channels" replace />;

export function apply(ctx: DashboardContext) {
  ctx.page({ frame: "settings", path: "/settings/channels", component: Channels, nav: { id: "channel-admin.settings", labelKey: "channelAdmin.settings", icon: Database, order: 50, scope: "settings", group: "ai" } });
  ctx.page({ frame: "settings", path: "/settings/models", component: ModelsRedirect });
}
export default apply
