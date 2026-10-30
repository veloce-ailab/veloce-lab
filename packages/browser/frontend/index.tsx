import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowLeft, ArrowRight, LoaderCircle, MoreVertical, RotateCw, Search } from "lucide-react"
import { type DashboardContext, useI18n } from "@velocelab/dashboard/frontend"

type BrowserState = { url?: string; history?: string[]; historyIndex?: number }
type TabProps = { activeTab?: string; activeTabState?: BrowserState; tabs?: Array<{ id: string; type: string }>; session?: { id?: string }; onCreateTab?: (type: string, label: string, state?: Record<string, unknown>, id?: string) => Promise<string>; onUpdateTab?: (id: string, state: Record<string, unknown>) => Promise<void> }

function BrowserTabType(props: Record<string, unknown>) {
  const data = props as TabProps
  const { language } = useI18n()
  const label = language === "zh" ? "浏览器" : "Browser"
  const create = async () => {
    const id = crypto.randomUUID()
    return data.onCreateTab?.("browser", label, { url: "about:blank", history: ["about:blank"], historyIndex: 0 }, id)
  }
  return <button type="button" className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => void create()}><Search size={16} />{label}</button>
}

function BrowserContent(props: Record<string, unknown>) {
  const data = props as TabProps
  const { language } = useI18n()
  const active = (data.tabs || []).find((tab) => tab.id === data.activeTab && tab.type === "browser")
  const state = data.activeTabState || {}
  const history = Array.isArray(state.history) ? state.history : ["about:blank"]
  const index = Math.max(0, Math.min(history.length - 1, Number(state.historyIndex) || 0))
  const url = String(state.url || history[index] || "about:blank")
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => setAddress(url === "about:blank" ? "" : url), [active?.id, url])
  if (!active) return null
  const save = (nextHistory: string[], nextIndex: number) => {
    const nextURL = nextHistory[nextIndex] || "about:blank"
    void data.onUpdateTab?.(active.id, { url: nextURL, history: nextHistory, historyIndex: nextIndex })
  }
  const navigate = (event: FormEvent) => {
    event.preventDefault()
    const value = address.trim()
    if (!value) return
    const target = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`
    const next = history.slice(0, index + 1).concat(target)
    save(next, next.length - 1)
  }
  const isZh = language === "zh"
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground" onClick={() => menu && setMenu(false)}>
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
      <div className="flex shrink-0 items-center rounded-full border border-border bg-muted p-1">
        <button type="button" className="grid size-8 place-items-center rounded-full disabled:opacity-35" disabled={index <= 0 || busy} title={isZh ? "后退" : "Back"} onClick={() => save(history, Math.max(0, index - 1))}><ArrowLeft size={17} /></button>
        <button type="button" className="grid size-8 place-items-center rounded-full disabled:opacity-35" disabled={index >= history.length - 1 || busy} title={isZh ? "前进" : "Forward"} onClick={() => save(history, Math.min(history.length - 1, index + 1))}><ArrowRight size={17} /></button>
        <button type="button" className="grid size-8 place-items-center rounded-full" title={isZh ? "重新加载" : "Reload"} onClick={() => { setBusy(true); setReloadKey((value) => value + 1) }}><RotateCw size={17} className={busy ? "animate-spin" : ""} /></button>
      </div>
      <form onSubmit={navigate} className="flex h-10 min-w-0 flex-1 items-center rounded-full border border-border bg-muted px-4 focus-within:ring-1 focus-within:ring-ring">
        <input value={address} onChange={(event) => setAddress(event.target.value)} className="min-w-0 flex-1 bg-transparent text-center text-sm outline-none placeholder:text-muted-foreground" placeholder={isZh ? "搜索或输入网址" : "Search or enter address"} aria-label={isZh ? "搜索或输入网址" : "Search or enter address"} />
        {busy ? <LoaderCircle size={16} className="animate-spin text-muted-foreground" /> : null}
      </form>
      <div className="relative shrink-0">
        <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-muted" title={isZh ? "浏览器菜单" : "Browser menu"} onClick={(event) => { event.stopPropagation(); setMenu(!menu) }}><MoreVertical size={19} /></button>
        {menu && <div className="absolute right-0 top-11 z-20 w-56 border border-border bg-popover p-1 text-sm shadow-lg" onClick={(event) => event.stopPropagation()}><button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setMenu(false); frame.current?.contentWindow?.postMessage({ type: "browser-find" }, "*") }}>{isZh ? "在页面中查找" : "Find in page"}</button></div>}
      </div>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden bg-white">{url !== "about:blank" && <iframe ref={frame} key={`${active.id}:${url}:${reloadKey}`} src={url} title="Browser" className="size-full border-0 bg-white" sandbox="allow-forms allow-scripts allow-same-origin allow-downloads" onLoad={() => setBusy(false)} />}</div>
  </div>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.tab-types", BrowserTabType, "browser.tab-type", 40, "/chat")
  ctx.slot("chat.sidebar.tab-content", BrowserContent, "browser.tab-content", 40, "/chat")
}
