import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, FileDiff, GitBranch, GitCompareArrows, RefreshCw, RotateCcw, Upload, X } from "lucide-react"
import { api, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useI18n, useToast, type DashboardContext } from "@velocelab/dashboard/frontend"
import { GitChangeList, type GitChangeFile } from "../../workspace/frontend/components/GitChangeList"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

function GitPanel(props: Record<string, unknown>) {
  const { session: currentSession, runMode } = props as ChatSlotData
  const currentConnectorDeviceID = currentSession?.connector_device_id || ""
  const approvalMode = currentSession?.connector_approval_mode || "manual"
  const { language } = useI18n()
  const { error } = useToast()
  const gitCopy = useMemo(() => language === "zh" ? zhGitWorkspaceCopy : enGitWorkspaceCopy, [language])
  const [gitCompareBranch, setGitCompareBranch] = useState("")
  const [gitCommitMessage, setGitCommitMessage] = useState("")
  const [gitActionTaskID, setGitActionTaskID] = useState("")
  const [isGitActionSubmitting, setIsGitActionSubmitting] = useState(false)
  const canInspectGitWorkspace = runMode !== "chat" && Boolean(currentConnectorDeviceID && currentSession?.connector_workspace_path)
  const gitStatusQuery = useQuery<WorkspaceGitStatus>({
    queryKey: ["advanced-chat-workspace-git-status", currentConnectorDeviceID, currentSession?.connector_workspace_path || "", gitCompareBranch],
    enabled: canInspectGitWorkspace,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/workspace/git/status", {
        params: {
          connector_device_id: currentConnectorDeviceID,
          connector_workspace_path: currentSession?.connector_workspace_path || "",
          compare_branch: gitCompareBranch,
        },
      })
      return normalizeWorkspaceGitStatus(res.data)
    },
  })
  const { refetch: refetchGitStatus } = gitStatusQuery
  const gitTaskQuery = useQuery<ConnectorTaskStatus | undefined>({
    queryKey: ["advanced-chat-workspace-git-task", gitActionTaskID],
    enabled: Boolean(gitActionTaskID),
    refetchInterval: (query) => isActiveConnectorTask(query.state.data?.status) ? 1000 : false,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/connector-tasks/${encodeURIComponent(gitActionTaskID)}`)
      return normalizeConnectorTaskStatus(res.data)
    },
  })
  useEffect(() => {
    if (gitTaskQuery.data?.status === "completed") {
      void refetchGitStatus()
    }
  }, [gitTaskQuery.data?.status, refetchGitStatus])
  const runGitAction = async (action: "commit" | "push" | "rollback") => {
    if (!currentConnectorDeviceID || isGitActionSubmitting) {
      return
    }
    if (action === "rollback") {
      const confirmed = window.confirm(language === "zh"
        ? "确定回滚工作区吗？已跟踪文件的未提交修改将恢复到当前提交，未跟踪文件会保留。"
        : "Roll back this workspace? Uncommitted changes to tracked files will be restored to HEAD. Untracked files will be kept.")
      if (!confirmed) {
        return
      }
    }
    if (action === "commit" && !gitCommitMessage.trim()) {
      error(gitCopy.commitMessageRequired)
      return
    }
    setIsGitActionSubmitting(true)
    try {
      const res = await api.post("/user/advanced-chat/workspace/git/action", {
        connector_device_id: currentConnectorDeviceID,
        connector_workspace_path: currentSession?.connector_workspace_path || "",
        approval_mode: approvalMode,
        action,
        message: action === "commit" ? gitCommitMessage.trim() : "",
      })
      const task = normalizeConnectorTaskStatus(res.data)
      setGitActionTaskID(task.id)
      if (action === "commit") {
        setGitCommitMessage("")
      }
      await gitStatusQuery.refetch()
    } catch (err) {
      error(apiErrorMessage(err, gitCopy.actionFailed))
    } finally {
      setIsGitActionSubmitting(false)
    }
  }

  const decideGitTask = async (approved: boolean) => {
    if (!gitActionTaskID) {
      return
    }
    try {
      await api.post(`/user/advanced-chat/connector-tasks/${encodeURIComponent(gitActionTaskID)}/decision`, { approved })
      await gitTaskQuery.refetch()
    } catch (err) {
      error(apiErrorMessage(err, gitCopy.actionFailed))
    }
  }


  return <section className="rounded-md border border-border bg-card p-3 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold"><GitBranch size={16} />{language === "zh" ? "源代码管理" : "Source Control"}</div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canInspectGitWorkspace || gitStatusQuery.isFetching} onClick={() => void gitStatusQuery.refetch()} title={gitCopy.refresh} aria-label={gitCopy.refresh}><RefreshCw size={14} className={gitStatusQuery.isFetching ? "animate-spin" : ""} /></Button>
    </div>
                  {!canInspectGitWorkspace ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">{gitCopy.noWorkspace}</div>
                  ) : gitStatusQuery.isLoading ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">{gitCopy.loading}</div>
                  ) : gitStatusQuery.isError ? (
                    <div className="py-4 text-sm text-destructive">{apiErrorMessage(gitStatusQuery.error, gitCopy.actionFailed)}</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-y border-border/70 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">{gitCopy.local}</div>
                          <div className="mt-1 flex min-w-0 items-center gap-1.5 font-medium">
                            <GitBranch size={14} className="shrink-0 text-muted-foreground" />
                            <span className="truncate">{gitStatusQuery.data?.current_branch || "-"}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">{gitCopy.changes}</div>
                          <div className="mt-1 flex items-center justify-end gap-1.5 font-medium tabular-nums">
                            <span className="text-primary">+{gitStatusQuery.data?.additions || 0}</span>
                            <span className="text-destructive">-{gitStatusQuery.data?.deletions || 0}</span>
                            <span className="text-xs font-normal text-muted-foreground">{gitCopy.files.replace("{count}", String(gitStatusQuery.data?.changed_files || 0))}</span>
                          </div>
                        </div>
                      </div>

                      <GitChangeList files={gitStatusQuery.data?.files || []} clean={gitStatusQuery.data?.clean} copy={gitCopy} />

                      <label className="block text-xs font-medium text-muted-foreground">
                        <span className="mb-1.5 flex items-center gap-1.5"><GitCompareArrows size={14} />{gitCopy.compareBranch}</span>
                        <Select value={String((gitCompareBranch) || "__shadcn_empty__")} onValueChange={(value) => setGitCompareBranch((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-9 w-full rounded-2xl border border-border bg-background px-2 text-sm text-foreground"><SelectValue /></SelectTrigger><SelectContent>
                          <SelectItem value="__shadcn_empty__">{gitCopy.noComparison}</SelectItem>
                          {(gitStatusQuery.data?.branches || []).filter((branch) => branch !== gitStatusQuery.data?.current_branch).map((branch) => (
                            <SelectItem key={branch} value={String(branch)}>{branch}</SelectItem>
                          ))}
                        </SelectContent></Select>
                      </label>

                      <div className="space-y-2 border-t border-border/70 pt-3">
                        <label className="block text-xs font-medium text-muted-foreground" htmlFor="git-commit-message">{gitCopy.commitMessage}</label>
                        <Input
                          id="git-commit-message"
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                          value={gitCommitMessage}
                          maxLength={200}
                          placeholder={gitCopy.commitMessage}
                          onChange={(event) => setGitCommitMessage(event.target.value)}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Button type="button" variant="outline" className="h-9 gap-2" disabled={isGitActionSubmitting || isActiveConnectorTask(gitTaskQuery.data?.status)} onClick={() => void runGitAction("commit")}>
                            <FileDiff size={15} />
                            {gitCopy.commit}
                          </Button>
                          <Button type="button" className="h-9 gap-2" disabled={isGitActionSubmitting || isActiveConnectorTask(gitTaskQuery.data?.status)} onClick={() => void runGitAction("push")}>
                            <Upload size={15} />
                            {gitCopy.push}
                          </Button>
                          <Button type="button" variant="outline" className="h-9 gap-2 text-destructive hover:text-destructive" disabled={isGitActionSubmitting || isActiveConnectorTask(gitTaskQuery.data?.status) || gitStatusQuery.data?.clean} onClick={() => void runGitAction("rollback")}>
                            <RotateCcw size={15} />
                            {gitCopy.rollback}
                          </Button>
                        </div>
                      </div>

                      {gitTaskQuery.data && (
                        <div className="border-t border-border/70 pt-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{gitTaskStatusLabel(gitTaskQuery.data.status, gitCopy)}</span>
                            {gitTaskQuery.data.status === "pending_approval" && (
                              <div className="flex items-center gap-1.5">
                                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void decideGitTask(false)}>
                                  <X size={14} />
                                  {gitCopy.reject}
                                </Button>
                                <Button type="button" size="sm" className="h-8 gap-1.5" onClick={() => void decideGitTask(true)}>
                                  <Check size={14} />
                                  {gitCopy.approve}
                                </Button>
                              </div>
                            )}
                          </div>
                          {gitTaskQuery.data.error_message && <div className="mt-1.5 whitespace-pre-wrap text-xs text-destructive">{gitTaskQuery.data.error_message}</div>}
                          {gitTaskQuery.data.result && gitTaskQuery.data.status === "completed" && <div className="mt-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{gitTaskQuery.data.result}</div>}
                        </div>
                      )}
                    </div>
                  )}
  </section>
}

function Git(props: Record<string, unknown>) {
  const data = props as ChatSlotData
  return <GitPanel key={`${data.session?.id}:${data.session?.connector_device_id}:${data.session?.connector_workspace_path}`} {...data} />
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", Git, "chat-git.panel", 20, "/chat")
}

interface WorkspaceGitStatus {
  current_branch: string
  compare_branch?: string
  branches: string[]
  changed_files: number
  additions: number
  deletions: number
  clean: boolean
  files: GitChangeFile[]
}

interface ConnectorTaskStatus {
  id: string
  status: string
  result?: string
  error_message?: string
}

function normalizeWorkspaceGitStatus(value: unknown): WorkspaceGitStatus {
  const item = isRecord(value) ? value : {}
  const numberValue = (candidate: unknown) => {
    const parsed = Number(candidate)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  }
  return {
    current_branch: stringFromUnknown(item.current_branch) || "",
    compare_branch: stringFromUnknown(item.compare_branch) || undefined,
    branches: stringArrayFromUnknown(item.branches),
    changed_files: numberValue(item.changed_files),
    additions: numberValue(item.additions),
    deletions: numberValue(item.deletions),
    clean: item.clean === true,
    files: Array.isArray(item.files) ? item.files.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const path = stringFromUnknown(entry.path)
      if (!path) return []
      return [{ path, status: stringFromUnknown(entry.status) || "", additions: numberValue(entry.additions), deletions: numberValue(entry.deletions), diff: stringFromUnknown(entry.diff) || undefined }]
    }) : [],
  }
}

function normalizeConnectorTaskStatus(value: unknown): ConnectorTaskStatus {
  const item = isRecord(value) ? value : {}
  return {
    id: stringFromUnknown(item.id) || "",
    status: stringFromUnknown(item.status) || "",
    result: stringFromUnknown(item.result) || undefined,
    error_message: stringFromUnknown(item.error_message) || undefined,
  }
}

function isActiveConnectorTask(status?: string) {
  return status === "pending_approval" || status === "queued" || status === "running"
}

function gitTaskStatusLabel(status: string, copy: typeof zhGitWorkspaceCopy) {
  switch (status) {
    case "pending_approval":
      return copy.pendingApproval
    case "queued":
      return copy.queued
    case "running":
      return copy.running
    case "completed":
      return copy.completed
    default:
      return copy.failed
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data) && typeof data.error === "string" && data.error) {
        return data.error
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.map(stringFromUnknown).filter((item): item is string => Boolean(item))) : []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

const zhGitWorkspaceCopy = {
  environment: "环境信息",
  executionEnvironment: "执行环境",
  runDirectory: "运行目录",
  selectDevice: "选择设备",
  noDevice: "未选择设备",
  noWorkspacePath: "未选择运行目录",
  changes: "变更",
  clean: "工作目录干净，没有待提交改动。",
  untracked: "未跟踪文件，尚无 Git diff。",
  noDiff: "当前比较范围没有可展示的文本差异。",
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  local: "本地",
  files: "{count} 个文件",
  compareBranch: "比较分支",
  noComparison: "不比较分支",
  commit: "提交",
  push: "推送",
  rollback: "回滚",
  commitMessage: "提交说明",
  commitMessageRequired: "请输入提交说明。",
  approve: "批准",
  reject: "拒绝",
  refresh: "刷新",
  loading: "加载中",
  actionFailed: "Git 操作失败",
  noWorkspace: "请选择本地设备和工作区。",
  openInVSCode: "在 VS Code 中打开",
  openVSCodeFailed: "无法在 VS Code 中打开工作区",
  pendingApproval: "等待审批",
  queued: "已排队",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
}

const enGitWorkspaceCopy: typeof zhGitWorkspaceCopy = {
  environment: "Environment",
  executionEnvironment: "Execution environment",
  runDirectory: "Run directory",
  selectDevice: "Select device",
  noDevice: "No device selected",
  noWorkspacePath: "No run directory selected",
  changes: "Changes",
  clean: "Working tree is clean.",
  untracked: "Untracked file; no Git diff yet.",
  noDiff: "No text diff is available for this comparison.",
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  local: "Local",
  files: "{count} files",
  compareBranch: "Compare branch",
  noComparison: "No comparison",
  commit: "Commit",
  push: "Push",
  rollback: "Rollback",
  commitMessage: "Commit message",
  commitMessageRequired: "Enter a commit message.",
  approve: "Approve",
  reject: "Reject",
  refresh: "Refresh",
  loading: "Loading",
  actionFailed: "Git action failed",
  noWorkspace: "Select a local device and workspace.",
  openInVSCode: "Open in VS Code",
  openVSCodeFailed: "Failed to open the workspace in VS Code",
  pendingApproval: "Approval required",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
}
