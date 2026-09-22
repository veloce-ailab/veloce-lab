import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { Users } from "lucide-react"
import Community from "./pages/Community"

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "chat",
    path: "/chat/community",
    component: Community,
    nav: { id: "chat-community", label: "社区", icon: Users, order: 10, scope: "chat", group: "direct" },
  })
  ctx.page({ frame: "chat", path: "/chat/community/characters/:id", component: Community })
  ctx.page({ frame: "chat", path: "/chat/community/knowledge-bases/:knowledgeBaseID", component: Community })
  ctx.page({ frame: "chat", path: "/chat/community/skills/:skillID", component: Community })
}

export default apply
