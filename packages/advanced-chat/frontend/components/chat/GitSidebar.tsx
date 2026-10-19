import { useQuery } from "@tanstack/react-query"
import { GitBranch, RefreshCw, TerminalSquare } from "lucide-react"
import { useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { GitChangeList, GitDiffPreview, type GitChangeFile } from "./GitChangeList"
import { ConnectorTerminalWindow, type ConnectorTerminalCopy } from "./ConnectorTerminalWindow"

interface GitStatus { current_branch: string; changed_files: number; additions: number; deletions: number; clean: boolean; files: GitChangeFile[] }
interface Session { id: string; run_mode?: string; connector_device_id?: string; connector_workspace_path?: string }

export default function GitSidebar() {
  const { language } = useI18n()
  const location = useLocation()
  const sessionID = useMemo(() => {
    const match = location.pathname.match(/^\/chat\/session\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : ""
  }, [location.pathname])
  const { data: session } = useQuery<Session | undefined>({
    queryKey: ["git-sidebar-session", sessionID],
    enabled: Boolean(sessionID),
    queryFn: async () => (await api.get(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}`)).data,
  })
  const enabled = Boolean(session?.connector_device_id && session.connector_workspace_path && session.run_mode && session.run_mode !== "chat")
  const statusQuery = useQuery<GitStatus>({
    queryKey: ["git-sidebar-status", session?.connector_device_id, session?.connector_workspace_path],
    enabled,
    queryFn: async () => (await api.get("/user/advanced-chat/workspace/git/status", { params: { connector_device_id: session?.connector_device_id, connector_workspace_path: session?.connector_workspace_path } })).data,
  })
  const [selectedFile, setSelectedFile] = useState<GitChangeFile | null>(null)
  const [activePanel, setActivePanel] = useState<"git" | "terminal">("git")
  const zh = language === "zh"
  const hasTerminal = Boolean(session?.connector_device_id)
  if (!sessionID || !session) return null
  const status = statusQuery.data
  const copy = { changes: zh ? "更改" : "Changes", clean: zh ? "工作树干净" : "Working tree clean", noDiff: zh ? "暂无 diff" : "No diff available", untracked: zh ? "未跟踪文件" : "Untracked file", added: zh ? "新增" : "Added", modified: zh ? "修改" : "Modified", deleted: zh ? "删除" : "Deleted", renamed: zh ? "重命名" : "Renamed" }
  const terminalCopy: ConnectorTerminalCopy = zh ? {
    title: "终端", connecting: "正在连接终端...", connectFailed: "无法打开终端", disconnected: "终端连接已断开", inputPlaceholder: "终端已连接", inputPlaceholderClosed: "终端已关闭", maximize: "最大化", restore: "还原", close: "关闭", restart: "重新连接", clear: "清屏", truncatedNotice: "终端输出过长，较早内容已省略", exitedWithCode: "进程已退出，代码 {code}",
  } : {
    title: "Terminal", connecting: "Connecting...", connectFailed: "Unable to open terminal", disconnected: "Terminal disconnected", inputPlaceholder: "Terminal connected", inputPlaceholderClosed: "Terminal closed", maximize: "Maximize", restore: "Restore", close: "Close", restart: "Reconnect", clear: "Clear", truncatedNotice: "Earlier terminal output was truncated", exitedWithCode: "Process exited with code {code}",
  }
  return <>
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex h-9 shrink-0 items-center border-b border-border">
        {enabled && <button type="button" className={`flex h-full items-center gap-2 border-b-2 px-2 text-sm ${activePanel === "git" ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setActivePanel("git")}><GitBranch size={15} />{zh ? "源代码管理" : "Source Control"}</button>}
        {hasTerminal && <button type="button" className={`flex h-full items-center gap-2 border-b-2 px-2 text-sm ${activePanel === "terminal" ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setActivePanel("terminal")}><TerminalSquare size={15} />{zh ? "终端" : "Terminal"}</button>}
      </div>
      {activePanel === "terminal" && hasTerminal ? <ConnectorTerminalWindow inline deviceID={session.connector_device_id!} deviceName={session.connector_device_id!} workspacePath={session.connector_workspace_path || ""} copy={terminalCopy} onClose={() => setActivePanel("git")} /> : enabled ? <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold"><GitBranch size={15} className="text-muted-foreground" /><span>{status?.current_branch || (zh ? "工作树" : "Working Tree")}</span></div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching} title={zh ? "刷新" : "Refresh"}><RefreshCw size={14} className={statusQuery.isFetching ? "animate-spin" : ""} /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {statusQuery.isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">{zh ? "加载中..." : "Loading..."}</div> : statusQuery.isError ? <div className="py-8 text-center text-sm text-destructive">{zh ? "无法读取 Git 状态" : "Unable to read Git status"}</div> : status ? <>
          <div className="mb-3 flex items-center justify-between border-b pb-3 text-xs"><span className="flex min-w-0 items-center gap-1.5 truncate font-medium"><GitBranch size={13} />{status.current_branch || "-"}</span><span className="tabular-nums text-muted-foreground">+{status.additions} -{status.deletions} · {status.changed_files}</span></div>
          <GitChangeList files={status.files} clean={status.clean} copy={copy} onFileClick={setSelectedFile} />
        </> : null}
      </div>
    </div> : <div className="px-2 py-8 text-center text-sm text-muted-foreground">{zh ? "此会话未配置工作区连接器" : "No workspace connector is configured for this session"}</div>}
    <Dialog open={Boolean(selectedFile)} onOpenChange={(open) => { if (!open) setSelectedFile(null) }}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden">
        <DialogHeader><DialogTitle className="truncate font-mono text-sm">{selectedFile?.path}</DialogTitle></DialogHeader>
        <div className="min-h-0 overflow-auto">{selectedFile?.diff ? <GitDiffPreview diff={selectedFile.diff} /> : <div className="py-8 text-center text-sm text-muted-foreground">{selectedFile?.status.includes("??") ? copy.untracked : copy.noDiff}</div>}</div>
      </DialogContent>
    </Dialog>
    </div>
  </>
}
