import { Context } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/sidebar";
import "@velocelab/advanced-chat";

export const depend = ["dashboard", "sidebar", "advanced-chat"];
export const provide = ["chat-files"];

export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/chat-files.js", import.meta.url).pathname,
    plugin: "chat-files",
  });
}
