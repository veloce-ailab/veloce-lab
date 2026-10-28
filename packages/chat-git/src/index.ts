import { Context } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/sidebar";
import "@velocelab/advanced-chat";
import "@velocelab/workspace";

export const depend = ["dashboard", "sidebar", "advanced-chat", "workspace"];
export const provide = ["chat-git"];

export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/chat-git.js", import.meta.url).pathname,
    plugin: "chat-git",
  });
}
