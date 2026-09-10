import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { SettingsWorkspace, SystemManagement, ThemeSettings } from "@velocelab/dashboard/frontend";
import { Palette, Settings as SettingsIcon, Shield } from "lucide-react";

const ProxySettings = () => <SystemManagement section="proxy" />;
const AboutSettings = () => <SystemManagement section="about" />;

export default function apply(ctx: DashboardContext) {
  ctx.frame({
    id: "settings",
    path: "/settings",
    component: SettingsWorkspace,
  });
  ctx.page({ frame: "settings", path: "/settings/system", component: ProxySettings });
  ctx.page({ frame: "settings", path: "/settings/theme", component: ThemeSettings });
  ctx.page({ frame: "settings", path: "/settings/about", component: AboutSettings });
  ctx.nav({ id: "settings-system", label: "网络代理", path: "/settings/system", icon: SettingsIcon, order: 70, scope: "settings", group: "system" });
  ctx.nav({ id: "settings-theme", label: "主题设置", path: "/settings/theme", icon: Palette, order: 90, scope: "settings", group: "system" });
  ctx.nav({ id: "settings-about", label: "软件信息", path: "/settings/about", icon: Shield, order: 100, scope: "settings", group: "system" });
}
