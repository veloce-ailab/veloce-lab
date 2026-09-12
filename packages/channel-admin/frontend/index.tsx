import { Database } from "lucide-react";
import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend";
import Channels from "./pages/Channels";

const ModelsRedirect = () => <Navigate to="/settings/channels" replace />;

export function apply(ctx: DashboardContext) {
  // This package owns the "ai" settings section, so it declares its heading and
  // position; sibling packages only join it with `group: "ai"`.
  ctx.page({ frame: "settings", path: "/settings/channels", component: Channels, nav: { id: "channel-admin.settings", labelKey: "channelAdmin.settings", icon: Database, order: 50, scope: "settings", group: { id: "ai", labelKey: "channelAdmin.settingsGroup", order: 20 } } });
  ctx.page({ frame: "settings", path: "/settings/models", component: ModelsRedirect });
}
export default apply
