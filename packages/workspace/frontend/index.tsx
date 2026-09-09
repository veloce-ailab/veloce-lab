import type { DashboardContext } from "@velocelab/dashboard/frontend"
import AdvancedChatFiles from "./pages/AdvancedChatFiles"

export default function apply(ctx: DashboardContext) {
  ctx.route({ path: "/chat/files", component: AdvancedChatFiles })
}
