import { useEffect, useSyncExternalStore, useState } from "react"
import { PanelRightClose, PanelRightOpen, X } from "lucide-react"
import { api, Button, DashboardSlot, ResizableSidebar, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"

let open = true
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => open
function useOpen() { return useSyncExternalStore(subscribe, snapshot, snapshot) }

type Tab = { id: string; type: string; label: string; state?: Record<string, unknown> }
type SidebarProps = Record<string, unknown> & { session?: { id?: string } }

function SidebarToggle(props: Record<string, unknown>) {
  const visible = useOpen()
  const { language } = useI18n()
  if (!(props as SidebarProps).session?.id) return null
  const label = language === "zh" ? (visible ? "收起侧边栏" : "展开侧边栏") : (visible ? "Close sidebar" : "Open sidebar")
  return <Button variant="outline" size="icon" className="hidden h-9 w-9 border-border bg-background lg:inline-flex" onClick={() => { open = !open; listeners.forEach((listener) => listener()) }} aria-label={label} title={label} aria-expanded={visible} aria-controls="chat-right-sidebar">{visible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</Button>
}

function Sidebar(data: Record<string, unknown>) {
  const sessionID = (data as SidebarProps).session?.id || ""
  const visible = useOpen()
  const { language } = useI18n()
  const zh = language === "zh"
  const [activeTab, setActiveTab] = useState("home")
  const [tabs, setTabs] = useState<Tab[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    setTabs([]); setActiveTab("home"); setReady(false)
    if (!sessionID) return () => { active = false }
    void api.get("/sidebar/tabs", { params: { session_id: sessionID } }).then(({ data: result }) => {
      if (!active) return
      setTabs(Array.isArray(result.tabs) ? result.tabs : [])
      setActiveTab(result.activeTab || "home")
    }).catch(() => { if (active) { setTabs([]); setActiveTab("home") } }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [sessionID])
  const selectTab = (id: string) => { setActiveTab(id); if (sessionID) void api.put("/sidebar/tabs/active", { session_id: sessionID, active_tab: id }) }
  const createTab = async (type: string, label: string, state: Record<string, unknown> = {}, requestedID?: string) => {
    if (!sessionID) return ""
    const { data: tab } = await api.post("/sidebar/tabs", { id: requestedID, session_id: sessionID, type, label, state })
    setTabs((current) => [...current, tab]); setActiveTab(tab.id)
    return tab.id as string
  }
  const updateTab = async (id: string, state: Record<string, unknown>, label?: string) => {
    if (!sessionID) return
    const { data: updated } = await api.put(`/sidebar/tabs/${encodeURIComponent(id)}`, { session_id: sessionID, state, label })
    setTabs((current) => current.map((tab) => tab.id === id ? updated : tab))
  }
  const closeTab = async (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id)
    await api.delete(`/sidebar/tabs/${encodeURIComponent(id)}`, { params: { session_id: sessionID } })
    setTabs((current) => current.filter((tab) => tab.id !== id))
    if (activeTab === id) selectTab(tabs[index - 1]?.id ?? tabs[index + 1]?.id ?? "home")
  }
  if (!sessionID) return null
  const active = tabs.find((tab) => tab.id === activeTab)
  const tabData = { ...data, activeTab, tabs, activeTabState: active?.state ?? {}, onSelectTab: selectTab, onCreateTab: createTab, onUpdateTab: updateTab, onCloseTab: closeTab }
  return <ResizableSidebar storageKey="chat-workspace" side="right" defaultWidth={288} minWidth={240} maxWidth={560} className={visible ? "hidden h-full min-h-0 lg:flex" : "hidden h-full min-h-0"}>
    <aside id="chat-right-sidebar" className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-muted/20 p-3">
      <div className="mb-3 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border pb-2" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === "home"} className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === "home" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => selectTab("home")}>{zh ? "主页" : "Home"}</button>
        {tabs.map((tab) => <span key={tab.id} className={`flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><button type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => selectTab(tab.id)}>{tab.label}</button><button type="button" aria-label={zh ? "关闭标签页" : "Close tab"} title={zh ? "关闭标签页" : "Close tab"} onClick={() => void closeTab(tab.id)}><X size={13} /></button></span>)}
        <button type="button" role="tab" aria-selected={activeTab === "new"} className={`flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} onClick={() => selectTab("new")}>{zh ? "新建" : "New"}</button>
      </div>
      <DashboardSlot name="chat.sidebar.panels" scope="/chat" data={tabData} className={activeTab === "home" ? "flex min-h-0 flex-col gap-3" : "hidden"} />
      <DashboardSlot name="chat.sidebar.tab-types" scope="/chat" data={tabData} className={activeTab === "new" ? "flex min-h-0 flex-col gap-2" : "hidden"} />
      {ready && <DashboardSlot name="chat.sidebar.tab-content" scope="/chat" data={tabData} className={activeTab !== "home" && activeTab !== "new" ? "flex min-h-0 flex-1 flex-col gap-3" : "hidden"} />}
    </aside>
  </ResizableSidebar>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("frame.right-sidebar", Sidebar, "sidebar.chat", 0, "/chat")
  ctx.slot("chat.toolbar.sidebar", SidebarToggle, "sidebar.toggle", 0, "/chat")
}
