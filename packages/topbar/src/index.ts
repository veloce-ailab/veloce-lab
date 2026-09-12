import { Context } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["topbar"];

/**
 * Owns the application top bar. Frames draw their own chrome and sidebar and
 * simply render the `frame.topbar` slot, so brand, top navigation, theme and
 * language switchers and the account entry live here instead of being copied
 * into every frame.
 */
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    id: "topbar",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/topbar.js", import.meta.url).pathname,
    plugin: "topbar",
  });
}
