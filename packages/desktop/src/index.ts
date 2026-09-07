import { Context } from "yumeri";
import "@velocelab/dashboard";
export const depend = ["dashboard"];
export const provide = ["desktop"];
export function apply(ctx: Context) { ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/desktop.js", import.meta.url).pathname, plugin: "desktop" }); }
