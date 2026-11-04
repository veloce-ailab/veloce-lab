import { useEffect, useSyncExternalStore, useState } from "react"
import { PanelRightClose, PanelRightOpen, X } from "lucide-react"
import { api, Button, DashboardSlot, isDesktopTarget, ResizableSidebar, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"

let open = false
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
  const label = language === "zh" ? (visible ? "收起工具" : "工具") : (visible ? "Close tools" : "Tools")
  return <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { open = !open; listeners.forEach((listener) => listener()) }} aria-label={label} title={label} aria-expanded={visible} aria-controls="chat-right-sidebar">{visible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</Button>
}

function Sidebar(data: Record<string, unknown>) {
  const sessionID = (data as SidebarProps).session?.id || ""
  const visible = useOpen()
  const { language } = useI18n()
  const zh = language === "zh"
  const desktop = isDesktopTarget()
  const topOffset = desktop ? "top-12" : "top-16"
  const panelHeight = desktop ? "h-[calc(100dvh-3rem)] max-h-[calc(100dvh-3rem)]" : "h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)]"
  useEffect(() => {
    if (!visible) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      open = false
      listeners.forEach((listener) => listener())
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [visible])
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
  return <>
    {visible && <button type="button" className={`fixed inset-x-0 bottom-0 ${topOffset} z-40 cursor-default bg-foreground/15 backdrop-blur-[1px] min-[1280px]:hidden`} aria-label={zh ? "关闭工具" : "Close tools"} onClick={() => { open = false; listeners.forEach((listener) => listener()) }} />}
    <ResizableSidebar storageKey="chat-workspace" side="right" defaultWidth={320} minWidth={288} maxWidth={400} className={visible ? `fixed ${topOffset} bottom-0 right-0 z-50 flex ${panelHeight} max-w-[min(88vw,24rem)] shadow-xl min-[1280px]:relative min-[1280px]:inset-auto min-[1280px]:z-auto min-[1280px]:h-full min-[1280px]:max-h-none min-[1280px]:max-w-none min-[1280px]:shadow-none` : "hidden h-full min-h-0"}>
    <aside id="chat-right-sidebar" className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-background p-3">
      <div className="mb-3 flex shrink-0 items-center justify-between border-b border-border pb-2 min-[1280px]:hidden">
        <span className="text-sm font-semibold">{zh ? "工具" : "Tools"}</span>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={zh ? "关闭工具" : "Close tools"} onClick={() => { open = false; listeners.forEach((listener) => listener()) }}><X size={16} /></Button>
      </div>
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
  </>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("frame.right-sidebar", Sidebar, "sidebar.chat", 0, "/chat")
  ctx.slot("chat.toolbar.sidebar", SidebarToggle, "sidebar.toggle", 0, "/chat")
}
