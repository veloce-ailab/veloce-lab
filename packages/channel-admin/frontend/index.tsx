import { Database } from "lucide-react";
import { NavLink, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend";
import Channels from "./pages/Channels";

function ChannelSettingsItem() {
  const { t } = useI18n();
  return <NavLink to="/settings/channels" className={({ isActive }) => `flex h-9 items-center gap-3 rounded-md px-3 text-sm ${isActive ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Database size={16} /><span>{t("channelAdmin.settings")}</span></NavLink>;
}

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/settings/channels", component: Channels });
  ctx.slot("settings.sidebar", ChannelSettingsItem, "channel-admin.settings", 100, "settings");
}
export default apply
