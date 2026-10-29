import { FolderOpen } from "lucide-react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import Explorer from "./pages/Explorer"

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.tab-types", (props) => {
    const data = props as { onCreateTab?: (type: string, label: string) => void }
    return <button type="button" className="flex w-full items-center gap-2 rounded-md border border-border bg-card p-3 text-left text-sm font-medium hover:bg-muted" onClick={() => data.onCreateTab?.("explorer", "文件浏览")}><FolderOpen size={16} />文件浏览</button>
  }, "explorer.tab-type", 20, "/chat")
  ctx.slot("chat.sidebar.tab-content", Explorer, "explorer.tab-content", 20, "/chat")
}
