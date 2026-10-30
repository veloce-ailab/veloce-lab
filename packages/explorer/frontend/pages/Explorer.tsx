import { useEffect, useMemo, useState, type FormEvent } from "react"
import Editor, { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { ChevronRight, Code2, Edit3, File, Folder, FolderOpen, MonitorUp, Save, Search, TerminalSquare, X } from "lucide-react"
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, api, useI18n, useTheme, useToast } from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"
import { workspaceBreadcrumbs } from "../path"

loader.config({ monaco })

interface Entry { name: string; path: string; type: string; size: number }
interface Tab { id: string; type: string }

export default function Explorer(props: Record<string, unknown>) {
  const data = props as ChatSlotData & { activeTab?: string; tabs?: Tab[]; activeTabState?: Record<string, unknown>; onCloseTab?: (id: string) => void }
  const active = data.tabs?.find((tab) => tab.id === data.activeTab)
  if (active?.type !== "explorer") return null
  return <ExplorerView data={data} />
}

function ExplorerView({ data }: { data: ChatSlotData & { activeTab?: string; tabs?: Tab[]; activeTabState?: Record<string, unknown>; onUpdateTab?: (id: string, state: Record<string, unknown>) => Promise<void>; onCloseTab?: (id: string) => void } }) {
  const { language } = useI18n()
  const { resolvedTheme } = useTheme()
  const { success, error } = useToast()
  const zh = language === "zh"
  const root = data.session?.connector_workspace_path || ""
  const deviceID = data.session?.connector_device_id || data.device?.id || ""
  const [currentPath, setCurrentPath] = useState(String(data.activeTabState?.path || root))
  const [pathInput, setPathInput] = useState(String(data.activeTabState?.path || root))
  const [search, setSearch] = useState(String(data.activeTabState?.search || ""))
  const [entries, setEntries] = useState<Entry[]>([])
  const [searchEntries, setSearchEntries] = useState<Entry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<{ path: string; content: string; dirty: boolean } | null>(null)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { if (root) { const next = String(data.activeTabState?.path || root); setHydrated(false); setCurrentPath(next); setPathInput(next); setSearch(String(data.activeTabState?.search || "")); void loadDirectory(next).finally(() => setHydrated(true)) } }, [root, deviceID, data.activeTab])
  useEffect(() => { if (hydrated && data.activeTab && data.onUpdateTab && root) void data.onUpdateTab(data.activeTab, { path: currentPath, search }) }, [currentPath, search, hydrated])
  const loadDirectory = async (path: string) => {
    if (!deviceID || !path) return
    setLoading(true)
    try { const result = (await api.get("/explorer/list", { params: { device_id: deviceID, workspace_path: root, path } })).data; setEntries((result.entries ?? []).sort((a: Entry, b: Entry) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name))) } catch (cause) { error(apiError(cause, zh ? "无法读取目录" : "Could not read directory")) } finally { setLoading(false) }
  }
  const breadcrumbs = useMemo(() => workspaceBreadcrumbs(root, currentPath), [root, currentPath])
  const visibleEntries = search.trim().length >= 2 ? searchEntries ?? [] : entries
  useEffect(() => {
    const needle = search.trim()
    if (needle.length < 2 || !root || !deviceID) { setSearchEntries(null); return }
    let active = true
    const timer = window.setTimeout(() => { void api.get("/explorer/search", { params: { device_id: deviceID, workspace_path: root, query: needle } }).then(({ data: result }) => { if (active) setSearchEntries(result.entries ?? []) }).catch((cause) => { if (active) { setSearchEntries([]); error(apiError(cause, zh ? "搜索失败" : "Search failed")) } }) }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [search, root, deviceID])
  const goToPath = (event: FormEvent) => { event.preventDefault(); const raw = pathInput.trim(); if (!raw) return; const next = raw.startsWith(root) ? raw : `${root.replace(/\/$/, "")}/${raw.replace(/^\/+/, "")}`; setCurrentPath(next); void loadDirectory(next) }
  const readFile = async (entry: Entry) => { setOpenPath(entry.path); try { const result = (await api.get("/explorer/read", { params: { device_id: deviceID, workspace_path: root, path: entry.path } })).data; setEditor({ path: entry.path, content: result.content ?? "", dirty: false }) } catch (cause) { setOpenPath(null); error(apiError(cause, zh ? "文件无法编辑，可能是二进制文件" : "This file cannot be edited; it may be binary")) } }
  const save = async () => { if (!editor) return; try { await api.post("/explorer/write", { device_id: deviceID, workspace_path: root, path: editor.path, content: editor.content }); setEditor({ ...editor, dirty: false }); success(zh ? "文件已保存" : "File saved") } catch (cause) { error(apiError(cause, zh ? "保存失败" : "Save failed")) } }
  const openLocal = async (action: string, path = currentPath) => { try { await api.post("/explorer/open", { action, device_id: deviceID, workspace_path: root, path }); success(zh ? "已打开" : "Opened") } catch (cause) { error(apiError(cause, zh ? "打开失败" : "Could not open")) } }
  if (!root || !data.device?.online) return <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">{zh ? "请先选择在线设备和工作区。" : "Select an online device and workspace first."}</div>
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
      {breadcrumbs.map((crumb, index) => <span key={crumb.path} className="flex items-center gap-1 text-xs"><button type="button" className="max-w-32 truncate hover:text-primary" onClick={() => { setCurrentPath(crumb.path); setPathInput(crumb.path); void loadDirectory(crumb.path) }}>{crumb.label}</button>{index < breadcrumbs.length - 1 && <ChevronRight size={13} className="text-muted-foreground" />}</span>)}
    </div>
    <form className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5" onSubmit={goToPath}><input value={pathInput} onChange={(event) => setPathInput(event.target.value)} className="min-w-36 flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" placeholder={zh ? "输入项目内路径" : "Enter a project path"} aria-label={zh ? "输入项目内路径" : "Enter a project path"} /><Button type="submit" size="sm" variant="outline">{zh ? "打开" : "Open"}</Button><div className="relative flex min-w-36 flex-1 items-center"><Search size={14} className="pointer-events-none absolute left-2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded border bg-background py-1 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring" placeholder={zh ? "搜索项目文件" : "Search project files"} aria-label={zh ? "搜索项目文件" : "Search project files"} /></div></form>
    <div className="flex shrink-0 flex-wrap gap-1 border-b px-2 py-1.5"><Button size="sm" variant="outline" className="gap-1" onClick={() => void openLocal("open_file_manager")}><FolderOpen size={14} />{zh ? "文件管理器" : "File manager"}</Button><Button size="sm" variant="outline" className="gap-1" onClick={() => void openLocal("open_terminal")}><TerminalSquare size={14} />{zh ? "终端" : "Terminal"}</Button><Button size="sm" variant="outline" className="gap-1" onClick={() => void openLocal("open_vscode")}><MonitorUp size={14} />VS Code</Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">{loading ? <p className="p-4 text-sm text-muted-foreground">{zh ? "加载中…" : "Loading…"}</p> : visibleEntries.map((entry) => <div key={entry.path} className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><button type="button" title={entry.path} className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => entry.type === "directory" ? (setCurrentPath(entry.path), setPathInput(entry.path), void loadDirectory(entry.path)) : void readFile(entry)}>{entry.type === "directory" ? <Folder size={15} className="shrink-0 text-primary" /> : <File size={15} className="shrink-0 text-muted-foreground" />}<span className="min-w-0 truncate"><span className="block truncate">{entry.name}</span>{search.trim().length >= 2 && <span className="block truncate text-[11px] text-muted-foreground">{entry.path.startsWith(`${root.replace(/\/$/, "")}/`) ? entry.path.slice(root.replace(/\/$/, "").length + 1) : entry.path}</span>}</span></button>{entry.type !== "directory" && <><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100" title={zh ? "在编辑器打开" : "Open in editor"} onClick={() => void openLocal("open_vscode", entry.path)}><Code2 size={14} /></Button><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100" title={zh ? "编辑文件" : "Edit file"} onClick={() => void readFile(entry)}><Edit3 size={14} /></Button><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100" title={zh ? "添加到聊天" : "Add to chat"} onClick={() => data.addFileToPrompt?.(entry.path)}><File size={14} /></Button></>}</div>)}</div>
    <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) { setEditor(null); setOpenPath(null) } }}><DialogContent className="max-w-5xl overflow-hidden bg-popover p-0 text-popover-foreground"><DialogHeader className="border-b px-5 py-3"><DialogTitle className="truncate text-sm">{openPath}</DialogTitle></DialogHeader>{editor && <Editor height="65vh" path={editor.path} value={editor.content} theme={resolvedTheme === "dark" ? "vs-dark" : "vs"} onChange={(value) => setEditor({ ...editor, content: value ?? "", dirty: true })} onMount={(instance) => instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save())} options={{ minimap: { enabled: false }, wordWrap: "on", automaticLayout: true }} />}{editor && <DialogFooter className="border-t bg-popover px-5 py-3"><Button variant="outline" onClick={() => { setEditor(null); setOpenPath(null) }}><X size={15} />{zh ? "关闭" : "Close"}</Button><Button disabled={!editor.dirty} onClick={() => void save()} className="gap-1"><Save size={15} />{zh ? "保存" : "Save"}</Button></DialogFooter>}</DialogContent></Dialog>
  </div>
}

function apiError(cause: unknown, fallback: string) { return (cause as { response?: { data?: { error?: string } } }).response?.data?.error || fallback }
