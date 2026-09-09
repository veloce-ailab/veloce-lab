import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { SettingsWorkspace } from "@velocelab/dashboard/frontend";
import { Palette, Settings as SettingsIcon, Shield, UserCircle } from "lucide-react";

export default function apply(ctx: DashboardContext) {
  ctx.route({
    path: "/settings/*",
    component: SettingsWorkspace,
    shell: "owned",
  });
  ctx.nav({ id: "settings-profile", label: "账户", path: "/settings/profile", icon: UserCircle, order: 20, scope: "settings", group: "general" });
  ctx.nav({ id: "settings-security", label: "安全", path: "/settings/security", icon: Shield, order: 30, scope: "settings", group: "general" });
  ctx.nav({ id: "settings-system", label: "网络代理", path: "/settings/system", icon: SettingsIcon, order: 70, scope: "settings", group: "system" });
  ctx.nav({ id: "settings-theme", label: "主题设置", path: "/settings/theme", icon: Palette, order: 90, scope: "settings", group: "system" });
  ctx.nav({ id: "settings-about", label: "软件信息", path: "/settings/about", icon: Shield, order: 100, scope: "settings", group: "system" });
}
