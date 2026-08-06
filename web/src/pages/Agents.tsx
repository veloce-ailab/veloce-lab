import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ReactNode, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, FolderOpen, MessageSquare, Plus, Save, Server, Sparkles, Trash2, X } from "lucide-react"
import { Link } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
  user_channel_id?: number
  stream: boolean
  skill_ids: string[]
  mcp_server_ids: string[]
	knowledge_base_ids: string[]
  preset_messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  created_at: string
  updated_at: string
}

interface ChatSkill {
  id: string
  name: string
  description: string
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
}

interface KnowledgeBase { id: string; name: string; description: string; vectorized: boolean }

type AgentCapabilityKind = "skills" | "knowledge" | "mcp"
type AgentFormTab = "basic" | AgentCapabilityKind
type AgentCapabilityItem = { id: string; name: string; description?: string }

const agentsQueryKey = ["advanced-chat-agents", "full"] as const
const sharedAgentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const agentMCPServersQueryKey = ["advanced-chat-agent-mcp-servers"] as const
const defaultAgentID = "default"

export default function Agents() {
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhAgentsCopy : enAgentsCopy
  const [activeAgentID, setActiveAgentID] = useState("")
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [userChannelID, setUserChannelID] = useState(0)
  const [stream, setStream] = useState(false)
  const [skillIDs, setSkillIDs] = useState<string[]>([])
  const [mcpServerIDs, setMCPServerIDs] = useState<string[]>([])
	const [knowledgeBaseIDs, setKnowledgeBaseIDs] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [agentFormTab, setAgentFormTab] = useState<AgentFormTab>("basic")
  const [createName, setCreateName] = useState("")
  const [createPrompt, setCreatePrompt] = useState("")
  const [createDefaultModel, setCreateDefaultModel] = useState("")
  const [createUserChannelID, setCreateUserChannelID] = useState(0)
  const [createStream, setCreateStream] = useState(false)
  const [createSkillIDs, setCreateSkillIDs] = useState<string[]>([])
  const [createMCPServerIDs, setCreateMCPServerIDs] = useState<string[]>([])
	const [createKnowledgeBaseIDs, setCreateKnowledgeBaseIDs] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [generationSourceAgentID, setGenerationSourceAgentID] = useState("")
  const [generationRequirements, setGenerationRequirements] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [deletingAgentID, setDeletingAgentID] = useState("")

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: agents = [] } = useQuery<ChatAgent[]>({
    queryKey: agentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data)
        ? res.data.map(normalizeAgent).filter((agent): agent is ChatAgent => Boolean(agent))
        : []
    },
  })

  const { data: skills = [] } = useQuery<ChatSkill[]>({
    queryKey: skillsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data)
        ? res.data.map(normalizeSkill).filter((skill): skill is ChatSkill => Boolean(skill))
        : []
    },
  })

  const { data: mcpServers = [] } = useQuery<MCPServer[]>({
    queryKey: agentMCPServersQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeMCPServersFromSettings(res.data)
    },
  })

  const { data: knowledgeBases = [] } = useQuery<KnowledgeBase[]>({
    queryKey: ["knowledge-bases"],
    queryFn: async () => normalizeKnowledgeBases((await api.get("/user/advanced-chat/knowledge-bases")).data).filter((base) => base.vectorized),
  })

  const editModelOptions = useMemo(() => modelsForChannel(catalog, userChannelID), [catalog, userChannelID])
  const createModelOptions = useMemo(() => modelsForChannel(catalog, createUserChannelID), [catalog, createUserChannelID])
  const editModelSelectOptions = useMemo(
    () => defaultModel && !editModelOptions.includes(defaultModel) ? [defaultModel, ...editModelOptions] : editModelOptions,
    [defaultModel, editModelOptions]
  )
  const createModelSelectOptions = useMemo(
    () => createDefaultModel && !createModelOptions.includes(createDefaultModel) ? [createDefaultModel, ...createModelOptions] : createModelOptions,
    [createDefaultModel, createModelOptions]
  )
  const channelName = useMemo(() => new Map(catalog.map((channel) => [channel.id, channel.name])), [catalog])
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentID), [activeAgentID, agents])
  const skillName = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.name])), [skills])
  const normalizedMCPServers = Array.isArray(mcpServers) ? mcpServers : []
  const mcpServerName = useMemo(() => new Map(normalizedMCPServers.map((server) => [server.id, server.name])), [normalizedMCPServers])

  const openCreateDialog = () => {
    setAgentFormTab("basic")
    setCreateName(t("chat.defaultAgentName"))
    setCreatePrompt("")
    setCreateDefaultModel("")
    setCreateUserChannelID(0)
    setCreateStream(false)
    setCreateSkillIDs([])
    setCreateMCPServerIDs([])
		setCreateKnowledgeBaseIDs([])
    setIsCreateOpen(true)
  }

  const openGenerateDialog = () => {
    setGenerationSourceAgentID(agents.find((agent) => agent.default_model)?.id || agents[0]?.id || "")
    setGenerationRequirements("")
    setIsGenerateOpen(true)
  }

  const setEditForm = (agent: ChatAgent) => {
    setActiveAgentID(agent.id)
    setName(agent.name)
    setPrompt(agent.prompt)
    setDefaultModel(agent.default_model)
    setUserChannelID(agent.user_channel_id || 0)
    setStream(agent.stream === true)
    setSkillIDs(Array.isArray(agent.skill_ids) ? agent.skill_ids : [])
    setMCPServerIDs(Array.isArray(agent.mcp_server_ids) ? agent.mcp_server_ids : [])
		setKnowledgeBaseIDs(Array.isArray(agent.knowledge_base_ids) ? agent.knowledge_base_ids : [])
  }

  const clearEdit = () => {
    setActiveAgentID("")
    setName("")
    setPrompt("")
    setDefaultModel("")
    setUserChannelID(0)
    setStream(false)
    setSkillIDs([])
    setMCPServerIDs([])
		setKnowledgeBaseIDs([])
    setIsEditOpen(false)
  }

  const createAgent = async () => {
    const trimmedName = createName.trim()
    const trimmedModel = createDefaultModel.trim()
    if (!trimmedName) {
      error(t("chat.agentNameRequired"))
      return
    }

    setIsCreating(true)
    try {
      const res = await api.post("/user/advanced-chat/agents", {
        name: trimmedName,
        prompt: createPrompt.trim(),
        default_model: trimmedModel,
        user_channel_id: createUserChannelID || 0,
        stream: createStream,
        skill_ids: uniqueStrings(createSkillIDs),
        mcp_server_ids: uniqueStrings(createMCPServerIDs),
		knowledge_base_ids: uniqueStrings(createKnowledgeBaseIDs),
      })
      const savedAgent = normalizeAgent(res.data)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (savedAgent) {
        setEditForm(savedAgent)
      }
      setIsCreateOpen(false)
      success(t("chat.agentCreated"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentCreateFailed")))
    } finally {
      setIsCreating(false)
    }
  }

  const generateAgent = async () => {
    if (!generationSourceAgentID) {
      error(copy.generationSourceRequired)
      return
    }
    if (!generationRequirements.trim()) {
      error(copy.generationRequirementsRequired)
      return
    }

    setIsGenerating(true)
    try {
      const res = await api.post("/user/advanced-chat/agents/generate", {
        source_agent_id: generationSourceAgentID,
        requirements: generationRequirements.trim(),
      })
      const savedAgent = normalizeAgent(res.data)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      setIsGenerateOpen(false)
      if (savedAgent) {
        setEditForm(savedAgent)
        setAgentFormTab("basic")
        setIsEditOpen(true)
      }
      success(copy.agentGenerated)
    } catch (err) {
      error(apiErrorMessage(err, copy.agentGenerateFailed))
    } finally {
      setIsGenerating(false)
    }
  }

  const saveAgent = async () => {
    const trimmedName = name.trim()
    const trimmedModel = defaultModel.trim()
    if (!activeAgentID) {
      error(t("chat.agentSelectRequired"))
      return
    }
    if (!trimmedName) {
      error(t("chat.agentNameRequired"))
      return
    }

    setIsSaving(true)
    try {
      const res = await api.put(`/user/advanced-chat/agents/${encodeURIComponent(activeAgentID)}`, {
        name: trimmedName,
        prompt: prompt.trim(),
        default_model: trimmedModel,
        user_channel_id: userChannelID || 0,
        stream,
        skill_ids: uniqueStrings(skillIDs),
        mcp_server_ids: uniqueStrings(mcpServerIDs),
		knowledge_base_ids: uniqueStrings(knowledgeBaseIDs),
      })
      const savedAgent = normalizeAgent(res.data)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (savedAgent) {
        setEditForm(savedAgent)
      }
      setIsEditOpen(false)
      success(t("chat.agentSaved"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentSaveFailed")))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteAgent = async (agent: ChatAgent) => {
    if (agent.id === defaultAgentID) {
      error(t("chat.agentDeleteFailed"))
      return
    }
    setDeletingAgentID(agent.id)
    try {
      await api.delete(`/user/advanced-chat/agents/${encodeURIComponent(agent.id)}`)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (activeAgentID === agent.id) {
        clearEdit()
      }
      success(t("chat.agentDeleted"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentDeleteFailed")))
    } finally {
      setDeletingAgentID("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.agents")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("advancedChat.agents.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={openGenerateDialog}>
            <Sparkles size={16} />
            {copy.generateAgent}
          </Button>
          <Button className="gap-2" onClick={openCreateDialog}>
            <Plus size={16} />
            {t("chat.newAgent")}
          </Button>
        </div>
      </div>

      <PageTitleSlot />
      <Card>
        <CardHeader>
          <CardTitle>{t("advancedChat.agents.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t("chat.noAgents")}</div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50",
                  agent.id === activeAgent?.id && "border-primary bg-primary/5 hover:bg-primary/5"
                )}
              >
                <Link to={`/chat/agents/${encodeURIComponent(agent.id)}`} className="min-w-0 w-full text-left">
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{agent.name}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {[agent.default_model || t("chat.noDefaultModel"), agent.user_channel_id ? channelName.get(agent.user_channel_id) || `#${agent.user_channel_id}` : copy.noChannel].join(" · ")}
                  </div>
                  {agent.stream && <div className="mt-1 text-xs text-primary">{copy.streaming}</div>}
                  {((Array.isArray(agent.skill_ids) && agent.skill_ids.length > 0) || (Array.isArray(agent.mcp_server_ids) && agent.mcp_server_ids.length > 0) || (Array.isArray(agent.knowledge_base_ids) && agent.knowledge_base_ids.length > 0)) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Array.isArray(agent.skill_ids) ? agent.skill_ids : []).map((id) => (
                        <span key={`skill-${id}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Sparkles size={11} />
                          {skillName.get(id) || id}
                        </span>
                      ))}
                      {(Array.isArray(agent.mcp_server_ids) ? agent.mcp_server_ids : []).map((id) => (
                        <span key={`mcp-${id}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Server size={11} />
                          {mcpServerName.get(id) || id}
                        </span>
                      ))}
						{(Array.isArray(agent.knowledge_base_ids) ? agent.knowledge_base_ids : []).map((id) => (
						  <span key={`knowledge-${id}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"><FolderOpen size={11} />{knowledgeBases.find((base) => base.id === id)?.name || id}</span>
						))}
                    </div>
                  )}
                </Link>
                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="sm" title={t("chat.chatWithAgent")}>
                    <Link to={`/chat?agent_id=${encodeURIComponent(agent.id)}`}>
                      <MessageSquare size={15} />
                    </Link>
                  </Button>
                  {agent.id !== defaultAgentID && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingAgentID === agent.id}
                      onClick={() => deleteAgent(agent)}
                      title={t("chat.deleteAgent")}
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.editAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AgentFormTabList
              activeTab={agentFormTab}
              onChange={setAgentFormTab}
              labels={{ basic: copy.basicInfo, skills: t("chat.skills"), knowledge: copy.knowledgeBases, mcp: t("chat.mcpServers") }}
            />
            {agentFormTab === "basic" && (
              <>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("common.name")}</span>
                <Input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  disabled={activeAgentID === defaultAgentID}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.channel}</span>
                <Select value={String((userChannelID || "") || "__shadcn_empty__")} onValueChange={(value) => {
                    const nextID = Number((value === "__shadcn_empty__" ? "" : value)) || 0
                    setUserChannelID(nextID)
                    const nextModels = modelsForChannel(catalog, nextID)
                    if (defaultModel && !nextModels.includes(defaultModel)) {
                      setDefaultModel("")
                    }
                  }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{copy.noChannel}</SelectItem>
                  {catalog.map((channel) => (
                    <SelectItem key={channel.id} value={String(channel.id)}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("chat.agentDefaultModel")}</span>
                <Select value={String((defaultModel) || "__shadcn_empty__")} onValueChange={(value) => setDefaultModel((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{t("chat.noDefaultModel")}</SelectItem>
                  {editModelSelectOptions.map((model) => (
                    <SelectItem key={model} value={String(model)}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch className="h-4 w-4" checked={stream} onCheckedChange={(checked) => setStream(checked)} />
              <span className="font-medium">{copy.streamAgent}</span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t("chat.agentPrompt")}</span>
              <textarea
                className="min-h-72 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={prompt}
                placeholder={t("chat.agentPromptPlaceholder")}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
              </>
            )}
            {agentFormTab !== "basic" && (
            <AgentCapabilityTabs
              activeTab={agentFormTab}
              skills={skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))}
              knowledgeBases={knowledgeBases.map((base) => ({ id: base.id, name: base.name, description: base.description }))}
              mcpServers={normalizedMCPServers.map((server) => ({ id: server.id, name: server.name, description: mcpServerSummary(server) }))}
              skillIDs={skillIDs}
              knowledgeBaseIDs={knowledgeBaseIDs}
              mcpServerIDs={mcpServerIDs}
              onChangeSkills={setSkillIDs}
              onChangeKnowledgeBases={setKnowledgeBaseIDs}
              onChangeMCPServers={setMCPServerIDs}
              labels={{
                skills: t("chat.skills"),
                knowledge: copy.knowledgeBases,
                mcp: t("chat.mcpServers"),
                add: copy.add,
                noAdded: copy.noAddedCapabilities,
                noAvailable: copy.noAvailableCapabilities,
                remove: t("chat.remove"),
              }}
            />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveAgent}>
              <Save size={16} />
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.newAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AgentFormTabList
              activeTab={agentFormTab}
              onChange={setAgentFormTab}
              labels={{ basic: copy.basicInfo, skills: t("chat.skills"), knowledge: copy.knowledgeBases, mcp: t("chat.mcpServers") }}
            />
            {agentFormTab === "basic" && (
              <>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("common.name")}</span>
                <Input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.channel}</span>
                <Select value={String((createUserChannelID || "") || "__shadcn_empty__")} onValueChange={(value) => {
                    const nextID = Number((value === "__shadcn_empty__" ? "" : value)) || 0
                    setCreateUserChannelID(nextID)
                    const nextModels = modelsForChannel(catalog, nextID)
                    if (createDefaultModel && !nextModels.includes(createDefaultModel)) {
                      setCreateDefaultModel("")
                    }
                  }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{copy.noChannel}</SelectItem>
                  {catalog.map((channel) => (
                    <SelectItem key={channel.id} value={String(channel.id)}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("chat.agentDefaultModel")}</span>
                <Select value={String((createDefaultModel) || "__shadcn_empty__")} onValueChange={(value) => setCreateDefaultModel((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{t("chat.noDefaultModel")}</SelectItem>
                  {createModelSelectOptions.map((model) => (
                    <SelectItem key={model} value={String(model)}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch className="h-4 w-4" checked={createStream} onCheckedChange={(checked) => setCreateStream(checked)} />
              <span className="font-medium">{copy.streamAgent}</span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t("chat.agentPrompt")}</span>
              <textarea
                className="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={createPrompt}
                placeholder={t("chat.agentPromptPlaceholder")}
                onChange={(event) => setCreatePrompt(event.target.value)}
              />
            </label>
              </>
            )}
            {agentFormTab !== "basic" && (
            <AgentCapabilityTabs
              activeTab={agentFormTab}
              skills={skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))}
              knowledgeBases={knowledgeBases.map((base) => ({ id: base.id, name: base.name, description: base.description }))}
              mcpServers={normalizedMCPServers.map((server) => ({ id: server.id, name: server.name, description: mcpServerSummary(server) }))}
              skillIDs={createSkillIDs}
              knowledgeBaseIDs={createKnowledgeBaseIDs}
              mcpServerIDs={createMCPServerIDs}
              onChangeSkills={setCreateSkillIDs}
              onChangeKnowledgeBases={setCreateKnowledgeBaseIDs}
              onChangeMCPServers={setCreateMCPServerIDs}
              labels={{
                skills: t("chat.skills"),
                knowledge: copy.knowledgeBases,
                mcp: t("chat.mcpServers"),
                add: copy.add,
                noAdded: copy.noAddedCapabilities,
                noAvailable: copy.noAvailableCapabilities,
                remove: t("chat.remove"),
              }}
            />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" disabled={isCreating} onClick={createAgent}>
              <Save size={16} />
              {isCreating ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{copy.generateAgent}</DialogTitle>
            <DialogDescription>{copy.generationDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.generationSource}</span>
              <Select value={String((generationSourceAgentID) || "__shadcn_empty__")} onValueChange={(value) => setGenerationSourceAgentID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.generationSourcePlaceholder}</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name}{agent.default_model ? ` · ${agent.default_model}` : ` · ${t("chat.noDefaultModel")}`}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.generationRequirements}</span>
              <textarea
                className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={generationRequirements}
                placeholder={copy.generationRequirementsPlaceholder}
                maxLength={4000}
                onChange={(event) => setGenerationRequirements(event.target.value)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={isGenerating} onClick={() => setIsGenerateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" disabled={isGenerating || !generationSourceAgentID || !generationRequirements.trim()} onClick={generateAgent}>
              <Sparkles size={16} />
              {isGenerating ? copy.generatingAgent : copy.generateAgent}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AgentFormTabList({
  activeTab,
  onChange,
  labels,
}: {
  activeTab: AgentFormTab
  onChange: (tab: AgentFormTab) => void
  labels: { basic: string; skills: string; knowledge: string; mcp: string }
}) {
  const tabs: Array<{ id: AgentFormTab; label: string; icon: ReactNode }> = [
    { id: "basic", label: labels.basic, icon: <Bot size={15} /> },
    { id: "skills", label: labels.skills, icon: <Sparkles size={15} /> },
    { id: "knowledge", label: labels.knowledge, icon: <FolderOpen size={15} /> },
    { id: "mcp", label: labels.mcp, icon: <Server size={15} /> },
  ]

  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn("inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted", activeTab === tab.id && "border-primary bg-primary/5 text-primary")}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function AgentCapabilityTabs({
  activeTab,
  skills,
  knowledgeBases,
  mcpServers,
  skillIDs,
  knowledgeBaseIDs,
  mcpServerIDs,
  onChangeSkills,
  onChangeKnowledgeBases,
  onChangeMCPServers,
  labels,
}: {
  activeTab: AgentCapabilityKind
  skills: AgentCapabilityItem[]
  knowledgeBases: AgentCapabilityItem[]
  mcpServers: AgentCapabilityItem[]
  skillIDs: string[]
  knowledgeBaseIDs: string[]
  mcpServerIDs: string[]
  onChangeSkills: (ids: string[]) => void
  onChangeKnowledgeBases: (ids: string[]) => void
  onChangeMCPServers: (ids: string[]) => void
  labels: { skills: string; knowledge: string; mcp: string; add: string; noAdded: string; noAvailable: string; remove: string }
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const capabilities: Record<AgentCapabilityKind, { label: string; items: AgentCapabilityItem[]; selected: string[]; onChange: (ids: string[]) => void }> = {
    skills: { label: labels.skills, items: skills, selected: skillIDs, onChange: onChangeSkills },
    knowledge: { label: labels.knowledge, items: knowledgeBases, selected: knowledgeBaseIDs, onChange: onChangeKnowledgeBases },
    mcp: { label: labels.mcp, items: mcpServers, selected: mcpServerIDs, onChange: onChangeMCPServers },
  }
  const activeCapability = capabilities[activeTab]
  const selectedItems = activeCapability.items.filter((item) => activeCapability.selected.includes(item.id))
  const availableItems = activeCapability.items.filter((item) => !activeCapability.selected.includes(item.id))

  return (
    <div className="space-y-3">
      {selectedItems.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{labels.noAdded}</div>
      ) : (
        <div className="space-y-2">
          {selectedItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                {item.description && <div className="mt-1 truncate text-xs text-muted-foreground">{item.description}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => activeCapability.onChange(activeCapability.selected.filter((id) => id !== item.id))} title={labels.remove}>
                <X size={15} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button className="gap-2" onClick={() => setIsPickerOpen(true)}>
        <Plus size={16} />
        {labels.add}
      </Button>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels.add}{activeCapability.label}</DialogTitle>
          </DialogHeader>
          {availableItems.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{labels.noAvailable}</div>
          ) : (
            <div className="space-y-2">
              {availableItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="grid w-full grid-cols-[1fr_auto] gap-2 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => activeCapability.onChange([...activeCapability.selected, item.id])}
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
    </div>
  )
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function modelsForChannel(catalog: UserChannelCatalog[], channelID: number) {
  if (!channelID) {
    return uniqueModels(catalog)
  }
  return catalog.find((channel) => channel.id === channelID)?.models || []
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
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
    skill_ids: stringArray(value.skill_ids),
    mcp_server_ids: stringArray(value.mcp_server_ids),
		knowledge_base_ids: stringArray(value.knowledge_base_ids),
    preset_messages: normalizePresetMessages(value.preset_messages),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizePresetMessages(value: unknown): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }
    const role = stringFromUnknown(item.role)
    const content = stringFromUnknown(item.content)
    if ((role !== "system" && role !== "user" && role !== "assistant") || !content) {
      return []
    }
    return [{ role, content }]
  })
}

function normalizeKnowledgeBases(value: unknown): KnowledgeBase[] { const source = isRecord(value) && Array.isArray(value.knowledge_bases) ? value.knowledge_bases : []; return source.map((item) => { if (!isRecord(item) || typeof item.id !== "string") return null; return { id: item.id, name: typeof item.name === "string" ? item.name : item.id, description: typeof item.description === "string" ? item.description : "", vectorized: item.vectorized === true } }).filter((item): item is KnowledgeBase => Boolean(item)) }

const zhAgentsCopy = {
  basicInfo: "基本信息",
  channel: "渠道",
  noChannel: "未指定渠道",
  streamAgent: "流式输出",
	streaming: "流式",
	knowledgeBases: "知识库",
	noKnowledgeBases: "没有已向量化的知识库",
  add: "添加",
  noAddedCapabilities: "尚未添加任何项目",
  noAvailableCapabilities: "没有可添加的项目",
  generateAgent: "生成代理",
  generatingAgent: "正在生成...",
  generationDescription: "选择一个代理，描述新代理的功能、目标和工作方式。生成时会使用所选代理的模型、渠道和已配置能力，并自动创建新代理。",
  generationSource: "选择代理",
  generationSourcePlaceholder: "选择一个已有代理",
  generationRequirements: "新代理需求",
  generationRequirementsPlaceholder: "例如：创建一个面向产品团队的竞品研究代理。它需要整理市场动态、比较竞品功能与定价，并输出带优先级的可执行建议。",
  generationSourceRequired: "请选择代理",
  generationRequirementsRequired: "请描述新代理的功能和目标",
  agentGenerated: "代理已生成",
  agentGenerateFailed: "生成代理失败",
}

const enAgentsCopy: typeof zhAgentsCopy = {
  basicInfo: "Basic information",
  channel: "Channel",
  noChannel: "No channel",
  streamAgent: "Stream responses",
	streaming: "Streaming",
	knowledgeBases: "Knowledge bases",
	noKnowledgeBases: "No vectorized knowledge bases",
  add: "Add",
  noAddedCapabilities: "No items added",
  noAvailableCapabilities: "No items available to add",
  generateAgent: "Generate agent",
  generatingAgent: "Generating...",
  generationDescription: "Choose an agent, then describe the new agent's responsibilities, goals, and working style. Generation uses the selected agent's model, channel, and configured capabilities, then creates the new agent.",
  generationSource: "Choose agent",
  generationSourcePlaceholder: "Choose an existing agent",
  generationRequirements: "New agent requirements",
  generationRequirementsPlaceholder: "For example: Create a competitive research agent for a product team. It should track market developments, compare features and pricing, and produce prioritized recommendations.",
  generationSourceRequired: "Choose an agent",
  generationRequirementsRequired: "Describe the new agent's responsibilities and goals",
  agentGenerated: "Agent generated",
  agentGenerateFailed: "Failed to generate agent",
}

function normalizeSkill(value: unknown): ChatSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  return id ? { id, name: typeof value.name === "string" ? value.name : id, description: typeof value.description === "string" ? value.description : "" } : null
}

function normalizeMCPServersFromSettings(value: unknown): MCPServer[] {
  if (!isRecord(value)) {
    return []
  }
  const builtin = Array.isArray(value.builtin_mcp_servers) ? value.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(value.custom_mcp_servers) ? value.custom_mcp_servers.map(normalizeMCPServer) : []
  const merged = Array.isArray(value.mcp_servers) ? value.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom)
  return merged.filter((server) => server.id && server.enabled)
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  const id = stringFromUnknown(item.id) || ""
  return {
    id,
    name: typeof item.name === "string" && item.name ? item.name : id,
    type: typeof item.type === "string" ? item.type : "http",
    url: typeof item.url === "string" ? item.url : "",
    command: typeof item.command === "string" ? item.command : "",
    args: Array.isArray(item.args) ? item.args.filter((value): value is string => typeof value === "string") : [],
    env: isStringRecord(item.env) ? item.env : {},
    cwd: typeof item.cwd === "string" ? item.cwd : "",
    enabled: item.enabled !== false,
  }
}

function mcpServerSummary(server: MCPServer) {
  if (server.type === "connector") {
    return [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter(Boolean).join(" ")
  }
  return server.url || ""
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.map((item) => stringFromUnknown(item) || "")) : []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function mergeMCPServers(...groups: MCPServer[][]) {
  const merged = new Map<string, MCPServer>()
  for (const server of groups.flat()) {
    if (server.id && !merged.has(server.id)) {
      merged.set(server.id, server)
    }
  }
  return Array.from(merged.values())
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data)) {
        if (typeof data.error === "string" && data.error) {
          return data.error
        }
        if (typeof data.message === "string" && data.message) {
          return data.message
        }
      }
      if (typeof data === "string" && data) {
        return data
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every((item) => typeof item === "string")
}
