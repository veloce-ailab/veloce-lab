import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowLeft, ArrowRight, LoaderCircle, MoreVertical, RotateCw, Search } from "lucide-react"
import { api, type DashboardContext, useI18n } from "@velocelab/dashboard/frontend"

interface BrowserTab { id: string; title: string; url: string; history: string; history_index: number }
type TabProps = { activeTab?: string; tabs?: Array<{ id: string; type: string }>; onCreateTab?: (type: string, label: string, id?: string) => void; onCloseTab?: (id: string) => void }

function BrowserRestore(props: Record<string, unknown>) {
  const data = props as TabProps
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void api.get("/browser/tabs").then((response) => {
      for (const tab of (response.data as BrowserTab[]).filter((item) => !(data.tabs || []).some((existing) => existing.id === item.id))) data.onCreateTab?.("browser", tab.title || "浏览器", tab.id)
    }).catch(() => {})
  }, [])
  return null
}

function BrowserTabType(props: Record<string, unknown>) {
  const data = props as TabProps
  const { language } = useI18n()
  const label = language === "zh" ? "浏览器" : "Browser"
  const create = async () => {
    const result = await api.post("/browser/tabs", { title: language === "zh" ? "新标签页" : "New tab", url: "about:blank" })
    data.onCreateTab?.("browser", label, String(result.data.id))
  }
  return <button type="button" className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => void create()}><Search size={16} />{label}</button>
}

function BrowserContent(props: Record<string, unknown>) {
  const data = props as TabProps
  const { language } = useI18n()
  const active = (data.tabs || []).find((tab) => tab.id === data.activeTab && tab.type === "browser")
  const [tab, setTab] = useState<BrowserTab | null>(null)
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!active) return
    setBusy(true)
    void api.get(`/browser/tabs/${encodeURIComponent(active.id)}`).then((response) => setTab(response.data)).catch(() => setTab(null)).finally(() => setBusy(false))
  }, [active?.id])
  useEffect(() => { setAddress(tab?.url === "about:blank" ? "" : tab?.url || "") }, [tab?.url])
  if (!active) return null
  const update = async (input: Record<string, unknown>) => {
    if (!tab) return
    setBusy(true)
    try { const result = await api.put(`/browser/tabs/${encodeURIComponent(tab.id)}`, input); setTab(result.data as BrowserTab) }
    finally { if (input.reload) setReloadKey((value) => value + 1) }
  }
  const navigate = (event: FormEvent) => { event.preventDefault(); if (address.trim()) void update({ navigate: address.trim() }) }
  const close = async () => { if (!tab) return; await api.delete(`/browser/tabs/${encodeURIComponent(tab.id)}`); data.onCloseTab?.(tab.id) }
  const isZh = language === "zh"
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground" onClick={() => menu && setMenu(false)}>
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
      <div className="flex shrink-0 items-center rounded-full border border-border bg-muted p-1">
        <button type="button" className="grid size-8 place-items-center rounded-full disabled:opacity-35" disabled={!tab || Number(tab.history_index) <= 0 || busy} title={isZh ? "后退" : "Back"} onClick={() => void update({ step: "back" })}><ArrowLeft size={17} /></button>
        <button type="button" className="grid size-8 place-items-center rounded-full disabled:opacity-35" disabled={!tab || Number(tab.history_index) >= JSON.parse(tab.history || "[]").length - 1 || busy} title={isZh ? "前进" : "Forward"} onClick={() => void update({ step: "forward" })}><ArrowRight size={17} /></button>
        <button type="button" className="grid size-8 place-items-center rounded-full" title={isZh ? "重新加载" : "Reload"} onClick={() => { setBusy(true); setReloadKey((value) => value + 1) }}><RotateCw size={17} className={busy ? "animate-spin" : ""} /></button>
      </div>
      <form onSubmit={navigate} className="flex h-10 min-w-0 flex-1 items-center rounded-full border border-border bg-muted px-4 focus-within:ring-1 focus-within:ring-ring">
        <input value={address} onChange={(event) => setAddress(event.target.value)} className="min-w-0 flex-1 bg-transparent text-center text-sm outline-none placeholder:text-muted-foreground" placeholder={isZh ? "搜索或输入网址" : "Search or enter address"} aria-label={isZh ? "搜索或输入网址" : "Search or enter address"} />
        {busy ? <LoaderCircle size={16} className="animate-spin text-muted-foreground" /> : null}
      </form>
      <div className="relative shrink-0">
        <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-muted" title={isZh ? "浏览器菜单" : "Browser menu"} onClick={(event) => { event.stopPropagation(); setMenu(!menu) }}><MoreVertical size={19} /></button>
        {menu && <div className="absolute right-0 top-11 z-20 w-56 border border-border bg-popover p-1 text-sm shadow-lg" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setMenu(false); frame.current?.contentWindow?.postMessage({ type: "browser-find" }, "*") }}>{isZh ? "在页面中查找" : "Find in page"}</button>
          <div className="my-1 border-t border-border" />
          <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setMenu(false); void close() }}>{isZh ? "关闭标签页" : "Close tab"}</button>
        </div>}
      </div>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
      {tab?.url && tab.url !== "about:blank" && <iframe ref={frame} key={`${tab.id}:${tab.url}:${reloadKey}`} src={tab.url} title={tab.title || "Browser"} className="size-full border-0 bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-downloads" onLoad={() => setBusy(false)} />}
    </div>
  </div>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", BrowserRestore, "browser.restore", 40, "/chat")
  ctx.slot("chat.sidebar.tab-types", BrowserTabType, "browser.tab-type", 40, "/chat")
  ctx.slot("chat.sidebar.tab-content", BrowserContent, "browser.tab-content", 40, "/chat")
}
