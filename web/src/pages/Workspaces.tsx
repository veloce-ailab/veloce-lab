import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  Bot, Check, ChevronDown, FilePlus2, FileText, FolderKanban, FolderOpen,
  HardDrive, History, Lightbulb, Loader2, MapPin, MoreHorizontal, PanelRight,
  Plus, Save, Search, Settings2, Sparkles, Wand2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

type WorkspaceFile = { id: string; name: string; content: string; updatedAt: string }
type Workspace = {
  id: string
  name: string
  location: "server" | "device"
  deviceID: string
  path: string
  model: string
  agentID: string
  files: WorkspaceFile[]
}
type AgentOption = { id: string; name: string; defaultModel: string }
type DeviceOption = { id: string; name: string; hostname: string; online: boolean }
type DirectoryOption = { name: string; path: string }
type WorkspaceDraft = { name: string; location: "server" | "device"; deviceID: string; path: string; model: string; agentID: string }

const emptyDraft: WorkspaceDraft = { name: "", location: "server", deviceID: "", path: "", model: "", agentID: "" }

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceID, setSelectedWorkspaceID] = useState("")
  const [selectedFileID, setSelectedFileID] = useState("")
  const [content, setContent] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([])
  const [directoryOptions, setDirectoryOptions] = useState<DirectoryOption[]>([])
  const [isBrowsingDirectories, setIsBrowsingDirectories] = useState(false)
  const [showNewWorkspace, setShowNewWorkspace] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceDraft>(emptyDraft)
  const [newFileName, setNewFileName] = useState("")
  const [activeTab, setActiveTab] = useState("开始")
  const [selectedText, setSelectedText] = useState("")
  const [aiAction, setAIAction] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const workspace = workspaces.find((item) => item.id === selectedWorkspaceID) || workspaces[0]
  const file = workspace?.files.find((item) => item.id === selectedFileID) || workspace?.files[0]
  const selectedAgentName = agentOptions.find((item) => item.id === workspace?.agentID)?.name || workspace?.agentID || "未配置智能体"

  useEffect(() => {
    Promise.all([
      api.get("/user/advanced-chat/workspaces"),
      api.get("/user/catalog"),
      api.get("/user/advanced-chat/agents"),
      api.get("/user/advanced-chat/devices"),
    ]).then(([workspacesRes, catalogRes, agentsRes, devicesRes]) => {
      if (!Array.isArray(workspacesRes.data?.workspaces)) throw new Error("invalid workspace response")
      const loadedWorkspaces = workspacesRes.data.workspaces.map(normalizeWorkspace).filter((item: Workspace) => item.id)
      const models = normalizeModels(catalogRes.data)
      const agents = normalizeAgents(agentsRes.data)
      const devices = normalizeDevices(devicesRes.data)
      setWorkspaces(loadedWorkspaces)
      setModelOptions(models)
      setAgentOptions(agents)
      setDeviceOptions(devices)
      setSelectedWorkspaceID(loadedWorkspaces[0]?.id || "")
      setSelectedFileID(loadedWorkspaces[0]?.files[0]?.id || "")
      setNewWorkspace({ ...emptyDraft, model: models[0] || agents[0]?.defaultModel || "", agentID: agents[0]?.id || "", deviceID: devices[0]?.id || "" })
    }).catch(() => setErrorMessage("无法加载工作区资源，请检查服务端连接和配置"))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (workspace && !workspace.files.some((item) => item.id === selectedFileID)) {
      setSelectedFileID(workspace.files[0]?.id || "")
    }
  }, [selectedFileID, workspace])

  useEffect(() => { setContent(file?.content || "") }, [file?.id, file?.content])

  useEffect(() => {
    if (!workspace || !file || content === file.content) return
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.put(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/files/${encodeURIComponent(file.id)}`, { name: file.name, content })
        const saved = normalizeWorkspaceFile(res.data)
        setWorkspaces((items) => replaceWorkspaceFile(items, workspace.id, saved))
      } catch {
        setErrorMessage("自动保存失败，请点击保存重试")
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [content, file, workspace])

  const selectWorkspace = (item: Workspace) => {
    setSelectedWorkspaceID(item.id)
    setSelectedFileID(item.files[0]?.id || "")
  }

  const selectFile = (item: WorkspaceFile) => {
    setSelectedFileID(item.id)
    setContent(item.content)
  }

  const saveFile = async () => {
    if (!workspace || !file) return
    try {
      const res = await api.put(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/files/${encodeURIComponent(file.id)}`, { name: file.name, content })
      setWorkspaces((items) => replaceWorkspaceFile(items, workspace.id, normalizeWorkspaceFile(res.data)))
    } catch {
      setErrorMessage("文件保存失败，请重试")
    }
  }

  const createWorkspace = async () => {
    const name = newWorkspace.name.trim() || "未命名工作区"
    if (!newWorkspace.model || !newWorkspace.agentID || (newWorkspace.location === "device" && (!newWorkspace.deviceID || !newWorkspace.path.trim()))) {
      setErrorMessage("请选择真实可用的模型、智能体、设备和目录")
      return
    }
    try {
      const res = await api.post("/user/advanced-chat/workspaces", {
        name,
        location: newWorkspace.location,
        device_id: newWorkspace.location === "device" ? newWorkspace.deviceID : "",
        path: newWorkspace.path || (newWorkspace.location === "server" ? `/workspaces/${name}` : ""),
        model: newWorkspace.model,
        agent: newWorkspace.agentID,
      })
      const created = normalizeWorkspace(res.data)
      setWorkspaces((items) => [...items, created])
      setSelectedWorkspaceID(created.id)
      setSelectedFileID(created.files[0]?.id || "")
      setShowNewWorkspace(false)
      setDirectoryOptions([])
      setNewWorkspace({ ...emptyDraft, model: modelOptions[0] || "", agentID: agentOptions[0]?.id || "", deviceID: deviceOptions[0]?.id || "" })
    } catch {
      setErrorMessage("工作区创建失败，请检查所选模型、智能体和设备是否仍然可用")
    }
  }

  const createFile = async () => {
    if (!workspace) return
    const name = `${(newFileName.trim() || "新建文档").replace(/\.md$/i, "")}.md`
    try {
      const res = await api.post(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/files`, { name, content: `# ${name.replace(/\.md$/, "")}\n\n` })
      const created = normalizeWorkspaceFile(res.data)
      setWorkspaces((items) => items.map((item) => item.id === workspace.id ? { ...item, files: [...item.files, created] } : item))
      setSelectedFileID(created.id)
      setContent(created.content)
      setShowNewFile(false)
      setNewFileName("")
    } catch {
      setErrorMessage("文件创建失败，请重试")
    }
  }

  const updateWorkspace = async (patch: Partial<Workspace>) => {
    if (!workspace) return
    try {
      const res = await api.put(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}`, {
        name: patch.name,
        location: patch.location,
        device_id: patch.deviceID,
        path: patch.path,
        model: patch.model,
        agent: patch.agentID,
      })
      const updated = normalizeWorkspace(res.data)
      setWorkspaces((items) => items.map((item) => item.id === updated.id ? updated : item))
    } catch {
      setErrorMessage("工作区设置保存失败，请检查选择是否仍然可用")
    }
  }

  const browseDirectories = async (path = newWorkspace.path) => {
    if (!newWorkspace.deviceID) return
    setIsBrowsingDirectories(true)
    try {
      const res = await api.get("/user/advanced-chat/workspace/directories", { params: { connector_device_id: newWorkspace.deviceID, path } })
      setDirectoryOptions(normalizeDirectories(res.data))
    } catch {
      setErrorMessage("无法读取设备目录，请确认设备在线")
    } finally {
      setIsBrowsingDirectories(false)
    }
  }

  const formatSelection = (prefix: string, suffix = prefix) => {
    const editor = editorRef.current
    if (!editor || !selectedText) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    setContent(content.slice(0, start) + prefix + selectedText + suffix + content.slice(end))
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + prefix.length, end + prefix.length) })
  }

  const runAI = async (action: "polish" | "outline" | "summary") => {
    if (!workspace || !file || aiAction) return
    setAIAction(action)
    try {
      const res = await api.post(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/ai`, { action, content, selection: selectedText })
      const generated = typeof res.data?.content === "string" ? res.data.content.trim() : ""
      if (!generated) throw new Error("empty AI response")
      setContent(action === "polish" ? generated : `${content.trimEnd()}\n\n${generated}\n`)
    } catch {
      setErrorMessage("AI 处理失败，请检查工作区模型、智能体和渠道配置")
    } finally {
      setAIAction("")
    }
  }

  if (isLoading) return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在加载工作区…</div>

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {errorMessage && <div className="flex shrink-0 items-center justify-between border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive"><span>{errorMessage}</span><button type="button" onClick={() => setErrorMessage("")} aria-label="关闭"><X size={14} /></button></div>}
      <WorkspaceHeader workspace={workspace} showAI={showAI} onNewWorkspace={() => setShowNewWorkspace(true)} onNewFile={() => setShowNewFile(true)} onSettings={() => setShowSettings(true)} onToggleAI={() => setShowAI((value) => !value)} />
      <div className="flex min-h-0 flex-1">
        <WorkspaceSidebar workspaces={workspaces} workspace={workspace} file={file} onSelectWorkspace={selectWorkspace} onSelectFile={selectFile} onNewWorkspace={() => setShowNewWorkspace(true)} onNewFile={() => setShowNewFile(true)} />
        <section className="flex min-w-0 flex-1 flex-col">
          {!workspace ? <EmptyWorkspace onCreate={() => setShowNewWorkspace(true)} /> : <>
            <EditorHeader file={file} workspace={workspace} onSelectFile={selectFile} onSave={saveFile} />
            <OfficeToolbar activeTab={activeTab} setActiveTab={setActiveTab} formatSelection={formatSelection} append={(value) => setContent((current) => current + value)} />
            <div className="relative flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative flex-1 overflow-y-auto p-5 sm:p-8">
                  <Textarea ref={editorRef} value={content} onChange={(event) => setContent(event.target.value)} onSelect={(event) => setSelectedText(event.currentTarget.value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd))} onKeyUp={(event) => setSelectedText(event.currentTarget.value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd))} placeholder="开始输入 Markdown…" className="min-h-[420px] w-full rounded-none border-0 bg-transparent p-0 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0" />
                  {selectedText && <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"><ToolButton label="粗体" onClick={() => formatSelection("**")}><b>B</b></ToolButton><ToolButton label="斜体" onClick={() => formatSelection("*")}><i>I</i></ToolButton><ToolButton label="高亮" onClick={() => formatSelection("==")}><span className="bg-yellow-200 px-0.5 text-black">A</span></ToolButton><ToolButton label="AI 润色" onClick={() => runAI("polish")}><Sparkles size={14} className="text-primary" /></ToolButton></div>}
                </div>
                <div className="flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Check size={13} className="text-emerald-500" />自动保存到{workspace.location === "server" ? "服务端" : "所选设备"}</span><span>Markdown</span></div>
              </div>
              {showAI && <AITools workspace={workspace} agentName={selectedAgentName} activeAction={aiAction} onRun={runAI} onClose={() => setShowAI(false)} onSettings={() => setShowSettings(true)} />}
            </div>
          </>}
        </section>
      </div>

      <NewWorkspaceDialog open={showNewWorkspace} setOpen={setShowNewWorkspace} draft={newWorkspace} setDraft={setNewWorkspace} models={modelOptions} agents={agentOptions} devices={deviceOptions} directories={directoryOptions} browsing={isBrowsingDirectories} onBrowse={browseDirectories} onCreate={createWorkspace} />
      <Dialog open={showNewFile} onOpenChange={setShowNewFile}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>新建 Markdown 文件</DialogTitle></DialogHeader><div className="space-y-2 py-2"><Label>文件名</Label><Input autoFocus placeholder="例如：项目计划" value={newFileName} onChange={(event) => setNewFileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFile() }} /><p className="text-xs text-muted-foreground">文件会以 .md 格式保存到当前工作区。</p></div><DialogFooter><Button variant="outline" onClick={() => setShowNewFile(false)}>取消</Button><Button onClick={createFile}>创建文件</Button></DialogFooter></DialogContent></Dialog>
      <WorkspaceSettingsDialog open={showSettings} setOpen={setShowSettings} workspace={workspace} models={modelOptions} agents={agentOptions} devices={deviceOptions} onUpdate={updateWorkspace} />
    </div>
  )
}

function WorkspaceHeader({ workspace, showAI, onNewWorkspace, onNewFile, onSettings, onToggleAI }: { workspace?: Workspace; showAI: boolean; onNewWorkspace: () => void; onNewFile: () => void; onSettings: () => void; onToggleAI: () => void }) {
  return <div className="flex shrink-0 items-center justify-between border-b bg-background/90 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderKanban size={19} /></div><div className="min-w-0"><div className="truncate text-sm font-semibold">工作区</div><div className="truncate text-xs text-muted-foreground">{workspace?.name || "创建一个工作区开始"}</div></div></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" className="gap-1.5" onClick={onNewWorkspace}><Plus size={15} />新建工作区</Button>{workspace && <Button size="sm" variant="ghost" className="gap-1.5" onClick={onNewFile}><FilePlus2 size={15} />新建文件</Button>}{workspace && <Button size="icon" variant="ghost" onClick={onSettings} title="工作区设置"><Settings2 size={17} /></Button>}<Button size="icon" variant={showAI ? "secondary" : "ghost"} onClick={onToggleAI} title="AI 工具"><PanelRight size={17} /></Button></div></div>
}

function WorkspaceSidebar({ workspaces, workspace, file, onSelectWorkspace, onSelectFile, onNewWorkspace, onNewFile }: { workspaces: Workspace[]; workspace?: Workspace; file?: WorkspaceFile; onSelectWorkspace: (workspace: Workspace) => void; onSelectFile: (file: WorkspaceFile) => void; onNewWorkspace: () => void; onNewFile: () => void }) {
  return <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/20 md:flex"><div className="flex items-center justify-between px-3 py-3"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">我的工作区</span><Button size="icon" variant="ghost" className="size-7" onClick={onNewWorkspace}><Plus size={15} /></Button></div><div className="min-h-0 flex-1 overflow-y-auto px-2">{workspaces.map((item) => <div key={item.id}><button type="button" onClick={() => onSelectWorkspace(item)} className={cn("mb-1 w-full rounded-lg p-2.5 text-left transition-colors", item.id === workspace?.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}><div className="flex items-center gap-2"><FolderOpen size={16} /><span className="truncate text-sm font-medium">{item.name}</span></div><div className="mt-1 flex items-center gap-1.5 pl-6 text-[11px] text-muted-foreground"><span>{item.files.length} 个文件</span><span>·</span><span>{item.location === "server" ? "服务端" : "设备"}</span></div></button>{item.id === workspace?.id && <div className="mb-3 ml-3 border-l pl-2">{item.files.map((entry) => <button key={entry.id} type="button" onClick={() => onSelectFile(entry)} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs", entry.id === file?.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><FileText size={13} /><span className="truncate">{entry.name}</span></button>)}<Button variant="ghost" size="sm" className="mt-1 h-7 w-full justify-start gap-1.5 px-2 text-xs text-muted-foreground" onClick={onNewFile}><FilePlus2 size={13} />新建文件</Button></div>}</div>)}</div><div className="border-t p-3 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><HardDrive size={13} />数据由服务端持久化</div></div></aside>
}

function EditorHeader({ file, workspace, onSelectFile, onSave }: { file?: WorkspaceFile; workspace: Workspace; onSelectFile: (file: WorkspaceFile) => void; onSave: () => void }) {
  return <><div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-3 py-1.5"><Button variant="ghost" size="sm" className="gap-1.5 text-xs font-semibold"><FileText size={14} />{file?.name || "未选择文件"}<ChevronDown size={13} /></Button><div className="ml-auto flex items-center gap-1"><span className="hidden text-xs text-muted-foreground sm:inline">{file?.updatedAt || "未保存"}</span><Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onSave}><Save size={13} />保存</Button><Button size="icon" variant="ghost" className="size-7"><MoreHorizontal size={15} /></Button></div></div><div className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-1 md:hidden">{workspace.files.map((entry) => <button key={entry.id} type="button" onClick={() => onSelectFile(entry)} className={cn("max-w-48 truncate rounded px-2 py-1 text-xs", entry.id === file?.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>{entry.name}</button>)}</div></>
}

function OfficeToolbar({ activeTab, setActiveTab, formatSelection, append }: { activeTab: string; setActiveTab: (tab: string) => void; formatSelection: (prefix: string, suffix?: string) => void; append: (value: string) => void }) {
  return <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 pt-1"><div className="flex items-center gap-0.5 border-r pr-2">{["开始", "插入", "视图"].map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn("rounded-t-md px-3 py-1.5 text-xs font-medium", activeTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>{tab}</button>)}</div><div className="flex items-center gap-1 pl-2">{activeTab === "开始" && <><ToolButton label="粗体" onClick={() => formatSelection("**")}><b>B</b></ToolButton><ToolButton label="斜体" onClick={() => formatSelection("*")}><i>I</i></ToolButton><ToolButton label="代码" onClick={() => formatSelection("`", "`")}><span className="font-mono">&lt;/&gt;</span></ToolButton><ToolButton label="标题" onClick={() => append("\n## ")}><span className="font-semibold">H</span></ToolButton><ToolButton label="列表" onClick={() => append("\n- ")}><span>☷</span></ToolButton></>}{activeTab === "插入" && <><ToolButton label="插入链接" onClick={() => append("[链接](https://) ")}><span>↗</span></ToolButton><ToolButton label="分割线" onClick={() => append("\n---\n")}><span>—</span></ToolButton></>}{activeTab === "视图" && <span className="px-2 text-xs text-muted-foreground">Markdown · 服务端实时保存</span>}</div></div>
}

function AITools({ workspace, agentName, activeAction, onRun, onClose, onSettings }: { workspace: Workspace; agentName: string; activeAction: string; onRun: (action: "polish" | "outline" | "summary") => void; onClose: () => void; onSettings: () => void }) {
  return <aside className="hidden w-72 shrink-0 border-l bg-muted/20 lg:flex lg:flex-col"><div className="flex items-center justify-between border-b px-4 py-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-primary" />AI 工具</div><div className="mt-1 text-[11px] text-muted-foreground">{workspace.model} · {agentName}</div></div><Button size="icon" variant="ghost" className="size-7" onClick={onClose}><X size={15} /></Button></div><div className="flex-1 space-y-2 overflow-y-auto p-3"><AITool icon={Wand2} title="润色文档" desc="使用工作区模型改写全文" loading={activeAction === "polish"} disabled={Boolean(activeAction)} onClick={() => onRun("polish")} /><AITool icon={Lightbulb} title="生成大纲" desc="根据当前内容生成结构" loading={activeAction === "outline"} disabled={Boolean(activeAction)} onClick={() => onRun("outline")} /><AITool icon={History} title="总结内容" desc="提炼关键结论与待办" loading={activeAction === "summary"} disabled={Boolean(activeAction)} onClick={() => onRun("summary")} /><div className="mt-5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground"><Bot size={15} className="mb-2 text-primary" /><div className="font-medium text-foreground">当前后端配置</div><div className="mt-1 leading-5">模型：{workspace.model}<br />智能体：{agentName}</div><Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={onSettings}>配置 AI →</Button></div></div><div className="border-t p-3"><div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground"><Search size={14} />AI 操作由服务端执行</div></div></aside>
}

function NewWorkspaceDialog({ open, setOpen, draft, setDraft, models, agents, devices, directories, browsing, onBrowse, onCreate }: { open: boolean; setOpen: (open: boolean) => void; draft: WorkspaceDraft; setDraft: (draft: WorkspaceDraft) => void; models: string[]; agents: AgentOption[]; devices: DeviceOption[]; directories: DirectoryOption[]; browsing: boolean; onBrowse: (path?: string) => void; onCreate: () => void }) {
  const valid = Boolean(draft.model && draft.agentID && (draft.location === "server" || (draft.deviceID && draft.path.trim())))
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>新建工作区</DialogTitle></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label>工作区名称</Label><Input autoFocus placeholder="例如：市场研究" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><div className="space-y-2"><Label>存放位置</Label><Select value={draft.location} onValueChange={(value: "server" | "device") => setDraft({ ...draft, location: value, path: "" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="server"><span className="flex items-center gap-2"><MapPin size={14} />服务端（云端同步）</span></SelectItem><SelectItem value="device"><span className="flex items-center gap-2"><HardDrive size={14} />连接器设备</span></SelectItem></SelectContent></Select></div>{draft.location === "device" && <div className="space-y-2"><Label>选择设备</Label><Select value={draft.deviceID} onValueChange={(value) => setDraft({ ...draft, deviceID: value, path: "" })}><SelectTrigger className="w-full"><SelectValue placeholder="选择已连接设备" /></SelectTrigger><SelectContent>{devices.length === 0 ? <SelectItem value="__none" disabled>暂无已连接设备</SelectItem> : devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.name}{device.hostname ? ` · ${device.hostname}` : ""}{device.online ? " · 在线" : " · 离线"}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><Label>{draft.location === "server" ? "服务端目录" : "设备目录"}</Label><div className="flex gap-2"><Input placeholder={draft.location === "server" ? "/workspaces/my-project" : "选择或输入设备绝对目录"} value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} />{draft.location === "device" && <Button type="button" variant="outline" disabled={!draft.deviceID || browsing} onClick={() => onBrowse(draft.path)}>{browsing ? <Loader2 className="size-4 animate-spin" /> : "浏览"}</Button>}</div>{draft.location === "device" && directories.length > 0 && <div className="max-h-36 overflow-y-auto rounded-lg border p-1">{directories.map((directory) => <button key={directory.path} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => { setDraft({ ...draft, path: directory.path }); onBrowse(directory.path) }}><FolderOpen size={13} /><span className="truncate">{directory.name}</span></button>)}</div>}</div><div className="grid gap-3 sm:grid-cols-2"><ResourceSelect label="AI 模型" value={draft.model} placeholder="选择可用模型" empty="暂无可用模型" options={models.map((model) => ({ value: model, label: model }))} onChange={(model) => setDraft({ ...draft, model })} /><ResourceSelect label="智能体" value={draft.agentID} placeholder="选择智能体" empty="暂无可用智能体" options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} onChange={(agentID) => setDraft({ ...draft, agentID })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={!valid} onClick={onCreate}>创建工作区</Button></DialogFooter></DialogContent></Dialog>
}

function WorkspaceSettingsDialog({ open, setOpen, workspace, models, agents, devices, onUpdate }: { open: boolean; setOpen: (open: boolean) => void; workspace?: Workspace; models: string[]; agents: AgentOption[]; devices: DeviceOption[]; onUpdate: (patch: Partial<Workspace>) => void }) {
  if (!workspace) return null
  const device = devices.find((item) => item.id === workspace.deviceID)
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>工作区设置</DialogTitle></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label>工作区名称</Label><Input value={workspace.name} onChange={(event) => onUpdate({ name: event.target.value })} /></div><div className="space-y-2"><Label>存放位置</Label><div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"><span className="flex size-7 items-center justify-center rounded bg-background">{workspace.location === "server" ? <MapPin size={15} /> : <HardDrive size={15} />}</span><div><div className="font-medium">{workspace.location === "server" ? "服务端" : device?.name || "连接器设备"}</div><div className="text-xs text-muted-foreground">{workspace.path}</div></div></div></div><div className="grid gap-3 sm:grid-cols-2"><ResourceSelect label="AI 模型" value={workspace.model} placeholder="选择模型" empty="暂无可用模型" options={models.map((model) => ({ value: model, label: model }))} onChange={(model) => onUpdate({ model })} /><ResourceSelect label="智能体" value={workspace.agentID} placeholder="选择智能体" empty="暂无可用智能体" options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} onChange={(agentID) => onUpdate({ agentID })} /></div></div><DialogFooter><Button onClick={() => setOpen(false)}>完成</Button></DialogFooter></DialogContent></Dialog>
}

function ResourceSelect({ label, value, placeholder, empty, options, onChange }: { label: string; value: string; placeholder: string; empty: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.length === 0 ? <SelectItem value="__none" disabled>{empty}</SelectItem> : options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) { return <Button type="button" variant="ghost" size="icon" className="size-7 text-xs" title={label} aria-label={label} onClick={onClick}>{children}</Button> }
function AITool({ icon: Icon, title, desc, loading, disabled, onClick }: { icon: typeof Wand2; title: string; desc: string; loading: boolean; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}</span><span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span></span></button> }
function EmptyWorkspace({ onCreate }: { onCreate: () => void }) { return <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderKanban size={30} /></div><h2 className="text-xl font-semibold">创建你的第一个工作区</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">工作区文件、模型、智能体和设备配置均由服务端管理。</p><Button className="mt-5 gap-2" onClick={onCreate}><Plus size={16} />新建工作区</Button></div> }

function replaceWorkspaceFile(workspaces: Workspace[], workspaceID: string, file: WorkspaceFile) { return workspaces.map((workspace) => workspace.id === workspaceID ? { ...workspace, files: workspace.files.map((item) => item.id === file.id ? file : item) } : workspace) }
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {} }
function normalizeWorkspace(value: unknown): Workspace { const item = record(value); return { id: stringValue(item.id), name: stringValue(item.name) || "未命名工作区", location: item.location === "device" ? "device" : "server", deviceID: stringValue(item.device_id), path: stringValue(item.path), model: stringValue(item.model), agentID: stringValue(item.agent_id), files: Array.isArray(item.files) ? item.files.map(normalizeWorkspaceFile).filter((file) => file.id) : [] } }
function normalizeWorkspaceFile(value: unknown): WorkspaceFile { const item = record(value); return { id: stringValue(item.id), name: stringValue(item.name) || "未命名.md", content: stringValue(item.content), updatedAt: stringValue(item.updated_at) || "刚刚" } }
function normalizeModels(value: unknown) { const catalog = Array.isArray(value) ? value : []; return Array.from(new Set(catalog.flatMap((entry) => { const models = record(entry).models; return Array.isArray(models) ? models.filter((model): model is string => typeof model === "string" && Boolean(model.trim())) : [] }))).sort() }
function normalizeAgents(value: unknown): AgentOption[] { return (Array.isArray(value) ? value : []).flatMap((entry): AgentOption[] => { const item = record(entry); const id = stringValue(item.id); return id ? [{ id, name: stringValue(item.name) || id, defaultModel: stringValue(item.default_model) }] : [] }) }
function normalizeDevices(value: unknown): DeviceOption[] { return (Array.isArray(value) ? value : []).flatMap((entry): DeviceOption[] => { const item = record(entry); const id = stringValue(item.id); return id ? [{ id, name: stringValue(item.name) || id, hostname: stringValue(item.hostname), online: item.online === true }] : [] }) }
function normalizeDirectories(value: unknown): DirectoryOption[] { const directories = record(value).directories; return (Array.isArray(directories) ? directories : []).flatMap((entry): DirectoryOption[] => { const item = record(entry); const path = stringValue(item.path); return path ? [{ path, name: stringValue(item.name) || path }] : [] }) }
function stringValue(value: unknown) { return typeof value === "string" ? value : "" }
