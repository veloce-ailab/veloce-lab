import { Wrench } from "lucide-react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import ToolsSettings from "./pages/ToolsSettings"

export default function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/tools",
    component: ToolsSettings,
    nav: { id: "settings-tools", labelKey: "tools.title", icon: Wrench, order: 55, scope: "settings", group: { id: "general", labelKey: "settings.group.general", order: 10 } },
  })
}
