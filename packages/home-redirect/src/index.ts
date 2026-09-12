import { Context } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["home-redirect"];

/**
 * Sends the site root to the chat frame. Which frames exist is decided by the
 * packages that own them, so this plugin only claims `/` and points at one.
 */
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    id: "home-redirect",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/home-redirect.js", import.meta.url).pathname,
    plugin: "home-redirect",
  });
}
