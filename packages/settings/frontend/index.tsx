import { Palette, Settings as SettingsIcon, Shield } from "lucide-react";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import SettingsWorkspace from "./pages/SettingsWorkspace";
import SystemSettings from "./pages/SystemSettings";
import ThemeSettings from "./pages/ThemeSettings";

const ProxySettings = () => <SystemSettings section="proxy" />;
const AboutSettings = () => <SystemSettings section="about" />;
const SCOPE = { scope: "settings", group: "system" } as const;

/**
 * The settings plugin owns the settings shell and the platform-level settings
 * pages. Capability plugins contribute their own pages and navigation items to
 * the same frame instead of being rendered by this package.
 */
export default function apply(ctx: DashboardContext) {
  ctx.frame({
    id: "settings",
    path: "/settings",
    component: SettingsWorkspace,
  });
  ctx.page({
    frame: "settings",
    path: "/settings/system",
    component: ProxySettings,
    nav: { id: "settings-system", labelKey: "settings.proxy", icon: SettingsIcon, order: 70, ...SCOPE },
  });
  ctx.page({
    frame: "settings",
    path: "/settings/theme",
    component: ThemeSettings,
    nav: { id: "settings-theme", labelKey: "settings.theme", icon: Palette, order: 90, ...SCOPE },
  });
  ctx.page({
    frame: "settings",
    path: "/settings/about",
    component: AboutSettings,
    nav: { id: "settings-about", labelKey: "settings.about", icon: Shield, order: 100, ...SCOPE },
  });
}
