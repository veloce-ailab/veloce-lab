import { Context } from "yumeri"
import "@velocelab/dashboard"
import "@velocelab/sidebar"

export const depend = ["dashboard", "sidebar"]
export const provide = ["browser"]

export async function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/browser.js", import.meta.url).pathname, plugin: "browser" })
}
