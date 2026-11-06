// The session's workspace as a tree.
//
// The file browser the explorer plugin offers is a flat directory with
// breadcrumbs, reached through a tab; what a conversation actually needs is the
// shape of its workspace — which folder holds what — visible next to the chat.
// Directories load their children the first time they open (a workspace can be
// large, and the connector answers one directory at a time), and a file opens in
// a small editor over the panel.
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RotateCw,
  Save,
  X,
} from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  api,
  useI18n,
  useToast,
} from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

interface Entry {
  name: string
  path: string
  type: string
  size: number
}

interface TreeProps {
  deviceID: string
  root: string
  path: string
  depth: number
  open: Record<string, Entry[] | undefined>
  loading: Record<string, boolean>
  onToggle: (entry: Entry) => void
  onOpenFile: (entry: Entry) => void
}

function TreeLevel({ deviceID, root, path, depth, open, loading, onToggle, onOpenFile }: TreeProps) {
  const entries = open[path]
  if (loading[path] && !entries) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: 8 + depth * 12 }}>
        <Loader2 size={12} className="animate-spin" />
      </div>
    )
  }
  if (!entries) return null
  if (entries.length === 0) {
    return <div className="px-2 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: 8 + depth * 12 }}>—</div>
  }
  return (
    <>
      {entries.map((entry) => {
        const directory = entry.type === "directory"
        const expanded = Boolean(open[entry.path])
        return (
          <div key={entry.path}>
            <button
              type="button"
              className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-muted"
              style={{ paddingLeft: 6 + depth * 12 }}
              title={entry.path}
              onClick={() => (directory ? onToggle(entry) : onOpenFile(entry))}
            >
              {directory ? (
                <ChevronRight size={12} className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {directory ? (
                expanded ? <FolderOpen size={13} className="shrink-0 text-primary" /> : <Folder size={13} className="shrink-0 text-muted-foreground" />
              ) : (
                <File size={13} className="shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
            {directory && expanded && (
              <TreeLevel
                deviceID={deviceID}
                root={root}
                path={entry.path}
                depth={depth + 1}
                open={open}
                loading={loading}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export default function WorkspaceTree(props: Record<string, unknown>) {
  const data = props as ChatSlotData
  const { language } = useI18n()
  const { error, success } = useToast()
  const zh = language === "zh"
  const root = data.session?.connector_workspace_path || ""
  const deviceID = data.session?.connector_device_id || data.device?.id || ""
  const [open, setOpen] = useState<Record<string, Entry[] | undefined>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [file, setFile] = useState<{ path: string; content: string; original: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (path: string) => {
    if (!deviceID || !root) return
    setLoading((current) => ({ ...current, [path]: true }))
    try {
      const result = (await api.get("/explorer/list", { params: { device_id: deviceID, workspace_path: root, path } })).data as { entries?: Entry[] }
      const entries = (result.entries ?? []).slice().sort((left: Entry, right: Entry) =>
        Number(right.type === "directory") - Number(left.type === "directory") || left.name.localeCompare(right.name))
      setOpen((current) => ({ ...current, [path]: entries }))
    } catch (cause) {
      error(zh ? "无法读取该目录" : "Could not read that folder")
      setOpen((current) => ({ ...current, [path]: [] }))
    } finally {
      setLoading((current) => ({ ...current, [path]: false }))
    }
  }, [deviceID, root, error, zh])

  // A new workspace (or another device) is a different tree.
  useEffect(() => {
    setOpen({})
    setFile(null)
    if (root && deviceID) void load(root)
  }, [root, deviceID, load])

  const toggle = (entry: Entry) => {
    setOpen((current) => {
      if (current[entry.path]) {
        const next = { ...current }
        delete next[entry.path]
        return next
      }
      return current
    })
    if (!open[entry.path]) void load(entry.path)
  }

  const openFile = async (entry: Entry) => {
    try {
      const result = (await api.get("/explorer/read", { params: { device_id: deviceID, workspace_path: root, path: entry.path } })).data as { content?: string }
      const content = String(result.content ?? "")
      setFile({ path: entry.path, content, original: content })
    } catch {
      error(zh ? "该文件无法以文本打开" : "That file cannot be opened as text")
    }
  }

  const save = async () => {
    if (!file) return
    setSaving(true)
    try {
      await api.post("/explorer/write", { device_id: deviceID, workspace_path: root, path: file.path, content: file.content })
      setFile({ ...file, original: file.content })
      success(zh ? "文件已保存" : "File saved")
    } catch {
      error(zh ? "保存失败" : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const rootName = useMemo(() => root.split(/[\\/]/).filter(Boolean).pop() || root, [root])
  const offline = !root || !deviceID || data.device?.online === false

  return (
    <section className="min-h-0 rounded-md border border-border bg-card shadow-sm">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <FolderOpen size={16} className="shrink-0" />
          <span className="truncate">{zh ? "工作区" : "Workspace"}</span>
          {rootName && <span className="truncate text-xs font-normal text-muted-foreground">{rootName}</span>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={offline}
          title={zh ? "刷新" : "Refresh"}
          aria-label={zh ? "刷新" : "Refresh"}
          onClick={() => { setOpen({}); if (root) void load(root) }}
        >
          <RotateCw size={14} />
        </Button>
      </div>
      <div className="max-h-[calc(100vh-24rem)] min-h-24 overflow-y-auto p-1">
        {offline ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {zh ? "请先选择在线设备和工作区" : "Select an online device and workspace first"}
          </div>
        ) : (
          <TreeLevel
            deviceID={deviceID}
            root={root}
            path={root}
            depth={0}
            open={open}
            loading={loading}
            onToggle={toggle}
            onOpenFile={(entry) => void openFile(entry)}
          />
        )}
      </div>
      <Dialog open={Boolean(file)} onOpenChange={(next) => { if (!next) setFile(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
              <File size={14} className="shrink-0" />
              <span className="truncate">{file?.path}</span>
            </DialogTitle>
          </DialogHeader>
          <textarea
            className="h-[50vh] w-full resize-none rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            value={file?.content ?? ""}
            spellCheck={false}
            onChange={(event) => setFile((current) => (current ? { ...current, content: event.target.value } : current))}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
              <X size={14} className="mr-1" />
              {zh ? "关闭" : "Close"}
            </Button>
            <Button size="sm" disabled={saving || !file || file.content === file.original} onClick={() => void save()}>
              <Save size={14} className="mr-1" />
              {zh ? "保存" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
