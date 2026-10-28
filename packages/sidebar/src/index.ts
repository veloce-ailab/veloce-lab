import { Context } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["sidebar"];

declare module "yumeri" { interface Components { sidebar: Record<string, never> } }

export function apply(ctx: Context) {
  ctx.registerComponent("sidebar", {});
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/sidebar.js", import.meta.url).pathname,
    plugin: "sidebar",
  });
}
