import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { Image as ImageIcon } from "lucide-react"
import ImageStudio from "./pages/ImageStudio"

export default function apply(ctx: DashboardContext) {
  // Beside the file library, because everything generated here ends up there.
  ctx.page({
    frame: "chat",
    path: "/chat/images",
    component: ImageStudio,
    nav: { id: "chat-images", label: "图片生成", icon: ImageIcon, order: 30, scope: "chat", group: "library" },
  })
}
