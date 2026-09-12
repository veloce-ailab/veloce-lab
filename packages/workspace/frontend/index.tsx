import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { FileText } from "lucide-react"
import AdvancedChatFiles from "./pages/AdvancedChatFiles"

export default function apply(ctx: DashboardContext) {
  ctx.page({ frame: "chat", path: "/chat/files", component: AdvancedChatFiles, nav: { id: "chat-files", label: "文件库", icon: FileText, order: 10, scope: "chat", group: "library" } })
}
