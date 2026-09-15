import { Compass } from "lucide-react";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import GuideHint from "./components/GuideHint";
import GuideSettings from "./pages/GuideSettings";

const GENERAL = { scope: "settings", group: { id: "general", labelKey: "settings.group.general", order: 10 } } as const;

/**
 * The setup guide owns one page and one insertion into a page owned by someone
 * else. The second half is the point: the plugin page publishes
 * `settings.plugins.before`, so guidance can meet the user where the work
 * happens instead of waiting on a page of its own.
 */
export default function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/guide",
    component: GuideSettings,
    nav: { id: "guide.settings", labelKey: "guide.title", icon: Compass, order: 5, ...GENERAL },
  });
  ctx.slot("settings.plugins.before", GuideHint, "guide.plugins.hint", 10);
}
