import { Context } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/sidebar";
import "@velocelab/advanced-chat";

export const depend = ["dashboard", "sidebar", "advanced-chat"];
export const provide = ["chat-terminal"];

export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/chat-terminal.js", import.meta.url).pathname,
    plugin: "chat-terminal",
  });
}
