import { useSyncExternalStore } from "react"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { Button, DashboardSlot, ResizableSidebar, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"

let open = true
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => open
function useOpen() { return useSyncExternalStore(subscribe, snapshot, snapshot) }

function SidebarToggle() {
  const visible = useOpen()
  const { language } = useI18n()
  const label = language === "zh" ? (visible ? "收起侧边栏" : "展开侧边栏") : (visible ? "Close sidebar" : "Open sidebar")
  return <Button variant="outline" size="icon" className="hidden h-9 w-9 border-border bg-background lg:inline-flex" onClick={() => { open = !open; listeners.forEach((listener) => listener()) }} aria-label={label} title={label} aria-expanded={visible} aria-controls="chat-right-sidebar">
    {visible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
  </Button>
}

function Sidebar(data: Record<string, unknown>) {
  const visible = useOpen()
  // Keep panels mounted when folded so pending approvals and terminal sessions survive.
  return <ResizableSidebar storageKey="chat-workspace" side="right" defaultWidth={288} minWidth={240} maxWidth={560} className={visible ? "hidden h-full min-h-0 lg:flex" : "hidden h-full min-h-0"}>
    <aside id="chat-right-sidebar" className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-muted/20 p-3">
      <DashboardSlot name="chat.sidebar.panels" scope="/chat" data={data} className="flex min-h-0 flex-col gap-3" />
    </aside>
  </ResizableSidebar>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("frame.right-sidebar", Sidebar, "sidebar.chat", 0, "/chat")
  ctx.slot("chat.toolbar.sidebar", SidebarToggle, "sidebar.toggle", 0, "/chat")
}
