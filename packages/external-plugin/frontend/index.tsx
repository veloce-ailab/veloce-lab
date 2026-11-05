import { Puzzle, type DashboardContext } from "@velocelab/dashboard/frontend";
import ExternalPlugins from "./pages/ExternalPlugins";

export function apply(ctx: DashboardContext) {
  // Per-user, so it belongs with the user's own settings rather than the
  // instance-wide plugin list: every user points at their own marketplaces.
  ctx.page({
    frame: "settings",
    path: "/settings/external-plugins",
    component: ExternalPlugins,
    nav: { id: "external-plugin.title", labelKey: "external-plugin.title", icon: Puzzle, order: 57, scope: "settings", group: { id: "ai", labelKey: "channelAdmin.settingsGroup", order: 20 } },
  });
}

export default apply;
