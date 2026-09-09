import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { FileText } from "lucide-react"
import AdvancedChatFiles from "./pages/AdvancedChatFiles"

export default function apply(ctx: DashboardContext) {
  ctx.route({ path: "/chat/files", component: AdvancedChatFiles })
  ctx.nav({ id: "chat-files", label: "文件库", path: "/chat/files", icon: FileText, order: 10, scope: "chat", group: "library" })
}
