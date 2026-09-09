import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { SettingsWorkspace } from "@velocelab/dashboard/frontend";

export default function apply(ctx: DashboardContext) {
  ctx.route({
    path: "/settings/*",
    component: SettingsWorkspace,
    shell: "owned",
  });
}
