import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Activity, ArrowDown, ArrowUp, Bot, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Copy, FileDiff, FileText, Folder, FolderOpen, FolderPlus, GitBranch, GitCompareArrows, Hand, ListTodo, Loader2, MessageCircleQuestion, MessageSquarePlus, Monitor, MoreHorizontal, PanelRightClose, PanelRightOpen, Paperclip, Pencil, Plus, Quote, RefreshCw, Search, Send, Server, Settings, ShieldCheck, Sparkles, TerminalSquare, Trash2, Upload, User, X } from "lucide-react"
import api, { apiURL, getAuthToken, isDesktopTarget } from "@/lib/api"
import { ChatSetupGuide } from "@/components/onboarding/SetupGuides"
import { ConnectorTerminalWindow, type ConnectorTerminalCopy } from "@/components/chat/ConnectorTerminalWindow"
import { useI18n, type TranslationKey } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface UpstreamChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface ChatToolCall {
  id: string
  round?: number
  name: string
  server?: string
  tool?: string
  status: string
  arguments?: Record<string, unknown>
  result?: string
}

interface GeneratedFileEntry {
  path: string
  name: string
  description: string
}

const GENERATED_FILE_TOOL_NAME = "report_generated_file"

interface ChatContentPart {
  round?: number
  content: string
}

type SessionTaskStatus = "pending" | "in_progress" | "completed" | "skipped"

interface SessionTask {
  id: string
  position: number
  title: string
  description?: string
  status: SessionTaskStatus
  note?: string
}

const SESSION_TASK_TOOL_NAMES = new Set(["tasks_plan", "tasks_update", "tasks_list"])
const ASK_USER_TOOL_NAME = "ask_user"

const CHAT_TOOL_GROUP_KEYS = ["workspace", "web", "sites", "tasks", "ask_user", "memory"] as const
type ChatToolGroupKey = typeof CHAT_TOOL_GROUP_KEYS[number]

function chatToolGroupItems(copy: ChatCopy): { key: ChatToolGroupKey; label: string; hint: string }[] {
  return [
    { key: "workspace", label: copy.toolGroupWorkspace, hint: copy.toolGroupWorkspaceHint },
    { key: "web", label: copy.toolGroupWeb, hint: copy.toolGroupWebHint },
    { key: "sites", label: copy.toolGroupSites, hint: copy.toolGroupSitesHint },
    { key: "tasks", label: copy.toolGroupTasks, hint: copy.toolGroupTasksHint },
    { key: "ask_user", label: copy.toolGroupAskUser, hint: copy.toolGroupAskUserHint },
    { key: "memory", label: copy.toolGroupMemory, hint: copy.toolGroupMemoryHint },
  ]
}

function normalizeDisabledToolGroups(value: unknown): ChatToolGroupKey[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: ChatToolGroupKey[] = []
  for (const item of value) {
    if (typeof item === "string" && (CHAT_TOOL_GROUP_KEYS as readonly string[]).includes(item) && !groups.includes(item as ChatToolGroupKey)) {
      groups.push(item as ChatToolGroupKey)
    }
  }
  return groups
}

interface AskUserPromptOption {
  label: string
  description?: string
}

interface AskUserPromptData {
  question: string
  options: AskUserPromptOption[]
  allowCustom: boolean
  multiSelect: boolean
}

function parseAskUserPrompt(result: string): AskUserPromptData | null {
  let raw: unknown
  try {
    raw = JSON.parse(result)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") {
    return null
  }
  const record = raw as Record<string, unknown>
  const question = typeof record.question === "string" ? record.question.trim() : ""
  if (!question) {
    return null
  }
  const options: AskUserPromptOption[] = []
  if (Array.isArray(record.options)) {
    for (const item of record.options) {
      if (!item || typeof item !== "object") {
        continue
      }
      const option = item as Record<string, unknown>
      const label = typeof option.label === "string" ? option.label.trim() : ""
      if (!label) {
        continue
      }
      options.push({ label, description: typeof option.description === "string" ? option.description : undefined })
    }
  }
  return {
    question,
    options,
    allowCustom: record.allow_custom !== false,
    multiSelect: record.multi_select === true,
  }
}

function askUserPromptFromToolCalls(toolCalls: ChatToolCall[] | undefined): AskUserPromptData | null {
  if (!toolCalls || toolCalls.length === 0) {
    return null
  }
  for (let index = toolCalls.length - 1; index >= 0; index--) {
    const call = toolCalls[index]
    if (call.name === ASK_USER_TOOL_NAME && call.status === "ok" && typeof call.result === "string") {
      const prompt = parseAskUserPrompt(call.result)
      if (prompt) {
        return prompt
      }
    }
  }
  return null
}

function normalizeSessionTasks(value: unknown): SessionTask[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { tasks?: unknown }).tasks)) {
    return null
  }
  const tasks: SessionTask[] = []
  for (const item of (value as { tasks: unknown[] }).tasks) {
    if (!item || typeof item !== "object") {
      continue
    }
    const raw = item as Record<string, unknown>
    const id = typeof raw.id === "string" ? raw.id : ""
    const title = typeof raw.title === "string" ? raw.title.trim() : ""
    if (!id || !title) {
      continue
    }
    const status = typeof raw.status === "string" && ["pending", "in_progress", "completed", "skipped"].includes(raw.status)
      ? raw.status as SessionTaskStatus
      : "pending"
    tasks.push({
      id,
      position: typeof raw.position === "number" && Number.isFinite(raw.position) ? raw.position : tasks.length + 1,
      title,
      description: typeof raw.description === "string" ? raw.description : undefined,
      status,
      note: typeof raw.note === "string" ? raw.note : undefined,
    })
  }
  tasks.sort((a, b) => a.position - b.position)
  return tasks
}

function sessionTasksFromToolCall(name: unknown, status: unknown, result: unknown): SessionTask[] | null {
  if (typeof name !== "string" || !SESSION_TASK_TOOL_NAMES.has(name) || status !== "ok" || typeof result !== "string") {
    return null
  }
  try {
    return normalizeSessionTasks(JSON.parse(result))
  } catch {
    return null
  }
}

interface ChatMessage {
  id: string
  user_id?: number
  role: "user" | "assistant"
  content: string
  content_parts?: ChatContentPart[]
  created_at: string
  updated_at?: string
  processing_duration_ms?: number
  tool_calls?: ChatToolCall[]
}

interface ChatSession {
  id: string
  folder_id?: string
  title: string
  messages: ChatMessage[]
  run_mode: ChatRunMode
  latest_run?: ChatRun
  agent_id?: string
  agent_group_id?: string
  skill_ids: string[]
  mcp_server_ids: string[]
	knowledge_base_ids: string[]
  connector_device_id?: string
  connector_workspace_path?: string
  cloud_sandbox_id?: string
  connector_auto_approve: boolean
  connector_approval_mode: ConnectorApprovalMode
  connector_command_prefixes: string[]
  model_name?: string
  user_channel_id?: number
  max_tokens?: number
  temperature?: number | null
  reasoning_effort?: string
  auto_compress_context: boolean
  disabled_tool_groups: ChatToolGroupKey[]
  created_at: string
  updated_at: string
}

interface CloudSandboxOption {
  id: string
  name: string
  image: string
  status: string
}

interface ChatRun {
  id: string
  session_id: string
  assistant_message_id: string
  mode: ChatRunMode
  status: string
  status_message?: string
  current_round?: number
  error_message?: string
  tool_calls?: number
  tool_call_details?: ChatToolCall[]
  created_at?: string
  updated_at?: string
  started_at?: string
  finished_at?: string
}

interface AgentWorkMessage {
  role: "user" | "assistant" | "tool" | "system" | string
  content: string
  status?: string
  tool?: string
  created_at?: string
}

interface AgentWorkStatus {
  agent_id: string
  agent_name: string
  agent_type: string
  group_id: string
  group_name: string
  status: string
  working: boolean
  updated_at?: string
  messages: AgentWorkMessage[]
}

interface AgentWorkConnectorTask {
  id: string
  device_id: string
  device_name: string
  action: string
  status: string
  workspace_path: string
  workspace_unrestricted?: boolean
  payload: Record<string, unknown>
  result?: string
  error_message?: string
  created_at: string
  updated_at?: string
  started_at?: string
  finished_at?: string
}

interface AgentWorkResponse {
  run_id: string
  session_id: string
  group_id: string
  group_name: string
  agents: AgentWorkStatus[]
  connector_tasks: AgentWorkConnectorTask[]
}

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
  user_channel_id?: number
  stream: boolean
	knowledge_base_ids: string[]
  created_at: string
  updated_at: string
}

interface ChatSkill {
  id: string
  name: string
  description: string
}

interface ChatAgentGroupAgent {
  id: string
  name: string
  type: "chief" | "worker" | "critic" | "reviewer" | string
}

interface ChatAgentGroup {
  id: string
  name: string
  agents: ChatAgentGroupAgent[]
}

interface MCPServer {
  id: string
  name: string
  type?: "http" | "connector" | string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface ConnectorDevice {
  id: string
  name: string
  remark?: string
  hostname?: string
  os?: string
  arch?: string
  version?: string
  kind?: "cli" | "desktop" | string
  desktop_instance_id?: string
  status: string
  online: boolean
  last_seen_at?: string
}

interface ConnectorApprovalTask {
  id: string
  device_id: string
  device_name: string
  run_id: string
  action: string
  workspace_path: string
  payload: Record<string, unknown>
  created_at: string
}

interface WorkspaceGitStatus {
  current_branch: string
  compare_branch?: string
  branches: string[]
  changed_files: number
  additions: number
  deletions: number
  clean: boolean
}

interface ConnectorTaskStatus {
  id: string
  status: string
  result?: string
  error_message?: string
}

interface WorkspaceDirectories {
  path: string
  directories: Array<{ name: string; path: string }>
}

interface TaskFileChange {
  path: string
  additions: number
  deletions: number
  entries: ReplacementEntry[]
}

interface TaskChangeSummary {
  files: TaskFileChange[]
  additions: number
  deletions: number
}

interface SessionFolder {
  id: string
  name: string
}

interface WorkspaceSkill {
  id: string
  name: string
  path: string
  content: string
  size: number
  truncated: boolean
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  file_storage_enabled: boolean
  file_storage_total_mb: number
  file_storage_used_bytes: number
  file_storage_auto_save_images_enabled: boolean
  file_storage_auto_save_videos_enabled: boolean
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
  assistant_mode_enabled: boolean
  assistant_mcp_tools_enabled: boolean
  assistant_connector_list_files_enabled: boolean
  assistant_connector_read_file_enabled: boolean
  assistant_connector_write_file_enabled: boolean
  assistant_connector_replace_text_enabled: boolean
  assistant_connector_run_command_enabled: boolean
  assistant_connector_web_search_enabled: boolean
  assistant_connector_static_site_enabled: boolean
  connector_approval_agent_id: string
}

interface ChatAttachment {
  id: string
  storage_id?: string
  name: string
  type: string
  size: number
  text?: string
  binary?: boolean
  truncated?: boolean
}

interface ParsedMessageAttachment {
  name: string
  type: string
  sizeLabel: string
  storageID?: string
  body: string
  truncated: boolean
  binary: boolean
}

interface StoredFile {
  id: string
  name: string
  type: string
  size: number
  source: string
  text_available: boolean
  created_at: string
  updated_at: string
}

interface StoredFileListResponse {
  files: StoredFile[]
  used_bytes: number
  total_bytes: number
  remaining_bytes: number
}

interface StoredFileContent {
  id: string
  text: string
  binary: boolean
  truncated: boolean
}

interface ChatKnowledgeBase { id: string; name: string; description: string; vectorized: boolean }

interface EnterpriseSharedPool {
  id: number
  scope_type: "task" | "department" | string
  name: string
  department_id?: number
  task_id?: number
}

interface EnterprisePoolDevice {
  external_device_id: string
}

type ChatRunMode = "chat" | "assistant" | "agent_group"
type ConnectorApprovalMode = "manual" | "full_access" | "assistant"
type SessionConfigTab = "basic" | "advanced" | "agent" | "agent_group" | "skills" | "knowledge" | "mcp" | "device"
type SessionCapabilityPicker = "skills" | "knowledge" | "mcp" | null
type AttachmentTarget = "composer" | "editor"
type ComposerControlMenu = "" | "mode" | "model" | "device" | "workspace" | "agent" | "agent_group" | "approval"
type WorkspacePickerTarget = "session" | "pending"

interface ChatStoreKeys {
  sessions: string
  selectedSession: string
  model: string
  userChannel: string
}

interface ParsedSSEEvent {
  type: string
  payload: any
}

const selectedAgentStoreKey = "windypear.advanced_chat.selected_agent.v1"
const recentAgentStoreKey = "windypear.advanced_chat.recent_agents.v1"
const sessionFoldersStorageKey = "windypear.chat.session_folders.v1"
const sessionFolderAssignmentsStorageKey = "windypear.chat.session_folder_assignments.v1"
const defaultAgentID = "default"
const agentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const advancedSessionsQueryKey = ["advanced-chat-sessions"] as const
const advancedSessionFoldersQueryKey = ["advanced-chat-session-folders"] as const
const advancedFilesQueryKey = ["advanced-chat-files"] as const
const connectorDevicesQueryKey = ["advanced-chat-connector-devices"] as const
const connectorApprovalsQueryKey = (runID: string) => ["advanced-chat-connector-approvals", runID] as const
const agentWorkQueryKey = (runID: string) => ["advanced-chat-agent-work", runID] as const
const agentGroupsQueryKey = ["advanced-chat-agent-groups"] as const
const defaultAdvancedChatSettings: AdvancedChatSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: ["text/plain", "text/markdown", "application/json", "text/csv", "image/png", "image/jpeg", "application/pdf"],
  file_storage_enabled: true,
  file_storage_total_mb: 100,
  file_storage_used_bytes: 0,
  file_storage_auto_save_images_enabled: true,
  file_storage_auto_save_videos_enabled: true,
  mcp_servers: [],
  builtin_mcp_servers: [],
  custom_mcp_servers: [],
  assistant_mode_enabled: true,
  assistant_mcp_tools_enabled: true,
  assistant_connector_list_files_enabled: true,
  assistant_connector_read_file_enabled: true,
  assistant_connector_write_file_enabled: true,
  assistant_connector_replace_text_enabled: true,
  assistant_connector_run_command_enabled: true,
  assistant_connector_web_search_enabled: true,
  assistant_connector_static_site_enabled: true,
  connector_approval_agent_id: "",
}

const chatStoreKeys: ChatStoreKeys = {
    sessions: "windypear.advanced_chat.sessions.v1",
    selectedSession: "windypear.advanced_chat.selected_session.v1",
    model: "windypear.advanced_chat.model.v1",
    userChannel: "windypear.advanced_chat.user_channel_id.v1",
}

export default function Chat() {
  const isAdvanced = true
  const isDesktop = isDesktopTarget()
  const storeKeys = chatStoreKeys
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const routeSessionID = isAdvanced ? sessionIDFromAdvancedChatPath(location.pathname) : ""
  const requestedAgentID = isAdvanced ? new URLSearchParams(location.search).get("agent_id") || "" : ""
  const { language, t } = useI18n()
  const { data: publicSettingsData } = useQuery<PublicSettings>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings")).data })
  const enterpriseMode = String(withPublicSettingsDefaults(publicSettingsData).system_mode).toLowerCase() === "enterprise"
  const copy = useMemo(() => buildChatCopy(t), [t])
	const knowledgeCopy = language === "zh" ? { label: "知识库", manage: "管理知识库", empty: "未添加知识库", select: "选择已向量化的知识库", add: "添加" } : { label: "Knowledge bases", manage: "Manage knowledge bases", empty: "No knowledge bases added", select: "Select a vectorized knowledge base", add: "Add" }
  const fileCopy = useMemo(() => (language === "zh" ? zhFileAttachmentCopy : enFileAttachmentCopy), [language])
  const agentGroupCopy = useMemo(() => (language === "zh" ? zhAgentGroupCopy : enAgentGroupCopy), [language])
  const approvalModeCopy = useMemo(() => (language === "zh" ? zhConnectorApprovalModeCopy : enConnectorApprovalModeCopy), [language])
  const newSessionGreeting = greetingForHour(language)
  const recentAgentsLabel = language === "zh" ? "最近助理" : language === "ja" ? "最近のアシスタント" : "Recent assistants"
  const gitCopy = useMemo(() => (language === "zh" ? zhGitWorkspaceCopy : enGitWorkspaceCopy), [language])
  const terminalCopy = useMemo(() => (language === "zh" ? zhConnectorTerminalCopy : enConnectorTerminalCopy), [language])
  const workspacePickerCopy = useMemo(() => (language === "zh" ? zhWorkspacePickerCopy : enWorkspacePickerCopy), [language])
  const taskChangeCopy = useMemo(() => (language === "zh" ? zhTaskChangeCopy : enTaskChangeCopy), [language])
  const sessionSidebarCopy = useMemo(() => (language === "zh" ? zhSessionSidebarCopy : enSessionSidebarCopy), [language])
  const { error, success } = useToast()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [draftSession, setDraftSession] = useState<ChatSession>(() => createSession())
  const [storedActiveSessionID, setStoredActiveSessionID] = useState(() => localStorage.getItem(storeKeys.selectedSession) || "")
  const activeSessionID = isAdvanced ? routeSessionID : storedActiveSessionID
  const setActiveSessionID = (sessionID: string) => {
    if (!isAdvanced) {
      setStoredActiveSessionID(sessionID)
    }
  }
  const [modelName, setModelName] = useState(() => localStorage.getItem(storeKeys.model) || "")
  const [selectedUserChannelID, setSelectedUserChannelID] = useState(() => Number(localStorage.getItem(storeKeys.userChannel) || 0))
  const [selectedAgentID, setSelectedAgentID] = useState(() => (isAdvanced ? localStorage.getItem(selectedAgentStoreKey) || "" : ""))
  const [recentAgentIDs, setRecentAgentIDs] = useState(() => (isAdvanced ? readRecentAgentIDs() : []))
  const [desktopInstanceID, setDesktopInstanceID] = useState("")
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isAgentWorkOpen, setIsAgentWorkOpen] = useState(false)
  const [selectedWorkAgentID, setSelectedWorkAgentID] = useState("")
  const [, setIsSessionsSidebarOpen] = useState(false)
  const [isDesktopSessionsSidebarVisible, setIsDesktopSessionsSidebarVisible] = useState(true)
  const [desktopSessionsSidebarHost, setDesktopSessionsSidebarHost] = useState<HTMLElement | null>(null)
  const [sessionSearch, setSessionSearch] = useState("")
  const [sessionFolders, setSessionFolders] = useState<SessionFolder[]>(readSessionFolders)
  const [sessionFolderAssignments, setSessionFolderAssignments] = useState<Record<string, string>>(readSessionFolderAssignments)
  const [isSessionFolderDialogOpen, setIsSessionFolderDialogOpen] = useState(false)
  const [newSessionFolderName, setNewSessionFolderName] = useState("")
  const [collapsedSessionFolderIDs, setCollapsedSessionFolderIDs] = useState<Set<string>>(() => new Set())
  const [configTab, setConfigTab] = useState<SessionConfigTab>("basic")
  const [pendingAgentID, setPendingAgentID] = useState("")
  const [sessionCapabilityPicker, setSessionCapabilityPicker] = useState<SessionCapabilityPicker>(null)
  const [pendingConnectorDeviceID, setPendingConnectorDeviceID] = useState("")
  const [pendingConnectorWorkspace, setPendingConnectorWorkspace] = useState("")
  const [pendingCloudSandboxID, setPendingCloudSandboxID] = useState("")
  const [pendingConnectorApprovalMode, setPendingConnectorApprovalMode] = useState<ConnectorApprovalMode>("manual")
  const [pendingConnectorCommandPrefixes, setPendingConnectorCommandPrefixes] = useState("")
  const [isWorkspacePickerOpen, setIsWorkspacePickerOpen] = useState(false)
  const [workspacePickerDeviceID, setWorkspacePickerDeviceID] = useState("")
  const [workspacePickerPath, setWorkspacePickerPath] = useState("")
  const [workspacePickerTarget, setWorkspacePickerTarget] = useState<WorkspacePickerTarget>("session")
  const [isTaskChangesOpen, setIsTaskChangesOpen] = useState(false)
  const [selectedTaskChangePath, setSelectedTaskChangePath] = useState("")
  const [isGitPanelOpen, setIsGitPanelOpen] = useState(false)
  const [isEnvironmentDevicePickerOpen, setIsEnvironmentDevicePickerOpen] = useState(false)
  const [isEnvironmentWorkspacePickerOpen, setIsEnvironmentWorkspacePickerOpen] = useState(false)
  const [gitCompareBranch, setGitCompareBranch] = useState("")
  const [gitCommitMessage, setGitCommitMessage] = useState("")
  const [gitActionTaskID, setGitActionTaskID] = useState("")
  const [isGitActionSubmitting, setIsGitActionSubmitting] = useState(false)
  const [workspaceSkills, setWorkspaceSkills] = useState<WorkspaceSkill[]>([])
  const [isRefreshingWorkspaceSkills, setIsRefreshingWorkspaceSkills] = useState(false)
  const [decidingConnectorTaskID, setDecidingConnectorTaskID] = useState("")
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [selectingFileID, setSelectingFileID] = useState("")
  const [attachmentMenuTarget, setAttachmentMenuTarget] = useState<AttachmentTarget | "">("")
  const [composerControlMenu, setComposerControlMenu] = useState<ComposerControlMenu>("")
  const [composerModelSubmenu, setComposerModelSubmenu] = useState<"" | "model" | "reasoning">("")
  const [sessionMenu, setSessionMenu] = useState<{ sessionID: string; x: number; y: number } | null>(null)
  const [sessionFolderContextMenu, setSessionFolderContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [messageSelectionMenu, setMessageSelectionMenu] = useState<{ text: string; x: number; y: number } | null>(null)
  const [isMessageSelectionSearchOpen, setIsMessageSelectionSearchOpen] = useState(false)
  const [regeneratingTitleSessionID, setRegeneratingTitleSessionID] = useState("")
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null)
  const [renamedTitle, setRenamedTitle] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [processingSessionID, setProcessingSessionID] = useState("")
  const [, setProcessingTick] = useState(0)
  const [terminalWindow, setTerminalWindow] = useState<{ deviceID: string; deviceName: string; deviceOS?: string; workspacePath: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const observedTaskRunStatesRef = useRef<Map<string, { runID: string; status: string }>>(new Map())
  const hasObservedTaskRunStatesRef = useRef(false)
  const notifiedConnectorApprovalTaskIDsRef = useRef(new Set<string>())
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerOverlayRef = useRef<HTMLDivElement | null>(null)
  const environmentDeviceButtonRef = useRef<HTMLButtonElement | null>(null)
  const environmentWorkspaceButtonRef = useRef<HTMLButtonElement | null>(null)
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [sessionTasks, setSessionTasks] = useState<SessionTask[]>([])
  const [isTaskPlanOpen, setIsTaskPlanOpen] = useState(true)
  const [editingMessageID, setEditingMessageID] = useState("")
  const [editingText, setEditingText] = useState("")
  const [editingAttachments, setEditingAttachments] = useState<ChatAttachment[]>([])
  const [filePickerTarget, setFilePickerTarget] = useState<AttachmentTarget>("composer")
  const [selectedSharedPoolID, setSelectedSharedPoolID] = useState("")
  const [loadingSharedSessionID, setLoadingSharedSessionID] = useState("")
  const [sharedSessionID, setSharedSessionID] = useState("")
  const [sharedSessionPoolID, setSharedSessionPoolID] = useState("")
  const [loadedSharedSession, setLoadedSharedSession] = useState<ChatSession | null>(null)

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const updateHost = () => setDesktopSessionsSidebarHost(document.getElementById(media.matches ? "chat-sessions-sidebar-slot-desktop" : "chat-sessions-sidebar-slot-mobile"))
    updateHost()
    media.addEventListener("change", updateHost)
    return () => media.removeEventListener("change", updateHost)
  }, [])

  const { data: catalog = [] } = useQuery<UpstreamChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: agents = [], isFetched: agentsFetched } = useQuery<ChatAgent[]>({
    queryKey: agentsQueryKey,
    enabled: false,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data)
        ? res.data.map(normalizeAgent).filter((agent): agent is ChatAgent => Boolean(agent))
        : []
    },
  })

  const { data: skills = [] } = useQuery<ChatSkill[]>({
    queryKey: skillsQueryKey,
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data)
        ? res.data.map(normalizeSkill).filter((skill): skill is ChatSkill => Boolean(skill))
        : []
    },
  })

  const { data: advancedSettings } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  const { data: knowledgeBases = [] } = useQuery<ChatKnowledgeBase[]>({
    queryKey: ["knowledge-bases"],
    enabled: isAdvanced,
    queryFn: async () => normalizeKnowledgeBases((await api.get("/user/advanced-chat/knowledge-bases")).data).filter((base) => base.vectorized),
  })

  const { data: sharedPools = [] } = useQuery<EnterpriseSharedPool[]>({
    queryKey: ["enterprise-shared-pools", "chat"],
    enabled: isAdvanced && enterpriseMode,
    queryFn: async () => {
      const res = await api.get("/user/enterprise/shared-pools")
      const items = isRecord(res.data) && Array.isArray(res.data.pools) ? res.data.pools : []
      return items.map(normalizeSharedPool).filter((pool): pool is EnterpriseSharedPool => Boolean(pool))
    },
  })

  const selectedSharedPool = useMemo(
    () => sharedPools.find((pool) => String(pool.id) === selectedSharedPoolID),
    [selectedSharedPoolID, sharedPools]
  )

  const { data: sharedPoolSessions = [] } = useQuery<ChatSession[]>({
    queryKey: ["enterprise-shared-pool-sessions", selectedSharedPoolID],
    enabled: isAdvanced && enterpriseMode && Boolean(selectedSharedPoolID),
    queryFn: async () => {
      const res = await api.get(`/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/sessions`)
      const items = isRecord(res.data) && Array.isArray(res.data.sessions) ? res.data.sessions : []
      return items.map(normalizeSession).filter((session): session is ChatSession => Boolean(session))
    },
  })

  const {
    data: serverSessions = [],
    isFetched: serverSessionsFetched,
    refetch: refetchAdvancedSessions,
  } = useQuery<ChatSession[]>({
    queryKey: advancedSessionsQueryKey,
    enabled: isAdvanced,
    refetchInterval: 2500,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions")
      return Array.isArray(res.data) ? res.data.map(normalizeSession).filter((session): session is ChatSession => Boolean(session)) : []
    },
  })

  const {
    data: serverSessionFolders = [],
    refetch: refetchSessionFolders,
  } = useQuery<SessionFolder[]>({
    queryKey: advancedSessionFoldersQueryKey,
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions/folders")
      return Array.isArray(res.data) ? res.data.map(normalizeSessionFolder).filter((folder): folder is SessionFolder => Boolean(folder)) : []
    },
  })

  const { data: connectorDevices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: connectorDevicesQueryKey,
    enabled: isAdvanced,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeConnectorDevice).filter((device): device is ConnectorDevice => Boolean(device)) : []
    },
  })

  const { data: cloudSandboxes = [] } = useQuery<CloudSandboxOption[]>({
    queryKey: ["chat-cloud-sandboxes"],
    enabled: false,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/cloud-sandboxes")
      if (!Array.isArray(res.data)) {
        return []
      }
      return res.data.flatMap((item: unknown) => {
        if (!isRecord(item)) {
          return []
        }
        const id = stringFromUnknown(item.id)
        if (!id) {
          return []
        }
        return [{
          id,
          name: stringFromUnknown(item.name) || id,
          image: stringFromUnknown(item.image) || "",
          status: stringFromUnknown(item.status) || "",
        }]
      })
    },
  })

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionID) || (loadedSharedSession?.id === activeSessionID ? loadedSharedSession : undefined),
    [sessions, activeSessionID, loadedSharedSession]
  )
  const displaySessions = useMemo(() => sessions.map(normalizeRuntimeSession), [sessions])
  const resolvedSessionFolderAssignments = useMemo(() => {
    if (!isAdvanced) {
      return sessionFolderAssignments
    }
    return Object.fromEntries(displaySessions.flatMap((session) => session.folder_id ? [[session.id, session.folder_id]] : []))
  }, [displaySessions, isAdvanced, sessionFolderAssignments])
  const normalizedSessionSearch = sessionSearch.trim().toLowerCase()
  const searchedSessions = useMemo(
    () => displaySessions.filter((session) => (session.title || copy.untitledSession).toLowerCase().includes(normalizedSessionSearch)),
    [copy.untitledSession, displaySessions, normalizedSessionSearch]
  )
  const ungroupedSessions = useMemo(
    () => searchedSessions.filter((session) => !resolvedSessionFolderAssignments[session.id]),
    [resolvedSessionFolderAssignments, searchedSessions]
  )
  const folderSessionGroups = useMemo(
    () => sessionFolders
      .map((folder) => ({ folder, sessions: searchedSessions.filter((session) => resolvedSessionFolderAssignments[session.id] === folder.id) }))
      .filter((group) => group.sessions.length > 0 || !normalizedSessionSearch),
    [normalizedSessionSearch, resolvedSessionFolderAssignments, searchedSessions, sessionFolders]
  )
  const currentSessionRaw = activeSession || (isAdvanced && routeSessionID ? undefined : draftSession)
  const currentSession = currentSessionRaw ? normalizeRuntimeSession(currentSessionRaw) : undefined
  const isSharedSession = Boolean(currentSession?.id && currentSession.id === sharedSessionID && sharedSessionPoolID)
  const currentMessages = currentSession?.messages || []
  const latestMessage = currentMessages[currentMessages.length - 1]
  const welcomeSuggestions = useMemo(
    () => welcomeSuggestionsFor(language, currentSession?.id || draftSession.id),
    [currentSession?.id, draftSession.id, language]
  )
  const recentAgents = useMemo(() => {
    if (!isAdvanced) {
      return []
    }
    const agentIDsFromSessions = [...displaySessions]
      .filter((session) => session.messages.length > 0 && Boolean(session.agent_id))
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .map((session) => session.agent_id || "")
    const seen = new Set<string>()
    return [...recentAgentIDs, ...agentIDsFromSessions]
      .filter((agentID) => {
        if (!agentID || seen.has(agentID)) return false
        seen.add(agentID)
        return true
      })
      .map((agentID) => agents.find((agent) => agent.id === agentID))
      .filter((agent): agent is ChatAgent => Boolean(agent))
      .slice(0, 5)
  }, [agents, displaySessions, isAdvanced, recentAgentIDs])

  useEffect(() => {
    if (!isDesktopTarget()) {
      return
    }
    const title = (currentSession?.title || copy.untitledSession).trim()
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title }, "*")
  }, [copy.untitledSession, currentSession?.title])

  const latestMessageSignal = useMemo(
    () => [
      currentSession?.id || "",
      currentSession?.messages.length || 0,
      latestMessage?.id || "",
      latestMessage?.content || "",
      JSON.stringify(latestMessage?.tool_calls || []),
    ].join("|"),
    [currentSession?.id, currentMessages.length, latestMessage?.id, latestMessage?.content, latestMessage?.tool_calls]
  )
  const currentAdvancedSettings = useMemo<AdvancedChatSettings>(
    () => ({ ...defaultAdvancedChatSettings, ...(advancedSettings ?? {}) }),
    [advancedSettings]
  )
  const { data: storedFilesResponse } = useQuery<StoredFileListResponse | StoredFile[]>({
    queryKey: advancedFilesQueryKey,
    enabled: isAdvanced && currentAdvancedSettings.file_storage_enabled,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/files")
      return normalizeStoredFilesResponse(res.data)
    },
  })
  const storedFiles = Array.isArray(storedFilesResponse) ? storedFilesResponse : storedFilesResponse?.files || []
  const { data: sharedPoolFiles = [] } = useQuery<StoredFile[]>({
    queryKey: ["enterprise-shared-pool-files", selectedSharedPoolID],
    enabled: isAdvanced && enterpriseMode && Boolean(selectedSharedPoolID),
    queryFn: async () => {
      const res = await api.get(`/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/files`)
      const items = isRecord(res.data) && Array.isArray(res.data.files) ? res.data.files : []
      return items.map(normalizeStoredFile).filter((file): file is StoredFile => Boolean(file))
    },
  })
  const { data: sharedPoolDevices = [], isFetched: sharedPoolDevicesFetched } = useQuery<EnterprisePoolDevice[]>({
    queryKey: ["enterprise-shared-pool-devices", sharedSessionPoolID],
    enabled: isAdvanced && enterpriseMode && Boolean(sharedSessionPoolID),
    queryFn: async () => {
      const res = await api.get(`/user/enterprise/shared-pools/${encodeURIComponent(sharedSessionPoolID)}/devices`)
      if (!isRecord(res.data) || !Array.isArray(res.data.devices)) {
        return []
      }
      return res.data.devices.filter(isRecord).flatMap((device): EnterprisePoolDevice[] => {
        const externalDeviceID = stringFromUnknown(device.external_device_id)
        return externalDeviceID ? [{ external_device_id: externalDeviceID }] : []
      })
    },
  })
  const selectableStoredFiles = selectedSharedPoolID ? sharedPoolFiles : storedFiles
  const assistantModeEnabled = !isAdvanced || currentAdvancedSettings.assistant_mode_enabled
  const assistantConnectorToolsEnabled =
    currentAdvancedSettings.assistant_connector_list_files_enabled ||
    currentAdvancedSettings.assistant_connector_read_file_enabled ||
    currentAdvancedSettings.assistant_connector_write_file_enabled ||
    currentAdvancedSettings.assistant_connector_replace_text_enabled ||
    currentAdvancedSettings.assistant_connector_run_command_enabled ||
    currentAdvancedSettings.assistant_connector_web_search_enabled ||
    currentAdvancedSettings.assistant_connector_static_site_enabled
  const selectedAgent = useMemo(() => {
    if (!isAdvanced) {
      return undefined
    }
    const agentID = currentSession?.agent_id || defaultAgentID
    return agents.find((agent) => agent.id === agentID)
  }, [currentSession?.agent_id, agents, isAdvanced])
  const activeRunMode: ChatRunMode = isAdvanced && assistantModeEnabled ? currentSession?.run_mode || "chat" : "chat"
  const activeRun = isAdvanced ? currentSession?.latest_run : undefined
  const isActiveRunRunning = isRunActive(activeRun)
  const activeRunID = activeRun?.id || ""
  const isProcessingLive = Boolean(currentSession) && ((processingSessionID === currentSession?.id && (isSending || isStreamActive)) || isActiveRunRunning)
  // Ticking a counter re-renders once a second; the elapsed time itself is read
  // from the clock during render so the first frame is already correct.
  useEffect(() => {
    if (!isProcessingLive) {
      return
    }
    const timer = window.setInterval(() => setProcessingTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isProcessingLive])
  const liveProcessingUserMessageIndex = isProcessingLive ? lastUserMessageIndex(currentMessages) : -1
  const taskChangeMessage = useMemo(() => {
    if (activeRun?.assistant_message_id) {
      const activeMessage = currentMessages.find((message) => message.id === activeRun.assistant_message_id)
      if (activeMessage) {
        return activeMessage
      }
    }
    return [...currentMessages].reverse().find((message) => message.role === "assistant")
  }, [activeRun?.assistant_message_id, currentMessages])
  const taskChangeSummary = useMemo(
    () => taskChangeSummaryFromToolCalls(taskChangeMessage?.tool_calls?.length ? taskChangeMessage.tool_calls : activeRun?.tool_call_details || []),
    [activeRun?.tool_call_details, taskChangeMessage?.tool_calls]
  )
  const generatedFiles = useMemo(() => generatedFilesFromMessages(currentMessages), [currentMessages])
  useEffect(() => {
    if (!taskChangeSummary.files.some((file) => file.path === selectedTaskChangePath)) {
      setSelectedTaskChangePath(taskChangeSummary.files[0]?.path || "")
    }
  }, [selectedTaskChangePath, taskChangeSummary.files])
  const showAgentWorkStatus = isAdvanced && activeRunMode === "agent_group"
  const { data: agentWork } = useQuery<AgentWorkResponse | undefined>({
    queryKey: agentWorkQueryKey(activeRunID),
    enabled: showAgentWorkStatus && Boolean(activeRunID) && (isAgentWorkOpen || isActiveRunRunning),
    refetchInterval: isActiveRunRunning ? 1000 : false,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/agent-work`)
      return normalizeAgentWorkResponse(res.data)
    },
  })
  const hasApprovalRequiredToolCall = useMemo(
    () => Boolean(currentSession?.messages.some((message) => message.tool_calls?.some((toolCall) => toolCall.status === "approval_required"))),
    [currentSession?.messages]
  )
  const {
    data: pendingConnectorApprovals = [],
    refetch: refetchConnectorApprovals,
  } = useQuery<ConnectorApprovalTask[]>({
    queryKey: connectorApprovalsQueryKey(activeRunID),
    enabled: isAdvanced && Boolean(activeRunID) && (isActiveRunRunning || hasApprovalRequiredToolCall),
    refetchInterval: 1000,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/connector-tasks/pending`)
      return Array.isArray(res.data)
        ? res.data.map(normalizeConnectorApprovalTask).filter((task): task is ConnectorApprovalTask => Boolean(task))
        : []
    },
  })
  useEffect(() => {
    if (!isDesktop || !window.veloceDesktop?.notifyConnectorApproval) {
      return
    }
    for (const task of pendingConnectorApprovals) {
      if (notifiedConnectorApprovalTaskIDsRef.current.has(task.id)) {
        continue
      }
      notifiedConnectorApprovalTaskIDsRef.current.add(task.id)
      const action = task.action || (language === "zh" ? "操作" : "action")
      const deviceName = task.device_name || (language === "zh" ? "连接器" : "Connector")
      const workspace = task.workspace_path ? `\n${task.workspace_path}` : ""
      void window.veloceDesktop.notifyConnectorApproval({
        id: `connector-approval:${task.id}`,
        taskID: task.id,
        title: language === "zh" ? "需要审批" : "Approval required",
        body: language === "zh" ? `${deviceName} 请求执行 ${action}${workspace}` : `${deviceName} requests ${action}${workspace}`,
        approveLabel: language === "zh" ? "批准" : "Approve",
        rejectLabel: language === "zh" ? "拒绝" : "Reject",
      })
    }
  }, [isDesktop, language, pendingConnectorApprovals])
  const activeModelName = isAdvanced ? currentSession?.model_name || selectedAgent?.default_model || modelName : modelName
  const selectedUserChannel = useMemo(
    () => catalog.find((channel) => channel.id === selectedUserChannelID) || catalog[0],
    [catalog, selectedUserChannelID]
  )
  const channelModelOptions = useMemo(() => {
    return selectedUserChannel ? selectedUserChannel.models : modelOptions
  }, [modelOptions, selectedUserChannel])
  const modelSelectOptions = useMemo(
    () => activeModelName && !channelModelOptions.includes(activeModelName) ? [activeModelName, ...channelModelOptions] : channelModelOptions,
    [activeModelName, channelModelOptions]
  )
  const mcpServers = useMemo(() => {
    if (currentAdvancedSettings.mcp_servers.length > 0) {
      return currentAdvancedSettings.mcp_servers
    }
    return mergeMCPServers(currentAdvancedSettings.builtin_mcp_servers, currentAdvancedSettings.custom_mcp_servers)
  }, [currentAdvancedSettings])
  const enabledMCPServers = useMemo(
    () => currentAdvancedSettings.assistant_mcp_tools_enabled ? mcpServers.filter((server) => server.enabled) : [],
    [currentAdvancedSettings.assistant_mcp_tools_enabled, mcpServers]
  )
  const selectedSkills = useMemo(() => {
    const selectedIDs = currentSession?.skill_ids || []
    return skills.filter((skill) => selectedIDs.includes(skill.id))
  }, [currentSession?.skill_ids, skills])
  const availableSkillsToAdd = useMemo(() => {
    const selectedIDs = new Set(currentSession?.skill_ids || [])
    return skills.filter((skill) => !selectedIDs.has(skill.id))
  }, [currentSession?.skill_ids, skills])
	const sessionKnowledgeBases = useMemo(() => {
		const selectedIDs = new Set(currentSession?.knowledge_base_ids || [])
		return knowledgeBases.filter((base) => selectedIDs.has(base.id))
	}, [currentSession?.knowledge_base_ids, knowledgeBases])
	const availableKnowledgeBasesToAdd = useMemo(() => {
		const selectedIDs = new Set(currentSession?.knowledge_base_ids || [])
		return knowledgeBases.filter((base) => !selectedIDs.has(base.id))
	}, [currentSession?.knowledge_base_ids, knowledgeBases])
  const sessionMCPServers = useMemo(() => {
    const selectedIDs = new Set(currentSession?.mcp_server_ids || [])
    return enabledMCPServers.filter((server) => selectedIDs.has(server.id))
  }, [currentSession?.mcp_server_ids, enabledMCPServers])
  const availableMCPServersToAdd = useMemo(() => {
    const selectedIDs = new Set(currentSession?.mcp_server_ids || [])
    return enabledMCPServers.filter((server) => !selectedIDs.has(server.id))
  }, [currentSession?.mcp_server_ids, enabledMCPServers])
  const selectedConnectorDevice = useMemo(
    () => connectorDevices.find((device) => device.id === currentSession?.connector_device_id),
    [currentSession?.connector_device_id, connectorDevices]
  )
  const selectedCloudSandbox = useMemo(
    () => cloudSandboxes.find((sandbox) => sandbox.id === currentSession?.cloud_sandbox_id),
    [currentSession?.cloud_sandbox_id, cloudSandboxes]
  )
  const sharedPoolDeviceIDs = useMemo(() => new Set(sharedPoolDevices.map((device) => device.external_device_id)), [sharedPoolDevices])
  const selectableConnectorDevices = assistantConnectorToolsEnabled
    ? (isSharedSession ? connectorDevices.filter((device) => sharedPoolDeviceIDs.has(device.id)) : connectorDevices)
    : []
  const currentConnectorDeviceID = currentSession?.connector_device_id || ""
  const currentConnectorDevice = connectorDevices.find((device) => device.id === currentConnectorDeviceID)
  const localDesktopConnectorDevice = useMemo(
    () => connectorDevices.find((device) => device.kind === "desktop" && Boolean(desktopInstanceID) && device.desktop_instance_id === desktopInstanceID),
    [connectorDevices, desktopInstanceID]
  )
  const isCurrentConnectorLocal = Boolean(
    isDesktop &&
    currentConnectorDevice?.kind === "desktop" &&
    desktopInstanceID &&
    currentConnectorDevice.desktop_instance_id === desktopInstanceID
  )
  const canOpenWorkspaceInVSCode = Boolean(isAdvanced && isCurrentConnectorLocal && currentSession?.connector_workspace_path)
  const canOpenConnectorTerminal = Boolean(isAdvanced && currentConnectorDevice?.online)
  useEffect(() => {
    if (!isDesktop || typeof window === "undefined" || !window.veloceDesktop?.getDesktopSystemInfo) {
      return
    }
    void window.veloceDesktop.getDesktopSystemInfo()
      .then((info) => setDesktopInstanceID(info.instanceID.trim()))
      .catch(() => setDesktopInstanceID(""))
  }, [isDesktop])
  const workspacePickerDevice = connectorDevices.find((device) => device.id === workspacePickerDeviceID)
  const workspaceDirectoriesQuery = useQuery<WorkspaceDirectories>({
    queryKey: ["advanced-chat-workspace-directories", workspacePickerDeviceID, workspacePickerPath],
    enabled: isWorkspacePickerOpen && Boolean(workspacePickerDeviceID),
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/workspace/directories", {
        params: {
          connector_device_id: workspacePickerDeviceID,
          path: workspacePickerPath,
        },
      })
      return normalizeWorkspaceDirectories(res.data)
    },
  })
  const canInspectGitWorkspace = isAdvanced && activeRunMode !== "chat" && Boolean(currentConnectorDeviceID && currentSession?.connector_workspace_path)
  const gitStatusQuery = useQuery<WorkspaceGitStatus>({
    queryKey: ["advanced-chat-workspace-git-status", currentConnectorDeviceID, currentSession?.connector_workspace_path || "", gitCompareBranch],
    enabled: isGitPanelOpen && canInspectGitWorkspace,
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
  const { data: agentGroups = [], isFetching: isFetchingAgentGroups } = useQuery<ChatAgentGroup[]>({
    queryKey: agentGroupsQueryKey,
    enabled: isAdvanced,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups")
      const rawGroups: unknown[] = Array.isArray(res.data?.groups) ? res.data.groups : Array.isArray(res.data) ? res.data : []
      return rawGroups.map(normalizeChatAgentGroup).filter((group): group is ChatAgentGroup => Boolean(group))
    },
  })
  const currentAgentGroup = useMemo(
    () => agentGroups.find((group) => group.id === currentSession?.agent_group_id),
    [agentGroups, currentSession?.agent_group_id]
  )
  const fallbackAgentWork = useMemo<AgentWorkResponse | undefined>(() => {
    if (!currentAgentGroup || activeRunMode !== "agent_group") {
      return undefined
    }
    return {
      run_id: activeRunID,
      session_id: currentSession?.id || "",
      group_id: currentAgentGroup.id,
      group_name: currentAgentGroup.name,
      agents: currentAgentGroup.agents.map((agent) => ({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_type: agent.type || "worker",
        group_id: currentAgentGroup.id,
        group_name: currentAgentGroup.name,
        status: "idle",
        working: false,
        messages: [],
      })),
      connector_tasks: [],
    }
  }, [activeRunID, activeRunMode, currentAgentGroup, currentSession?.id])
  useEffect(() => {
    if ((configTab === "device" && activeRunMode === "chat") || (configTab === "agent" && activeRunMode === "agent_group")) {
      setConfigTab("basic")
    }
  }, [activeRunMode, configTab])

  useEffect(() => {
    if (!sessionMenu && !sessionFolderContextMenu && !messageSelectionMenu) {
      return
    }
    const close = () => {
      setSessionMenu(null)
      setSessionFolderContextMenu(null)
      setMessageSelectionMenu(null)
      setIsMessageSelectionSearchOpen(false)
    }
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [messageSelectionMenu, sessionFolderContextMenu, sessionMenu])

  useEffect(() => {
    if (isAdvanced) {
      setSessionFolders(serverSessionFolders)
    }
  }, [isAdvanced, serverSessionFolders])

  useEffect(() => {
    if (isAdvanced || typeof window === "undefined") {
      return
    }
    localStorage.setItem(sessionFoldersStorageKey, JSON.stringify(sessionFolders))
  }, [isAdvanced, sessionFolders])

  useEffect(() => {
    if (isAdvanced || typeof window === "undefined") {
      return
    }
    localStorage.setItem(sessionFolderAssignmentsStorageKey, JSON.stringify(sessionFolderAssignments))
  }, [isAdvanced, sessionFolderAssignments])

  const recentWorkspacePaths = useMemo(() => {
    if (!currentConnectorDeviceID) {
      return []
    }
    return uniqueStrings(
      displaySessions
        .filter((session) => session.connector_device_id === currentConnectorDeviceID && session.connector_workspace_path)
        .map((session) => session.connector_workspace_path || "")
    ).slice(0, 6)
  }, [currentConnectorDeviceID, displaySessions])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    localStorage.setItem(storeKeys.sessions, JSON.stringify(sessions))
  }, [isAdvanced, sessions, storeKeys.sessions])

  useEffect(() => {
    if (!isAdvanced || !serverSessionsFetched || serverSessions.length === 0) {
      return
    }
    setSessions((current) => mergeServerSessions(current, serverSessions, activeSessionID))
  }, [activeSessionID, isAdvanced, serverSessions, serverSessionsFetched])

  useEffect(() => {
    if (!isAdvanced || !isDesktop || !window.veloceDesktop?.notifyTaskComplete) {
      return
    }
    const nextStates = new Map<string, { runID: string; status: string }>()
    for (const session of sessions) {
      const run = session.latest_run
      if (!run?.status) {
        continue
      }
      const nextState = { runID: run.id, status: run.status }
      const previousState = observedTaskRunStatesRef.current.get(session.id)
      if (hasObservedTaskRunStatesRef.current && previousState && isRunActiveStatus(previousState.status) && run.status === "completed") {
        const sessionTitle = (session.title || copy.untitledSession).trim()
        const title = language === "zh" ? "任务已完成" : "Task complete"
        const body = language === "zh" ? `${sessionTitle} 已完成` : `${sessionTitle} is complete`
        const notificationID = [session.id, run.id || previousState.runID, run.finished_at || run.updated_at || run.status].join(":")
        void window.veloceDesktop.notifyTaskComplete({ id: notificationID, title, body })
      }
      nextStates.set(session.id, nextState)
    }
    observedTaskRunStatesRef.current = nextStates
    hasObservedTaskRunStatesRef.current = true
  }, [copy.untitledSession, isAdvanced, isDesktop, language, sessions])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    if (activeSessionID && !sessions.some((session) => session.id === activeSessionID) && sessions[0]) {
      setActiveSessionID(sessions[0].id)
      return
    }
    if (activeSessionID && sessions.length === 0) {
      setActiveSessionID("")
    }
  }, [activeSessionID, isAdvanced, sessions])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    if (activeSessionID) {
      localStorage.setItem(storeKeys.selectedSession, activeSessionID)
    } else {
      localStorage.removeItem(storeKeys.selectedSession)
    }
  }, [activeSessionID, isAdvanced, storeKeys.selectedSession])

  const messagesScrollElement = () => {
    if (messagesViewportRef.current) {
      return messagesViewportRef.current
    }
    const marker = messagesEndRef.current
    if (marker) {
      const main = marker.closest("main")
      if (main instanceof HTMLElement) {
        return main
      }
    }
    return (document.scrollingElement as HTMLElement | null) || document.documentElement
  }

  const messagesAtBottom = () => {
    const marker = messagesEndRef.current
    if (!marker) {
      return true
    }
    const container = messagesScrollElement()
    const markerBottom = marker.getBoundingClientRect().bottom
    const containerBottom = container === document.scrollingElement || container === document.documentElement
      ? window.innerHeight
      : container.getBoundingClientRect().bottom
    return markerBottom - containerBottom < 120
  }

  const scrollMessagesToLatest = (behavior: ScrollBehavior = "smooth") => {
    const container = messagesScrollElement()
    if (container === document.scrollingElement || container === document.documentElement) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior })
    }
    setShowJumpToLatest(false)
  }

  useEffect(() => {
    setShowJumpToLatest(false)
    requestAnimationFrame(() => scrollMessagesToLatest("auto"))
  }, [currentSession?.id])

  useEffect(() => {
    setSessionTasks([])
    setIsTaskPlanOpen(true)
    const sessionID = currentSession?.id
    if (!isAdvanced || !sessionID) {
      return
    }
    let cancelled = false
    api.get(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}/tasks`)
      .then((res) => {
        if (!cancelled) {
          setSessionTasks(normalizeSessionTasks(res.data) || [])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAdvanced, currentSession?.id])

  // Assistant and agent-group runs surface tool calls through run polling
  // instead of the completion stream, so mirror task updates from there too.
  useEffect(() => {
    const details = activeRun?.tool_call_details
    if (!isAdvanced || !details || details.length === 0) {
      return
    }
    for (let index = details.length - 1; index >= 0; index--) {
      const call = details[index]
      const tasks = sessionTasksFromToolCall(call.name, call.status, call.result)
      if (tasks) {
        setSessionTasks(tasks)
        return
      }
    }
  }, [isAdvanced, activeRun?.tool_call_details])

  // The ask_user card is interactive only while the newest message is the
  // assistant's question; once the user answers, the reply becomes the last
  // message and the card disappears.
  const pendingAskUserPrompt = useMemo(() => {
    if (!isAdvanced || isStreamActive || isSending || isActiveRunRunning) {
      return null
    }
    const messages = currentSession?.messages || []
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
      return null
    }
    return askUserPromptFromToolCalls(lastMessage.tool_calls)
  }, [isAdvanced, isStreamActive, isSending, isActiveRunRunning, currentSession?.messages])

  useEffect(() => {
    const container = messagesScrollElement()
    const target: HTMLElement | Window = container === document.scrollingElement || container === document.documentElement
      ? window
      : container
    const handleScroll = () => setShowJumpToLatest(!messagesAtBottom())
    target.addEventListener("scroll", handleScroll, { passive: true })
    requestAnimationFrame(handleScroll)
    return () => target.removeEventListener("scroll", handleScroll)
  }, [currentSession?.id])

  useEffect(() => {
    if (!showJumpToLatest) {
      requestAnimationFrame(() => scrollMessagesToLatest("smooth"))
    }
  }, [latestMessageSignal, showJumpToLatest])

  useEffect(() => {
    const textarea = composerTextareaRef.current
    if (!isAdvanced || !textarea) {
      return
    }
    textarea.style.height = "32px"
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 32), 160)}px`
  }, [prompt, currentSession?.id, currentSession?.messages.length, isAdvanced])

  // The composer floats over the message list, so the list needs bottom padding
  // matching the composer's real height or the newest messages hide behind it.
  // Runs after the textarea autosize effect so it measures the resized state.
  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    const measure = () => setComposerOverlayHeight(composerOverlayRef.current?.offsetHeight ?? 0)
    measure()
    const overlay = composerOverlayRef.current
    if (!overlay || typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [isAdvanced, currentSession?.id, prompt, attachments.length, pendingConnectorApprovals.length, taskChangeSummary.files.length])

  useEffect(() => {
    if (!isAdvanced || composerOverlayHeight <= 0 || showJumpToLatest) {
      return
    }
    scrollMessagesToLatest("auto")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOverlayHeight])

  useEffect(() => {
    if (modelName) {
      localStorage.setItem(storeKeys.model, modelName)
    }
  }, [modelName, storeKeys.model])

  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    if (!selectedUserChannel && selectedUserChannelID !== 0) {
      setSelectedUserChannelID(0)
      return
    }
    if (!selectedUserChannelID && selectedUserChannel) {
      setSelectedUserChannelID(selectedUserChannel.id)
    }
  }, [isAdvanced, selectedUserChannel, selectedUserChannelID])

  useEffect(() => {
    if (isAdvanced && selectedUserChannelID) {
      localStorage.setItem(storeKeys.userChannel, String(selectedUserChannelID))
    }
  }, [isAdvanced, selectedUserChannelID, storeKeys.userChannel])

  useEffect(() => {
    if (!isAdvanced || !currentSession?.user_channel_id || currentSession.user_channel_id === selectedUserChannelID) {
      return
    }
    setSelectedUserChannelID(currentSession.user_channel_id)
  }, [currentSession?.id, currentSession?.user_channel_id, isAdvanced, selectedUserChannelID])

  useEffect(() => {
    if (!modelName && modelOptions.length > 0) {
      setModelName(modelOptions[0])
    }
  }, [modelName, modelOptions])

  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    if (!agentsFetched) {
      return
    }
    if (selectedAgentID && agents.some((agent) => agent.id === selectedAgentID)) {
      localStorage.setItem(selectedAgentStoreKey, selectedAgentID)
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (defaultAgent) {
      setSelectedAgentID(defaultAgent.id)
      localStorage.setItem(selectedAgentStoreKey, defaultAgent.id)
      return
    }
    setSelectedAgentID("")
    localStorage.removeItem(selectedAgentStoreKey)
  }, [agents, agentsFetched, isAdvanced, selectedAgentID])

  useEffect(() => {
    if (!isAdvanced || !agentsFetched || !currentSession || currentSession.agent_id) {
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (!defaultAgent) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: defaultAgent.id,
      model_name: session.model_name || defaultAgent.default_model || modelName || modelOptions[0] || "",
    }))
  }, [agents, agentsFetched, currentSession?.agent_id, currentSession?.id, isAdvanced, modelName, modelOptions])

  useEffect(() => {
    if (!isAdvanced || !requestedAgentID || !agentsFetched) {
      return
    }
    const agent = agents.find((item) => item.id === requestedAgentID)
    if (!agent) {
      navigate("/chat", { replace: true })
      return
    }
    const session = createSession({
      agentID: agent.id,
      modelName: modelName || agent.default_model || modelOptions[0] || "",
    })
    setDraftSession(session)
    setActiveSessionID("")
    setSelectedAgentID(agent.id)
    setIsSessionsSidebarOpen(false)
    setPrompt("")
    setAttachments([])
    cancelEdit()
    navigate("/chat", { replace: true })
  }, [agents, agentsFetched, isAdvanced, modelName, modelOptions, navigate, requestedAgentID])

  useEffect(() => {
    if (!isAdvanced || !currentSession || currentSession.model_name || modelOptions.length === 0) {
      return
    }
    const defaultModel = selectedAgent?.default_model || modelName || modelOptions[0]
    updateSession(currentSession.id, (session) => ({ ...session, model_name: defaultModel }))
  }, [currentSession, isAdvanced, modelName, modelOptions, selectedAgent?.default_model])

  useEffect(() => {
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (!pendingAgentID && defaultAgent) {
      setPendingAgentID(defaultAgent.id)
      return
    }
    if (pendingAgentID && !agents.some((agent) => agent.id === pendingAgentID)) {
      setPendingAgentID(defaultAgent?.id || "")
    }
  }, [agents, pendingAgentID])

  useEffect(() => {
    if (!pendingConnectorDeviceID && selectableConnectorDevices[0]) {
      setPendingConnectorDeviceID(selectableConnectorDevices[0].id)
      return
    }
    if (pendingConnectorDeviceID && !selectableConnectorDevices.some((device) => device.id === pendingConnectorDeviceID)) {
      setPendingConnectorDeviceID(selectableConnectorDevices[0]?.id || "")
    }
  }, [selectableConnectorDevices, connectorDevices, pendingConnectorDeviceID])

  const createNewSession = async (context: { folderID?: string; poolID?: string } = {}) => {
    setSessionMenu(null)
    setSharedSessionID("")
    setSharedSessionPoolID(context.poolID || "")
    setSelectedSharedPoolID(context.poolID || "")
    setLoadedSharedSession(null)
    const defaultAgent = isAdvanced ? agents.find((agent) => agent.id === defaultAgentID) || agents[0] : undefined
    if (isAdvanced && context.poolID) {
      try {
        const res = await api.post(`/user/enterprise/shared-pools/${encodeURIComponent(context.poolID)}/sessions/new`, {
          agent_id: defaultAgent?.id || "",
          model_name: modelName || defaultAgent?.default_model || modelOptions[0] || "",
          user_channel_id: selectedUserChannelID ? Number(selectedUserChannelID) : 0,
        })
        const payload = isRecord(res.data) ? res.data : {}
        const sharedSession = normalizeSession(payload.session)
        if (!sharedSession) {
          throw new Error(language === "zh" ? "共享会话创建失败" : "Failed to create shared session")
        }
        setLoadedSharedSession(sharedSession)
        setSharedSessionID(sharedSession.id)
        setSharedSessionPoolID(context.poolID)
        setActiveSessionID(sharedSession.id)
        setPrompt("")
        setAttachments([])
        setIsSessionsSidebarOpen(false)
        cancelEdit()
        await queryClient.invalidateQueries({ queryKey: ["enterprise-shared-pool-sessions", context.poolID] })
        if (location.pathname !== "/chat") {
          navigate("/chat")
        }
      } catch (err) {
        setSharedSessionPoolID("")
        setSelectedSharedPoolID("")
        error(apiErrorMessage(err, language === "zh" ? "无法在该文件夹中新建会话" : "Unable to create a session in this folder"))
      }
      return
    }
    const session = { ...createSession({
      agentID: defaultAgent?.id,
      modelName: isAdvanced ? modelName || defaultAgent?.default_model || modelOptions[0] || "" : undefined,
    }), folder_id: context.folderID }
    setDraftSession(session)
    setActiveSessionID("")
    setIsSessionsSidebarOpen(false)
    setPrompt("")
    setAttachments([])
    cancelEdit()
    if (isAdvanced && location.pathname !== "/chat") {
      navigate("/chat")
    }
  }

  const startBrowserPageConversation = (title: string, url: string) => {
    const pageURL = url.trim()
    if (!pageURL) {
      return
    }
    const defaultAgent = isAdvanced ? agents.find((agent) => agent.id === defaultAgentID) || agents[0] : undefined
    const session = createSession({
      agentID: defaultAgent?.id,
      modelName: isAdvanced ? modelName || defaultAgent?.default_model || modelOptions[0] || "" : undefined,
    })
    setDraftSession(session)
    setActiveSessionID("")
    setIsSessionsSidebarOpen(false)
    setPrompt(language === "zh"
      ? `请帮我阅读并回答这个页面：${title.trim() || pageURL}\n${pageURL}\n`
      : `Please read and answer questions about this page: ${title.trim() || pageURL}\n${pageURL}\n`)
    setAttachments([])
    cancelEdit()
    if (isAdvanced && location.pathname !== "/chat") {
      navigate("/chat")
    }
    window.setTimeout(() => composerTextareaRef.current?.focus(), 0)
  }

  useEffect(() => {
    const receiveBrowserPage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== "object" || data.type !== "veloce-browser-ask-page") {
        return
      }
      startBrowserPageConversation(typeof data.title === "string" ? data.title : "", typeof data.url === "string" ? data.url : "")
    }
    window.addEventListener("message", receiveBrowserPage)
    return () => window.removeEventListener("message", receiveBrowserPage)
  }, [agents, isAdvanced, language, location.pathname, modelName, modelOptions])

  const chooseWelcomeSuggestion = (promptText: string) => {
    setPrompt(promptText)
    window.setTimeout(() => composerTextareaRef.current?.focus(), 0)
  }

  const openCurrentWorkspaceInVSCode = async () => {
    const workspacePath = currentSession?.connector_workspace_path || ""
    if (!canOpenWorkspaceInVSCode || !window.veloceDesktop?.openInVSCode) {
      return
    }
    try {
      const result = await window.veloceDesktop.openInVSCode(workspacePath)
      if (!result.ok) {
        error(result.message || gitCopy.openVSCodeFailed)
      }
    } catch (err) {
      error(apiErrorMessage(err, gitCopy.openVSCodeFailed))
    }
  }

  const deleteSession = (sessionID: string) => {
    setSessionMenu(null)
    if (isAdvanced) {
      void api.delete(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}`).then(() => refetchAdvancedSessions()).catch(() => undefined)
    }
    const nextSessions = sessions.filter((session) => session.id !== sessionID)
    setSessionFolderAssignments((current) => {
      if (!current[sessionID]) {
        return current
      }
      const next = { ...current }
      delete next[sessionID]
      return next
    })
    setSessions(nextSessions)
    if (isAdvanced) {
      if (routeSessionID === sessionID) {
        const nextID = nextSessions[0]?.id || ""
        navigate(nextID ? `/chat/session/${encodeURIComponent(nextID)}` : "/chat", { replace: true })
      }
    } else if (activeSessionID === sessionID || !nextSessions.some((session) => session.id === activeSessionID)) {
      setActiveSessionID(nextSessions[0]?.id || "")
    }
    cancelEdit()
  }

  const createSessionFolder = async () => {
    const name = newSessionFolderName.trim().slice(0, 80)
    if (!name) {
      return
    }
    try {
      if (isAdvanced) {
        const res = await api.post("/user/advanced-chat/sessions/folders", { name })
        const folder = normalizeSessionFolder(res.data)
        if (!folder) {
          throw new Error("Invalid session folder")
        }
        setSessionFolders((current) => [...current, folder])
        void refetchSessionFolders()
      } else {
        setSessionFolders((current) => [...current, { id: createID(), name }])
      }
      setNewSessionFolderName("")
      setIsSessionFolderDialogOpen(false)
    } catch (err) {
      error(apiErrorMessage(err, sessionSidebarCopy.createFolderFailed))
    }
  }

  const moveSessionToFolder = async (sessionID: string, folderID = "") => {
    try {
      if (isAdvanced) {
        await api.put(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}/folder`, { folder_id: folderID })
        setSessions((current) => current.map((session) => session.id === sessionID ? { ...session, folder_id: folderID || undefined } : session))
        void refetchAdvancedSessions()
      } else {
        setSessionFolderAssignments((current) => {
          const next = { ...current }
          if (folderID) {
            next[sessionID] = folderID
          } else {
            delete next[sessionID]
          }
          return next
        })
      }
    } catch (err) {
      error(apiErrorMessage(err, sessionSidebarCopy.moveFailed))
    }
    setSessionMenu(null)
  }

  const renameSessionTitle = (session: ChatSession) => {
    setSessionMenu(null)
    setRenamingSession(session)
    setRenamedTitle(session.title || copy.untitledSession)
  }

  const saveSessionTitle = () => {
    const title = renamedTitle.trim()
    if (!title) {
      return
    }
    if (renamingSession) {
      updateSession(renamingSession.id, (current) => ({ ...current, title }), { persist: true })
    }
    setRenamingSession(null)
  }

  const regenerateSessionTitle = async (session: ChatSession) => {
    setSessionMenu(null)
    if (!isAdvanced || session.id === sharedSessionID) {
      return
    }
    setRegeneratingTitleSessionID(session.id)
    try {
      const res = await api.post(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}/title/regenerate`)
      const saved = normalizeSession(res.data?.session)
      if (saved) {
        setSessions((current) => upsertSession(current, saved))
      } else if (typeof res.data?.title === "string" && res.data.title.trim()) {
        updateSession(session.id, (current) => ({ ...current, title: res.data.title.trim() }))
      }
      void refetchAdvancedSessions()
    } catch (err) {
      error(apiErrorMessage(err, copy.regenerateTitleFailed))
    } finally {
      setRegeneratingTitleSessionID("")
    }
  }

  const persistAdvancedSession = (session: ChatSession) => {
    if (!isAdvanced || isRunActive(session.latest_run)) {
      return
    }
    saveAdvancedSessionSnapshot(session)
      .then((saved) => {
        if (saved) {
          setSessions((current) => upsertSession(current, saved))
          if (selectedSharedPoolID) {
            void api.post(`/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/sessions`, { id: saved.id })
              .then(() => queryClient.invalidateQueries({ queryKey: ["enterprise-shared-pool-sessions", selectedSharedPoolID] }))
              .catch(() => undefined)
          }
        }
      })
      .catch((err) => error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed)))
  }

  const updateSession = (sessionID: string, updater: (session: ChatSession) => ChatSession, options: { persist?: boolean; materialize?: boolean } = {}) => {
    const existingSession = sessions.find((session) => session.id === sessionID)
    const baseSession = existingSession || (draftSession.id === sessionID ? draftSession : undefined)
    const persistedSession = baseSession ? normalizeRuntimeSession({ ...updater(normalizeRuntimeSession(baseSession)), updated_at: new Date().toISOString() }) : undefined
    setSessions((current) => {
      const index = current.findIndex((session) => session.id === sessionID)
      if (index >= 0) {
        return current.map((session) =>
          session.id === sessionID ? normalizeRuntimeSession({ ...updater(normalizeRuntimeSession(session)), updated_at: new Date().toISOString() }) : normalizeRuntimeSession(session)
        )
      }
      if (options.materialize && persistedSession) {
        return [persistedSession, ...current]
      }
      return current.map(normalizeRuntimeSession)
    })
    if (draftSession.id === sessionID) {
      setDraftSession((current) => current.id === sessionID ? normalizeRuntimeSession({ ...updater(normalizeRuntimeSession(current)), updated_at: new Date().toISOString() }) : normalizeRuntimeSession(current))
    }
    if (options.materialize) {
      setActiveSessionID(sessionID)
      if (isAdvanced && !routeSessionID) {
        navigate(`/chat/session/${encodeURIComponent(sessionID)}`, { replace: true })
      }
    }
    if (options.persist && persistedSession && existingSession) {
      persistAdvancedSession(persistedSession)
    }
  }

  const autoLocalAssistantSessionIDsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!isAdvanced || !isDesktop || activeRunMode !== "assistant" || !currentSession || !localDesktopConnectorDevice) {
      return
    }
    if (currentSession.cloud_sandbox_id || currentSession.connector_device_id === localDesktopConnectorDevice.id || autoLocalAssistantSessionIDsRef.current.has(currentSession.id)) {
      return
    }
    autoLocalAssistantSessionIDsRef.current.add(currentSession.id)
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: localDesktopConnectorDevice.id,
      connector_workspace_path: session.connector_device_id === localDesktopConnectorDevice.id ? session.connector_workspace_path : undefined,
    }), { persist: true })
  }, [activeRunMode, currentSession, isAdvanced, isDesktop, localDesktopConnectorDevice])

  const selectSession = (sessionID: string) => {
    setSessionMenu(null)
    if (sessionID !== sharedSessionID) {
      setSharedSessionID("")
      setSharedSessionPoolID("")
      setLoadedSharedSession(null)
    }
    setActiveSessionID(sessionID)
    if (isAdvanced) {
      navigate(`/chat/session/${encodeURIComponent(sessionID)}`)
    }
    setIsSessionsSidebarOpen(false)
    cancelEdit()
  }

  const setSessionAgent = (agentID: string) => {
    const nextAgentID = agentID || defaultAgentID
    setSelectedAgentID(nextAgentID)
    setRecentAgentIDs((current) => {
      const next = [nextAgentID, ...current.filter((id) => id !== nextAgentID)].slice(0, 5)
      localStorage.setItem(recentAgentStoreKey, JSON.stringify(next))
      return next
    })
    const agent = agents.find((item) => item.id === nextAgentID)
    const nextModel = agent?.default_model || modelName || modelOptions[0] || ""
    if (nextModel) {
      setModelName(nextModel)
    }
    setSelectedUserChannelID(agent?.user_channel_id || 0)
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: nextAgentID,
      user_channel_id: agent?.user_channel_id || undefined,
      model_name: nextModel,
    }), { persist: true })
  }

  const removeAgentFromSession = () => {
    if (!currentSession) {
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID)
    setSelectedAgentID(defaultAgentID)
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: defaultAgentID,
      user_channel_id: defaultAgent?.user_channel_id || undefined,
    }), { persist: true })
  }

  const handleSessionModelChange = (value: string) => {
    if (activeRunMode === "agent_group") {
      return
    }
    if (value.trim()) {
      setModelName(value.trim())
    }
    if (isAdvanced && currentSession) {
      updateSession(currentSession.id, (session) => ({ ...session, model_name: value }), { persist: true })
      return
    }
    setModelName(value)
  }

  const setSessionRunMode = (mode: ChatRunMode) => {
    if (!isAdvanced || !currentSession) {
      return
    }
    const hasStarted = currentMessages.length > 0 || isRunActive(currentSession.latest_run)
    if (currentSession.run_mode !== "chat" && mode === "chat" && hasStarted) {
      return
    }
    if ((mode === "assistant" || mode === "agent_group") && !assistantModeEnabled) {
      error(copy.assistantModeDisabled)
      return
    }
    const localDeviceID = mode === "assistant" && isDesktop ? localDesktopConnectorDevice?.id || "" : ""
    if (mode === "assistant" && localDeviceID) {
      autoLocalAssistantSessionIDsRef.current.add(currentSession.id)
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      run_mode: mode,
      agent_id: mode === "agent_group" ? undefined : session.agent_id || defaultAgentID,
      agent_group_id: mode === "agent_group" ? session.agent_group_id : undefined,
      connector_device_id: mode === "chat" || session.cloud_sandbox_id ? undefined : localDeviceID || session.connector_device_id,
      connector_workspace_path: mode === "chat" || session.cloud_sandbox_id ? undefined : localDeviceID && session.connector_device_id !== localDeviceID ? undefined : session.connector_workspace_path,
      cloud_sandbox_id: mode === "chat" ? undefined : session.cloud_sandbox_id,
      connector_auto_approve: mode === "chat" ? false : session.connector_auto_approve,
      connector_approval_mode: mode === "chat" ? "manual" : connectorApprovalModeFor(session),
      connector_command_prefixes: mode === "chat" ? [] : session.connector_command_prefixes || [],
      model_name: mode === "agent_group" ? undefined : session.model_name,
    }), { persist: true })
    setComposerControlMenu("")
  }

  const addSessionSkill = (skillID: string) => {
    if (!currentSession) {
      return
    }
    if ((currentSession.skill_ids || []).includes(skillID)) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      skill_ids: [...(session.skill_ids || []), skillID],
    }), { persist: true })
  }

  const removeSessionSkill = (skillID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      skill_ids: (session.skill_ids || []).filter((id) => id !== skillID),
    }), { persist: true })
  }

  const addSessionMCPServer = (serverID: string) => {
    if (!currentSession) {
      return
    }
    if (!currentAdvancedSettings.assistant_mcp_tools_enabled) {
      error(copy.assistantMCPToolsDisabled)
      return
    }
    if ((currentSession.mcp_server_ids || []).includes(serverID)) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      mcp_server_ids: [...(session.mcp_server_ids || []), serverID],
    }), { persist: true })
  }

  const removeSessionMCPServer = (serverID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      mcp_server_ids: (session.mcp_server_ids || []).filter((id) => id !== serverID),
    }), { persist: true })
  }

  const setSessionConnector = (deviceID: string, workspacePath: string, approvalMode: ConnectorApprovalMode, commandPrefixes: string[]) => {
    if (!currentSession) {
      return
    }
    if (!assistantConnectorToolsEnabled) {
      error(copy.assistantWorkspaceToolsDisabled)
      return
    }
    if (isSharedSession && deviceID && !sharedPoolDeviceIDs.has(deviceID)) {
      error(language === "zh" ? "共享会话只能使用此池分配的设备" : "Shared sessions can only use devices assigned to this pool")
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: deviceID || undefined,
      connector_workspace_path: workspacePath || undefined,
      cloud_sandbox_id: deviceID ? undefined : session.cloud_sandbox_id,
      connector_auto_approve: approvalMode === "full_access",
      connector_approval_mode: approvalMode,
      connector_command_prefixes: uniqueStrings(commandPrefixes),
    }), { persist: true })
  }

  const setSessionCloudSandbox = (sandboxID: string) => {
    if (!currentSession) {
      return
    }
    if (!assistantConnectorToolsEnabled) {
      error(copy.assistantWorkspaceToolsDisabled)
      return
    }
    // Cloud sandboxes are host-policy governed: the backend forces the
    // full-access approval mode, so mirror that in the local session state.
    updateSession(currentSession.id, (session) => ({
      ...session,
      cloud_sandbox_id: sandboxID || undefined,
      connector_device_id: undefined,
      connector_workspace_path: undefined,
      connector_auto_approve: Boolean(sandboxID),
      connector_approval_mode: sandboxID ? "full_access" : session.connector_approval_mode,
    }), { persist: true })
    setPendingCloudSandboxID(sandboxID)
    setPendingConnectorDeviceID("")
    setPendingConnectorWorkspace("")
    setWorkspaceSkills([])
  }

  const setSessionConnectorDevice = (deviceID: string) => {
    if (!currentSession) {
      return
    }
    if (!assistantConnectorToolsEnabled) {
      error(copy.assistantWorkspaceToolsDisabled)
      return
    }
    if (isSharedSession && deviceID && !sharedPoolDeviceIDs.has(deviceID)) {
      error(language === "zh" ? "共享会话只能使用此池分配的设备" : "Shared sessions can only use devices assigned to this pool")
      return
    }
    const keepWorkspace = currentSession.connector_device_id === deviceID ? currentSession.connector_workspace_path : ""
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: deviceID || undefined,
      connector_workspace_path: keepWorkspace || undefined,
      cloud_sandbox_id: deviceID ? undefined : session.cloud_sandbox_id,
    }), { persist: true })
    setPendingConnectorDeviceID(deviceID)
    setPendingConnectorWorkspace(keepWorkspace || "")
    setComposerControlMenu("")
  }

	const addSessionKnowledgeBase = (knowledgeBaseID: string) => {
		if (!currentSession || (currentSession.knowledge_base_ids || []).includes(knowledgeBaseID)) return
		updateSession(currentSession.id, (session) => ({ ...session, knowledge_base_ids: [...(session.knowledge_base_ids || []), knowledgeBaseID] }), { persist: true })
	}

	const removeSessionKnowledgeBase = (knowledgeBaseID: string) => {
		if (!currentSession) return
		updateSession(currentSession.id, (session) => ({ ...session, knowledge_base_ids: (session.knowledge_base_ids || []).filter((id) => id !== knowledgeBaseID) }), { persist: true })
	}

  useEffect(() => {
    if (!isSharedSession || !sharedPoolDevicesFetched || !currentSession?.connector_device_id || sharedPoolDeviceIDs.has(currentSession.connector_device_id)) {
      return
    }
    updateSession(currentSession.id, (session) => ({ ...session, connector_device_id: undefined, connector_workspace_path: undefined }), { persist: true })
    setPendingConnectorDeviceID("")
    setPendingConnectorWorkspace("")
  }, [currentSession?.connector_device_id, currentSession?.id, isSharedSession, sharedPoolDeviceIDs, sharedPoolDevicesFetched, updateSession])

  const setSessionAgentGroup = (groupID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_group_id: groupID || undefined,
    }), { persist: true })
    setComposerControlMenu("")
  }

  const setSessionWorkspacePath = (workspacePath: string) => {
    if (!currentSession) {
      return
    }
    const path = workspacePath.trim()
    const deviceID = currentSession.connector_device_id || ""
    if (!deviceID) {
      return
    }
    setSessionConnector(
      deviceID,
      path,
      connectorApprovalModeFor(currentSession),
      currentSession.connector_command_prefixes || commandPrefixesFromText(pendingConnectorCommandPrefixes)
    )
    setPendingConnectorWorkspace(path)
    setComposerControlMenu("")
  }

  const openWorkspacePicker = async (target: WorkspacePickerTarget = "session") => {
    const deviceID = target === "session" ? currentSession?.connector_device_id || "" : pendingConnectorDeviceID
    const device = connectorDevices.find((item) => item.id === deviceID)
    if (!deviceID || !device) {
      error(copy.noDeviceSelected)
      return
    }
    const currentPath = target === "session"
      ? currentSession?.connector_workspace_path || ""
      : pendingConnectorWorkspace.trim()
    const isCurrentDesktopDevice = isDesktop && device.kind === "desktop" && Boolean(desktopInstanceID) && device.desktop_instance_id === desktopInstanceID
    if (isCurrentDesktopDevice && window.veloceDesktop?.chooseDesktopFolder) {
      try {
        const selectedPath = (await window.veloceDesktop.chooseDesktopFolder(currentPath)).trim()
        if (!selectedPath) {
          return
        }
        if (target === "pending") {
          setPendingConnectorWorkspace(selectedPath)
        } else {
          setSessionWorkspacePath(selectedPath)
        }
      } catch (err) {
        error(err instanceof Error ? err.message : workspacePickerCopy.title)
      }
      return
    }
    setWorkspacePickerTarget(target)
    setWorkspacePickerDeviceID(deviceID)
    setWorkspacePickerPath(currentPath || (device.os?.toLowerCase() === "windows" ? "" : "/"))
    setIsWorkspacePickerOpen(true)
  }

  const selectWorkspacePickerPath = () => {
    if (!workspacePickerPath) {
      return
    }
    if (workspacePickerTarget === "pending") {
      setPendingConnectorWorkspace(workspacePickerPath)
    } else {
      setSessionWorkspacePath(workspacePickerPath)
    }
    setIsWorkspacePickerOpen(false)
  }

  const clearSessionConnector = () => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: undefined,
      connector_workspace_path: undefined,
      cloud_sandbox_id: undefined,
      agent_group_id: undefined,
      connector_auto_approve: false,
      connector_approval_mode: "manual",
      connector_command_prefixes: [],
    }), { persist: true })
    setPendingCloudSandboxID("")
    setWorkspaceSkills([])
  }

  const refreshWorkspaceSkills = async () => {
    const deviceID = currentSession?.connector_device_id || pendingConnectorDeviceID
    const workspacePath = currentSession?.connector_workspace_path || pendingConnectorWorkspace.trim()
    if (!deviceID) {
      error(copy.noDeviceSelected)
      return
    }
    setIsRefreshingWorkspaceSkills(true)
    try {
      const res = await api.post("/user/advanced-chat/workspace-skills/refresh", {
        connector_device_id: deviceID,
        connector_workspace_path: workspacePath || undefined,
      })
      const rawSkills: unknown[] = Array.isArray(res.data?.skills) ? res.data.skills : []
      const skills = rawSkills.map(normalizeWorkspaceSkill).filter((skill): skill is WorkspaceSkill => Boolean(skill))
      setWorkspaceSkills(skills)
    } catch (err) {
      error(apiErrorMessage(err, copy.workspaceSkillsRefreshFailed))
    } finally {
      setIsRefreshingWorkspaceSkills(false)
    }
  }

  const decideConnectorApproval = async (taskID: string, approved: boolean) => {
    if (!taskID || decidingConnectorTaskID) {
      return
    }
    setDecidingConnectorTaskID(taskID)
    try {
      await api.post(`/user/advanced-chat/connector-tasks/${encodeURIComponent(taskID)}/decision`, { approved })
      void window.veloceDesktop?.dismissConnectorApproval(taskID)
      if (activeSessionID) {
        updateSession(activeSessionID, (session) => ({
          ...session,
          messages: session.messages.map((message) => ({
            ...message,
            tool_calls: (message.tool_calls || []).map((toolCall) =>
              stringArgument(toolCall.arguments, "connector_task_id") === taskID
                ? { ...toolCall, status: approved ? "running" : "error" }
                : toolCall
            ),
          })),
        }))
      }
      await refetchConnectorApprovals()
      void refetchAdvancedSessions()
    } catch (err) {
      await refetchConnectorApprovals()
      error(apiErrorMessage(err, copy.connectorApprovalFailed))
    } finally {
      setDecidingConnectorTaskID("")
    }
  }

  const runGitAction = async (action: "commit" | "push") => {
    if (!currentConnectorDeviceID || isGitActionSubmitting) {
      return
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
        approval_mode: connectorApprovalModeFor(currentSession),
        action,
        message: action === "commit" ? gitCommitMessage.trim() : "",
      })
      const task = normalizeConnectorTaskStatus(res.data)
      setGitActionTaskID(task.id)
      if (action === "commit") {
        setGitCommitMessage("")
      }
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

  const openAdvancedConfig = (tab: SessionConfigTab = configTab) => {
    if (tab === "mcp" && !currentAdvancedSettings.assistant_mcp_tools_enabled) {
      tab = "basic"
    }
    if (tab === "device" && !assistantConnectorToolsEnabled) {
      tab = "basic"
    }
    if (tab === "device") {
      setPendingConnectorDeviceID(currentSession?.connector_device_id || connectorDevices[0]?.id || "")
      setPendingConnectorWorkspace(currentSession?.connector_workspace_path || "")
      setPendingConnectorApprovalMode(connectorApprovalModeFor(currentSession))
      setPendingConnectorCommandPrefixes((currentSession?.connector_command_prefixes || []).join("\n"))
    }
    setConfigTab(tab)
    setIsConfigOpen(true)
  }

  const stopActiveTask = async () => {
    if (isStopping) {
      return
    }
    setIsStopping(true)
    abortControllerRef.current?.abort()
    if (isAdvanced && activeRunID && currentSession) {
      try {
        const res = await api.post(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/stop`)
        const stoppedRun = normalizeRun(res.data)
        updateSession(currentSession.id, (current) => ({
          ...current,
          latest_run: stoppedRun || (current.latest_run ? { ...current.latest_run, status: "cancelled", status_message: "cancelled" } : current.latest_run),
        }))
        void refetchAdvancedSessions()
      } catch (err) {
        error(apiErrorMessage(err, copy.stopFailed))
      } finally {
        setIsStopping(false)
      }
    } else {
      setIsStopping(false)
    }
  }

  const handleComposerPromptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(event.currentTarget.value)
  }

  const handleComposerPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      sendMessage()
    }
  }

  const sendMessage = async () => sendMessageWithContent(null)

  // rawText comes from interactive cards (e.g. ask_user answers); it bypasses
  // the composer draft and leaves staged attachments untouched.
  const sendMessageWithContent = async (rawText: string | null) => {
    const content = (rawText ?? prompt).trim()
    const activeAttachments = rawText == null ? attachments : []
    const session = currentSession
    const resolvedModel = activeModelName.trim()
    if (!session) {
      return
    }
    if (isSharedSession) {
      if (!content && activeAttachments.length === 0) {
        return
      }
      const messageContent = messageContentWithAttachments(content, activeAttachments)
      const nextTitle = session.title || titleFromMessage(content || activeAttachments[0]?.name || copy.attachmentMessageTitle, copy)
      setIsSending(true)
      try {
        const res = await api.post(`/user/enterprise/shared-pools/${encodeURIComponent(sharedSessionPoolID)}/sessions/${encodeURIComponent(session.id)}/messages`, {
          content: messageContent,
          title: nextTitle,
        })
        const payload = isRecord(res.data) ? res.data : {}
        const sharedSession = normalizeSession({ ...(isRecord(payload.session) ? payload.session : {}), messages: payload.messages })
        if (!sharedSession) {
          throw new Error("Shared session not found")
        }
        setLoadedSharedSession(sharedSession)
        if (rawText == null) {
          setPrompt("")
          setAttachments([])
        }
        cancelEdit()
      } catch (err) {
        error(apiErrorMessage(err, language === "zh" ? "发送共享消息失败" : "Failed to send shared message"))
      } finally {
        setIsSending(false)
      }
      return
    }
    if (!resolvedModel && activeRunMode !== "agent_group") {
      error(copy.modelRequired)
      return
    }
    if (isAdvanced && activeRunMode !== "agent_group" && !selectedAgent) {
      error(copy.agentSelectRequired)
      return
    }
    if (!selectedAgent?.default_model && activeRunMode !== "agent_group") {
      setModelName(resolvedModel)
    }
    if (isAdvanced && !selectedUserChannel) {
      error(copy.channelRequired)
      return
    }
    if (isAdvanced && (activeRunMode === "assistant" || activeRunMode === "agent_group")) {
      if (!assistantModeEnabled) {
        error(copy.assistantModeDisabled)
        return
      }
      if (activeRunMode === "agent_group") {
        if (!session.agent_group_id) {
          error(agentGroupCopy.groupRequired)
          return
        }
      }
      if (!currentAdvancedSettings.assistant_mcp_tools_enabled && (session.mcp_server_ids || []).length > 0) {
        error(copy.assistantMCPToolsDisabled)
        return
      }
      if (!assistantConnectorToolsEnabled && (session.connector_device_id || session.connector_workspace_path || session.cloud_sandbox_id)) {
        error(copy.assistantWorkspaceToolsDisabled)
        return
      }
    }
    if (!content && activeAttachments.length === 0) {
      return
    }

    const processingStartedAt = Date.now()
    const messageContent = messageContentWithAttachments(content, activeAttachments)
    const userMessage = createMessage("user", messageContent)
    const nextMessages = [...session.messages, userMessage]
    const nextTitle = session.title || titleFromMessage(content || activeAttachments[0]?.name || copy.attachmentMessageTitle, copy)
    updateSession(session.id, (current) => ({
      ...current,
      title: nextTitle,
      messages: nextMessages,
      agent_id: activeRunMode === "agent_group" ? undefined : current.agent_id || defaultAgentID,
      model_name: activeRunMode === "agent_group" ? undefined : resolvedModel,
    }), { materialize: true })
    if (rawText == null) {
      setPrompt("")
      setAttachments([])
    }
    setIsSending(true)
    setProcessingSessionID(session.id)
    cancelEdit()

    const recordProcessingDuration = () => {
      const duration = Math.max(0, Date.now() - processingStartedAt)
      updateSession(session.id, (current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === userMessage.id ? { ...message, processing_duration_ms: duration } : message),
      }))
    }

    try {
      if (isAdvanced) {
        if (activeRunMode === "assistant" || activeRunMode === "agent_group") {
          const assistantMessage = createMessage("assistant", "", [])
          updateSession(session.id, (current) => ({
            ...current,
            user_channel_id: selectedUserChannel?.id || current.user_channel_id,
            messages: [...current.messages, assistantMessage],
            latest_run: {
              id: "",
              session_id: session.id,
              assistant_message_id: assistantMessage.id,
              mode: activeRunMode,
              status: "queued",
              status_message: "assistant_started",
            },
          }))
          try {
            const res = await api.post("/user/advanced-chat/completions", {
              session_id: session.id,
              title: nextTitle,
              model: activeRunMode === "agent_group" ? "" : resolvedModel,
              channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: activeRunMode === "agent_group" ? "" : session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
				knowledge_base_ids: session.knowledge_base_ids,
              connector_device_id: session.cloud_sandbox_id ? "" : session.connector_device_id || "",
              connector_workspace_path: session.cloud_sandbox_id ? "" : session.connector_workspace_path || "",
              cloud_sandbox_id: session.cloud_sandbox_id || "",
              connector_auto_approve: session.connector_auto_approve,
              connector_approval_mode: connectorApprovalModeFor(session),
              connector_command_prefixes: session.connector_command_prefixes,
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              auto_compress_context: session.auto_compress_context,
              disabled_tool_groups: session.disabled_tool_groups || [],
              stream: false,
            })
            const serverSession = normalizeSession(res.data?.session)
            if (serverSession) {
              setSessions((current) => upsertSession(current, serverSession))
              setActiveSessionID(serverSession.id)
              navigate(`/chat/session/${encodeURIComponent(serverSession.id)}`, { replace: true })
            }
            void refetchAdvancedSessions()
          } catch (err) {
            updateSession(session.id, (current) => ({
              ...current,
              latest_run: undefined,
              messages: current.messages.filter((message) => message.id !== assistantMessage.id),
            }))
            throw err
          }
          return
        }

        if (selectedAgent?.stream !== true) {
          try {
            const res = await api.post("/user/advanced-chat/completions", {
              session_id: session.id,
              title: nextTitle,
              model: resolvedModel,
              channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
				knowledge_base_ids: session.knowledge_base_ids,
              connector_device_id: "",
              connector_workspace_path: "",
              connector_auto_approve: false,
              connector_approval_mode: "manual",
              connector_command_prefixes: [],
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              auto_compress_context: session.auto_compress_context,
              disabled_tool_groups: session.disabled_tool_groups || [],
              stream: false,
            })
            const content = typeof res.data?.message?.content === "string" ? res.data.message.content : ""
            const finalParts = normalizeContentParts(res.data?.message?.content_parts, content)
            const finalToolCalls = normalizeToolCalls(res.data?.tool_call_details)
            for (let index = finalToolCalls.length - 1; index >= 0; index--) {
              const call = finalToolCalls[index]
              const finalTasks = sessionTasksFromToolCall(call.name, call.status, call.result)
              if (finalTasks) {
                setSessionTasks(finalTasks)
                break
              }
            }
            const assistantMessage = createMessage("assistant", content || copy.emptyResponse, finalToolCalls)
            updateSession(session.id, (current) => ({
              ...current,
              messages: [...current.messages, { ...assistantMessage, content_parts: finalParts }],
            }))
          } catch (err) {
            throw err
          }
          void refetchAdvancedSessions()
          return
        }
        const assistantMessage = createMessage("assistant", "", [])
        const assistantMessageID = assistantMessage.id
        const controller = new AbortController()
        abortControllerRef.current = controller
        setIsStreamActive(true)
        const upsertAssistantMessage = (updater: (message: ChatMessage) => ChatMessage) => {
          updateSession(session.id, (current) => {
            const existing = current.messages.find((message) => message.id === assistantMessageID)
            const nextMessage = updater(existing || assistantMessage)
            return {
              ...current,
              messages: existing
                ? current.messages.map((message) => message.id === assistantMessageID ? nextMessage : message)
                : [...current.messages, nextMessage],
            }
          })
        }

        let accumulatedText = ""
        try {
          const token = getAuthToken()
          const response = await fetch(apiURL("/api/user/advanced-chat/completions"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              session_id: session.id,
              title: nextTitle,
              model: resolvedModel,
              channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
				knowledge_base_ids: session.knowledge_base_ids,
              connector_device_id: "",
              connector_workspace_path: "",
              connector_auto_approve: false,
              connector_approval_mode: "manual",
              connector_command_prefixes: [],
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              auto_compress_context: session.auto_compress_context,
              disabled_tool_groups: session.disabled_tool_groups || [],
              stream: true,
            }),
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(await responseErrorMessage(response))
          }
          if (!response.body) {
            throw new Error(copy.emptyResponse)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          const handleStreamEvent = (event: ParsedSSEEvent | null) => {
            if (!event) {
              return
            }
            if (event.type === "text") {
              const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
              if (!delta) {
                return
              }
              const round = typeof event.payload.round === "number" && Number.isFinite(event.payload.round) ? event.payload.round : 1
              accumulatedText += delta
              upsertAssistantMessage((message) => ({ ...message, content: accumulatedText, content_parts: appendContentPart(message.content_parts || [], round, delta) }))
            } else if (event.type === "status") {
              const statusText = streamStatusText(event.payload, copy)
              if (!statusText || accumulatedText) {
                return
              }
              upsertAssistantMessage((message) => ({ ...message, content: statusText }))
            } else if (event.type === "tool_call") {
              const streamedTasks = sessionTasksFromToolCall(event.payload.name, event.payload.status, event.payload.result)
              if (streamedTasks) {
                setSessionTasks(streamedTasks)
              }
              const nextToolCalls = normalizeToolCalls([event.payload])
              if (nextToolCalls.length === 0) {
                return
              }
              upsertAssistantMessage((message) => ({ ...message, tool_calls: mergeToolCalls(message.tool_calls || [], nextToolCalls) }))
            } else if (event.type === "done") {
              const finalContent = typeof event.payload.message?.content === "string" ? event.payload.message.content : accumulatedText
              const finalParts = normalizeContentParts(event.payload.message?.content_parts, finalContent)
              const finalToolCalls = normalizeToolCalls(event.payload.tool_call_details)
              upsertAssistantMessage((message) => ({ ...message, content: finalContent || copy.emptyResponse, content_parts: finalParts, tool_calls: finalToolCalls }))
            } else if (event.type === "error") {
              throw new Error(typeof event.payload.error === "string" ? event.payload.error : copy.sendFailed)
            }
          }
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split(/\r?\n\r?\n/)
            buffer = parts.pop() || ""
            for (const part of parts) {
              handleStreamEvent(parseSSEEvent(part))
            }
          }
          if (buffer.trim()) {
            handleStreamEvent(parseSSEEvent(buffer))
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantMessageID && !message.content ? { ...message, content: copy.stopped } : message
              ),
            }))
          } else {
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.filter((message) => message.id !== assistantMessageID || message.content || (message.tool_calls || []).length > 0),
            }))
            error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed))
          }
        } finally {
          abortControllerRef.current = null
          setIsStreamActive(false)
          setIsStopping(false)
          setIsSending(false)
          void refetchAdvancedSessions()
        }
        return
      }

    } catch (err) {
      error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed))
    } finally {
      recordProcessingDuration()
      setIsSending(false)
      setProcessingSessionID("")
    }
  }

  const beginEditMessage = (message: ChatMessage) => {
    setEditingMessageID(message.id)
    if (message.role === "user") {
      const parsed = parseMessageAttachments(message.content)
      setEditingText(parsed.text)
      setEditingAttachments(parsed.attachments.map(chatAttachmentFromParsed))
      return
    }
    setEditingText(message.content)
    setEditingAttachments([])
  }

  const saveEditedMessage = () => {
    const content = messageContentWithAttachments(editingText.trim(), editingAttachments)
    if (isSharedSession || !currentSession || !editingMessageID || !content.trim()) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === editingMessageID ? { ...message, content, updated_at: new Date().toISOString() } : message
      ),
    }), { persist: true })
    cancelEdit()
  }

  const deleteMessage = (messageID: string) => {
    if (isSharedSession || !currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      messages: session.messages.filter((message) => message.id !== messageID),
    }), { persist: true })
    if (editingMessageID === messageID) {
      cancelEdit()
    }
  }

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(messageDisplayContent(message, activeRun, copy))
      success(copy.messageCopied)
    } catch {
      error(copy.copyFailed)
    }
  }

  const handleMessageSelectionContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    const rawText = selection?.toString().replace(/\s+/g, " ").trim() || ""
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!rawText || !range || !messagesViewportRef.current?.contains(range.commonAncestorContainer)) {
      return
    }
    event.preventDefault()
    setSessionMenu(null)
    setSessionFolderContextMenu(null)
    setMessageSelectionMenu({ text: rawText.slice(0, 12000), x: event.clientX, y: event.clientY })
    setIsMessageSelectionSearchOpen(false)
  }

  const copySelectedMessageText = async () => {
    if (!messageSelectionMenu) {
      return
    }
    try {
      await navigator.clipboard.writeText(messageSelectionMenu.text)
      success(copy.messageCopied)
    } catch {
      error(copy.copyFailed)
    } finally {
      setMessageSelectionMenu(null)
    }
  }

  const quoteSelectedMessageText = () => {
    if (!messageSelectionMenu) {
      return
    }
    const quoted = language === "zh"
      ? `对于你所说的“${messageSelectionMenu.text}”，`
      : `Regarding what you know about ${messageSelectionMenu.text}, `
    setPrompt(quoted)
    setMessageSelectionMenu(null)
    setIsMessageSelectionSearchOpen(false)
    window.setTimeout(() => composerTextareaRef.current?.focus(), 0)
  }

  const searchSelectedMessageText = async (provider: "bing" | "google" | "baidu") => {
    if (!messageSelectionMenu) {
      return
    }
    const query = encodeURIComponent(messageSelectionMenu.text)
    const url = provider === "bing"
      ? `https://www.bing.com/search?q=${query}`
      : provider === "google"
        ? `https://www.google.com/search?q=${query}`
        : `https://www.baidu.com/s?wd=${query}`
    setMessageSelectionMenu(null)
    setIsMessageSelectionSearchOpen(false)
    if (isDesktop && window.veloceDesktop?.openDesktopBrowser) {
      await window.veloceDesktop.openDesktopBrowser(url)
      return
    }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleAttachmentFiles = async (files: FileList | null, target: AttachmentTarget = "composer") => {
    if (!isAdvanced || !files?.length) {
      return
    }
    setAttachmentMenuTarget("")
    if (!currentAdvancedSettings.file_storage_enabled) {
      error(fileCopy.storageDisabled)
      return
    }
    if (isUploadingAttachments) {
      return
    }
    setIsUploadingAttachments(true)
    const next: ChatAttachment[] = []
    try {
      for (const file of Array.from(files)) {
        const validationError = validateAttachment(file, currentAdvancedSettings, copy)
        if (validationError) {
          error(validationError)
          continue
        }
        const formData = new FormData()
        formData.append("file", file)
        const res = await api.post("/user/advanced-chat/files", formData)
        const storedFile = normalizeStoredFile(res.data?.file)
        if (!storedFile) {
          continue
        }
        if (selectedSharedPoolID) {
          await api.post(`/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/files`, { id: storedFile.id })
        }
        next.push(attachmentFromStoredFile(storedFile, normalizeStoredFileContent(res.data?.content)))
      }
      if (next.length > 0) {
        appendAttachments(target, next)
        void queryClient.invalidateQueries({ queryKey: advancedFilesQueryKey })
        if (selectedSharedPoolID) {
          void queryClient.invalidateQueries({ queryKey: ["enterprise-shared-pool-files", selectedSharedPoolID] })
        }
        void queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
      }
    } catch (err) {
      error(apiErrorMessage(err, fileCopy.uploadFailed))
    } finally {
      setIsUploadingAttachments(false)
    }
  }

  const selectStoredFile = async (file: StoredFile) => {
    const targetAttachments = filePickerTarget === "editor" ? editingAttachments : attachments
    if (targetAttachments.some((attachment) => attachment.storage_id === file.id)) {
      setIsFilePickerOpen(false)
      return
    }
    setSelectingFileID(file.id)
    try {
      const source = selectedSharedPoolID
        ? `/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/files/${encodeURIComponent(file.id)}/content`
        : `/user/advanced-chat/files/${encodeURIComponent(file.id)}/content`
      const res = await api.get(source)
      const content = normalizeStoredFileContent(res.data)
      appendAttachments(filePickerTarget, [attachmentFromStoredFile(file, content)])
      setIsFilePickerOpen(false)
    } catch (err) {
      error(apiErrorMessage(err, fileCopy.selectFailed))
    } finally {
      setSelectingFileID("")
    }
  }

  const appendAttachments = (target: AttachmentTarget, next: ChatAttachment[]) => {
    if (target === "editor") {
      setEditingAttachments((current) => mergeAttachments(current, next).slice(0, 8))
      return
    }
    setAttachments((current) => mergeAttachments(current, next).slice(0, 8))
  }

  const openFilePicker = (target: AttachmentTarget) => {
    setAttachmentMenuTarget("")
    setFilePickerTarget(target)
    setIsFilePickerOpen(true)
  }

  const selectSharedPoolSession = async (sessionID: string) => {
    if (!selectedSharedPoolID || loadingSharedSessionID) {
      return
    }
    setLoadingSharedSessionID(sessionID)
    try {
      const res = await api.get(`/user/enterprise/shared-pools/${encodeURIComponent(selectedSharedPoolID)}/sessions/${encodeURIComponent(sessionID)}`)
      const payload = isRecord(res.data) ? res.data : {}
      const session = normalizeSession({ ...(isRecord(payload.session) ? payload.session : {}), messages: payload.messages })
      if (!session) {
        throw new Error("Shared session not found")
      }
      setSessions((current) => current.filter((item) => item.id !== session.id && item.id !== sharedSessionID))
      setLoadedSharedSession(session)
      setSharedSessionID(session.id)
      setSharedSessionPoolID(selectedSharedPoolID)
      setActiveSessionID(session.id)
      navigate(`/chat/session/${encodeURIComponent(session.id)}`)
      setIsSessionsSidebarOpen(false)
      cancelEdit()
    } catch (err) {
      error(apiErrorMessage(err, language === "zh" ? "加载共享会话失败" : "Failed to load shared session"))
    } finally {
      setLoadingSharedSessionID("")
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  const removeEditingAttachment = (id: string) => {
    setEditingAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  const attachmentMenuButton = (target: AttachmentTarget, className = "") => {
    const open = attachmentMenuTarget === target
    const disabled = !currentAdvancedSettings.file_storage_enabled
    return (
      <div className={cn("relative shrink-0", className)}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full"
          disabled={disabled}
          aria-label={copy.addAttachment}
          aria-expanded={open}
          onClick={() => setAttachmentMenuTarget((current) => current === target ? "" : target)}
        >
          <Plus size={16} />
        </Button>
        {open && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            <label className={cn(
              "flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted",
              isUploadingAttachments && "pointer-events-none opacity-50"
            )}>
              <Paperclip size={15} />
              {isUploadingAttachments ? fileCopy.uploading : copy.addAttachment}
              <input
                className="sr-only"
                type="file"
                multiple
                disabled={isUploadingAttachments || disabled}
                onChange={(event) => {
                  handleAttachmentFiles(event.target.files, target)
                  event.target.value = ""
                }}
              />
            </label>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
              onClick={() => openFilePicker(target)}
            >
              <FileText size={15} />
              {fileCopy.selectFile}
            </button>
          </div>
        )}
      </div>
    )
  }

  const advancedComposerActionButton = (className = "") => {
    if (isStreamActive || isActiveRunRunning || isSending) {
      return (
        <Button
          type="button"
          size="icon"
          className={className}
          disabled={isStopping}
          onClick={stopActiveTask}
          title={copy.stopTask}
          aria-label={copy.stopTask}
        >
          <span className="h-2.5 w-2.5 rounded-[1px] bg-current" />
        </Button>
      )
    }
    const title = activeRunMode === "assistant" ? copy.runAssistant : activeRunMode === "agent_group" ? agentGroupCopy.runAgentGroup : copy.send
    return (
      <Button
        type="button"
        size="icon"
        className={className}
        disabled={(!prompt.trim() && attachments.length === 0) || isSending || isUploadingAttachments || isActiveRunRunning}
        onClick={sendMessage}
        title={title}
        aria-label={title}
      >
        <ArrowUp size={16} />
      </Button>
    )
  }

  const agentWorkStatusButton = (className = "") => {
    if (!showAgentWorkStatus) {
      return null
    }
    const workingCount = agentWork?.agents.filter((agent) => agent.working).length || 0
    const title = workingCount > 0
      ? agentGroupCopy.workStatusActive.replace("{count}", String(workingCount))
      : agentGroupCopy.workStatus
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(className, workingCount > 0 && "border-primary/40 bg-primary/5 text-primary")}
        onClick={() => setIsAgentWorkOpen(true)}
        title={title}
        aria-label={title}
      >
        <Activity size={16} />
      </Button>
    )
  }

  const composerModeControl = (compact = false) => {
    const chatLocked = Boolean((currentSession?.messages.length || 0) > 0 || isActiveRunRunning)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={compact ? "ghost" : "outline"} className={compact ? "h-7 w-auto justify-start px-2 text-xs" : "h-8 w-full justify-between gap-2 px-2 text-xs"}>
            <span className="truncate">{runModeLabel(activeRunMode, copy, agentGroupCopy)}</span>
            {!compact && <ArrowDown className="h-3.5 w-3.5 rotate-180" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-40">
          <DropdownMenuRadioGroup value={activeRunMode} onValueChange={(value) => setSessionRunMode(value as ChatRunMode)}>
            {(["chat", "assistant", "agent_group"] as const).map((mode) => {
              const disabled = (mode === "chat" && chatLocked) || ((mode === "assistant" || mode === "agent_group") && !assistantModeEnabled)
              return <DropdownMenuRadioItem key={mode} value={mode} disabled={disabled}>{runModeLabel(mode, copy, agentGroupCopy)}</DropdownMenuRadioItem>
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const composerAgentControl = (compact = false) => {
    if (!isAdvanced || activeRunMode === "agent_group") {
      return null
    }
    const label = selectedAgent?.name || copy.selectAgent
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={compact ? "ghost" : "outline"} className={compact ? "h-7 max-w-32 justify-start gap-1 px-2 text-xs" : "h-8 w-full justify-between gap-2 px-2 text-xs"} title={label}>
            <Bot size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
            {!compact && <ArrowDown className="h-3.5 w-3.5 shrink-0 rotate-180" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="max-h-56 w-52">
          {agents.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">{copy.noAgents}</div>
          ) : (
            <DropdownMenuRadioGroup value={currentSession?.agent_id || defaultAgentID} onValueChange={setSessionAgent}>
              {agents.map((agent) => (
                <DropdownMenuRadioItem key={agent.id} value={agent.id} className="min-h-9">
                  <span className="truncate">{agent.name || agent.id}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const composerModelControl = () => {
    if (activeRunMode === "agent_group") {
      return null
    }
    const open = composerControlMenu === "model"
    const reasoningOptions = [
      { value: "", label: copy.reasoningDefault },
      { value: "minimal", label: copy.reasoningMinimal },
      { value: "low", label: copy.reasoningLow },
      { value: "medium", label: copy.reasoningMedium },
      { value: "high", label: copy.reasoningHigh },
    ]
    const selectedReasoning = currentSession?.reasoning_effort || ""
    const reasoningLabel = reasoningOptions.find((option) => option.value === selectedReasoning)?.label || copy.reasoningDefault
    const modelLabel = activeModelName || copy.selectModel
    const controlLabel = `${modelLabel} ${reasoningLabel}`
    const selectReasoning = (value: string) => {
      if (currentSession) {
        updateSession(currentSession.id, (session) => ({ ...session, reasoning_effort: value }), { persist: true })
      }
      setComposerModelSubmenu("")
      setComposerControlMenu("")
    }
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant="ghost"
          className="h-5 max-w-36 justify-between gap-1 rounded-lg px-2 text-[11px]"
          onClick={() => setComposerControlMenu((current) => {
            const next = current === "model" ? "" : "model"
            if (!next) setComposerModelSubmenu("")
            return next
          })}
          title={controlLabel}
        >
          <span className="min-w-0 truncate">
            <span>{modelLabel}</span>
            <span className="ml-1 text-muted-foreground">{reasoningLabel}</span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
        {open && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            <button
              type="button"
              className={cn("flex h-8 w-full items-center justify-between rounded px-2 text-left text-xs hover:bg-muted", composerModelSubmenu === "model" && "bg-muted")}
              onClick={() => setComposerModelSubmenu((current) => current === "model" ? "" : "model")}
            >
              <span>{copy.selectModel}</span>
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className={cn("flex h-8 w-full items-center justify-between rounded px-2 text-left text-xs hover:bg-muted", composerModelSubmenu === "reasoning" && "bg-muted")}
              onClick={() => setComposerModelSubmenu((current) => current === "reasoning" ? "" : "reasoning")}
            >
              <span>{copy.reasoningEffort}</span>
              <ChevronRight size={14} />
            </button>
            {composerModelSubmenu === "model" && (
              <div className="absolute left-full top-0 ml-1 max-h-56 w-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
                {modelSelectOptions.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={cn("flex h-8 w-full items-center justify-between rounded px-2 text-left text-xs hover:bg-muted", activeModelName === model && "bg-primary/10 text-primary")}
                    onClick={() => {
                      handleSessionModelChange(model)
                      setComposerModelSubmenu("")
                      setComposerControlMenu("")
                    }}
                  >
                    <span className="truncate">{model}</span>
                    {activeModelName === model && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
            {composerModelSubmenu === "reasoning" && (
              <div className="absolute left-full top-0 ml-1 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
                {reasoningOptions.map((option) => (
                  <button
                    key={option.value || "default"}
                    type="button"
                    className={cn("flex h-8 w-full items-center justify-between rounded px-2 text-left text-xs hover:bg-muted", selectedReasoning === option.value && "bg-primary/10 text-primary")}
                    onClick={() => selectReasoning(option.value)}
                  >
                    <span>{option.label}</span>
                    {selectedReasoning === option.value && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const composerApprovalControl = (compact = false) => {
    if (activeRunMode === "chat") {
      return null
    }
    const open = composerControlMenu === "approval"
    const approvalMode = connectorApprovalModeFor(currentSession)
    const selectApprovalMode = (nextMode: ConnectorApprovalMode) => {
      if (!currentSession) {
        return
      }
      if (nextMode === "assistant" && !currentAdvancedSettings.connector_approval_agent_id) {
        error(approvalModeCopy.agentRequired)
        return
      }
      updateSession(currentSession.id, (session) => ({
        ...session,
        connector_auto_approve: nextMode === "full_access",
        connector_approval_mode: nextMode,
      }), { persist: true })
      setComposerControlMenu("")
    }
    const labels: Record<ConnectorApprovalMode, string> = {
      manual: approvalModeCopy.manual,
      full_access: approvalModeCopy.fullAccess,
      assistant: approvalModeCopy.assistant,
    }
    const icons = { manual: Hand, full_access: ShieldCheck, assistant: Bot }
    const ApprovalIcon = icons[approvalMode]
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          className={compact ? "h-7 w-auto justify-start gap-1.5 px-2 text-xs" : "h-8 w-full justify-between gap-2 px-2 text-xs"}
          onClick={() => setComposerControlMenu((current) => current === "approval" ? "" : "approval")}
        >
          {compact && <ApprovalIcon size={14} />}
          <span className="truncate">{labels[approvalMode]}</span>
          {!compact && <ArrowDown className="h-3.5 w-3.5 rotate-180" />}
        </Button>
        {open && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {(["manual", "full_access", "assistant"] as const).map((mode) => {
              const disabled = mode === "assistant" && !currentAdvancedSettings.connector_approval_agent_id
              const ApprovalOptionIcon = icons[mode]
              return (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    approvalMode === mode && "bg-primary/10 text-primary",
                    disabled && "cursor-not-allowed opacity-40"
                  )}
                  disabled={disabled}
                  onClick={() => selectApprovalMode(mode)}
                >
                  <ApprovalOptionIcon size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1">{labels[mode]}</span>
                  {approvalMode === mode && <Check size={14} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const composerAgentGroupControl = () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="h-8 w-full justify-between gap-2 px-2 text-xs" disabled={isFetchingAgentGroups}>
            <span className="truncate">{currentAgentGroup?.name || agentGroupCopy.selectGroup}</span>
            <ArrowDown className="h-3.5 w-3.5 rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-64">
          {isFetchingAgentGroups ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">{agentGroupCopy.loadingGroups}</div>
          ) : agentGroups.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">{agentGroupCopy.noGroups}</div>
          ) : agentGroups.map((group) => (
            <DropdownMenuItem key={group.id} onSelect={() => setSessionAgentGroup(group.id)} className="min-h-10 justify-between">
              <span className="min-w-0 truncate">{group.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{agentGroupChiefCount(group)} chief</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function cancelEdit() {
    setEditingMessageID("")
    setEditingText("")
    setEditingAttachments([])
    setFilePickerTarget("composer")
    setAttachmentMenuTarget("")
    setComposerControlMenu("")
  }

  const sessionSidebarItem = (session: ChatSession) => {
    const activePersonalSession = session.id === activeSession?.id && !isSharedSession
    return <div
      key={session.id}
      className={cn(
        "group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors",
        activePersonalSession ? "border-primary/40 bg-primary/15 shadow-sm before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-r before:bg-primary" : "hover:bg-muted"
      )}
      onContextMenu={(event) => {
        if (session.id === sharedSessionID) {
          return
        }
        event.preventDefault()
        setSessionFolderContextMenu(null)
        setSessionMenu({ sessionID: session.id, x: event.clientX, y: event.clientY })
      }}
    >
      <button type="button" className="min-w-0 text-left" onClick={() => selectSession(session.id)}>
        <div className="flex min-w-0 items-center gap-2">
          {isRunActive(session.latest_run) && <RefreshCw size={14} className="shrink-0 animate-spin text-primary" aria-label={language === "zh" ? "任务运行中" : "Task running"} />}
          <div className={cn("truncate text-sm font-medium", activePersonalSession ? "text-primary" : "text-foreground")}>{session.title || copy.untitledSession}</div>
        </div>
      </button>
      {session.id !== sharedSessionID && <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" onClick={() => deleteSession(session.id)} title={copy.deleteSession}>
        <Trash2 size={15} />
      </Button>}
    </div>
  }

  const advancedComposer = () => (
    <>
      <div className="rounded-xl border border-border bg-card p-1 shadow-md">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={composerTextareaRef}
            className="h-8 max-h-40 min-h-8 w-full resize-none overflow-y-auto rounded-md border-0 bg-transparent px-3 py-1 text-sm leading-5 outline-none focus:ring-0"
            rows={1}
            value={prompt}
            placeholder={activeRunMode === "assistant" ? copy.assistantPromptPlaceholder : activeRunMode === "agent_group" ? agentGroupCopy.promptPlaceholder : copy.promptPlaceholder}
            onChange={handleComposerPromptChange}
            onKeyDown={handleComposerPromptKeyDown}
          />
        </div>
        {isSharedSession && <div className="px-3 pb-2 text-xs text-muted-foreground">{language === "zh" ? "共享会话：参与者可追加任务消息；运行仅可使用本池分配的企业设备。" : "Shared session: participants can add task messages; runs may only use enterprise devices assigned to this pool."}</div>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {attachmentMenuButton("composer")}
            <div className="hidden items-center gap-1 lg:flex">
              {composerApprovalControl(true)}
              {composerModeControl(true)}
              {composerAgentControl(true)}
            </div>
            {agentWorkStatusButton("h-5 w-5")}
          </div>
          <div className="flex items-center gap-1">
            {composerModelControl()}
            {advancedComposerActionButton("h-5 w-5 rounded-full")}
          </div>
        </div>
      </div>
      <div className={cn("grid gap-2 lg:hidden", activeRunMode === "agent_group" || isAdvanced ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
        {composerModeControl()}
        {composerAgentControl()}
        {activeRunMode === "agent_group" && composerAgentGroupControl()}
        {composerApprovalControl()}
      </div>
    </>
  )

  const sessionCapabilityPickerConfig = sessionCapabilityPicker === "skills"
    ? {
        title: copy.skills,
        empty: copy.noSkills,
        items: availableSkillsToAdd.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description })),
        onAdd: addSessionSkill,
      }
    : sessionCapabilityPicker === "knowledge"
      ? {
          title: knowledgeCopy.label,
          empty: language === "zh" ? "没有可添加的已向量化知识库" : "No vectorized knowledge bases available to add",
          items: availableKnowledgeBasesToAdd.map((base) => ({ id: base.id, name: base.name, description: base.description })),
          onAdd: addSessionKnowledgeBase,
        }
      : sessionCapabilityPicker === "mcp"
        ? {
            title: copy.mcpServers,
            empty: copy.noMCPServers,
            items: availableMCPServersToAdd.map((server) => ({ id: server.id, name: server.name, description: mcpServerSummary(server) })),
            onAdd: addSessionMCPServer,
          }
        : null

  const sessionsSidebar = (
    <aside
      className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-card text-foreground"
      onContextMenu={(event) => {
        if (event.defaultPrevented) {
          return
        }
        event.preventDefault()
        setSessionMenu(null)
        setSessionFolderContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 px-3">
        <div className="truncate text-xs font-semibold uppercase text-muted-foreground">{copy.sessions}</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsSessionFolderDialogOpen(true)}
            aria-label={sessionSidebarCopy.newFolder}
            title={sessionSidebarCopy.newFolder}
          >
            <FolderPlus size={16} />
          </Button>
        </div>
      </div>
      <div className="border-b border-border/80 p-2.5">
        <Button className="h-9 w-full justify-start gap-2 rounded-md bg-background text-foreground shadow-sm hover:bg-muted" variant="outline" onClick={() => createNewSession()}>
          <MessageSquarePlus size={16} />
          {copy.newSession}
        </Button>
        <label className="relative mt-2 block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <input
            className="h-8 w-full rounded-md border border-border bg-background py-1 pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring"
            value={sessionSearch}
            onChange={(event) => setSessionSearch(event.target.value)}
            placeholder={sessionSidebarCopy.search}
            aria-label={sessionSidebarCopy.search}
          />
        </label>
      </div>
      <div className="space-y-0.5 p-2">
        {isAdvanced && enterpriseMode && sharedPools.length > 0 && (
          <div className="pb-3">
            <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">{language === "zh" ? "任务与部门会话" : "Task and department sessions"}</div>
            {sharedPools.map((pool) => {
              const expanded = String(pool.id) === selectedSharedPoolID
              return <div key={pool.id} className="pb-1">
                <button type="button" className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => setSelectedSharedPoolID(expanded ? "" : String(pool.id))}>
                  <ChevronRight size={14} className={cn("shrink-0 transition-transform", expanded && "rotate-90")} />
                  <Folder size={14} className="shrink-0 text-primary" />
                  <span className="truncate">{sharedPoolLabel(pool, language)}</span>
                </button>
                {expanded && <Button size="sm" variant="ghost" className="ml-7 h-7 text-xs" onClick={() => createNewSession({ poolID: String(pool.id) })}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "在此新建会话" : "New session here"}</Button>}
                {expanded && (sharedPoolSessions.length === 0 ? <div className="px-8 py-2 text-xs text-muted-foreground">{language === "zh" ? "池内暂无会话" : "No shared sessions in this pool"}</div> : sharedPoolSessions.map((session) => <button key={session.id} type="button" className={cn("flex w-full items-center gap-2 rounded-md py-2 pl-8 pr-3 text-left hover:bg-muted", session.id === activeSession?.id && isSharedSession && "bg-primary/10 text-primary")} disabled={loadingSharedSessionID === session.id} onClick={() => void selectSharedPoolSession(session.id)}><FileText size={14} className="shrink-0" /><span className="truncate text-sm font-medium">{session.title || copy.untitledSession}</span></button>))}
              </div>
            })}
          </div>
        )}
        {folderSessionGroups.map(({ folder, sessions: groupedSessions }) => (
          <div key={folder.id} className="pb-2">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted"
              onClick={() => setCollapsedSessionFolderIDs((current) => {
                const next = new Set(current)
                if (next.has(folder.id)) {
                  next.delete(folder.id)
                } else {
                  next.add(folder.id)
                }
                return next
              })}
            >
              <ChevronRight size={14} className={cn("shrink-0 transition-transform", (normalizedSessionSearch || !collapsedSessionFolderIDs.has(folder.id)) && "rotate-90")} />
              <Folder size={14} className="shrink-0 text-primary" />
              <span className="truncate">{folder.name}</span>
            </button>
            <Button size="sm" variant="ghost" className="ml-7 h-7 text-xs" onClick={() => createNewSession({ folderID: folder.id })}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" />{language === "zh" ? "在此新建会话" : "New session here"}</Button>
            {(normalizedSessionSearch || !collapsedSessionFolderIDs.has(folder.id)) && groupedSessions.map(sessionSidebarItem)}
          </div>
        ))}
        {ungroupedSessions.length > 0 && (
          <div className="pb-2">
            {sessionFolders.length > 0 && <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">{sessionSidebarCopy.uncategorized}</div>}
            {ungroupedSessions.map(sessionSidebarItem)}
          </div>
        )}
        {searchedSessions.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted-foreground">{sessionSidebarCopy.noSessions}</div>}
        {sessionMenu && typeof document !== "undefined" && (() => {
          const session = sessions.find((item) => item.id === sessionMenu.sessionID)
          if (!session) {
            return null
          }
          const placement = sessionContextMenuPlacement(sessionMenu.x, sessionMenu.y, 224)
          return createPortal(
            <div
              className="pointer-events-none fixed z-[80] w-56 overflow-hidden"
              style={placement.opensUp
                ? { left: placement.left, top: 8, bottom: window.innerHeight - placement.lineY }
                : { left: placement.left, top: placement.lineY, bottom: 8 }}
            >
              <div
                className={cn("session-context-surface pointer-events-auto absolute inset-x-0 max-h-full overflow-y-auto rounded-md border p-1 text-sm text-popover-foreground will-change-transform", placement.animationClass, placement.opensUp ? "bottom-0" : "top-0")}
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted" onClick={() => renameSessionTitle(session)}>
                  {copy.customTitle}
                </button>
                <button
                  type="button"
                  className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  disabled={!isAdvanced || regeneratingTitleSessionID === session.id}
                  onClick={() => void regenerateSessionTitle(session)}
                >
                  {regeneratingTitleSessionID === session.id ? copy.regeneratingTitle : copy.regenerateTitle}
                </button>
                <div className="my-1 border-t" />
                <div className="px-2 py-1 text-xs text-muted-foreground">{sessionSidebarCopy.moveToFolder}</div>
                <button type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted" onClick={() => void moveSessionToFolder(session.id)}>
                  <Folder size={14} />
                  {sessionSidebarCopy.uncategorized}
                </button>
                {sessionFolders.map((folder) => (
                  <button key={folder.id} type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted" onClick={() => void moveSessionToFolder(session.id, folder.id)}>
                    <Folder size={14} className="text-primary" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        })()}
        {sessionFolderContextMenu && typeof document !== "undefined" && (() => {
          const placement = sessionContextMenuPlacement(sessionFolderContextMenu.x, sessionFolderContextMenu.y, 176)
          return createPortal(
            <div
              className="pointer-events-none fixed z-[80] w-44 overflow-hidden"
              style={placement.opensUp
                ? { left: placement.left, top: 8, bottom: window.innerHeight - placement.lineY }
                : { left: placement.left, top: placement.lineY, bottom: 8 }}
            >
              <div
                className={cn("session-context-surface pointer-events-auto absolute inset-x-0 max-h-full overflow-y-auto rounded-md border p-1 text-sm text-popover-foreground will-change-transform", placement.animationClass, placement.opensUp ? "bottom-0" : "top-0")}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted"
                  onClick={() => {
                    setSessionFolderContextMenu(null)
                    setIsSessionFolderDialogOpen(true)
                  }}
                >
                  <FolderPlus size={15} />
                  {sessionSidebarCopy.newFolder}
                </button>
              </div>
            </div>,
            document.body
          )
        })()}
      </div>
    </aside>
  )
  const desktopSessionsSidebarPortal = desktopSessionsSidebarHost
    ? createPortal(sessionsSidebar, desktopSessionsSidebarHost)
    : null
  const messageSelectionContextMenuPortal = messageSelectionMenu && typeof document !== "undefined" && (() => {
    const labels = language === "zh"
      ? { copy: "复制", quote: "引用", search: "搜索" }
      : { copy: "Copy", quote: "Quote", search: "Search" }
    const placement = sessionContextMenuPlacement(messageSelectionMenu.x, messageSelectionMenu.y, 176)
    const searchPlacement = sessionContextSubmenuPlacement(placement.left, 176, placement.lineY, 176)
    return createPortal(
      <>
        <div
          className="pointer-events-none fixed z-[90] w-44 overflow-hidden"
          style={placement.opensUp
            ? { left: placement.left, top: 8, bottom: window.innerHeight - placement.lineY }
            : { left: placement.left, top: placement.lineY, bottom: 8 }}
        >
          <div
            className={cn("session-context-surface pointer-events-auto absolute inset-x-0 max-h-full overflow-y-auto rounded-md border p-1 text-sm text-popover-foreground will-change-transform", placement.animationClass, placement.opensUp ? "bottom-0" : "top-0")}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted" onClick={() => void copySelectedMessageText()}>
              <Copy size={15} />
              {labels.copy}
            </button>
            <button type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted" onClick={quoteSelectedMessageText}>
              <Quote size={15} />
              {labels.quote}
            </button>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted"
              onMouseEnter={() => setIsMessageSelectionSearchOpen(true)}
              onClick={() => setIsMessageSelectionSearchOpen((open) => !open)}
            >
              <Search size={15} />
              <span className="flex-1">{labels.search}</span>
              {searchPlacement.opensLeft ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
        </div>
        {isMessageSelectionSearchOpen && (
          <div
            className="pointer-events-none fixed z-[91] w-44 overflow-hidden"
            style={searchPlacement.opensUp
              ? { left: searchPlacement.left, top: 8, bottom: window.innerHeight - searchPlacement.lineY }
              : { left: searchPlacement.left, top: searchPlacement.lineY, bottom: 8 }}
          >
            <div
              className={cn("session-context-surface pointer-events-auto absolute inset-x-0 max-h-full overflow-y-auto rounded-md border p-1 text-sm text-popover-foreground will-change-transform", searchPlacement.animationClass, searchPlacement.opensUp ? "bottom-0" : "top-0")}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted" onClick={() => void searchSelectedMessageText("bing")}>Bing</button>
              <button type="button" className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted" onClick={() => void searchSelectedMessageText("google")}>Google</button>
              <button type="button" className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted" onClick={() => void searchSelectedMessageText("baidu")}>Baidu</button>
            </div>
          </div>
        )}
      </>,
      document.body
    )
  })()

  return (
    <div className={cn("flex min-w-0", isAdvanced && "h-full min-h-0")}>
      {desktopSessionsSidebarPortal}
      {messageSelectionContextMenuPortal}
      {terminalWindow && (
        <ConnectorTerminalWindow
          key={`${terminalWindow.deviceID}:${terminalWindow.workspacePath}`}
          deviceID={terminalWindow.deviceID}
          deviceName={terminalWindow.deviceName}
          deviceOS={terminalWindow.deviceOS}
          workspacePath={terminalWindow.workspacePath}
          copy={terminalCopy}
          onClose={() => setTerminalWindow(null)}
        />
      )}
      <Dialog open={Boolean(renamingSession)} onOpenChange={(open) => { if (!open) setRenamingSession(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{copy.customTitlePrompt}</DialogTitle></DialogHeader>
          <Input autoFocus value={renamedTitle} onChange={(event) => setRenamedTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveSessionTitle() }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingSession(null)}>{language === "zh" ? "取消" : "Cancel"}</Button>
            <Button onClick={saveSessionTitle} disabled={!renamedTitle.trim()}>{language === "zh" ? "保存" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className={cn(
        "min-w-0 flex-1 transition-[filter] duration-200",
        isAdvanced ? "flex min-h-0 flex-col overflow-hidden bg-background p-4 sm:p-6 xl:relative xl:z-10 xl:p-0" : "space-y-5"
      )}>
      <div className="sticky top-0 z-30 -mx-4 flex min-h-10 justify-end bg-transparent px-4 py-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:mx-0">
        <div className="relative flex items-center gap-2">
          {isAdvanced && <ChatSetupGuide />}
          {isAdvanced && canOpenWorkspaceInVSCode && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-border bg-background"
              onClick={() => void openCurrentWorkspaceInVSCode()}
              aria-label={gitCopy.openInVSCode}
              title={gitCopy.openInVSCode}
            >
              <VSCodeIcon size={18} />
            </Button>
          )}
          {isAdvanced && (
            <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-background" onClick={() => openAdvancedConfig()} aria-label={copy.config} title={copy.config}>
              <Settings size={16} />
            </Button>
          )}
          {isAdvanced && activeRunMode !== "chat" && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-border bg-background"
                onClick={() => {
                  setIsGitPanelOpen((open) => !open)
                  setIsEnvironmentDevicePickerOpen(false)
                  setIsEnvironmentWorkspacePickerOpen(false)
                }}
                aria-label={gitCopy.environment}
                aria-expanded={isGitPanelOpen}
                title={gitCopy.environment}
              >
                <MoreHorizontal size={18} />
              </Button>
              {isGitPanelOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <GitBranch size={16} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{gitCopy.environment}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!canInspectGitWorkspace || gitStatusQuery.isFetching}
                      onClick={() => void gitStatusQuery.refetch()}
                      aria-label={gitCopy.refresh}
                      title={gitCopy.refresh}
                    >
                      <RefreshCw size={14} className={gitStatusQuery.isFetching ? "animate-spin" : ""} />
                    </Button>
                  </div>

                  <div className="relative mt-3 overflow-visible rounded-md border border-border">
                    <button
                      ref={environmentDeviceButtonRef}
                      type="button"
                      className="flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-muted/50"
                      onClick={() => {
                        setIsEnvironmentDevicePickerOpen((open) => !open)
                        setIsEnvironmentWorkspacePickerOpen(false)
                      }}
                      aria-expanded={isEnvironmentDevicePickerOpen}
                    >
                      <Monitor size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">{gitCopy.executionEnvironment}</span>
                        <span className="block truncate text-sm font-medium">{currentConnectorDevice?.name || gitCopy.noDevice}</span>
                      </span>
                      <ChevronRight size={16} className={cn("shrink-0 text-muted-foreground transition-transform", isEnvironmentDevicePickerOpen && "translate-x-0.5")} />
                    </button>
                    <button
                      ref={environmentWorkspaceButtonRef}
                      type="button"
                      className="flex min-h-12 w-full items-center gap-2 border-t border-border/70 px-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!currentConnectorDeviceID}
                      onClick={() => {
                        setIsEnvironmentWorkspacePickerOpen((open) => !open)
                        setIsEnvironmentDevicePickerOpen(false)
                      }}
                    >
                      <Folder size={16} className="shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">{gitCopy.runDirectory}</span>
                        <span className="block truncate font-mono text-xs text-foreground">{currentSession?.connector_workspace_path || gitCopy.noWorkspacePath}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                    </button>

                    {isEnvironmentDevicePickerOpen && typeof document !== "undefined" && createPortal(
                      <div className="fixed z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg" style={floatingMenuStyle(environmentDeviceButtonRef.current)}>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{gitCopy.selectDevice}</div>
                        <button
                          type="button"
                          className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-muted", !currentConnectorDeviceID && "bg-primary/10 text-primary")}
                          onClick={() => {
                            setSessionConnectorDevice("")
                            setGitCompareBranch("")
                            setGitActionTaskID("")
                            setIsEnvironmentDevicePickerOpen(false)
                          }}
                        >
                          <span>{gitCopy.noDevice}</span>
                          {!currentConnectorDeviceID && <Check size={14} />}
                        </button>
                        {selectableConnectorDevices.length === 0 ? (
                          <div className="px-2 py-3 text-center text-xs text-muted-foreground">{copy.noDevices}</div>
                        ) : (
                          selectableConnectorDevices.map((device) => {
                            const selected = device.id === currentConnectorDeviceID
                            return (
                              <button
                                key={device.id}
                                type="button"
                                className={cn(
                                  "flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                                  selected && "bg-primary/10 text-primary"
                                )}
                                onClick={() => {
                                  setSessionConnectorDevice(device.id)
                                  setGitCompareBranch("")
                                  setGitActionTaskID("")
                                  setIsEnvironmentDevicePickerOpen(false)
                                }}
                              >
                                <span className="min-w-0 truncate font-medium">{device.name}</span>
                                <span className={cn("shrink-0 text-[11px]", device.online ? "text-primary" : "text-muted-foreground")}>
                                  {device.online ? copy.deviceOnline : copy.deviceOffline}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>,
                      document.body
                    )}
                    {isEnvironmentWorkspacePickerOpen && typeof document !== "undefined" && createPortal(
                      <div className="fixed z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg" style={floatingMenuStyle(environmentWorkspaceButtonRef.current)}>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{gitCopy.runDirectory}</div>
                        {recentWorkspacePaths.length === 0 ? (
                          <div className="px-2 py-4 text-center text-sm text-muted-foreground">{copy.noWorkspaces}</div>
                        ) : (
                          recentWorkspacePaths.map((workspacePath) => (
                            <button
                              key={workspacePath}
                              type="button"
                              className={cn(
                                "flex min-h-10 w-full items-center rounded px-2 text-left text-sm hover:bg-muted",
                                workspacePath === currentSession?.connector_workspace_path && "bg-primary/10 text-primary"
                              )}
                              onClick={() => {
                                setSessionWorkspacePath(workspacePath)
                                setIsEnvironmentWorkspacePickerOpen(false)
                              }}
                            >
                              <span className="truncate font-mono text-xs">{workspacePath}</span>
                            </button>
                          ))
                        )}
                        <div className="mt-1 border-t border-border/70 pt-1">
                          <button
                            type="button"
                            className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setIsEnvironmentWorkspacePickerOpen(false)
                              openWorkspacePicker("session")
                            }}
                          >
                            <Folder size={15} />
                            {copy.selectWorkspace}
                          </button>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 h-9 w-full justify-start gap-2"
                    disabled={!canOpenConnectorTerminal}
                    title={canOpenConnectorTerminal ? terminalCopy.openTerminal : terminalCopy.deviceRequired}
                    onClick={() => {
                      if (!currentConnectorDevice) {
                        return
                      }
                      setIsGitPanelOpen(false)
                      setTerminalWindow({
                        deviceID: currentConnectorDevice.id,
                        deviceName: currentConnectorDevice.name,
                        deviceOS: currentConnectorDevice.os,
                        workspacePath: currentSession?.connector_workspace_path || "",
                      })
                    }}
                  >
                    <TerminalSquare size={15} />
                    {terminalCopy.openTerminal}
                  </Button>

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
                        <input
                          id="git-commit-message"
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                          value={gitCommitMessage}
                          maxLength={200}
                          placeholder={gitCopy.commitMessage}
                          onChange={(event) => setGitCommitMessage(event.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-9 gap-2" disabled={isGitActionSubmitting || isActiveConnectorTask(gitTaskQuery.data?.status)} onClick={() => void runGitAction("commit")}>
                            <FileDiff size={15} />
                            {gitCopy.commit}
                          </Button>
                          <Button type="button" className="h-9 gap-2" disabled={isGitActionSubmitting || isActiveConnectorTask(gitTaskQuery.data?.status)} onClick={() => void runGitAction("push")}>
                            <Upload size={15} />
                            {gitCopy.push}
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
                </div>
              )}
            </>
          )}
          {activeRunMode !== "chat" && <Button
            variant="outline"
            size="icon"
            className="hidden h-9 w-9 border-border bg-background xl:inline-flex"
            onClick={() => setIsDesktopSessionsSidebarVisible((visible) => !visible)}
            aria-label={isDesktopSessionsSidebarVisible ? copy.closeSessions : copy.openSessions}
            aria-expanded={isDesktopSessionsSidebarVisible}
            title={isDesktopSessionsSidebarVisible ? copy.closeSessions : copy.openSessions}
          >
            {isDesktopSessionsSidebarVisible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </Button>}
        </div>
      </div>

      <PageTitleSlot />
      <div className={cn(isAdvanced ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
        <div className={cn(isAdvanced ? "flex min-h-0 flex-1 flex-col" : "rounded-lg border bg-card text-card-foreground shadow-sm")}>
            <div className={cn(isAdvanced ? (isActiveRunRunning && activeRun ? "shrink-0 pb-2" : "sr-only") : "flex flex-col space-y-1.5 p-6")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className={cn(isAdvanced && "sr-only")}>{copy.conversation}</CardTitle>
                {isAdvanced && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isActiveRunRunning && activeRun && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                        {runStatusText(activeRun, copy)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={cn(isAdvanced ? "relative flex min-h-0 flex-1 flex-col gap-3" : "space-y-4 p-6 pt-0")}>
              <div ref={messagesViewportRef} className={cn(isAdvanced ? "min-h-0 flex-1 overflow-y-auto" : "min-h-[360px] space-y-3 rounded-md border p-3")} onContextMenu={handleMessageSelectionContextMenu}>
                <div
                  className={cn(isAdvanced ? "mx-auto w-full max-w-3xl space-y-4 px-2 py-5 pb-36 sm:px-4" : "contents")}
                  style={isAdvanced && composerOverlayHeight > 0 ? { paddingBottom: Math.max(144, composerOverlayHeight + 28) } : undefined}
                >
                {!currentSession || currentSession.messages.length === 0 ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-20 text-center">
                    <Sparkles className="mb-3 h-7 w-7 text-primary" />
                    <div className="text-lg font-semibold text-foreground">{newSessionGreeting}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{language === "zh" ? "输入消息开始对话" : "Send a message to begin"}</div>
                    {recentAgents.length > 0 && (
                      <div className="mt-6 w-full max-w-xl text-left">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">{recentAgentsLabel}</div>
                        <div className="flex gap-1 overflow-x-auto pb-1">
                          {recentAgents.map((agent) => {
                            const selected = agent.id === (currentSession?.agent_id || defaultAgentID)
                            return (
                              <Button
                                key={agent.id}
                                type="button"
                                variant="ghost"
                                className={cn("h-9 shrink-0 gap-2 rounded-2xl px-2.5", selected && "bg-muted text-foreground")}
                                aria-pressed={selected}
                                onClick={() => setSessionAgent(agent.id)}
                              >
                                <span className="flex size-5 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot size={13} /></span>
                                <span className="max-w-32 truncate text-sm">{agent.name || agent.id}</span>
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div className="mt-6 grid w-full max-w-xl grid-cols-2 gap-2 text-left sm:grid-cols-3">
                      {welcomeSuggestions.slice(0, recentAgents.length > 0 ? 3 : 6).map((suggestion, index) => {
                        const Icon = [Folder, Search, FileText, GitBranch, Sparkles, Server][index % 6]
                        return (
                          <button
                            key={suggestion.title}
                            type="button"
                            className="flex min-h-16 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors hover:bg-muted"
                            onClick={() => chooseWelcomeSuggestion(suggestion.prompt)}
                          >
                            <Icon size={16} className="shrink-0 text-muted-foreground" />
                            <span className="line-clamp-2 text-left">{suggestion.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    {currentSession.messages.map((message, messageIndex) => {
                      const processingDuration = message.role === "user"
                        ? messageIndex === liveProcessingUserMessageIndex
                          ? liveProcessingDurationMs(message, Date.now())
                          : processingDurationForUserMessage(currentSession.messages, messageIndex, activeRun)
                        : undefined
                      if (message.role === "assistant" && editingMessageID !== message.id) {
                        return (
                          <AssistantMessageSequence
                            key={message.id}
                            message={message}
                            activeRun={activeRun}
                            copy={copy}
                            approvalTasks={pendingConnectorApprovals}
                            decidingTaskID={decidingConnectorTaskID}
                            onDecide={decideConnectorApproval}
                            onCopy={() => copyMessage(message)}
                            onEdit={() => beginEditMessage(message)}
                            onDelete={() => deleteMessage(message.id)}
                            editLabel={copy.editMessage}
                            deleteLabel={copy.deleteMessage}
                            controlsHidden={isActiveRunRunning && activeRun?.assistant_message_id === message.id}
                          />
                        )
                      }
                      return (
                        <div key={message.id} className="group space-y-1.5">
                          <div className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                            <div className={cn(
                              "w-fit max-w-full p-3 text-sm",
                              isAdvanced
                                ? message.role === "user"
                                  ? "rounded-lg border border-border bg-muted shadow-sm"
                                  : "rounded-lg border border-border bg-background shadow-sm"
                                : "rounded-md border bg-background"
                            )}>
                              <div className="flex items-start gap-2">
                                {message.role === "user" ? (
                                  <User className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : (
                                  <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  {editingMessageID === message.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                        value={editingText}
                                        readOnly={isSharedSession}
                                        onChange={(event) => setEditingText(event.target.value)}
                                      />
                                      {editingAttachments.length > 0 && (
                                        <AttachmentChips
                                          attachments={editingAttachments}
                                          removeLabel={copy.removeAttachment}
                                          onRemove={removeEditingAttachment}
                                        />
                                      )}
                                      {isAdvanced && message.role === "user" && (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {attachmentMenuButton("editor")}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <MessageContent
                                      message={message}
                                      activeRun={activeRun}
                                      isAdvanced={isAdvanced}
                                      copy={copy}
                                      approvalTasks={pendingConnectorApprovals}
                                      decidingTaskID={decidingConnectorTaskID}
                                      onDecide={decideConnectorApproval}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                              message.role === "user" ? "justify-end" : "justify-start",
                              editingMessageID === message.id && "opacity-100",
                              message.role === "assistant" && isActiveRunRunning && activeRun?.assistant_message_id === message.id && "pointer-events-none opacity-0"
                            )}
                          >
                            {editingMessageID === message.id ? (
                              <>
                                <Button variant="ghost" size="sm" disabled={isSharedSession} onClick={saveEditedMessage} title={copy.saveMessage}>
                                  <Check size={15} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={cancelEdit} title={copy.cancelEdit}>
                                  <X size={15} />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyMessage(message)} title={copy.copyMessage}>
                                  <Copy size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isSharedSession} onClick={() => beginEditMessage(message)} title={copy.editMessage}>
                                  <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" disabled={isSharedSession} onClick={() => deleteMessage(message.id)} title={copy.deleteMessage}>
                                  <Trash2 size={14} />
                                </Button>
                              </>
                            )}
                          </div>
                          {message.role === "user" && processingDuration !== undefined && (
                            <div className="pl-1 text-xs text-muted-foreground">{formatProcessingDuration(processingDuration)}</div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
                </div>
              </div>

              {attachments.length > 0 && !isAdvanced && (
                <div className={cn(isAdvanced && "mx-auto w-full max-w-3xl px-2 sm:px-4")}>
                  <AttachmentChips attachments={attachments} removeLabel={copy.removeAttachment} onRemove={removeAttachment} />
                </div>
              )}

              {isAdvanced ? (
                <div ref={composerOverlayRef} className="absolute inset-x-0 bottom-3 z-20 mx-auto w-full max-w-3xl space-y-2 px-2 sm:px-4">
                  {showJumpToLatest && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="absolute -top-11 right-4 z-30 h-9 w-9 rounded-full border-border bg-background shadow-md hover:bg-muted sm:right-6"
                      title={copy.jumpToLatest}
                      onClick={() => scrollMessagesToLatest()}
                    >
                      <ArrowDown size={16} />
                      <span className="sr-only">{copy.jumpToLatest}</span>
                    </Button>
                  )}
                  {pendingAskUserPrompt && (
                    <AskUserPromptCard
                      key={currentSession?.messages.length || 0}
                      prompt={pendingAskUserPrompt}
                      copy={copy}
                      disabled={isSending || isStreamActive}
                      onSubmit={(text) => void sendMessageWithContent(text)}
                    />
                  )}
                  {sessionTasks.length > 0 && (
                    <SessionTaskPlanPanel
                      tasks={sessionTasks}
                      copy={copy}
                      isOpen={isTaskPlanOpen}
                      onToggle={() => setIsTaskPlanOpen((open) => !open)}
                    />
                  )}
                  {pendingConnectorApprovals.length > 0 && (
                    <PendingConnectorApprovalsPanel
                      tasks={pendingConnectorApprovals}
                      copy={copy}
                      decidingTaskID={decidingConnectorTaskID}
                      onDecide={decideConnectorApproval}
                    />
                  )}
                  {attachments.length > 0 && (
                    <AttachmentChips attachments={attachments} removeLabel={copy.removeAttachment} onRemove={removeAttachment} />
                  )}
                  {taskChangeSummary.files.length > 0 && (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-xs shadow-sm transition-colors hover:bg-muted"
                      onClick={() => setIsTaskChangesOpen(true)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileDiff size={15} className="shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{taskChangeCopy.summary.replace("{count}", String(taskChangeSummary.files.length))}</span>
                        {isActiveRunRunning && <span className="shrink-0 text-muted-foreground">{taskChangeCopy.inProgress}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 font-medium tabular-nums">
                        <span className="text-primary">+{taskChangeSummary.additions}</span>
                        <span className="text-destructive">-{taskChangeSummary.deletions}</span>
                      </span>
                    </button>
                  )}
                  {advancedComposer()}
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-ring"
                    value={prompt}
                    placeholder={copy.promptPlaceholder}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="gap-2 self-end"
                    disabled={(!prompt.trim() && attachments.length === 0) || isSending || isUploadingAttachments || isActiveRunRunning}
                    onClick={sendMessage}
                  >
                    <Send size={16} />
                    {isSending || isActiveRunRunning ? copy.sending : copy.send}
                  </Button>
                </div>
              )}
            </div>
        </div>
      </div>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      {isAdvanced && (
        <TaskChangesDialog
          open={isTaskChangesOpen}
          onOpenChange={setIsTaskChangesOpen}
          summary={taskChangeSummary}
          selectedPath={selectedTaskChangePath}
          onSelectPath={setSelectedTaskChangePath}
          copy={taskChangeCopy}
        />
      )}
      <Dialog
        open={isSessionFolderDialogOpen}
        onOpenChange={(open) => {
          setIsSessionFolderDialogOpen(open)
          if (!open) {
            setNewSessionFolderName("")
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{sessionSidebarCopy.newFolder}</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            value={newSessionFolderName}
            onChange={(event) => setNewSessionFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void createSessionFolder()
              }
            }}
            placeholder={sessionSidebarCopy.folderName}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsSessionFolderDialogOpen(false)}>{sessionSidebarCopy.cancel}</Button>
            <Button type="button" disabled={!newSessionFolderName.trim()} onClick={() => void createSessionFolder()}>{sessionSidebarCopy.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isAdvanced && (
        <Dialog open={isWorkspacePickerOpen} onOpenChange={setIsWorkspacePickerOpen}>
          <DialogContent className="max-h-[80vh] max-w-xl overflow-hidden p-0">
            <DialogHeader className="border-b px-5 py-4 pr-12">
              <DialogTitle>{workspacePickerCopy.title}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 px-5 py-4">
              <div className="mb-3 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!workspacePickerCanGoUp(workspacePickerPath, workspacePickerDevice?.os)}
                  onClick={() => setWorkspacePickerPath(workspacePickerParentPath(workspacePickerPath, workspacePickerDevice?.os))}
                  aria-label={workspacePickerCopy.up}
                  title={workspacePickerCopy.up}
                >
                  <ChevronLeft size={17} />
                </Button>
                <div className="min-w-0 flex-1 truncate rounded-md border bg-muted/30 px-3 py-2 text-sm" title={workspacePickerPath || workspacePickerCopy.computer}>
                  {workspacePickerPath || workspacePickerCopy.computer}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={workspaceDirectoriesQuery.isFetching}
                  onClick={() => void workspaceDirectoriesQuery.refetch()}
                  aria-label={workspacePickerCopy.refresh}
                  title={workspacePickerCopy.refresh}
                >
                  <RefreshCw size={15} className={workspaceDirectoriesQuery.isFetching ? "animate-spin" : ""} />
                </Button>
              </div>

              <div className="max-h-[48vh] min-h-56 overflow-y-auto rounded-md border">
                {workspaceDirectoriesQuery.isLoading ? (
                  <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">{workspacePickerCopy.loading}</div>
                ) : workspaceDirectoriesQuery.isError ? (
                  <div className="p-4 text-sm text-destructive">{apiErrorMessage(workspaceDirectoriesQuery.error, workspacePickerCopy.loadFailed)}</div>
                ) : (workspaceDirectoriesQuery.data?.directories.length || 0) === 0 ? (
                  <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">{workspacePickerCopy.empty}</div>
                ) : (
                  <div className="p-1">
                    {(workspaceDirectoriesQuery.data?.directories || []).map((directory) => (
                      <button
                        key={directory.path}
                        type="button"
                        className="flex h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                        onClick={() => setWorkspacePickerPath(directory.path)}
                      >
                        <Folder size={16} className="shrink-0 text-primary" />
                        <span className="truncate">{directory.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="border-t px-5 py-4">
              <Button type="button" variant="ghost" onClick={() => setIsWorkspacePickerOpen(false)}>{workspacePickerCopy.cancel}</Button>
              <Button type="button" disabled={!workspacePickerPath || workspaceDirectoriesQuery.isLoading} onClick={selectWorkspacePickerPath}>
                <Folder size={16} />
                {workspacePickerCopy.selectCurrent}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isAdvanced && (
        <Dialog open={isFilePickerOpen} onOpenChange={setIsFilePickerOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{fileCopy.selectFile}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {selectedSharedPool && <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{language === "zh" ? `正在选择 ${sharedPoolLabel(selectedSharedPool, language)} 中的共享文件` : `Selecting shared files from ${sharedPoolLabel(selectedSharedPool, language)}`}</div>}
              {selectableStoredFiles.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
                  {fileCopy.noFiles}
                </div>
              ) : (
                selectableStoredFiles.map((file) => {
                  const targetAttachments = filePickerTarget === "editor" ? editingAttachments : attachments
                  const selected = targetAttachments.some((attachment) => attachment.storage_id === file.id)
                  return (
                    <div key={file.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{file.name}</span>
                          {file.text_available && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{fileCopy.text}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{file.type || "application/octet-stream"}</span>
                          <span>{formatBytes(file.size)}</span>
                        </div>
                      </div>
                      <Button
                        variant={selected ? "outline" : "default"}
                        disabled={selected || selectingFileID === file.id}
                        onClick={() => selectStoredFile(file)}
                      >
                        {selected ? fileCopy.selected : selectingFileID === file.id ? fileCopy.loading : fileCopy.useFile}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsFilePickerOpen(false)}>
                {fileCopy.close}
              </Button>
              <Button asChild variant="outline">
                <Link to="/chat/files">{fileCopy.manageFiles}</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isAdvanced && (
        <AgentWorkDialog
          open={isAgentWorkOpen}
          onOpenChange={setIsAgentWorkOpen}
          work={agentWork || fallbackAgentWork}
          selectedAgentID={selectedWorkAgentID}
          onSelectAgent={setSelectedWorkAgentID}
          copy={agentGroupCopy}
          chatCopy={copy}
          decidingTaskID={decidingConnectorTaskID}
          onDecideConnectorTask={decideConnectorApproval}
        />
      )}
      {isAdvanced && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.advancedConfig}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                {([
                  ["basic", copy.basicSettings],
                  ["advanced", copy.advancedModelSettings],
                  ...(activeRunMode !== "agent_group" ? ([["agent", copy.agent]] as const) : []),
                  ["agent_group", agentGroupCopy.agentGroups],
                  ["skills", copy.skills],
					["knowledge", knowledgeCopy.label],
                  ...(currentAdvancedSettings.assistant_mcp_tools_enabled ? ([["mcp", copy.mcpServers]] as const) : []),
                  ...(assistantConnectorToolsEnabled && activeRunMode !== "chat" ? ([["device", copy.devices]] as const) : []),
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      if (tab === "device") {
                        setPendingConnectorDeviceID(currentSession?.connector_device_id || connectorDevices[0]?.id || "")
                        setPendingConnectorWorkspace(currentSession?.connector_workspace_path || "")
                        setPendingCloudSandboxID(currentSession?.cloud_sandbox_id || "")
                      }
                      setConfigTab(tab)
                    }}
                    className={cn(
                      "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted",
                      configTab === tab && "border-primary bg-primary/5 text-primary"
                    )}
                  >
                    {tab === "skills" && <Sparkles size={14} />}
                    {tab === "knowledge" && <FolderOpen size={14} />}
                    {tab === "mcp" && <Server size={14} />}
                    {label}
                  </button>
                ))}
              </div>

              {configTab === "basic" && (
                <div className="space-y-4 rounded-md border p-3">
                  {activeRunMode !== "agent_group" && (
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.sessionModel}</span>
                      <Select value={String((activeModelName) || "__shadcn_empty__")} onValueChange={(value) => handleSessionModelChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="__shadcn_empty__">{copy.selectModel}</SelectItem>
                        {modelSelectOptions.map((model) => (
                          <SelectItem key={model} value={String(model)}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent></Select>
                    </label>
                  )}

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.channel}</span>
                    <Select value={String((selectedUserChannel?.id || "") || "__shadcn_empty__")} onValueChange={(value) => {
                        const nextID = Number((value === "__shadcn_empty__" ? "" : value)) || 0
                        const nextChannel = catalog.find((channel) => channel.id === nextID)
                        const nextModel = nextChannel?.models.includes(activeModelName) ? activeModelName : nextChannel?.models[0] || ""
                        setSelectedUserChannelID(nextID)
                        setModelName(nextModel)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, user_channel_id: nextID || undefined, model_name: nextModel }), { persist: true })
                        }
                      }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="__shadcn_empty__">{catalog.length ? copy.selectChannel : copy.noChannels}</SelectItem>
                      {catalog.map((channel) => (
                        <SelectItem key={channel.id} value={String(channel.id)}>
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent></Select>
                  </label>
                  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{copy.autoCompressContext}</div>
                      <div className="text-xs text-muted-foreground">{copy.autoCompressContextHint}</div>
                    </div>
                    <Switch
                      checked={currentSession?.auto_compress_context !== false}
                      onCheckedChange={(checked) => {
                        if (currentSession) updateSession(currentSession.id, (session) => ({ ...session, auto_compress_context: checked }), { persist: true })
                      }}
                      aria-label={copy.autoCompressContext}
                    />
                  </div>
                  <div className="space-y-3 rounded-md border px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{copy.toolGroupsTitle}</div>
                      <div className="text-xs text-muted-foreground">{copy.toolGroupsHint}</div>
                    </div>
                    {chatToolGroupItems(copy).map((group) => {
                      const disabledGroups = currentSession?.disabled_tool_groups || []
                      const enabled = !disabledGroups.includes(group.key)
                      return (
                        <div key={group.key} className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm">{group.label}</div>
                            <div className="text-xs text-muted-foreground">{group.hint}</div>
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) => {
                              if (!currentSession) return
                              updateSession(currentSession.id, (session) => {
                                const current = session.disabled_tool_groups || []
                                const next = checked ? current.filter((item) => item !== group.key) : current.includes(group.key) ? current : [...current, group.key]
                                return { ...session, disabled_tool_groups: next }
                              }, { persist: true })
                            }}
                            aria-label={group.label}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {configTab === "advanced" && (
                <div className="space-y-4 rounded-md border p-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.temperature}</span>
                    <input
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={currentSession?.temperature ?? ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? null : Number(event.target.value)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, temperature: value }), { persist: true })
                        }
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.reasoningEffort}</span>
                    <Select value={String((currentSession?.reasoning_effort || "") || "__shadcn_empty__")} onValueChange={(value) => {
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, reasoning_effort: (value === "__shadcn_empty__" ? "" : value) }), { persist: true })
                        }
                      }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="__shadcn_empty__">{copy.reasoningDefault}</SelectItem>
                      <SelectItem value="minimal">{copy.reasoningMinimal}</SelectItem>
                      <SelectItem value="low">{copy.reasoningLow}</SelectItem>
                      <SelectItem value="medium">{copy.reasoningMedium}</SelectItem>
                      <SelectItem value="high">{copy.reasoningHigh}</SelectItem>
                    </SelectContent></Select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.maxTokens}</span>
                    <input
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      type="number"
                      min={0}
                      max={200000}
                      step={1}
                      value={currentSession?.max_tokens || ""}
                      placeholder={copy.maxTokensPlaceholder}
                      onChange={(event) => {
                        const value = Math.max(0, Number(event.target.value) || 0)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, max_tokens: value }), { persist: true })
                        }
                      }}
                    />
                  </label>
                </div>
              )}

              {configTab === "agent" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">{copy.addedAgent}</div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/agents">{copy.manageAgents}</Link>
                    </Button>
                  </div>
                  {selectedAgent ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{selectedAgent.name}</div>
                        {selectedAgent.prompt && <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{selectedAgent.prompt}</div>}
                      </div>
                      {selectedAgent.id !== defaultAgentID && (
                        <Button variant="ghost" size="sm" onClick={removeAgentFromSession} title={copy.remove}>
                          <X size={15} />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noAgentAdded}</div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select value={String((pendingAgentID) || "__shadcn_empty__")} onValueChange={(value) => setPendingAgentID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      {agents.length === 0 && <SelectItem value="__shadcn_empty__">{copy.noAgents}</SelectItem>}
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent></Select>
                    <Button className="gap-2" disabled={!pendingAgentID} onClick={() => setSessionAgent(pendingAgentID)}>
                      <Check size={16} />
                      {selectedAgent ? copy.replaceAgent : copy.setAgent}
                    </Button>
                  </div>
                </div>
              )}

              {configTab === "skills" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles size={15} />
                      {copy.addedSkills}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/skills">{copy.manageSkills}</Link>
                    </Button>
                  </div>
                  {selectedSkills.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noSkillsAdded}</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSkills.map((skill) => (
                        <div key={skill.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{skill.name}</div>
                            {skill.description && <div className="mt-1 truncate text-xs text-muted-foreground">{skill.description}</div>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeSessionSkill(skill.id)} title={copy.remove}>
                            <X size={15} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button className="gap-2" onClick={() => setSessionCapabilityPicker("skills")}>
                    <Plus size={16} />
                    {copy.add}
                  </Button>
                </div>
              )}

              {configTab === "knowledge" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FolderOpen size={15} />
                      {knowledgeCopy.label}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/knowledge">{knowledgeCopy.manage}</Link>
                    </Button>
                  </div>
                  {sessionKnowledgeBases.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{knowledgeCopy.empty}</div>
                  ) : (
                    <div className="space-y-2">
                      {sessionKnowledgeBases.map((base) => (
                        <div key={base.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{base.name}</div>
                            {base.description && <div className="mt-1 truncate text-xs text-muted-foreground">{base.description}</div>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeSessionKnowledgeBase(base.id)} title={copy.remove}>
                            <X size={15} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button className="gap-2" onClick={() => setSessionCapabilityPicker("knowledge")}>
                    <Plus size={16} />
                    {copy.add}
                  </Button>
                </div>
              )}

              {configTab === "mcp" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server size={15} />
                      {copy.addedMCPServers}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/mcp">{copy.manageMCP}</Link>
                    </Button>
                  </div>
                  {sessionMCPServers.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noMCPServersAdded}</div>
                  ) : (
                    <div className="space-y-2">
                      {sessionMCPServers.map((server) => (
                        <div key={server.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{server.name}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{mcpServerSummary(server)}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeSessionMCPServer(server.id)} title={copy.remove}>
                            <X size={15} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button className="gap-2" onClick={() => setSessionCapabilityPicker("mcp")}>
                    <Plus size={16} />
                    {copy.add}
                  </Button>
                </div>
              )}

              {configTab === "agent_group" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">{agentGroupCopy.agentGroups}</div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/agent-groups">{agentGroupCopy.manageGroups}</Link>
                    </Button>
                  </div>
                  {currentAgentGroup ? (
                    <div className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{currentAgentGroup.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{agentGroupCopy.chiefCount.replace("{count}", String(agentGroupChiefCount(currentAgentGroup)))}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSessionAgentGroup("")} title={copy.remove}>
                          <X size={15} />
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {currentAgentGroup.agents.map((agent) => (
                          <span key={agent.id} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                            @{agent.name || agent.id} · {agent.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{agentGroupCopy.noGroupSelected}</div>
                  )}
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{agentGroupCopy.selectGroup}</span>
                    <Select value={String((currentSession?.agent_group_id || "") || "__shadcn_empty__")} disabled={isFetchingAgentGroups} onValueChange={(value) => setSessionAgentGroup((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="__shadcn_empty__">{agentGroups.length ? agentGroupCopy.selectGroup : agentGroupCopy.noGroups}</SelectItem>
                      {agentGroups.map((group) => (
                        <SelectItem key={group.id} value={String(group.id)}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent></Select>
                  </label>
                </div>
              )}

              {configTab === "device" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server size={15} />
                      {copy.sessionDevice}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/devices">{copy.manageDevices}</Link>
                    </Button>
                  </div>

                  {selectedConnectorDevice ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{selectedConnectorDevice.name}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{currentSession?.connector_workspace_path || copy.unrestrictedWorkspace}</div>
                        {selectedConnectorDevice.remark && <div className="mt-1 truncate text-xs text-muted-foreground">{selectedConnectorDevice.remark}</div>}
                        <div className={cn("mt-1 text-xs", selectedConnectorDevice.online ? "text-primary" : "text-muted-foreground")}>
                          {selectedConnectorDevice.online ? copy.deviceOnline : copy.deviceOffline}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearSessionConnector} title={copy.remove}>
                        <X size={15} />
                      </Button>
                    </div>
                  ) : false && currentSession?.cloud_sandbox_id ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{selectedCloudSandbox?.name || currentSession?.cloud_sandbox_id}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{selectedCloudSandbox?.image || copy.cloudSandbox}</div>
                        <div className="mt-1 text-xs text-primary">{copy.cloudSandbox}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSessionCloudSandbox("")} title={copy.remove}>
                        <X size={15} />
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noDeviceSelected}</div>
                  )}

                  {false && <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Cloud size={15} />
                        {copy.cloudSandbox}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/chat/sandboxes">{copy.manageCloudSandboxes}</Link>
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">{copy.cloudSandboxHint}</div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <Select value={String(pendingCloudSandboxID || "__shadcn_empty__")} onValueChange={(value) => setPendingCloudSandboxID(value === "__shadcn_empty__" ? "" : value)}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="__shadcn_empty__">{cloudSandboxes.length ? copy.selectCloudSandbox : copy.noCloudSandboxes}</SelectItem>
                        {cloudSandboxes.map((sandbox) => (
                          <SelectItem key={sandbox.id} value={String(sandbox.id)}>
                            {sandbox.name}{sandbox.image ? ` · ${sandbox.image}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent></Select>
                      <div className="flex items-end">
                        <Button
                          className="w-full gap-2"
                          disabled={!pendingCloudSandboxID}
                          onClick={() => setSessionCloudSandbox(pendingCloudSandboxID)}
                        >
                          <Check size={16} />
                          {copy.useCloudSandbox}
                        </Button>
                      </div>
                    </div>
                  </div>}

                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles size={15} />
                        {copy.workspaceSkills}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isRefreshingWorkspaceSkills || !(currentSession?.connector_device_id || pendingConnectorDeviceID)}
                        onClick={refreshWorkspaceSkills}
                      >
                        <Sparkles size={15} />
                        {isRefreshingWorkspaceSkills ? copy.refreshingWorkspaceSkills : copy.refreshWorkspaceSkills}
                      </Button>
                    </div>
                    {workspaceSkills.length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{copy.noWorkspaceSkills}</div>
                    ) : (
                      <div className="space-y-2">
                        {workspaceSkills.map((skill) => (
                          <div key={skill.path} className="rounded-md border p-3">
                            <div className="flex min-w-0 items-center gap-2 text-sm">
                              <span className="truncate font-medium">{skill.name}</span>
                              {skill.truncated && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{copy.truncated}</span>}
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{skill.path}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.selectDevice}</span>
                      <Select value={String((pendingConnectorDeviceID) || "__shadcn_empty__")} onValueChange={(value) => setPendingConnectorDeviceID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="__shadcn_empty__">{selectableConnectorDevices.length ? copy.selectDevice : copy.noDevices}</SelectItem>
                        {selectableConnectorDevices.map((device) => (
                          <SelectItem key={device.id} value={String(device.id)}>
                            {device.name}{device.online ? "" : ` (${copy.deviceOffline})`}
                          </SelectItem>
                        ))}
                      </SelectContent></Select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.workspacePath}</span>
                      <div className="flex gap-2">
                        <input
                          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                          value={pendingConnectorWorkspace}
                          placeholder={copy.workspacePathPlaceholder}
                          onChange={(event) => setPendingConnectorWorkspace(event.target.value)}
                        />
                        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={!pendingConnectorDeviceID} onClick={() => openWorkspacePicker("pending")} aria-label={workspacePickerCopy.title} title={workspacePickerCopy.title}>
                          <Folder size={16} />
                        </Button>
                      </div>
                    </label>
                    <div className="flex items-end">
                      <Button
                        className="w-full gap-2"
                        disabled={!pendingConnectorDeviceID || !pendingConnectorWorkspace.trim()}
                        onClick={() => setSessionConnector(
                          pendingConnectorDeviceID,
                          pendingConnectorWorkspace.trim(),
                          pendingConnectorApprovalMode,
                          commandPrefixesFromText(pendingConnectorCommandPrefixes)
                        )}
                      >
                        <Check size={16} />
                        {copy.setDevice}
                      </Button>
                    </div>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{approvalModeCopy.label}</span>
                    <Select value={String((pendingConnectorApprovalMode) || "__shadcn_empty__")} onValueChange={(value) => setPendingConnectorApprovalMode(normalizeConnectorApprovalMode((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="manual">{approvalModeCopy.manual}</SelectItem>
                      <SelectItem value="full_access">{approvalModeCopy.fullAccess}</SelectItem>
                      <SelectItem value="assistant" disabled={!currentAdvancedSettings.connector_approval_agent_id}>{approvalModeCopy.assistant}</SelectItem>
                    </SelectContent></Select>
                    {pendingConnectorApprovalMode === "assistant" && !currentAdvancedSettings.connector_approval_agent_id && (
                      <span className="block text-xs text-destructive">{approvalModeCopy.agentRequired}</span>
                    )}
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.connectorCommandPrefixes}</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={pendingConnectorCommandPrefixes}
                      placeholder={copy.connectorCommandPrefixesPlaceholder}
                      onChange={(event) => setPendingConnectorCommandPrefixes(event.target.value)}
                    />
                    <span className="block text-xs text-muted-foreground">{copy.connectorCommandPrefixesHint}</span>
                  </label>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setIsConfigOpen(false)}>{copy.done}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isAdvanced && sessionCapabilityPickerConfig && (
        <Dialog open onOpenChange={(open) => !open && setSessionCapabilityPicker(null)}>
          <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.add}{sessionCapabilityPickerConfig.title}</DialogTitle>
            </DialogHeader>
            {sessionCapabilityPickerConfig.items.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{sessionCapabilityPickerConfig.empty}</div>
            ) : (
              <div className="space-y-2">
                {sessionCapabilityPickerConfig.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="grid w-full grid-cols-[1fr_auto] gap-2 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => sessionCapabilityPickerConfig.onAdd(item.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      {item.description && <span className="mt-1 block truncate text-xs text-muted-foreground">{item.description}</span>}
                    </span>
                    <Plus size={16} className="mt-0.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      </div>
      {activeRunMode !== "chat" && (
        <aside className={cn(
          "hidden h-full shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-muted/20 p-3 transition-[width,opacity,padding] duration-200 xl:flex",
          isDesktopSessionsSidebarVisible ? "w-72 opacity-100" : "w-0 overflow-hidden border-l-0 p-0 opacity-0 pointer-events-none"
        )}>
          <section className="shrink-0 rounded-md border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold"><Monitor size={16} />{gitCopy.environment}</div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">{gitCopy.executionEnvironment}</span><span className="max-w-40 truncate text-right font-medium">{currentConnectorDevice?.name || gitCopy.noDevice}</span></div>
              <div className="flex items-start justify-between gap-3"><span className="shrink-0 text-muted-foreground">{gitCopy.runDirectory}</span><span className="min-w-0 truncate text-right font-mono">{currentSession?.connector_workspace_path || gitCopy.noWorkspacePath}</span></div>
              {currentConnectorDevice && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{language === "zh" ? "状态" : "Status"}</span><span className={currentConnectorDevice.online ? "text-emerald-600" : "text-muted-foreground"}>{currentConnectorDevice.online ? copy.deviceOnline : copy.deviceOffline}</span></div>}
            </div>
          </section>
          <section className="min-h-0 rounded-md border border-border bg-card shadow-sm">
            <div className="flex h-11 items-center justify-between border-b px-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} />{language === "zh" ? "生成的文件" : "Generated files"}</div>
              <span className="text-xs tabular-nums text-muted-foreground">{generatedFiles.length}</span>
            </div>
            <div className="max-h-[calc(100vh-20rem)] space-y-1 overflow-y-auto p-2">
              {generatedFiles.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">{language === "zh" ? "助理登记的文件会显示在这里" : "Files reported by the assistant appear here"}</div>
              ) : generatedFiles.map((file) => (
                <div key={file.path} className="rounded-md px-2 py-2 hover:bg-muted">
                  <div className="flex items-center gap-2"><FileText size={14} className="shrink-0 text-primary" /><span className="truncate text-sm font-medium" title={file.path}>{file.name}</span></div>
                  {file.description && <div className="mt-1 line-clamp-2 pl-6 text-xs text-muted-foreground">{file.description}</div>}
                  <div className="mt-1 truncate pl-6 font-mono text-[11px] text-muted-foreground" title={file.path}>{file.path}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      )}
    </div>
  )
}

function floatingMenuStyle(anchor: HTMLElement | null) {
  if (!anchor) {
    return undefined
  }
  const rect = anchor.getBoundingClientRect()
  return {
    left: Math.min(rect.right + 8, window.innerWidth - 304),
    top: Math.max(8, Math.min(rect.top, window.innerHeight - 240)),
  }
}

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; language: string; text: string }
  | { type: "table"; headers: string[]; alignments: Array<"left" | "center" | "right">; rows: string[][] }
  | { type: "hr" }

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content)
  if (blocks.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 break-words leading-relaxed">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
}

function UserMessageContent({ content }: { content: string }) {
  const parsed = parseMessageAttachments(content)
  return (
    <div className="space-y-2">
      {parsed.text && <MarkdownContent content={parsed.text} />}
      {parsed.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parsed.attachments.map((attachment, index) => (
            <div
              key={`${attachment.storageID || attachment.name}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs shadow-sm"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{attachment.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{attachment.type || "application/octet-stream"}</span>
                  <span>{attachment.sizeLabel || "0 B"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentChips({
  attachments,
  removeLabel,
  onRemove,
}: {
  attachments: ChatAttachment[]
  removeLabel: string
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <Paperclip size={14} className="shrink-0" />
          <span className="truncate">{attachment.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size)}</span>
          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => onRemove(attachment.id)} aria-label={removeLabel}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

function AssistantMessageSequence({
  message,
  activeRun,
  copy,
  approvalTasks,
  decidingTaskID,
  onDecide,
  onCopy,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  controlsHidden,
}: {
  message: ChatMessage
  activeRun?: ChatRun
  copy: ChatCopy
  approvalTasks: ConnectorApprovalTask[]
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  editLabel: string
  deleteLabel: string
  controlsHidden: boolean
}) {
  const parts = messageContentParts(message, activeRun, copy)
  const toolCallsByRound = groupToolCallsByRound(message.tool_calls || [])
  const blocks = messageRoundBlocks(parts, toolCallsByRound)
  if (blocks.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      {blocks.map((block) => block.kind === "text" ? (
        <div key={block.id} className="space-y-1.5">
          {block.parts.map((part, index) => (
              <div key={`${block.id}-part-${index}`} className="group space-y-1.5">
                <div className="flex justify-start">
                  <div className="w-fit max-w-full rounded-lg border border-border bg-background p-3 text-sm shadow-sm">
                    <div className="flex items-start gap-2">
                      <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <MarkdownContent content={part.content} />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex justify-start gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                    controlsHidden && "pointer-events-none opacity-0"
                  )}
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy} title={copy.copyMessage}>
                    <Copy size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title={editLabel}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" onClick={onDelete} title={deleteLabel}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div key={block.id} className="flex justify-start">
          <div className="w-full max-w-3xl pl-1">
            <ToolCallRounds
              toolCalls={block.toolCalls}
              copy={copy}
              approvalTasks={block.toolCalls.some((toolCall) => toolCall.status === "approval_required") ? approvalTasks : []}
              decidingTaskID={decidingTaskID}
              onDecide={onDecide}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MessageContent({
  message,
  activeRun,
  isAdvanced,
  copy,
  approvalTasks,
  decidingTaskID,
  onDecide,
  hideToolCalls = false,
}: {
  message: ChatMessage
  activeRun?: ChatRun
  isAdvanced: boolean
  copy: ChatCopy
  approvalTasks: ConnectorApprovalTask[]
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
  hideToolCalls?: boolean
}) {
  if (message.role !== "assistant") {
    return <UserMessageContent content={messageDisplayContent(message, activeRun, copy)} />
  }

  const parts = messageContentParts(message, activeRun, copy)
  if (hideToolCalls) {
    if (parts.length === 0) {
      return <MarkdownContent content={messageDisplayContent(message, activeRun, copy)} />
    }
    return (
      <div className="space-y-2">
        {parts.map((part, index) => (
          <MarkdownContent key={`${normalizedRound(part.round)}-text-${index}`} content={part.content} />
        ))}
      </div>
    )
  }
  const toolCallsByRound = groupToolCallsByRound(message.tool_calls || [])
  const blocks = messageRoundBlocks(parts, toolCallsByRound)
  if (blocks.length === 0) {
    return <MarkdownContent content={messageDisplayContent(message, activeRun, copy)} />
  }

  return (
    <div className="space-y-3">
      {blocks.map((block) => block.kind === "text" ? (
        <div key={block.id} className="space-y-2">
          {block.parts.map((part, index) => (
            <MarkdownContent key={`${block.id}-text-${index}`} content={part.content} />
          ))}
        </div>
      ) : (
        <ToolCallRounds
          key={block.id}
          toolCalls={block.toolCalls}
          copy={copy}
          approvalTasks={isAdvanced && block.toolCalls.some((toolCall) => toolCall.status === "approval_required") ? approvalTasks : []}
          decidingTaskID={decidingTaskID}
          onDecide={onDecide}
        />
      ))}
    </div>
  )
}

function ToolCallRounds({
  toolCalls,
  copy,
  approvalTasks = [],
  decidingTaskID = "",
  onDecide,
}: {
  toolCalls: ChatToolCall[]
  copy: ChatCopy
  approvalTasks?: ConnectorApprovalTask[]
  decidingTaskID?: string
  onDecide?: (taskID: string, approved: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  if (toolCalls.length === 0) {
    return null
  }

  return (
    <details className="mb-2 rounded-md bg-muted/40 px-2 py-1.5" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-foreground">{copy.toolRound}</span>
        <span className="min-w-0 flex-1" />
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      </summary>
      <div className={cn("mt-2 space-y-2", toolCalls.length > 6 && "max-h-[30rem] overflow-y-auto overscroll-contain pr-1")}>
        {toolCalls.map((toolCall) => (
          <ToolCallDetails
            key={toolCall.id}
            toolCall={toolCall}
            copy={copy}
            approvalTask={findConnectorApprovalTask(toolCall, approvalTasks)}
            decidingTaskID={decidingTaskID}
            onDecide={onDecide}
          />
        ))}
      </div>
    </details>
  )
}

function ToolCallDetails({
  toolCall,
  copy,
  approvalTask,
  decidingTaskID = "",
  onDecide,
}: {
  toolCall: ChatToolCall
  copy: ChatCopy
  approvalTask?: ConnectorApprovalTask
  decidingTaskID?: string
  onDecide?: (taskID: string, approved: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const builtinKind = builtinToolKind(toolCall)
  const path = stringArgument(toolCall.arguments, "path")
  const content = stringArgument(toolCall.arguments, "content")
  const command = stringArgument(toolCall.arguments, "command")
  const query = stringArgument(toolCall.arguments, "query")
  const url = stringArgument(toolCall.arguments, "url")
  const domainName = stringArgument(toolCall.arguments, "domain_name")
  const siteID = stringArgument(toolCall.arguments, "site_id")
  const replacements = replacementEntriesFromArguments(toolCall.arguments)
  const toolTarget = builtinKind === "search" ? query : builtinKind === "fetch" ? url : command
  const siteTitle = staticSiteToolTitle(toolCall, domainName, siteID)
  const title = builtinKind
    ? builtinToolTitle(builtinKind, path, toolTarget, copy, booleanArgument(toolCall.arguments, "preview_old_content_available"))
    : siteTitle || toolLabel(toolCall)

  return (
    <details
      className="group rounded-md px-1 py-1 text-muted-foreground"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[11px]", toolStatusClassName(toolCall.status))}>
          {toolStatusLabel(toolCall.status, copy)}
        </span>
        <ArrowDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </summary>
      <ConnectorApprovalControls
        task={approvalTask}
        copy={copy}
        decidingTaskID={decidingTaskID}
        onDecide={onDecide}
        className="mt-2"
      />
      {builtinKind === "write" ? (
        <div className="mt-2 overflow-hidden rounded-md bg-muted/40">
          <LineDiff oldText={stringArgument(toolCall.arguments, "preview_old_content")} newText={content} />
        </div>
      ) : builtinKind === "replace" ? (
        <ReplacementDiffList entries={replacements} copy={copy} />
      ) : builtinKind === "read" || builtinKind === "list" ? (
        <ToolResultBlock result={toolCall.result} copy={copy} />
      ) : builtinKind === "command" || builtinKind === "search" || builtinKind === "fetch" ? (
        <ToolResultBlock result={toolCall.result} copy={copy} />
      ) : (
        <>
          <div className="mt-2 text-[11px] font-medium text-muted-foreground">{copy.toolArguments}</div>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
            {formatToolArguments(toolCall.arguments)}
          </pre>
        </>
      )}
    </details>
  )
}

function ToolResultBlock({ result, copy }: { result?: string; copy: ChatCopy }) {
  const text = typeof result === "string" ? result.trim() : ""
  if (!text) {
    return <div className="mt-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">{copy.emptyResponse}</div>
  }
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.toolResult}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

function TaskChangesDialog({
  open,
  onOpenChange,
  summary,
  selectedPath,
  onSelectPath,
  copy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: TaskChangeSummary
  selectedPath: string
  onSelectPath: (path: string) => void
  copy: typeof zhTaskChangeCopy
}) {
  const selectedFile = summary.files.find((file) => file.path === selectedPath) || summary.files[0]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{copy.title}</DialogTitle>
          <div className="mt-1 flex items-center gap-3 text-xs font-medium tabular-nums">
            <span className="text-muted-foreground">{copy.summary.replace("{count}", String(summary.files.length))}</span>
            <span className="text-primary">+{summary.additions}</span>
            <span className="text-destructive">-{summary.deletions}</span>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="max-h-[65vh] overflow-y-auto border-b p-2 md:border-b-0 md:border-r">
            {summary.files.map((file) => {
              const selected = file.path === selectedFile?.path
              return (
                <button
                  key={file.path}
                  type="button"
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    selected && "bg-primary/10 text-primary"
                  )}
                  onClick={() => onSelectPath(file.path)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={15} className="shrink-0" />
                    <span className="truncate font-medium">{file.path}</span>
                  </div>
                  <div className="mt-1 flex gap-2 pl-5 text-xs font-medium tabular-nums">
                    <span className="text-primary">+{file.additions}</span>
                    <span className="text-destructive">-{file.deletions}</span>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="min-h-0 overflow-y-auto">
            {selectedFile ? (
              <>
                <div className="sticky top-0 z-10 border-b bg-popover px-4 py-3 font-mono text-xs text-muted-foreground">{selectedFile.path}</div>
                <div className="space-y-3 p-3">
                  {selectedFile.entries.map((entry, index) => (
                    <div key={`${entry.path}-${index}`} className="overflow-hidden rounded-md border">
                      <LineDiff oldText={entry.oldText} newText={entry.newText} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-4 text-sm text-muted-foreground">{copy.empty}</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConnectorApprovalControls({
  task,
  copy,
  decidingTaskID,
  onDecide,
  className,
}: {
  task?: ConnectorApprovalTask
  copy: ChatCopy
  decidingTaskID: string
  onDecide?: (taskID: string, approved: boolean) => void
  className?: string
}) {
  if (!task || !onDecide) {
    return null
  }
  return (
    <div className={cn("flex shrink-0 flex-wrap justify-end gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={Boolean(decidingTaskID)}
        onClick={() => onDecide(task.id, false)}
      >
        <X size={14} />
        {copy.rejectConnectorTask}
      </Button>
      <Button
        size="sm"
        disabled={Boolean(decidingTaskID)}
        onClick={() => onDecide(task.id, true)}
      >
        <Check size={14} />
        {copy.approveConnectorTask}
      </Button>
    </div>
  )
}

function AskUserPromptCard({
  prompt,
  copy,
  disabled,
  onSubmit,
}: {
  prompt: AskUserPromptData
  copy: ChatCopy
  disabled: boolean
  onSubmit: (text: string) => void
}) {
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [customText, setCustomText] = useState("")

  const toggleOption = (label: string) => {
    if (disabled) {
      return
    }
    if (!prompt.multiSelect) {
      onSubmit(label)
      return
    }
    setSelectedLabels((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label])
  }

  const submitAnswer = () => {
    if (disabled) {
      return
    }
    const parts = prompt.multiSelect ? [...selectedLabels] : []
    const text = customText.trim()
    if (text) {
      parts.push(text)
    }
    if (parts.length === 0) {
      return
    }
    onSubmit(parts.join("、"))
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion size={15} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">{copy.askUserTitle}</div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-foreground">{prompt.question}</div>
        </div>
      </div>
      {prompt.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map((option) => {
            const selected = prompt.multiSelect && selectedLabels.includes(option.label)
            return (
              <button
                key={option.label}
                type="button"
                disabled={disabled}
                title={option.description || undefined}
                onClick={() => toggleOption(option.label)}
                className={cn(
                  "max-w-full rounded-md border px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  selected ? "border-primary bg-primary/15 text-foreground" : "border-border bg-background hover:border-primary/60 hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {prompt.multiSelect && (
                    <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border", selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
                      {selected && <Check size={10} />}
                    </span>
                  )}
                  <span className="break-words font-medium">{option.label}</span>
                </span>
                {option.description && <span className="mt-0.5 block break-words text-muted-foreground">{option.description}</span>}
              </button>
            )
          })}
        </div>
      )}
      {(prompt.multiSelect || prompt.allowCustom) && (
        <div className="flex items-center gap-2">
          {prompt.allowCustom && (
            <input
              value={customText}
              disabled={disabled}
              onChange={(event) => setCustomText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submitAnswer()
                }
              }}
              placeholder={copy.askUserCustomPlaceholder}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/60 disabled:opacity-60"
            />
          )}
          {(prompt.multiSelect || customText.trim() !== "") && (
            <Button
              size="sm"
              className="h-8 shrink-0 text-xs"
              disabled={disabled || (selectedLabels.length === 0 && customText.trim() === "")}
              onClick={submitAnswer}
            >
              {prompt.multiSelect ? copy.askUserConfirm : copy.send}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function sessionTaskStatusLabel(status: SessionTaskStatus, copy: ChatCopy): string {
  switch (status) {
    case "in_progress":
      return copy.taskStatusInProgress
    case "completed":
      return copy.taskStatusCompleted
    case "skipped":
      return copy.taskStatusSkipped
    default:
      return copy.taskStatusPending
  }
}

function SessionTaskPlanPanel({
  tasks,
  copy,
  isOpen,
  onToggle,
}: {
  tasks: SessionTask[]
  copy: ChatCopy
  isOpen: boolean
  onToggle: () => void
}) {
  if (tasks.length === 0) {
    return null
  }
  const completedCount = tasks.filter((task) => task.status === "completed" || task.status === "skipped").length
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
        onClick={onToggle}
        aria-expanded={isOpen}
        title={copy.taskPlanToggle}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ListTodo size={14} className="shrink-0 text-primary" />
          <span className="truncate">{copy.taskPlan}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{completedCount}/{tasks.length}</span>
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && (
        <ul className="max-h-44 space-y-1.5 overflow-y-auto border-t border-border px-3 py-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2 text-xs" title={task.note || task.description || undefined}>
              {task.status === "completed" ? (
                <Check size={13} className="mt-0.5 shrink-0 text-primary" />
              ) : task.status === "in_progress" ? (
                <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-primary" />
              ) : task.status === "skipped" ? (
                <X size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
              ) : (
                <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground/50" aria-hidden />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  (task.status === "completed" || task.status === "skipped") && "text-muted-foreground line-through",
                  task.status === "in_progress" && "font-medium text-foreground"
                )}
              >
                {task.title}
              </span>
              <span className="sr-only">{sessionTaskStatusLabel(task.status, copy)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PendingConnectorApprovalsPanel({
  tasks,
  copy,
  decidingTaskID,
  onDecide,
}: {
  tasks: ConnectorApprovalTask[]
  copy: ChatCopy
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
}) {
  if (tasks.length === 0) {
    return null
  }
  return (
    <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
      <div className="font-medium text-foreground">{copy.connectorApprovalTitle}</div>
      <div className="mt-1 text-xs text-muted-foreground">{copy.connectorApprovalDescription}</div>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-md border bg-background p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-xs">
                <div className="font-medium">{connectorApprovalTaskTitle(task)}</div>
                <div className="mt-1 truncate text-muted-foreground">{connectorApprovalTaskSubtitle(task)}</div>
              </div>
              <ConnectorApprovalControls
                task={task}
                copy={copy}
                decidingTaskID={decidingTaskID}
                onDecide={onDecide}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentWorkDialog({
  open,
  onOpenChange,
  work,
  selectedAgentID,
  onSelectAgent,
  copy,
  chatCopy,
  decidingTaskID,
  onDecideConnectorTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  work?: AgentWorkResponse
  selectedAgentID: string
  onSelectAgent: (agentID: string) => void
  copy: AgentGroupCopy
  chatCopy: ChatCopy
  decidingTaskID: string
  onDecideConnectorTask: (taskID: string, approved: boolean) => void
}) {
  const agents = work?.agents || []
  const connectorTasks = work?.connector_tasks || []
  const activeAgent = agents.find((agent) => agent.agent_id === selectedAgentID) || agents[0]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{copy.workStatus}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 gap-3 md:grid-cols-[16rem_1fr]">
          <div className="max-h-[65vh] space-y-2 overflow-y-auto rounded-md border p-2">
            {agents.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">{copy.noWorkStatus}</div>
            ) : (
              agents.map((agent) => {
                const selected = (selectedAgentID || activeAgent?.agent_id) === agent.agent_id
                return (
                  <button
                    key={agent.agent_id}
                    type="button"
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      selected && "border-primary bg-primary/5 text-primary"
                    )}
                    onClick={() => onSelectAgent(agent.agent_id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{agent.agent_name || agent.agent_id}</span>
                      <span className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                        agent.working ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {agent.working ? copy.working : copy.idle}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {agent.agent_type} · {agentWorkStatusText(agent.status, copy)}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex max-h-[65vh] min-h-0 flex-col rounded-md border">
            {activeAgent ? (
              <>
                <div className="border-b px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{activeAgent.agent_name || activeAgent.agent_id}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{activeAgent.agent_type}</span>
                    <span className={cn("rounded px-2 py-0.5 text-xs", activeAgent.working ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {activeAgent.working ? copy.working : copy.idle}
                    </span>
                  </div>
                  {activeAgent.updated_at && (
                    <div className="mt-1 text-xs text-muted-foreground">{copy.updatedAt}: {formatAgentWorkTime(activeAgent.updated_at)}</div>
                  )}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {connectorTasks.length > 0 && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium">{copy.roleTool}</span>
                        <span className="text-muted-foreground">{connectorTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {connectorTasks.map((task) => (
                          <AgentWorkConnectorTaskItem
                            key={task.id}
                            task={task}
                            runID={work?.run_id || ""}
                            copy={copy}
                            chatCopy={chatCopy}
                            decidingTaskID={decidingTaskID}
                            onDecide={onDecideConnectorTask}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {activeAgent.messages.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">{copy.noWorkMessages}</div>
                  ) : (
                    activeAgent.messages.map((message, index) => (
                      <div key={`${message.created_at || index}-${index}`} className="rounded-md border bg-background p-3 text-sm">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5">{agentWorkRoleLabel(message.role, copy)}</span>
                          {message.tool && <span>{message.tool}</span>}
                          {message.status && <span>{agentWorkStatusText(message.status, copy)}</span>}
                          {message.created_at && <span className="ml-auto">{formatAgentWorkTime(message.created_at)}</span>}
                        </div>
                        <MarkdownContent content={message.content} />
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[18rem] items-center justify-center px-3 text-sm text-muted-foreground">{copy.noWorkStatus}</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AgentWorkConnectorTaskItem({
  task,
  runID,
  copy,
  chatCopy,
  decidingTaskID,
  onDecide,
}: {
  task: AgentWorkConnectorTask
  runID: string
  copy: AgentGroupCopy
  chatCopy: ChatCopy
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
}) {
  const pending = task.status === "pending_approval"
  const approvalTask = agentWorkConnectorTaskAsApprovalTask(task, runID)
  const target =
    stringArgument(task.payload, "path") ||
    stringArgument(task.payload, "command") ||
    stringArgument(task.payload, "url") ||
    stringArgument(task.payload, "query")
  const payloadText = JSON.stringify(task.payload, null, 2)
  return (
    <div className="rounded-md border bg-background p-2 text-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{task.action || "connector"}</span>
            <span className={cn("rounded px-1.5 py-0.5", pending ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {agentWorkStatusText(task.status, copy)}
            </span>
            {task.updated_at && <span className="text-muted-foreground">{formatAgentWorkTime(task.updated_at)}</span>}
          </div>
          <div className="mt-1 truncate text-muted-foreground">
            {[task.device_name, task.workspace_path, target].filter(Boolean).join(" · ") || task.id}
          </div>
        </div>
        {pending && (
          <ConnectorApprovalControls
            task={approvalTask}
            copy={chatCopy}
            decidingTaskID={decidingTaskID}
            onDecide={onDecide}
          />
        )}
      </div>
      {payloadText !== "{}" && (
        <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{payloadText}</pre>
      )}
      {(task.result || task.error_message) && (
        <div className={cn("mt-2 whitespace-pre-wrap rounded px-2 py-1", task.error_message ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
          {task.error_message || task.result}
        </div>
      )}
    </div>
  )
}

function agentWorkConnectorTaskAsApprovalTask(task: AgentWorkConnectorTask, runID: string): ConnectorApprovalTask {
  return {
    id: task.id,
    device_id: task.device_id,
    device_name: task.device_name,
    run_id: runID,
    action: task.action,
    workspace_path: task.workspace_path,
    payload: task.payload,
    created_at: task.created_at,
  }
}

function ReplacementDiffList({ entries, copy }: { entries: ReplacementEntry[]; copy: ChatCopy }) {
  if (entries.length === 0) {
    return <div className="mt-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">{copy.toolArguments}</div>
  }
  return (
    <div className="mt-2 space-y-3">
      {entries.map((entry, index) => (
        <div key={`${entry.path}-${index}`} className="overflow-hidden rounded-md border">
          {entry.path && <div className="border-b bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">{entry.path}</div>}
          <LineDiff oldText={entry.oldText} newText={entry.newText} />
        </div>
      ))}
    </div>
  )
}

function LineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const hunks = diffHunks(oldText, newText, 2)
  return (
    <div className="max-h-96 overflow-auto bg-background py-1 font-mono text-xs">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          {hunkIndex > 0 && <div className="px-2 py-1 text-muted-foreground">...</div>}
          {hunk.map((line, lineIndex) => (
            <div
              key={`${hunkIndex}-${lineIndex}`}
              className={cn(
                "grid grid-cols-[1.5rem_1fr] gap-2 whitespace-pre-wrap break-words px-2 py-0.5",
                line.type === "remove" && "bg-destructive/10 text-destructive",
                line.type === "add" && "bg-primary/10 text-primary",
                line.type === "context" && "text-muted-foreground"
              )}
            >
              <span className="select-none text-right opacity-70">{line.type === "remove" ? "-" : line.type === "add" ? "+" : " "}</span>
              <span>{line.text || " "}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let index = 0

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim()
    if (text) {
      blocks.push({ type: "paragraph", text })
    }
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const fence = trimmed.match(/^```([\w-]*)\s*$/)
    if (fence) {
      flushParagraph()
      const language = fence[1] || ""
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      blocks.push({ type: "code", language, text: codeLines.join("\n") })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: "hr" })
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    const headerCells = parseMarkdownTableRow(line)
    const separatorCells = index + 1 < lines.length ? parseMarkdownTableRow(lines[index + 1]) : null
    if (headerCells && separatorCells && headerCells.length > 0 && headerCells.length === separatorCells.length && markdownTableSeparator(separatorCells)) {
      flushParagraph()
      const alignments = separatorCells.slice(0, headerCells.length).map(markdownTableAlignment)
      const rows: string[][] = []
      index += 2
      while (index < lines.length) {
        const row = parseMarkdownTableRow(lines[index])
        if (!row) {
          break
        }
        rows.push(Array.from({ length: headerCells.length }, (_, cellIndex) => row[cellIndex] || ""))
        index += 1
      }
      blocks.push({ type: "table", headers: headerCells, alignments, rows })
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/)
        if (!item) {
          break
        }
        items.push(item[1].trim())
        index += 1
      }
      blocks.push({ type: "ul", items })
      continue
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
        if (!item) {
          break
        }
        items.push(item[1].trim())
        index += 1
      }
      blocks.push({ type: "ol", items })
      continue
    }

    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*>\s?(.*)$/)
        if (!item) {
          break
        }
        quoteLines.push(item[1])
        index += 1
      }
      blocks.push({ type: "quote", lines: quoteLines })
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case "heading": {
      const className = cn("font-semibold leading-snug", block.level <= 2 ? "text-base" : "text-sm")
      if (block.level === 1) {
        return <h1 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h1>
      }
      if (block.level === 2) {
        return <h2 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h2>
      }
      return <h3 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h3>
    }
    case "quote":
      return (
        <blockquote key={index} className="border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">
          {block.lines.map((line, lineIndex) => (
            <div key={lineIndex}>{renderInlineMarkdown(line, `q-${index}-${lineIndex}`)}</div>
          ))}
        </blockquote>
      )
    case "ul":
      return (
        <ul key={index} className="list-disc space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol key={index} className="list-decimal space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>
      )
    case "code":
      return (
        <div key={index} className="overflow-hidden rounded-md border bg-muted/50">
          {block.language && <div className="border-b px-3 py-1 text-[11px] uppercase text-muted-foreground">{block.language}</div>}
          <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
            <code>{block.text}</code>
          </pre>
        </div>
      )
    case "table":
      return (
        <div key={index} className="max-w-full overflow-x-auto rounded-md border">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th key={cellIndex} className={cn("border-b px-3 py-2 font-medium", markdownTableAlignmentClass(block.alignments[cellIndex]))}>
                    {renderInlineMarkdown(header, `th-${index}-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-b-0 hover:bg-muted/30">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("px-3 py-2 align-top", markdownTableAlignmentClass(block.alignments[cellIndex]))}>
                      {renderInlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "hr":
      return <hr key={index} className="border-border" />
    default:
      return (
        <p key={index}>
          {block.text.split("\n").map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line, `p-${index}-${lineIndex}`)}
            </span>
          ))}
        </p>
      )
  }
}

function parseMarkdownTableRow(line: string) {
  if (!line.includes("|")) {
    return null
  }
  let source = line.trim()
  if (source.startsWith("|")) {
    source = source.slice(1)
  }
  if (source.endsWith("|") && !source.endsWith("\\|")) {
    source = source.slice(0, -1)
  }
  const cells: string[] = []
  let cell = ""
  let escaped = false
  for (const character of source) {
    if (escaped) {
      cell += character
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (character === "|") {
      cells.push(cell.trim())
      cell = ""
      continue
    }
    cell += character
  }
  if (escaped) {
    cell += "\\"
  }
  cells.push(cell.trim())
  return cells.length > 1 ? cells : null
}

function markdownTableSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function markdownTableAlignment(cell: string): "left" | "center" | "right" {
  const value = cell.trim()
  if (value.startsWith(":") && value.endsWith(":")) {
    return "center"
  }
  return value.endsWith(":") ? "right" : "left"
}

function markdownTableAlignmentClass(alignment?: "left" | "center" | "right") {
  return alignment === "center" ? "text-center" : alignment === "right" ? "text-right" : "text-left"
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const codePattern = /`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = codePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderLinksAndEmphasis(text.slice(lastIndex, match.index), `${keyPrefix}-${nodes.length}`))
    }
    nodes.push(
      <code key={`${keyPrefix}-code-${match.index}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
        {match[1]}
      </code>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(...renderLinksAndEmphasis(text.slice(lastIndex), `${keyPrefix}-${nodes.length}`))
  }
  return nodes
}

function renderLinksAndEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const linkPattern = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderEmphasis(text.slice(lastIndex, match.index), `${keyPrefix}-${nodes.length}`))
    }
    const href = safeMarkdownHref(match[2])
    nodes.push(
      href ? (
        <a key={`${keyPrefix}-link-${match.index}`} href={href} target={isExternalHref(href) ? "_blank" : undefined} rel={isExternalHref(href) ? "noreferrer" : undefined} className="font-medium text-primary underline underline-offset-2">
          {renderEmphasis(match[1], `${keyPrefix}-link-label-${match.index}`)}
        </a>
      ) : (
        <span key={`${keyPrefix}-link-${match.index}`}>{renderEmphasis(match[1], `${keyPrefix}-link-label-${match.index}`)}</span>
      )
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(...renderEmphasis(text.slice(lastIndex), `${keyPrefix}-${nodes.length}`))
  }
  return nodes
}

function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const emphasisPattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = emphasisPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const value = match[0]
    const inner = value.replace(/^(\*\*|__|\*|_|~~)|(\*\*|__|\*|_|~~)$/g, "")
    if (value.startsWith("**") || value.startsWith("__")) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{inner}</strong>)
    } else if (value.startsWith("~~")) {
      nodes.push(<del key={`${keyPrefix}-del-${match.index}`}>{inner}</del>)
    } else {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{inner}</em>)
    }
    lastIndex = match.index + value.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function safeMarkdownHref(value: string) {
  const href = value.trim()
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return href
  }
  return ""
}

function isExternalHref(href: string) {
  return /^(https?:|mailto:)/i.test(href)
}

function readRecentAgentIDs() {
  try {
    const value = JSON.parse(localStorage.getItem(recentAgentStoreKey) || "[]")
    return Array.isArray(value)
      ? value.filter((agentID): agentID is string => typeof agentID === "string" && Boolean(agentID)).slice(0, 5)
      : []
  } catch {
    return []
  }
}

function readSessionFolders(): SessionFolder[] {
  if (typeof window === "undefined") {
    return []
  }
  try {
    const value = JSON.parse(localStorage.getItem(sessionFoldersStorageKey) || "[]")
    return Array.isArray(value) ? value.map(normalizeSessionFolder).filter((folder): folder is SessionFolder => Boolean(folder)) : []
  } catch {
    return []
  }
}

function readSessionFolderAssignments(): Record<string, string> {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const value = JSON.parse(localStorage.getItem(sessionFolderAssignmentsStorageKey) || "{}")
    if (!isRecord(value)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[0]) && Boolean(entry[1]))
    )
  } catch {
    return {}
  }
}

async function responseErrorMessage(response: Response) {
  const text = await response.text().catch(() => "")
  try {
    const payload = text ? JSON.parse(text) : null
    if (typeof payload?.error === "string" && payload.error) {
      return payload.error
    }
    if (typeof payload?.message === "string" && payload.message) {
      return payload.message
    }
  } catch {
    // Fall through to plain text / status.
  }
  return text || `HTTP ${response.status}`
}

async function saveAdvancedSessionSnapshot(session: ChatSession): Promise<ChatSession | null> {
  const safeSession = normalizeRuntimeSession(session)
  if (isRunActive(safeSession.latest_run)) {
    return null
  }
  const isStudio = safeSession.run_mode === "agent_group"
  const isChat = safeSession.run_mode === "chat"
  const res = await api.put(`/user/advanced-chat/sessions/${encodeURIComponent(safeSession.id)}`, {
    id: safeSession.id,
    title: safeSession.title,
    run_mode: safeSession.run_mode,
    agent_id: isStudio ? "" : safeSession.agent_id || defaultAgentID,
    agent_group_id: isStudio ? safeSession.agent_group_id || "" : "",
    skill_ids: safeSession.skill_ids,
    mcp_server_ids: safeSession.mcp_server_ids,
		knowledge_base_ids: safeSession.knowledge_base_ids,
    connector_device_id: isChat || safeSession.cloud_sandbox_id ? "" : safeSession.connector_device_id || "",
    connector_workspace_path: isChat || safeSession.cloud_sandbox_id ? "" : safeSession.connector_workspace_path || "",
    cloud_sandbox_id: isChat ? "" : safeSession.cloud_sandbox_id || "",
    connector_auto_approve: isChat ? false : safeSession.connector_auto_approve,
    connector_approval_mode: isChat ? "manual" : connectorApprovalModeFor(safeSession),
    connector_command_prefixes: isChat ? [] : safeSession.connector_command_prefixes,
    model_name: isStudio ? "" : safeSession.model_name || "",
    user_channel_id: safeSession.user_channel_id || 0,
    max_tokens: safeSession.max_tokens || 0,
    temperature: safeSession.temperature ?? null,
    reasoning_effort: safeSession.reasoning_effort || "",
    auto_compress_context: safeSession.auto_compress_context,
    disabled_tool_groups: safeSession.disabled_tool_groups || [],
    messages: safeSession.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      content_parts: message.content_parts || [],
      tool_calls: message.tool_calls || [],
    })),
  })
  return normalizeSession(res.data)
}

function advancedMessagePayload(messages: ChatMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    content_parts: message.content_parts || [],
    tool_calls: message.tool_calls || [],
  }))
}

function parseSSEEvent(raw: string): ParsedSSEEvent | null {
  let type = "message"
  const dataLines: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      type = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  try {
    return { type, payload: JSON.parse(dataLines.join("\n")) }
  } catch {
    return null
  }
}

function streamStatusText(payload: any, copy: ChatCopy) {
  const message = typeof payload?.message === "string" ? payload.message : ""
  const retryMatch = message.match(/^retrying:(\d+)\/(\d+)$/)
  if (message === "retrying" || retryMatch) {
    return copy.streamThinking
  }
  if (["stream_started", "loading_tools", "assistant_started", "model_round"].includes(message)) {
    return copy.streamThinking
  }
  return message ? copy.streamThinking : ""
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  const builtin = Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(item.custom_mcp_servers) ? item.custom_mcp_servers.map(normalizeMCPServer) : []
  return {
    attachment_max_mb: Number(item.attachment_max_mb || defaultAdvancedChatSettings.attachment_max_mb),
    attachment_allowed_types: Array.isArray(item.attachment_allowed_types)
      ? item.attachment_allowed_types.filter((value): value is string => typeof value === "string")
      : defaultAdvancedChatSettings.attachment_allowed_types,
    file_storage_enabled: item.file_storage_enabled !== false,
    file_storage_total_mb: Number(item.file_storage_total_mb || defaultAdvancedChatSettings.file_storage_total_mb),
    file_storage_used_bytes: Number(item.file_storage_used_bytes || 0),
    file_storage_auto_save_images_enabled: item.file_storage_auto_save_images_enabled !== false,
    file_storage_auto_save_videos_enabled: item.file_storage_auto_save_videos_enabled !== false,
    mcp_servers: Array.isArray(item.mcp_servers) ? item.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom),
    builtin_mcp_servers: builtin,
    custom_mcp_servers: custom,
    assistant_mode_enabled: item.assistant_mode_enabled !== false,
    assistant_mcp_tools_enabled: item.assistant_mcp_tools_enabled !== false,
    assistant_connector_list_files_enabled: item.assistant_connector_list_files_enabled !== false,
    assistant_connector_read_file_enabled: item.assistant_connector_read_file_enabled !== false,
    assistant_connector_write_file_enabled: item.assistant_connector_write_file_enabled !== false,
    assistant_connector_replace_text_enabled: item.assistant_connector_replace_text_enabled !== false,
    assistant_connector_run_command_enabled: item.assistant_connector_run_command_enabled !== false,
    assistant_connector_web_search_enabled: item.assistant_connector_web_search_enabled !== false,
    assistant_connector_static_site_enabled: item.assistant_connector_static_site_enabled !== false,
    connector_approval_agent_id: stringFromUnknown(item.connector_approval_agent_id) || "",
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : createID(),
    name: typeof item.name === "string" ? item.name : "",
    type: typeof item.type === "string" ? item.type : "http",
    url: typeof item.url === "string" ? item.url : "",
    command: typeof item.command === "string" ? item.command : "",
    args: Array.isArray(item.args) ? item.args.filter((value): value is string => typeof value === "string") : [],
    env: isStringRecord(item.env) ? item.env : {},
    cwd: typeof item.cwd === "string" ? item.cwd : "",
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "frontend",
  }
}

function mcpServerSummary(server: MCPServer) {
  if (server.type === "connector") {
    return [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter(Boolean).join(" ")
  }
  return server.url || ""
}

function normalizeConnectorDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || "Local device",
    remark: stringFromUnknown(value.remark) || undefined,
    hostname: stringFromUnknown(value.hostname) || undefined,
    os: stringFromUnknown(value.os) || undefined,
    arch: stringFromUnknown(value.arch) || undefined,
    version: stringFromUnknown(value.version) || undefined,
    kind: stringFromUnknown(value.kind) || "cli",
    desktop_instance_id: stringFromUnknown(value.desktop_instance_id) || undefined,
    status: stringFromUnknown(value.status) || "offline",
    online: value.online === true,
    last_seen_at: stringFromUnknown(value.last_seen_at) || undefined,
  }
}

function normalizeConnectorApprovalTask(value: unknown): ConnectorApprovalTask | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  const payload = isRecord(value.payload) ? value.payload : {}
  return {
    id,
    device_id: stringFromUnknown(value.device_id) || "",
    device_name: stringFromUnknown(value.device_name) || "",
    run_id: stringFromUnknown(value.run_id) || "",
    action: stringFromUnknown(value.action) || "",
    workspace_path: stringFromUnknown(value.workspace_path) || "",
    payload,
    created_at: stringFromUnknown(value.created_at) || new Date().toISOString(),
  }
}

function normalizeWorkspaceDirectories(value: unknown): WorkspaceDirectories {
  const item = isRecord(value) ? value : {}
  const directories = Array.isArray(item.directories)
    ? item.directories.flatMap((entry) => {
      if (!isRecord(entry)) {
        return []
      }
      const path = stringFromUnknown(entry.path)
      if (!path) {
        return []
      }
      return [{ name: stringFromUnknown(entry.name) || path, path }]
    })
    : []
  return {
    path: stringFromUnknown(item.path) || "",
    directories,
  }
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

function workspacePickerIsWindows(os?: string) {
  return os?.toLowerCase() === "windows"
}

function workspacePickerCanGoUp(path: string, os?: string) {
  if (!path) {
    return false
  }
  if (workspacePickerIsWindows(os)) {
    return !/^[a-z]:[\\/]?$/i.test(path)
  }
  return path !== "/"
}

function workspacePickerParentPath(path: string, os?: string) {
  if (!workspacePickerCanGoUp(path, os)) {
    return path
  }
  if (workspacePickerIsWindows(os)) {
    const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "")
    const separatorIndex = normalized.lastIndexOf("\\")
    return separatorIndex <= 2 ? normalized.slice(0, 3) : normalized.slice(0, separatorIndex)
  }
  const separatorIndex = path.replace(/\/+$/, "").lastIndexOf("/")
  return separatorIndex <= 0 ? "/" : path.slice(0, separatorIndex)
}

function normalizeWorkspaceSkill(value: unknown): WorkspaceSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const path = stringFromUnknown(value.path)
  if (!path) {
    return null
  }
  return {
    id: stringFromUnknown(value.id) || path,
    name: stringFromUnknown(value.name) || path,
    path,
    content: stringFromUnknown(value.content) || "",
    size: Number(value.size || 0),
    truncated: value.truncated === true,
  }
}

function validateAttachment(file: File, settings: AdvancedChatSettings, copy: ChatCopy) {
  const type = attachmentFileType(file)
  if (!mimeAllowed(type, settings.attachment_allowed_types)) {
    return copy.attachmentTypeBlocked.replace("{file}", file.name).replace("{type}", type)
  }
  return ""
}

function mimeAllowed(type: string, allowedTypes: string[]) {
  return allowedTypes.some((allowed) => {
    const item = allowed.toLowerCase().trim()
    if (item === "*/*" || item === type) {
      return true
    }
    if (item.endsWith("/*")) {
      return type.startsWith(item.slice(0, -1))
    }
    return false
  })
}

function attachmentFileType(file: File) {
  return (file.type || mimeTypeFromName(file.name) || "application/octet-stream").toLowerCase()
}

function mimeTypeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  switch (ext) {
    case "txt":
      return "text/plain"
    case "md":
    case "markdown":
      return "text/markdown"
    case "json":
      return "application/json"
    case "csv":
      return "text/csv"
    case "xml":
      return "application/xml"
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "pdf":
      return "application/pdf"
    default:
      return ""
  }
}

function attachmentFromStoredFile(file: StoredFile, content?: StoredFileContent): ChatAttachment {
  return {
    id: createID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    storage_id: file.id,
    text: content?.text || "",
    binary: content?.binary ?? !file.text_available,
    truncated: content?.truncated === true,
  }
}

function mergeAttachments(current: ChatAttachment[], next: ChatAttachment[]) {
  const existingIDs = new Set(current.map((attachment) => attachment.storage_id).filter(Boolean))
  const result = [...current]
  for (const attachment of next) {
    if (attachment.storage_id && existingIDs.has(attachment.storage_id)) {
      continue
    }
    result.push(attachment)
    if (attachment.storage_id) {
      existingIDs.add(attachment.storage_id)
    }
  }
  return result
}

function parseMessageAttachments(content: string): { text: string; attachments: ParsedMessageAttachment[] } {
  const normalized = content.replace(/\r\n/g, "\n")
  const attachmentPattern = /^\[Attachment:\s*(.*?);\s*type=([^;\]]*);\s*size=([^;\]]+)(?:;\s*file_id=([^\]]+))?\]\s*$/gm
  const attachments: ParsedMessageAttachment[] = []
  const ranges: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null

  while ((match = attachmentPattern.exec(normalized)) !== null) {
    const headerStart = match.index
    const nextHeader = normalized.slice(attachmentPattern.lastIndex).search(/^\[Attachment:\s*/m)
    const blockEnd = nextHeader >= 0 ? attachmentPattern.lastIndex + nextHeader : normalized.length
    const body = normalized.slice(attachmentPattern.lastIndex, blockEnd).trim()
    attachments.push({
      name: match[1]?.trim() || "Attachment",
      type: match[2]?.trim() || "application/octet-stream",
      sizeLabel: match[3]?.trim() || "0 B",
      storageID: match[4]?.trim() || undefined,
      body,
      truncated: body.endsWith("...(truncated)"),
      binary: body === "(binary content omitted)" || body === "(image attached for model vision input)",
    })
    ranges.push({ start: headerStart, end: blockEnd })
    attachmentPattern.lastIndex = blockEnd
  }

  if (ranges.length === 0) {
    return { text: content, attachments: [] }
  }

  let text = ""
  let cursor = 0
  for (const range of ranges) {
    text += normalized.slice(cursor, range.start)
    cursor = range.end
  }
  text += normalized.slice(cursor)
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), attachments }
}

function chatAttachmentFromParsed(attachment: ParsedMessageAttachment): ChatAttachment {
  return {
    id: createID(),
    storage_id: attachment.storageID,
    name: attachment.name,
    type: attachment.type,
    size: bytesFromSizeLabel(attachment.sizeLabel),
    text: attachment.binary ? "" : attachment.body.replace(/\n\.\.\.\(truncated\)$/, ""),
    binary: attachment.binary,
    truncated: attachment.truncated,
  }
}

function bytesFromSizeLabel(value: string) {
  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB|GB)$/i)
  if (!match) {
    return 0
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) {
    return 0
  }
  switch (match[2].toUpperCase()) {
    case "KB":
      return Math.round(amount * 1024)
    case "MB":
      return Math.round(amount * 1024 * 1024)
    case "GB":
      return Math.round(amount * 1024 * 1024 * 1024)
    default:
      return Math.round(amount)
  }
}

function normalizeStoredFilesResponse(value: unknown): StoredFileListResponse {
  if (Array.isArray(value)) {
    return {
      files: value.map(normalizeStoredFile).filter((file): file is StoredFile => Boolean(file)),
      used_bytes: 0,
      total_bytes: 0,
      remaining_bytes: 0,
    }
  }
  const item = isRecord(value) ? value : {}
  return {
    files: Array.isArray(item.files) ? item.files.map(normalizeStoredFile).filter((file): file is StoredFile => Boolean(file)) : [],
    used_bytes: Number(item.used_bytes || 0),
    total_bytes: Number(item.total_bytes || 0),
    remaining_bytes: Number(item.remaining_bytes || 0),
  }
}

function normalizeStoredFile(value: unknown): StoredFile | null {
  const item = isRecord(value) ? value : {}
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof item.name === "string" ? item.name : id,
    type: typeof item.type === "string" ? item.type : "",
    size: Number(item.size || 0),
    source: typeof item.source === "string" ? item.source : "",
    text_available: item.text_available === true,
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  }
}

function normalizeStoredFileContent(value: unknown): StoredFileContent {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" ? item.id : "",
    text: typeof item.text === "string" ? item.text : "",
    binary: item.binary === true,
    truncated: item.truncated === true,
  }
}

function normalizeSharedPool(value: unknown): EnterpriseSharedPool | null {
  const item = isRecord(value) ? value : {}
  const id = Number(item.id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }
  return {
    id,
    scope_type: stringFromUnknown(item.scope_type) || "",
    name: stringFromUnknown(item.name) || `Pool ${id}`,
    department_id: Number(item.department_id || 0) || undefined,
    task_id: Number(item.task_id || 0) || undefined,
  }
}

function sharedPoolLabel(pool: EnterpriseSharedPool, language: string) {
  const scope = pool.scope_type === "task" ? (language === "zh" ? "任务" : "Task") : (language === "zh" ? "部门" : "Department")
  return `${scope}: ${pool.name}`
}

function messageContentWithAttachments(content: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return content
  }
  const sections = attachments.map((attachment) => {
    const fileID = attachment.storage_id ? `; file_id=${attachment.storage_id}` : ""
    const header = `[Attachment: ${attachment.name}; type=${attachment.type}; size=${formatBytes(attachment.size)}${fileID}]`
    if (!attachment.text) {
      if (attachment.type.toLowerCase().startsWith("image/") && attachment.storage_id) {
        return `${header}\n(image attached for model vision input)`
      }
      return `${header}\n(binary content omitted)`
    }
    const suffix = attachment.truncated ? "\n...(truncated)" : ""
    return `${header}\n${attachment.text.slice(0, 20000)}${suffix}`
  })
  return [content, sections.join("\n\n")].filter(Boolean).join("\n\n")
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!isRecord(value)) {
    return null
  }
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message))
    : []
  const runMode = normalizeChatRunMode(value.run_mode)
  const agentID = stringFromUnknown(value.agent_id)
  return {
    id: typeof value.id === "string" && value.id ? value.id : createID(),
    folder_id: stringFromUnknown(value.folder_id) || undefined,
    title: typeof value.title === "string" ? value.title : "",
    messages,
    run_mode: runMode,
    latest_run: normalizeRun(value.latest_run),
    agent_id: runMode === "agent_group" ? undefined : agentID || defaultAgentID,
    agent_group_id: stringFromUnknown(value.agent_group_id),
    skill_ids: stringArrayFromUnknown(value.skill_ids),
    mcp_server_ids: stringArrayFromUnknown(value.mcp_server_ids),
		knowledge_base_ids: stringArrayFromUnknown(value.knowledge_base_ids),
    connector_device_id: stringFromUnknown(value.connector_device_id) || undefined,
    connector_workspace_path: stringFromUnknown(value.connector_workspace_path) || undefined,
    cloud_sandbox_id: stringFromUnknown(value.cloud_sandbox_id) || undefined,
    connector_auto_approve: value.connector_auto_approve === true,
    connector_approval_mode: normalizeConnectorApprovalMode(value.connector_approval_mode, value.connector_auto_approve === true),
    connector_command_prefixes: stringArrayFromUnknown(value.connector_command_prefixes),
    model_name: stringFromUnknown(value.model_name),
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    max_tokens: Number(value.max_tokens || 0) || 0,
    temperature: value.temperature === null || value.temperature === undefined ? null : Number(value.temperature),
    reasoning_effort: stringFromUnknown(value.reasoning_effort) || "",
    auto_compress_context: value.auto_compress_context !== false,
    disabled_tool_groups: normalizeDisabledToolGroups(value.disabled_tool_groups),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeSessionFolder(value: unknown): SessionFolder | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  const name = (stringFromUnknown(value.name) || "").trim()
  if (!id || !name) {
    return null
  }
  return { id, name }
}

function normalizeRuntimeSession(session: ChatSession): ChatSession {
  return {
    ...session,
    messages: Array.isArray(session.messages) ? session.messages : [],
    skill_ids: Array.isArray(session.skill_ids) ? session.skill_ids.filter((id): id is string => typeof id === "string") : [],
    mcp_server_ids: Array.isArray(session.mcp_server_ids) ? session.mcp_server_ids.filter((id): id is string => typeof id === "string") : [],
		knowledge_base_ids: Array.isArray(session.knowledge_base_ids) ? session.knowledge_base_ids.filter((id): id is string => typeof id === "string") : [],
    connector_command_prefixes: Array.isArray(session.connector_command_prefixes)
      ? session.connector_command_prefixes.filter((prefix): prefix is string => typeof prefix === "string")
      : [],
    run_mode: normalizeChatRunMode(session.run_mode),
    latest_run: normalizeRun(session.latest_run),
  }
}

function normalizeChatRunMode(value: unknown): ChatRunMode {
  return value === "assistant" || value === "agent_group" ? value : "chat"
}

function normalizeRun(value: unknown): ChatRun | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = stringFromUnknown(value.id) || ""
  const sessionID = stringFromUnknown(value.session_id) || ""
  if (!id && !sessionID) {
    return undefined
  }
  return {
    id,
    session_id: sessionID,
    assistant_message_id: stringFromUnknown(value.assistant_message_id) || "",
    mode: normalizeChatRunMode(value.mode),
    status: typeof value.status === "string" && value.status ? value.status : "queued",
    status_message: typeof value.status_message === "string" ? value.status_message : undefined,
    current_round: typeof value.current_round === "number" ? value.current_round : undefined,
    error_message: typeof value.error_message === "string" ? value.error_message : undefined,
    tool_calls: typeof value.tool_calls === "number" ? value.tool_calls : undefined,
    tool_call_details: normalizeToolCalls(value.tool_call_details),
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    started_at: typeof value.started_at === "string" ? value.started_at : undefined,
    finished_at: typeof value.finished_at === "string" ? value.finished_at : undefined,
  }
}

function normalizeAgentWorkResponse(value: unknown): AgentWorkResponse | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const runID = stringFromUnknown(value.run_id) || ""
  if (!runID) {
    return undefined
  }
  const rawAgents = Array.isArray(value.agents) ? value.agents : []
  const rawConnectorTasks = Array.isArray(value.connector_tasks) ? value.connector_tasks : []
  return {
    run_id: runID,
    session_id: stringFromUnknown(value.session_id) || "",
    group_id: stringFromUnknown(value.group_id) || "",
    group_name: stringFromUnknown(value.group_name) || "",
    agents: rawAgents.map(normalizeAgentWorkStatus).filter((agent): agent is AgentWorkStatus => Boolean(agent)),
    connector_tasks: rawConnectorTasks.map(normalizeAgentWorkConnectorTask).filter((task): task is AgentWorkConnectorTask => Boolean(task)),
  }
}

function normalizeAgentWorkStatus(value: unknown): AgentWorkStatus | null {
  if (!isRecord(value)) {
    return null
  }
  const agentID = stringFromUnknown(value.agent_id) || ""
  const agentName = stringFromUnknown(value.agent_name) || agentID
  if (!agentID && !agentName) {
    return null
  }
  const rawMessages = Array.isArray(value.messages) ? value.messages : []
  return {
    agent_id: agentID,
    agent_name: agentName,
    agent_type: stringFromUnknown(value.agent_type) || "worker",
    group_id: stringFromUnknown(value.group_id) || "",
    group_name: stringFromUnknown(value.group_name) || "",
    status: stringFromUnknown(value.status) || "idle",
    working: value.working === true,
    updated_at: stringFromUnknown(value.updated_at) || undefined,
    messages: rawMessages.map(normalizeAgentWorkMessage).filter((message): message is AgentWorkMessage => Boolean(message)),
  }
}

function normalizeAgentWorkMessage(value: unknown): AgentWorkMessage | null {
  if (!isRecord(value)) {
    return null
  }
  const content = stringFromUnknown(value.content) || ""
  if (!content.trim()) {
    return null
  }
  return {
    role: stringFromUnknown(value.role) || "system",
    content,
    status: stringFromUnknown(value.status) || undefined,
    tool: stringFromUnknown(value.tool) || undefined,
    created_at: stringFromUnknown(value.created_at) || undefined,
  }
}

function normalizeAgentWorkConnectorTask(value: unknown): AgentWorkConnectorTask | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    device_id: stringFromUnknown(value.device_id) || "",
    device_name: stringFromUnknown(value.device_name) || "",
    action: stringFromUnknown(value.action) || "",
    status: stringFromUnknown(value.status) || "queued",
    workspace_path: stringFromUnknown(value.workspace_path) || "",
    workspace_unrestricted: value.workspace_unrestricted === true,
    payload: isRecord(value.payload) ? value.payload : {},
    result: stringFromUnknown(value.result) || undefined,
    error_message: stringFromUnknown(value.error_message) || undefined,
    created_at: stringFromUnknown(value.created_at) || new Date().toISOString(),
    updated_at: stringFromUnknown(value.updated_at) || undefined,
    started_at: stringFromUnknown(value.started_at) || undefined,
    finished_at: stringFromUnknown(value.finished_at) || undefined,
  }
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.role !== "user" && value.role !== "assistant") {
    return null
  }
  if (typeof value.content !== "string") {
    return null
  }
  return {
    id: typeof value.id === "string" && value.id ? value.id : createID(),
    user_id: Number(value.user_id || 0) || undefined,
    role: value.role,
    content: value.content,
    content_parts: normalizeContentParts(value.content_parts, value.content),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    processing_duration_ms: typeof value.processing_duration_ms === "number" && Number.isFinite(value.processing_duration_ms) && value.processing_duration_ms >= 0 ? value.processing_duration_ms : undefined,
    tool_calls: normalizeToolCalls(value.tool_calls),
  }
}

function normalizeContentParts(value: unknown, fallback = ""): ChatContentPart[] {
  if (!Array.isArray(value)) {
    return fallback.trim() ? [{ round: 1, content: fallback }] : []
  }
  const parts: ChatContentPart[] = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return
    }
    const content = typeof item.content === "string" ? item.content : ""
    if (!content.trim()) {
      return
    }
    const round = typeof item.round === "number" && Number.isFinite(item.round) && item.round > 0 ? item.round : index + 1
    parts.push({ round, content })
  })
  if (parts.length === 0 && fallback.trim()) {
    return [{ round: 1, content: fallback }]
  }
  return parts
}

function appendContentPart(parts: ChatContentPart[], round: number, delta: string): ChatContentPart[] {
  if (!delta.trim()) {
    return parts
  }
  const nextRound = round > 0 ? round : 1
  const next = [...parts]
  const last = next[next.length - 1]
  if (last && normalizedRound(last.round) === nextRound) {
    next[next.length - 1] = { ...last, content: last.content + delta }
    return next
  }
  next.push({ round: nextRound, content: delta })
  return next
}

function normalizeToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) {
    return []
  }
  const calls: ChatToolCall[] = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return
    }
    const name = typeof item.name === "string" ? item.name : ""
    const tool = typeof item.tool === "string" ? item.tool : ""
    const server = typeof item.server === "string" ? item.server : ""
    if (!name && !tool) {
      return
    }
    const round = typeof item.round === "number" && Number.isFinite(item.round) && item.round > 0 ? item.round : undefined
    const id = typeof item.id === "string" && item.id ? item.id : `${round || 0}-${server}-${name || tool}-${index}`
    calls.push({
      id,
      round,
      name: name || tool,
      server,
      tool,
      status: typeof item.status === "string" && item.status ? item.status : "ok",
      arguments: isRecord(item.arguments) ? item.arguments : undefined,
      result: typeof item.result === "string" ? item.result : undefined,
    })
  })
  return calls
}

function mergeToolCalls(current: ChatToolCall[], incoming: ChatToolCall[]) {
  const merged = [...current]
  for (const next of incoming) {
    const index = merged.findIndex(
      (item) => item.id === next.id
    )
    if (index >= 0) {
      const currentItem = merged[index]
      merged[index] = {
        ...currentItem,
        ...next,
        result: typeof next.result === "string" && next.result.trim() ? next.result : currentItem.result,
      }
    } else {
      merged.push(next)
    }
  }
  return merged
}

function normalizeAgent(value: unknown): ChatAgent | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof value.name === "string" ? value.name : "",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    default_model: typeof value.default_model === "string" ? value.default_model : "",
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    stream: value.stream === true,
		knowledge_base_ids: stringArrayFromUnknown(value.knowledge_base_ids),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeKnowledgeBases(value: unknown): ChatKnowledgeBase[] {
	const source = isRecord(value) && Array.isArray(value.knowledge_bases) ? value.knowledge_bases : []
	return source.flatMap((item): ChatKnowledgeBase[] => {
		if (!isRecord(item) || typeof item.id !== "string" || !item.id) return []
		return [{ id: item.id, name: typeof item.name === "string" ? item.name : item.id, description: typeof item.description === "string" ? item.description : "", vectorized: item.vectorized === true }]
	})
}

function normalizeSkill(value: unknown): ChatSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : "",
  }
}

function normalizeChatAgentGroup(value: unknown): ChatAgentGroup | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  const agents = Array.isArray(value.agents)
    ? value.agents.map(normalizeChatAgentGroupAgent).filter((agent): agent is ChatAgentGroupAgent => Boolean(agent))
    : []
  return {
    id,
    name: stringFromUnknown(value.name) || id,
    agents,
  }
}

function normalizeChatAgentGroupAgent(value: unknown): ChatAgentGroupAgent | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || id,
    type: stringFromUnknown(value.type) || "worker",
  }
}

function agentGroupChiefCount(group: ChatAgentGroup): number {
  return group.agents.filter((agent) => agent.type === "chief").length
}

function runModeLabel(mode: ChatRunMode, copy: ChatCopy, agentGroupCopy: AgentGroupCopy) {
  if (mode === "assistant") {
    return copy.assistantMode
  }
  if (mode === "agent_group") {
    return agentGroupCopy.agentGroupMode
  }
  return copy.chatMode
}

function normalizeConnectorApprovalMode(value: unknown, legacyFullAccess = false): ConnectorApprovalMode {
  if (value === "full_access" || value === "assistant") {
    return value
  }
  return legacyFullAccess ? "full_access" : "manual"
}

function connectorApprovalModeFor(session?: Pick<ChatSession, "connector_approval_mode" | "connector_auto_approve">): ConnectorApprovalMode {
  return normalizeConnectorApprovalMode(session?.connector_approval_mode, session?.connector_auto_approve === true)
}

function createSession(input: { agentID?: string; modelName?: string } = {}): ChatSession {
  const now = new Date().toISOString()
  return {
    id: createID(),
    title: "",
    messages: [],
    run_mode: "chat",
    agent_id: input.agentID || undefined,
    agent_group_id: undefined,
    skill_ids: [],
    mcp_server_ids: [],
		knowledge_base_ids: [],
    connector_device_id: undefined,
    connector_workspace_path: undefined,
    connector_auto_approve: false,
    connector_approval_mode: "manual",
    connector_command_prefixes: [],
    model_name: input.modelName || undefined,
    max_tokens: 0,
    temperature: null,
    reasoning_effort: "",
    auto_compress_context: true,
    disabled_tool_groups: [],
    created_at: now,
    updated_at: now,
  }
}

function createMessage(role: ChatMessage["role"], content: string, toolCalls: ChatToolCall[] = []): ChatMessage {
  return {
    id: createID(),
    role,
    content,
    content_parts: content.trim() ? [{ round: 1, content }] : [],
    created_at: new Date().toISOString(),
    tool_calls: toolCalls,
  }
}

function createID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function titleFromMessage(content: string, copy: ChatCopy) {
  const title = content.replace(/\s+/g, " ").trim()
  return title ? title.slice(0, 28) : copy.untitledSession
}

function isRunActive(run?: ChatRun) {
  return isRunActiveStatus(run?.status)
}

function isRunActiveStatus(status?: string) {
  return status === "queued" || status === "running"
}

function runStatusText(run: ChatRun, copy: ChatCopy) {
  if (run.status === "queued") {
    return copy.streamThinking
  }
  const text = streamStatusText({ message: run.status_message || "assistant_started", round: run.current_round }, copy)
  return text || copy.streamThinking
}

function agentWorkStatusText(status: string, copy: AgentGroupCopy) {
  switch (status) {
    case "queued":
      return copy.statusQueued
    case "running":
      return copy.statusRunning
    case "completed":
      return copy.statusCompleted
    case "failed":
    case "error":
      return copy.statusFailed
    case "cancelled":
      return copy.statusCancelled
    case "approval_required":
    case "pending_approval":
      return copy.statusApproval
    case "idle":
    case "":
      return copy.idle
    default:
      return status
  }
}

function agentWorkRoleLabel(role: string, copy: AgentGroupCopy) {
  switch (role) {
    case "user":
      return copy.roleUser
    case "assistant":
      return copy.roleAssistant
    case "tool":
      return copy.roleTool
    case "system":
      return copy.roleSystem
    default:
      return role || copy.roleSystem
  }
}

function formatAgentWorkTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function messageDisplayContent(message: ChatMessage, run: ChatRun | undefined, copy: ChatCopy) {
  if (message.content.trim()) {
    return message.content
  }
  if (run && isRunActive(run) && run.assistant_message_id === message.id) {
    return runStatusText(run, copy)
  }
  if (run?.status === "failed" && run.assistant_message_id === message.id) {
    return run.error_message || copy.sendFailed
  }
  if (message.role === "assistant" && (message.tool_calls || []).length > 0) {
    return ""
  }
  if (message.role === "assistant") {
    return copy.streamThinking
  }
  return message.content
}

function messageContentParts(message: ChatMessage, run: ChatRun | undefined, copy: ChatCopy) {
  const parts = normalizeContentParts(message.content_parts, "")
  if (parts.length > 0) {
    return parts
  }
  const content = messageDisplayContent(message, run, copy)
  return content.trim() ? [{ round: 1, content }] : []
}

function groupToolCallsByRound(toolCalls: ChatToolCall[]) {
  const groups = new Map<number, ChatToolCall[]>()
  for (const toolCall of toolCalls) {
    const round = normalizedRound(toolCall.round)
    groups.set(round, [...(groups.get(round) || []), toolCall])
  }
  return groups
}

function orderedMessageRounds(parts: ChatContentPart[], toolCallsByRound: Map<number, ChatToolCall[]>) {
  const rounds = new Set<number>()
  parts.forEach((part) => rounds.add(normalizedRound(part.round)))
  toolCallsByRound.forEach((_items, round) => rounds.add(round))
  return Array.from(rounds).sort((a, b) => a - b)
}

type MessageRoundBlock =
  | { kind: "text"; id: string; parts: ChatContentPart[] }
  | { kind: "tools"; id: string; toolCalls: ChatToolCall[] }

function messageRoundBlocks(parts: ChatContentPart[], toolCallsByRound: Map<number, ChatToolCall[]>): MessageRoundBlock[] {
  const blocks: MessageRoundBlock[] = []
  for (const round of orderedMessageRounds(parts, toolCallsByRound)) {
    const roundParts = parts.filter((part) => normalizedRound(part.round) === round)
    const roundToolCalls = toolCallsByRound.get(round) || []
    if (roundParts.length > 0) {
      blocks.push({ kind: "text", id: `text-${round}`, parts: roundParts })
    }
    if (roundToolCalls.length === 0) {
      continue
    }
    const previous = blocks.at(-1)
    if (previous?.kind === "tools" && roundParts.length === 0) {
      previous.toolCalls.push(...roundToolCalls)
      continue
    }
    blocks.push({ kind: "tools", id: `tools-${round}`, toolCalls: [...roundToolCalls] })
  }
  return blocks
}

function normalizedRound(round?: number) {
  return typeof round === "number" && Number.isFinite(round) && round > 0 ? round : 1
}

function processingDurationForUserMessage(messages: ChatMessage[], messageIndex: number, run?: ChatRun) {
  const message = messages[messageIndex]
  if (!message || message.role !== "user") {
    return undefined
  }
  const backendRunDuration = backendRunDurationForUserMessage(messages, messageIndex, run)
  if (backendRunDuration !== undefined) {
    return backendRunDuration
  }
  if (typeof message.processing_duration_ms === "number" && Number.isFinite(message.processing_duration_ms)) {
    return Math.max(0, message.processing_duration_ms)
  }
  const startedAt = Date.parse(message.created_at)
  if (!Number.isFinite(startedAt)) {
    return undefined
  }
  let finishedAt = 0
  for (let index = messageIndex + 1; index < messages.length; index += 1) {
    const candidate = messages[index]
    if (candidate.role === "user") {
      break
    }
    if (candidate.role === "assistant") {
      const timestamp = Date.parse(candidate.updated_at || candidate.created_at)
      if (Number.isFinite(timestamp)) {
        finishedAt = Math.max(finishedAt, timestamp)
      }
    }
  }
  return finishedAt > 0 ? Math.max(0, finishedAt - startedAt) : undefined
}

// 运行结束后以后端上报的 started_at/finished_at 为准，覆盖前端本地计时。
function backendRunDurationForUserMessage(messages: ChatMessage[], messageIndex: number, run?: ChatRun) {
  if (!run || isRunActiveStatus(run.status) || !run.assistant_message_id || !run.started_at || !run.finished_at) {
    return undefined
  }
  const assistantIndex = messages.findIndex((message) => message.id === run.assistant_message_id)
  if (assistantIndex <= messageIndex) {
    return undefined
  }
  for (let index = messageIndex + 1; index < assistantIndex; index += 1) {
    if (messages[index].role === "user") {
      return undefined
    }
  }
  const startedAt = Date.parse(run.started_at)
  const finishedAt = Date.parse(run.finished_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) {
    return undefined
  }
  return Math.max(0, finishedAt - startedAt)
}

function lastUserMessageIndex(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return index
    }
  }
  return -1
}

function liveProcessingDurationMs(message: ChatMessage, nowMs: number) {
  const startedAt = Date.parse(message.created_at)
  if (!Number.isFinite(startedAt)) {
    return 0
  }
  return Math.max(0, nowMs - startedAt)
}

function formatProcessingDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  return `已处理${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
}

function sessionContextMenuPlacement(x: number, y: number, width: number) {
  const edge = 8
  const opensLeft = x > window.innerWidth - x
  const opensUp = y > window.innerHeight - y
  const lineY = Math.max(edge, Math.min(y, window.innerHeight - edge))
  return {
    left: Math.max(edge, Math.min(opensLeft ? x - width : x, window.innerWidth - width - edge)),
    lineY,
    opensUp,
    animationClass: opensUp ? "animate-session-context-up" : "animate-session-context-down",
  }
}

function sessionContextSubmenuPlacement(anchorLeft: number, anchorWidth: number, y: number, width: number) {
  const edge = 8
  const opensLeft = window.innerWidth - (anchorLeft + anchorWidth) < anchorLeft
  const lineY = Math.max(edge, Math.min(y, window.innerHeight - edge))
  const opensUp = lineY > window.innerHeight - lineY
  return {
    left: Math.max(edge, Math.min(opensLeft ? anchorLeft - width : anchorLeft + anchorWidth, window.innerWidth - width - edge)),
    lineY,
    opensLeft,
    opensUp,
    animationClass: opensUp ? "animate-session-context-up" : "animate-session-context-down",
  }
}

function greetingForHour(language: string, hour = new Date().getHours()) {
  if (language === "zh") {
    if (hour >= 5 && hour < 9) return "早上好"
    if (hour < 12) return "上午好"
    if (hour < 14) return "中午好"
    if (hour < 18) return "下午好"
    if (hour < 20) return "傍晚好"
    return "晚上好"
  }
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function welcomeSuggestionsFor(language: string, seed: string) {
  const chinese = language === "zh"
  const options: Array<[string, string]> = chinese ? [
    ["查看项目", "查看当前项目的结构，并说明各个主要目录的职责。"],
    ["了解当前目录", "列出当前工作目录中的重要文件，并给出开始阅读的建议。"],
    ["排查测试失败", "运行相关测试，定位失败原因并提出修复方案。"],
    ["实现一个功能", "请先分析现有代码结构，然后帮我实现一个新功能。"],
    ["审查改动", "审查当前工作区的改动，找出潜在缺陷和遗漏的测试。"],
    ["整理任务", "根据当前项目状态，整理一份按优先级排序的待办事项。"],
    ["查找 Bug", "检查当前项目中可能导致运行错误或边界问题的代码。"],
    ["解释代码", "解释当前项目的核心执行流程和关键模块。"],
    ["补充单元测试", "为最近的功能改动设计并补充覆盖关键路径的单元测试。"],
    ["优化性能", "分析当前实现的性能瓶颈，并给出可执行的优化建议。"],
    ["修复构建", "运行构建并修复出现的编译、类型或打包错误。"],
    ["比较分支", "比较当前分支与主分支的差异，并总结需要关注的改动。"],
    ["准备提交", "检查工作区改动，建议合适的提交拆分和提交信息。"],
    ["查看时事", "查看今天值得关注的国内外时事，并简要总结。"],
    ["总结新闻", "汇总今天科技领域的重要新闻和趋势。"],
    ["研究技术", "调研一个与当前项目相关的技术方案，并比较取舍。"],
    ["撰写文档", "为当前功能撰写清晰的使用文档和示例。"],
    ["起草方案", "针对一个新需求，起草实施方案、风险和验收标准。"],
    ["评估风险", "识别当前改动可能带来的兼容性、安全性和发布风险。"],
    ["设计 API", "为一个新能力设计简洁一致的 API 接口和数据结构。"],
    ["规划重构", "分析可以重构的模块，并给出渐进式重构计划。"],
    ["生成 README", "为当前项目生成或完善 README，包括启动和开发说明。"],
    ["搜索最佳实践", "查找当前技术栈的最佳实践，并结合项目给出建议。"],
    ["更新依赖", "检查项目依赖的可更新项、兼容性风险和升级顺序。"],
    ["分析日志", "分析最近的错误日志，归纳根因和下一步排查路径。"],
    ["处理数据库问题", "检查数据库相关实现，分析潜在的并发、迁移或查询问题。"],
    ["设计数据模型", "为一个新业务场景设计数据模型、关系和索引。"],
    ["准备发布说明", "根据当前改动起草面向用户的发布说明。"],
    ["翻译文本", "帮我把一段产品或技术文本翻译得自然准确。"],
    ["起草邮件", "帮我起草一封清晰、专业的工作邮件。"],
    ["制定学习计划", "根据一个技术目标制定循序渐进的学习计划。"],
    ["头脑风暴", "围绕一个产品或技术问题，提供多个可行方向。"],
    ["设计页面", "根据业务目标设计一个清晰、高效的页面信息架构。"],
    ["检查安全性", "检查当前实现中常见的认证、输入和数据安全风险。"],
    ["整理会议纪要", "把零散的会议记录整理为结论、行动项和负责人。"],
    ["制定排期", "把一个需求拆分为可交付任务，并估算实施顺序。"],
  ] : [
    ["Explore this project", "Inspect the current project structure and explain the responsibility of each major directory."],
    ["Review this folder", "List the important files in the current working directory and suggest where to start reading."],
    ["Investigate test failures", "Run the relevant tests, identify the failure, and propose a fix."],
    ["Build a feature", "Analyze the existing code structure, then help me implement a new feature."],
    ["Review changes", "Review the current workspace changes for defects and missing tests."],
    ["Organize tasks", "Create a prioritized task list based on the current project state."],
    ["Find bugs", "Inspect the project for likely runtime errors and edge cases."],
    ["Explain the code", "Explain the core execution flow and the important modules in this project."],
    ["Add unit tests", "Design and add unit tests that cover the important paths of recent changes."],
    ["Improve performance", "Analyze the implementation for performance bottlenecks and propose actionable improvements."],
    ["Fix the build", "Run the build and fix compilation, type, or packaging errors."],
    ["Compare branches", "Compare the current branch with the main branch and summarize notable changes."],
    ["Prepare a commit", "Review workspace changes and suggest sensible commit splits and messages."],
    ["Check current events", "Summarize notable current events from today."],
    ["Summarize news", "Summarize important technology news and trends from today."],
    ["Research a technology", "Research a technical approach relevant to this project and compare tradeoffs."],
    ["Write documentation", "Write clear usage documentation and examples for the current feature."],
    ["Draft a proposal", "Draft an implementation proposal for a new requirement, including risks and acceptance criteria."],
    ["Assess risks", "Identify compatibility, security, and release risks in the current changes."],
    ["Design an API", "Design a concise, consistent API and data model for a new capability."],
    ["Plan a refactor", "Identify modules worth refactoring and propose an incremental plan."],
    ["Improve the README", "Create or improve the README with setup and development instructions."],
    ["Find best practices", "Find best practices for this stack and adapt them to the current project."],
    ["Update dependencies", "Review available dependency updates, compatibility risks, and upgrade order."],
    ["Analyze logs", "Analyze recent error logs and identify root causes and next investigation steps."],
    ["Check database code", "Review database code for concurrency, migration, and query issues."],
    ["Design a data model", "Design a data model, relations, and indexes for a new business scenario."],
    ["Prepare release notes", "Draft user-facing release notes based on the current changes."],
    ["Translate text", "Help translate product or technical text naturally and accurately."],
    ["Draft an email", "Draft a clear, professional work email."],
    ["Make a study plan", "Create a gradual study plan for a technical goal."],
    ["Brainstorm ideas", "Generate several feasible directions for a product or technical problem."],
    ["Design a page", "Design a clear, efficient information architecture for a page."],
    ["Check security", "Review the implementation for common authentication, input, and data security risks."],
    ["Organize meeting notes", "Turn rough meeting notes into decisions, action items, and owners."],
    ["Make a schedule", "Break a requirement into deliverable tasks and estimate their implementation order."],
  ]
  const shuffled = [...options]
  let value = 2166136261
  for (const character of seed) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    const target = Math.abs(value) % (index + 1)
    const current = shuffled[index]
    shuffled[index] = shuffled[target]
    shuffled[target] = current
  }
  return shuffled.slice(0, 6).map(([title, prompt]) => ({ title, prompt }))
}

function upsertSession(current: ChatSession[], next: ChatSession) {
  const safeNext = normalizeRuntimeSession(next)
  const index = current.findIndex((session) => session.id === safeNext.id)
  if (index < 0) {
    return [safeNext, ...current.map(normalizeRuntimeSession)]
  }
  const updated = current.map(normalizeRuntimeSession)
  updated[index] = safeNext
  return updated
}

function mergeServerSessions(current: ChatSession[], serverSessions: ChatSession[], activeSessionID = "") {
  const safeServerSessions = serverSessions.map(normalizeRuntimeSession)
  const serverIDs = new Set(safeServerSessions.map((session) => session.id))
  const localDrafts = current.map(normalizeRuntimeSession).filter((session) =>
    !serverIDs.has(session.id) && (session.messages.length === 0 || session.id === activeSessionID || isRunActive(session.latest_run))
  )
  return [...localDrafts, ...safeServerSessions]
}

function sessionIDFromAdvancedChatPath(pathname: string) {
  const match = pathname.match(/^\/chat\/session\/([^/]+)$/)
  if (!match) {
    return ""
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function uniqueModels(catalog: UpstreamChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function normalizeCatalogItem(value: unknown): UpstreamChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function mergeMCPServers(...groups: MCPServer[][]) {
  const servers: MCPServer[] = []
  const seen = new Set<string>()
  for (const server of groups.flat()) {
    if (!server.id || seen.has(server.id)) {
      continue
    }
    seen.add(server.id)
    servers.push(server)
  }
  return servers
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.map(stringFromUnknown).filter((item): item is string => Boolean(item))) : []
}

function commandPrefixesFromText(value: string) {
  return uniqueStrings(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))
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

function formatToolArguments(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) {
    return "{}"
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function generatedFilesFromMessages(messages: ChatMessage[]): GeneratedFileEntry[] {
  const files = new Map<string, GeneratedFileEntry>()
  for (const message of messages) {
    for (const call of message.tool_calls || []) {
      if (call.name !== GENERATED_FILE_TOOL_NAME || call.status !== "ok") continue
      const path = stringArgument(call.arguments, "path").trim()
      if (!path) continue
      const segments = path.replace(/\\/g, "/").split("/").filter(Boolean)
      files.set(path, {
        path,
        name: stringArgument(call.arguments, "name").trim() || segments.at(-1) || path,
        description: stringArgument(call.arguments, "description").trim(),
      })
    }
  }
  return Array.from(files.values()).reverse()
}

interface ReplacementEntry {
  path: string
  oldText: string
  newText: string
}

interface DiffLine {
  type: "context" | "remove" | "add"
  text: string
}

function replacementEntriesFromArguments(value?: Record<string, unknown>): ReplacementEntry[] {
  if (!value) {
    return []
  }
  const defaultPath = stringArgument(value, "path")
  const rawReplacements = Array.isArray(value.replacements) ? value.replacements : []
  const entries = rawReplacements
    .filter(isRecord)
    .map((item) => ({
      path: stringArgument(item, "path") || defaultPath,
      oldText: stringArgument(item, "old_text"),
      newText: stringArgument(item, "new_text"),
    }))
    .filter((item) => item.oldText || item.newText)
  if (entries.length > 0) {
    return entries
  }
  const oldText = stringArgument(value, "old_text")
  const newText = stringArgument(value, "new_text")
  return oldText || newText ? [{ path: defaultPath, oldText, newText }] : []
}

function taskChangeSummaryFromToolCalls(toolCalls: ChatToolCall[]): TaskChangeSummary {
  const changes = new Map<string, TaskFileChange>()
  for (const toolCall of toolCalls) {
    if (toolCall.status === "error" || toolCall.status === "invalid_arguments" || toolCall.status === "cancelled") {
      continue
    }
    for (const entry of taskChangeEntriesFromToolCall(toolCall)) {
      const path = entry.path.trim()
      if (!path) {
        continue
      }
      const diff = lineDiff(entry.oldText, entry.newText)
      const additions = diff.filter((line) => line.type === "add").length
      const deletions = diff.filter((line) => line.type === "remove").length
      const existing = changes.get(path) || { path, additions: 0, deletions: 0, entries: [] }
      existing.additions += additions
      existing.deletions += deletions
      existing.entries.push({ ...entry, path })
      changes.set(path, existing)
    }
  }
  const files = Array.from(changes.values())
  return {
    files,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  }
}

function taskChangeEntriesFromToolCall(toolCall: ChatToolCall): ReplacementEntry[] {
  const argumentsValue = toolCall.arguments
  const kind = builtinToolKind(toolCall)
  if (kind === "write") {
    const path = stringArgument(argumentsValue, "path")
    return path ? [{
      path,
      oldText: stringArgument(argumentsValue, "preview_old_content"),
      newText: stringArgument(argumentsValue, "content"),
    }] : []
  }
  if (kind === "replace") {
    return replacementEntriesFromArguments(argumentsValue)
  }
  const action = `${toolCall.name} ${toolCall.tool || ""}`.toLowerCase()
  if (!action.includes("commit_delta")) {
    return []
  }
  const mutations = Array.isArray(argumentsValue?.mutations) ? argumentsValue.mutations : []
  return mutations.flatMap((mutation) => taskChangeEntryFromMutation(mutation))
}

function taskChangeEntryFromMutation(value: unknown): ReplacementEntry[] {
  if (!isRecord(value)) {
    return []
  }
  const action = stringFromUnknown(value.action)?.toLowerCase() || ""
  const path = stringFromUnknown(value.path) || ""
  if (!path) {
    return []
  }
  if (action === "write_file") {
    return [{
      path,
      oldText: stringFromUnknown(value.preview_old_content) || "",
      newText: stringFromUnknown(value.content) || "",
    }]
  }
  if (action === "replace_text") {
    return [{
      path,
      oldText: stringFromUnknown(value.old_text) || "",
      newText: stringFromUnknown(value.new_text) || "",
    }]
  }
  return []
}

function diffHunks(oldText: string, newText: string, contextLines: number): DiffLine[][] {
  const lines = lineDiff(oldText, newText)
  const changed = lines
    .map((line, index) => (line.type === "context" ? -1 : index))
    .filter((index) => index >= 0)
  if (changed.length === 0) {
    return [lines.slice(0, Math.max(1, contextLines * 2 + 1))]
  }

  const ranges: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - contextLines)
    const end = Math.min(lines.length, index + contextLines + 1)
    const last = ranges[ranges.length - 1]
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      ranges.push([start, end])
    }
  }
  return ranges.map(([start, end]) => lines.slice(start, end))
}

function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitDiffLines(oldText)
  const newLines = splitDiffLines(newText)
  if (oldLines.length * newLines.length > 40000) {
    return [
      ...oldLines.map((text) => ({ type: "remove" as const, text })),
      ...newLines.map((text) => ({ type: "add" as const, text })),
    ]
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0) as number[])
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      dp[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? dp[oldIndex + 1][newIndex + 1] + 1
        : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1])
    }
  }

  const result: DiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push({ type: "context", text: oldLines[oldIndex] })
      oldIndex += 1
      newIndex += 1
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      result.push({ type: "remove", text: oldLines[oldIndex] })
      oldIndex += 1
    } else {
      result.push({ type: "add", text: newLines[newIndex] })
      newIndex += 1
    }
  }
  while (oldIndex < oldLines.length) {
    result.push({ type: "remove", text: oldLines[oldIndex] })
    oldIndex += 1
  }
  while (newIndex < newLines.length) {
    result.push({ type: "add", text: newLines[newIndex] })
    newIndex += 1
  }
  return result
}

function splitDiffLines(value: string) {
  return value.replace(/\r\n/g, "\n").split("\n")
}

function toolLabel(toolCall: ChatToolCall) {
  return `${toolCall.server ? `${toolCall.server}: ` : ""}${toolCall.tool || toolCall.name}`
}

function staticSiteToolTitle(toolCall: ChatToolCall, domainName: string, siteID: string) {
  const name = toolCall.name.toLowerCase()
  const target = domainName || siteID || "."
  if (name === "list_static_sites") {
    return "列出静态站点"
  }
  if (name === "deploy_static_site") {
    return `部署静态站点: ${target}`
  }
  if (name === "set_static_site_enabled") {
    return `切换静态站点: ${target}`
  }
  if (name === "delete_static_site") {
    return `删除静态站点: ${target}`
  }
  return ""
}

function findConnectorApprovalTask(toolCall: ChatToolCall, tasks: ConnectorApprovalTask[]) {
  if (toolCall.status !== "approval_required" || tasks.length === 0) {
    return undefined
  }
  return tasks.find((task) => connectorApprovalTaskMatchesToolCall(toolCall, task))
}

function connectorApprovalTaskMatchesToolCall(toolCall: ChatToolCall, task: ConnectorApprovalTask) {
  if (task.id === stringArgument(toolCall.arguments, "connector_task_id")) {
    return true
  }
  if (stringArgument(task.payload, "preview_tool_call_id") === toolCall.id) {
    return true
  }
  const action = connectorActionForToolCall(toolCall)
  if (!action || task.action !== action) {
    return false
  }
  if (action === "run_command") {
    return stringArgument(task.payload, "command") === stringArgument(toolCall.arguments, "command")
  }
  return stringArgument(task.payload, "path") === stringArgument(toolCall.arguments, "path")
}

function connectorApprovalTaskTitle(task: ConnectorApprovalTask) {
  const action = task.action || "connector action"
  const target =
    stringArgument(task.payload, "path") ||
    stringArgument(task.payload, "command") ||
    stringArgument(task.payload, "url") ||
    stringArgument(task.payload, "query")
  return target ? `${action}: ${target}` : action
}

function connectorApprovalTaskSubtitle(task: ConnectorApprovalTask) {
  const parts = [task.device_name, task.workspace_path].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : task.id
}

function connectorActionForToolCall(toolCall: ChatToolCall) {
  if (toolCall.tool) {
    return toolCall.tool
  }
  switch (builtinToolKind(toolCall)) {
    case "list":
      return "list_files"
    case "read":
      return "read_file"
    case "write":
      return "write_file"
    case "replace":
      return "replace_text"
    case "command":
      return "run_command"
    case "search":
      return "web_search"
    case "fetch":
      return "web_fetch"
    default:
      return ""
  }
}

function builtinToolKind(toolCall: ChatToolCall): "list" | "read" | "write" | "replace" | "command" | "search" | "fetch" | "" {
  const name = toolCall.name.toLowerCase()
  if (!name.startsWith("workspace_")) {
    return ""
  }
  if (name.includes("workspace_list_files")) {
    return "list"
  }
  if (name.includes("workspace_read_file")) {
    return "read"
  }
  if (name.includes("workspace_write_file")) {
    return "write"
  }
  if (name.includes("workspace_replace_text")) {
    return "replace"
  }
  if (name.includes("workspace_run_command")) {
    return "command"
  }
  if (name.includes("workspace_web_search")) {
    return "search"
  }
  if (name.includes("workspace_web_fetch")) {
    return "fetch"
  }
  return ""
}

function builtinToolTitle(
  kind: "list" | "read" | "write" | "replace" | "command" | "search" | "fetch",
  path: string,
  command: string,
  copy: ChatCopy,
  writeModifiesExisting: boolean
) {
  const target = kind === "command" || kind === "search" || kind === "fetch" ? command || "." : path || "."
  const template = kind === "list"
    ? copy.toolActionListFiles
    : kind === "read"
      ? copy.toolActionReadFile
      : kind === "command"
        ? copy.toolActionRunCommand
        : kind === "search"
          ? copy.toolActionWebSearch
          : kind === "fetch"
            ? copy.toolActionWebFetch
          : kind === "write"
            ? writeModifiesExisting ? copy.toolActionEditFile : copy.toolActionWriteFile
            : copy.toolActionEditFile
  return template.replace("{target}", target)
}

function stringArgument(value: Record<string, unknown> | undefined, key: string) {
  const item = value?.[key]
  if (typeof item === "string") {
    return item
  }
  if (typeof item === "number" || typeof item === "boolean") {
    return String(item)
  }
  return ""
}

function booleanArgument(value: Record<string, unknown> | undefined, key: string) {
  return value?.[key] === true
}

function toolStatusClassName(status: string) {
  switch (status) {
    case "ok":
      return "bg-primary/10 text-primary"
    case "running":
    case "approval_required":
      return "bg-secondary text-secondary-foreground"
    case "missing":
    case "invalid_arguments":
    case "error":
    default:
      return "bg-destructive/10 text-destructive"
  }
}

function toolStatusLabel(status: string, copy: ChatCopy) {
  switch (status) {
    case "ok":
      return copy.toolStatusOk
    case "running":
      return copy.toolStatusRunning
    case "approval_required":
      return copy.toolStatusApprovalRequired
    case "missing":
      return copy.toolStatusMissing
    case "invalid_arguments":
      return copy.toolStatusInvalidArguments
    default:
      return copy.toolStatusError
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

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every((item) => typeof item === "string")
}

const chatCopyKeys = {
  title: "chat.title",
  sessions: "chat.sessions",
  openSessions: "chat.openSessions",
  closeSessions: "chat.closeSessions",
  newSession: "chat.newSession",
  untitledSession: "chat.untitledSession",
  messageCount: "chat.messageCount",
  deleteSession: "chat.deleteSession",
  customTitle: "chat.customTitle",
  customTitlePrompt: "chat.customTitlePrompt",
  regenerateTitle: "chat.regenerateTitle",
  regeneratingTitle: "chat.regeneratingTitle",
  regenerateTitleFailed: "chat.regenerateTitleFailed",
  config: "chat.config",
  advancedConfig: "chat.advancedConfig",
  apiKey: "chat.apiKey",
  channel: "chat.channel",
  endpoint: "chat.endpoint",
  agent: "chat.agent",
  noAgentSelected: "chat.noAgentSelected",
  selectAgent: "chat.selectAgent",
  noAgents: "chat.noAgents",
  manageAgents: "chat.manageAgents",
  newAgent: "chat.newAgent",
  editAgent: "chat.editAgent",
  deleteAgent: "chat.deleteAgent",
  agentName: "chat.agentName",
  defaultAgentName: "chat.defaultAgentName",
  agentPrompt: "chat.agentPrompt",
  agentPromptPlaceholder: "chat.agentPromptPlaceholder",
  agentDefaultModel: "chat.agentDefaultModel",
  saveAgent: "chat.saveAgent",
  agentSaved: "chat.agentSaved",
  agentCreated: "chat.agentCreated",
  agentDeleted: "chat.agentDeleted",
  agentNameRequired: "chat.agentNameRequired",
  agentSelectRequired: "chat.agentSelectRequired",
  agentDefaultModelRequired: "chat.agentDefaultModelRequired",
  agentSaveFailed: "chat.agentSaveFailed",
  agentCreateFailed: "chat.agentCreateFailed",
  agentDeleteFailed: "chat.agentDeleteFailed",
  basicSettings: "chat.basicSettings",
  advancedModelSettings: "chat.advancedModelSettings",
  maxTokens: "chat.maxTokens",
  maxTokensPlaceholder: "chat.maxTokensPlaceholder",
  temperature: "chat.temperature",
  reasoningEffort: "chat.reasoningEffort",
  reasoningDefault: "chat.reasoningDefault",
  reasoningMinimal: "chat.reasoningMinimal",
  reasoningLow: "chat.reasoningLow",
  reasoningMedium: "chat.reasoningMedium",
  reasoningHigh: "chat.reasoningHigh",
  autoCompressContext: "chat.autoCompressContext",
  autoCompressContextHint: "chat.autoCompressContextHint",
  addedAgent: "chat.addedAgent",
  noAgentAdded: "chat.noAgentAdded",
  setAgent: "chat.setAgent",
  replaceAgent: "chat.replaceAgent",
  skills: "chat.skills",
  selectSkills: "chat.selectSkills",
  noSkills: "chat.noSkills",
  addedSkills: "chat.addedSkills",
  noSkillsAdded: "chat.noSkillsAdded",
  manageSkills: "chat.manageSkills",
  mcpServers: "chat.mcpServers",
  noMCPServers: "chat.noMCPServers",
  addedMCPServers: "chat.addedMCPServers",
  noMCPServersAdded: "chat.noMCPServersAdded",
  selectMCPServer: "chat.selectMCPServer",
  manageMCP: "chat.manageMCP",
  fromSkill: "chat.fromSkill",
  devices: "chat.devices",
  connectedDevices: "chat.connectedDevices",
  sessionDevice: "chat.sessionDevice",
  manageDevices: "chat.manageDevices",
  cloudSandbox: "chat.cloudSandbox",
  manageCloudSandboxes: "chat.manageCloudSandboxes",
  selectCloudSandbox: "chat.selectCloudSandbox",
  noCloudSandboxes: "chat.noCloudSandboxes",
  useCloudSandbox: "chat.useCloudSandbox",
  cloudSandboxHint: "chat.cloudSandboxHint",
  createConnectorToken: "chat.createConnectorToken",
  creatingConnectorToken: "chat.creatingConnectorToken",
  connectorToken: "chat.connectorToken",
  connectorCommand: "chat.connectorCommand",
  connectorTokenCreated: "chat.connectorTokenCreated",
  connectorTokenCreateFailed: "chat.connectorTokenCreateFailed",
  connectorApprovalTitle: "chat.connectorApprovalTitle",
  connectorApprovalDescription: "chat.connectorApprovalDescription",
  connectorApprovalFailed: "chat.connectorApprovalFailed",
  approveConnectorTask: "chat.approveConnectorTask",
  rejectConnectorTask: "chat.rejectConnectorTask",
  connectorAutoApprove: "chat.connectorAutoApprove",
  connectorCommandPrefixes: "chat.connectorCommandPrefixes",
  connectorCommandPrefixesPlaceholder: "chat.connectorCommandPrefixesPlaceholder",
  connectorCommandPrefixesHint: "chat.connectorCommandPrefixesHint",
  localDevice: "chat.localDevice",
  noDeviceSelected: "chat.noDeviceSelected",
  selectDevice: "chat.selectDevice",
  noDevices: "chat.noDevices",
  selectWorkspace: "chat.selectWorkspace",
  workspacePath: "chat.workspacePath",
  workspacePathPlaceholder: "chat.workspacePathPlaceholder",
  unrestrictedWorkspace: "chat.unrestrictedWorkspace",
  workspaceSkills: "chat.workspaceSkills",
  refreshWorkspaceSkills: "chat.refreshWorkspaceSkills",
  refreshingWorkspaceSkills: "chat.refreshingWorkspaceSkills",
  noWorkspaceSkills: "chat.noWorkspaceSkills",
  workspaceSkillsRefreshFailed: "chat.workspaceSkillsRefreshFailed",
  truncated: "chat.truncated",
  noWorkspaces: "chat.noWorkspaces",
  setDevice: "chat.setDevice",
  deviceOnline: "chat.deviceOnline",
  deviceOffline: "chat.deviceOffline",
  add: "chat.add",
  remove: "chat.remove",
  sessionModel: "chat.sessionModel",
  done: "chat.done",
  chatCompletions: "chat.chatCompletions",
  responsesAPI: "chat.responsesAPI",
  claudeMessages: "chat.claudeMessages",
  geminiGenerate: "chat.geminiGenerate",
  selectKey: "chat.selectKey",
  selectChannel: "chat.selectChannel",
  noKeys: "chat.noKeys",
  noChannels: "chat.noChannels",
  selectModel: "chat.selectModel",
  conversation: "chat.conversation",
  noMessages: "chat.noMessages",
  chatMode: "chat.chatMode",
  assistantMode: "chat.assistantMode",
  assistantModeDisabled: "chat.assistantModeDisabled",
  assistantMCPToolsDisabled: "chat.assistantMCPToolsDisabled",
  assistantWorkspaceToolsDisabled: "chat.assistantWorkspaceToolsDisabled",
  promptPlaceholder: "chat.promptPlaceholder",
  assistantPromptPlaceholder: "chat.assistantPromptPlaceholder",
  attachmentMessageTitle: "chat.attachmentMessageTitle",
  addAttachment: "chat.addAttachment",
  removeAttachment: "chat.removeAttachment",
  attachmentLimit: "chat.attachmentLimit",
  attachmentTooLarge: "chat.attachmentTooLarge",
  attachmentTypeBlocked: "chat.attachmentTypeBlocked",
  send: "chat.send",
  sending: "chat.sending",
  runAssistant: "chat.runAssistant",
  runningAssistant: "chat.runningAssistant",
  editMessage: "chat.editMessage",
  deleteMessage: "chat.deleteMessage",
  copyMessage: "chat.copyMessage",
  messageCopied: "chat.messageCopied",
  copyFailed: "chat.copyFailed",
  saveMessage: "chat.saveMessage",
  cancelEdit: "chat.cancelEdit",
  keyRequired: "chat.keyRequired",
  channelRequired: "chat.channelRequired",
  modelRequired: "chat.modelRequired",
  sendFailed: "chat.sendFailed",
  emptyResponse: "chat.emptyResponse",
  stopped: "chat.stopped",
  stop: "chat.stop",
  stopTask: "chat.stopTask",
  stopFailed: "chat.stopFailed",
  streamStarted: "chat.streamStarted",
  streamLoadingTools: "chat.streamLoadingTools",
  assistantStarted: "chat.assistantStarted",
  streamModelRound: "chat.streamModelRound",
  streamRetrying: "chat.streamRetrying",
  streamThinking: "chat.streamThinking",
  usedTools: "chat.usedTools",
  toolRound: "chat.toolRound",
  toolArguments: "chat.toolArguments",
  toolResult: "chat.toolResult",
  toolWriteContent: "chat.toolWriteContent",
  toolReplaceOld: "chat.toolReplaceOld",
  toolReplaceNew: "chat.toolReplaceNew",
  toolActionListFiles: "chat.toolActionListFiles",
  toolActionReadFile: "chat.toolActionReadFile",
  toolActionRunCommand: "chat.toolActionRunCommand",
  toolActionWebSearch: "chat.toolActionWebSearch",
  toolActionWebFetch: "chat.toolActionWebFetch",
  toolActionWriteFile: "chat.toolActionWriteFile",
  toolActionEditFile: "chat.toolActionEditFile",
  jumpToLatest: "chat.jumpToLatest",
  taskPlan: "chat.taskPlan",
  taskPlanToggle: "chat.taskPlanToggle",
  taskStatusPending: "chat.taskStatusPending",
  taskStatusInProgress: "chat.taskStatusInProgress",
  taskStatusCompleted: "chat.taskStatusCompleted",
  taskStatusSkipped: "chat.taskStatusSkipped",
  askUserTitle: "chat.askUserTitle",
  askUserConfirm: "chat.askUserConfirm",
  askUserCustomPlaceholder: "chat.askUserCustomPlaceholder",
  toolGroupsTitle: "chat.toolGroupsTitle",
  toolGroupsHint: "chat.toolGroupsHint",
  toolGroupWorkspace: "chat.toolGroupWorkspace",
  toolGroupWorkspaceHint: "chat.toolGroupWorkspaceHint",
  toolGroupWeb: "chat.toolGroupWeb",
  toolGroupWebHint: "chat.toolGroupWebHint",
  toolGroupSites: "chat.toolGroupSites",
  toolGroupSitesHint: "chat.toolGroupSitesHint",
  toolGroupTasks: "chat.toolGroupTasks",
  toolGroupTasksHint: "chat.toolGroupTasksHint",
  toolGroupAskUser: "chat.toolGroupAskUser",
  toolGroupAskUserHint: "chat.toolGroupAskUserHint",
  toolGroupMemory: "chat.toolGroupMemory",
  toolGroupMemoryHint: "chat.toolGroupMemoryHint",
  expandToolCall: "chat.expandToolCall",
  toolStatusOk: "chat.toolStatusOk",
  toolStatusRunning: "chat.toolStatusRunning",
  toolStatusApprovalRequired: "chat.toolStatusApprovalRequired",
  toolStatusError: "chat.toolStatusError",
  toolStatusMissing: "chat.toolStatusMissing",
  toolStatusInvalidArguments: "chat.toolStatusInvalidArguments",
} as const satisfies Record<string, TranslationKey>

type ChatCopy = Record<keyof typeof chatCopyKeys, string>
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

function buildChatCopy(t: Translate): ChatCopy {
  return Object.fromEntries(
    Object.entries(chatCopyKeys).map(([name, key]) => [name, t(key)])
  ) as ChatCopy
}

const zhFileAttachmentCopy = {
  selectFile: "选择文件",
  useFile: "使用",
  selected: "已选择",
  loading: "加载中",
  noFiles: "文件库暂无文件",
  manageFiles: "管理文件库",
  text: "文本",
  close: "关闭",
  uploading: "上传中",
  uploadFailed: "上传附件失败",
  selectFailed: "选择文件失败",
  storageDisabled: "管理员已关闭文件存储功能",
}

const enFileAttachmentCopy: typeof zhFileAttachmentCopy = {
  selectFile: "Select file",
  useFile: "Use",
  selected: "Selected",
  loading: "Loading",
  noFiles: "No files in storage",
  manageFiles: "Manage files",
  text: "Text",
  close: "Close",
  uploading: "Uploading",
  uploadFailed: "Failed to upload attachment",
  selectFailed: "Failed to select file",
  storageDisabled: "File storage is disabled by the administrator",
}

type AgentGroupCopy = typeof enAgentGroupCopy

const enAgentGroupCopy = {
  agentGroupMode: "Agent Studio",
  agentGroups: "Agent Studios",
  selectGroup: "Select studio",
  noGroups: "No agent studios",
  loadingGroups: "Loading studios",
  noAgents: "No agents in this studio",
  manageGroups: "Manage studios",
  noGroupSelected: "No studio selected",
  chiefCount: "{count} chief",
  runAgentGroup: "Send to studio",
  promptPlaceholder: "Tell the Chief what you want done; it will clarify and arrange concrete work for the studio",
  groupRequired: "Select a studio before sending",
  workStatus: "Work status",
  workStatusActive: "{count} working",
  noWorkStatus: "No main agent status yet",
  noWorkMessages: "No messages recorded for this agent",
  working: "Working",
  idle: "Idle",
  updatedAt: "Updated",
  roleUser: "User",
  roleAssistant: "Assistant",
  roleTool: "Tool",
  roleSystem: "System",
  statusQueued: "Queued",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
  statusApproval: "Approval required",
}

const zhAgentGroupCopy: AgentGroupCopy = {
  agentGroupMode: "\u5de5\u4f5c\u5ba4\u6a21\u5f0f",
  agentGroups: "\u5de5\u4f5c\u5ba4",
  selectGroup: "\u9009\u62e9\u5de5\u4f5c\u5ba4",
  noGroups: "\u6682\u65e0\u5de5\u4f5c\u5ba4",
  loadingGroups: "\u6b63\u5728\u52a0\u8f7d\u5de5\u4f5c\u5ba4",
  noAgents: "\u8be5\u5de5\u4f5c\u5ba4\u6682\u65e0\u4ee3\u7406",
  manageGroups: "\u7ba1\u7406\u5de5\u4f5c\u5ba4",
  noGroupSelected: "\u5c1a\u672a\u9009\u62e9\u5de5\u4f5c\u5ba4",
  chiefCount: "{count} \u4e2a chief",
  runAgentGroup: "\u53d1\u9001\u5230\u5de5\u4f5c\u5ba4",
  promptPlaceholder: "告诉 Chief 你希望完成什么；它会澄清需求并安排具体工作",
  groupRequired: "\u53d1\u9001\u524d\u8bf7\u5148\u9009\u62e9\u5de5\u4f5c\u5ba4",
  workStatus: "\u5de5\u4f5c\u72b6\u6001",
  workStatusActive: "{count} \u4e2a\u6b63\u5728\u5de5\u4f5c",
  noWorkStatus: "\u6682\u65e0\u4e3b\u4ee3\u7406\u5de5\u4f5c\u72b6\u6001",
  noWorkMessages: "\u8be5\u4ee3\u7406\u6682\u65e0\u6d88\u606f\u8bb0\u5f55",
  working: "\u5de5\u4f5c\u4e2d",
  idle: "\u7a7a\u95f2",
  updatedAt: "\u66f4\u65b0",
  roleUser: "\u7528\u6237",
  roleAssistant: "\u52a9\u624b",
  roleTool: "\u5de5\u5177",
  roleSystem: "\u7cfb\u7edf",
  statusQueued: "\u6392\u961f\u4e2d",
  statusRunning: "\u8fd0\u884c\u4e2d",
  statusCompleted: "\u5df2\u5b8c\u6210",
  statusFailed: "\u5931\u8d25",
  statusCancelled: "\u5df2\u53d6\u6d88",
  statusApproval: "\u7b49\u5f85\u6279\u51c6",
}

const zhConnectorApprovalModeCopy = {
  label: "连接器权限",
  manual: "手动审批",
  fullAccess: "完全访问",
  assistant: "助手审批",
  agentRequired: "请先在个人设置中选择审批助手。",
}

const enConnectorApprovalModeCopy: typeof zhConnectorApprovalModeCopy = {
  label: "Connector access",
  manual: "Manual approval",
  fullAccess: "Full access",
  assistant: "Assistant approval",
  agentRequired: "Select an approval assistant in personal settings first.",
}

const zhConnectorTerminalCopy: ConnectorTerminalCopy & { openTerminal: string; deviceRequired: string } = {
  openTerminal: "打开终端",
  deviceRequired: "请先选择一台在线设备。",
  title: "终端",
  connecting: "正在连接设备终端…",
  connectFailed: "无法打开设备终端",
  disconnected: "终端已断开",
  inputPlaceholder: "输入命令后回车执行",
  inputPlaceholderClosed: "终端不可用",
  maximize: "最大化",
  restore: "还原",
  close: "关闭",
  restart: "重启终端",
  clear: "清屏",
  truncatedNotice: "较早的输出已被截断",
  exitedWithCode: "终端已退出（退出码 {code}）",
}

const enConnectorTerminalCopy: typeof zhConnectorTerminalCopy = {
  openTerminal: "Open terminal",
  deviceRequired: "Select an online device first.",
  title: "Terminal",
  connecting: "Connecting to the device terminal…",
  connectFailed: "Failed to open the device terminal",
  disconnected: "Terminal disconnected",
  inputPlaceholder: "Type a command and press Enter",
  inputPlaceholderClosed: "Terminal unavailable",
  maximize: "Maximize",
  restore: "Restore",
  close: "Close",
  restart: "Restart terminal",
  clear: "Clear",
  truncatedNotice: "Earlier output was truncated",
  exitedWithCode: "Terminal exited with code {code}",
}

const zhGitWorkspaceCopy = {
  environment: "环境信息",
  executionEnvironment: "执行环境",
  runDirectory: "运行目录",
  selectDevice: "选择设备",
  noDevice: "未选择设备",
  noWorkspacePath: "未选择运行目录",
  changes: "变更",
  local: "本地",
  files: "{count} 个文件",
  compareBranch: "比较分支",
  noComparison: "不比较分支",
  commit: "提交",
  push: "推送",
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
  local: "Local",
  files: "{count} files",
  compareBranch: "Compare branch",
  noComparison: "No comparison",
  commit: "Commit",
  push: "Push",
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

const zhWorkspacePickerCopy = {
  title: "选择工作区文件夹",
  computer: "此电脑",
  up: "上一级",
  refresh: "刷新",
  loading: "正在读取文件夹",
  loadFailed: "读取文件夹失败",
  empty: "该文件夹中没有子文件夹",
  cancel: "取消",
  selectCurrent: "选择当前文件夹",
}

const enWorkspacePickerCopy: typeof zhWorkspacePickerCopy = {
  title: "Select workspace folder",
  computer: "This PC",
  up: "Up one level",
  refresh: "Refresh",
  loading: "Loading folders",
  loadFailed: "Failed to load folders",
  empty: "No subfolders in this folder",
  cancel: "Cancel",
  selectCurrent: "Select current folder",
}

const zhTaskChangeCopy = {
  title: "本轮修改",
  summary: "已修改 {count} 个文件",
  inProgress: "进行中",
  empty: "本轮任务没有可显示的文件修改。",
}

const enTaskChangeCopy: typeof zhTaskChangeCopy = {
  title: "Task changes",
  summary: "{count} files changed",
  inProgress: "In progress",
  empty: "This task has no file changes to show.",
}

const zhSessionSidebarCopy = {
  search: "搜索会话",
  newFolder: "新建文件夹",
  folderName: "文件夹名称",
  create: "创建",
  cancel: "取消",
  uncategorized: "未分类",
  moveToFolder: "移动到文件夹",
  noSessions: "没有匹配的会话",
  createFolderFailed: "创建会话文件夹失败",
  moveFailed: "移动会话失败",
}

const enSessionSidebarCopy: typeof zhSessionSidebarCopy = {
  search: "Search sessions",
  newFolder: "New folder",
  folderName: "Folder name",
  create: "Create",
  cancel: "Cancel",
  uncategorized: "Uncategorized",
  moveToFolder: "Move to folder",
  noSessions: "No matching sessions",
  createFolderFailed: "Failed to create session folder",
  moveFailed: "Failed to move session",
}

function VSCodeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#29B6F6" d="M17.8 2.4 11 8.9 7.3 6.1 3.6 8v8l3.7 1.9 3.7-2.8 6.8 6.5 3.9-1.9V4.3l-3.9-1.9Zm.6 5.1v8.9l-4.5-4.5 4.5-4.4Z" />
      <path fill="#0179CB" d="m7.3 6.1 3.7 2.8v6.2l-3.7 2.8L2 14.8V9.2l5.3-3.1Z" />
    </svg>
  )
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
