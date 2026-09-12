import type { DashboardContext } from "@velocelab/dashboard/frontend";
import TopBar, { topBarComponent } from "./TopBar";

/** Slot every frame renders at the top of its layout. */
export const topBarSlot = "frame.topbar";

export function apply(ctx: DashboardContext) {
  ctx.slot(topBarSlot, topBarComponent, "topbar", 10);
}

export default apply;
