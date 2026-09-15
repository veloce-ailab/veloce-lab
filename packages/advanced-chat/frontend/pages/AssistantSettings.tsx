import { Bot, ListRestart, MessageSquareText, Radio, Save, ShieldCheck, UserCheck } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  api,
  useI18n,
} from "@velocelab/dashboard/frontend"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface AdvancedChatUserSettings {
  title_model_name: string
  title_user_channel_id?: number
  title_generation_scope: "all" | "recent"
  connector_approval_agent_id: string
}

interface AdvancedChatAgentOption {
  id: string
  name: string
}

/**
 * Assistant behaviour preferences for the signed-in user: conversation title
 * generation and connector approval. Owned by the advanced-chat plugin, which
 * also owns the backing `/api/user/advanced-chat/*` endpoints.
 */
export default function AssistantSettings() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhAssistantCopy : enAssistantCopy
  const queryClient = useQueryClient()
  const [titleModelName, setTitleModelName] = useState("")
  const [titleUserChannelID, setTitleUserChannelID] = useState(0)
  const [titleGenerationScope, setTitleGenerationScope] = useState<"all" | "recent">("recent")
  const [connectorApprovalAgentID, setConnectorApprovalAgentID] = useState("")

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })
  const { data: advancedChatSettings } = useQuery<AdvancedChatUserSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => normalizeAdvancedChatUserSettings((await api.get("/user/advanced-chat/settings")).data),
  })
  const { data: advancedChatAgents = [] } = useQuery<AdvancedChatAgentOption[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeAdvancedChatAgentOption).filter((item): item is AdvancedChatAgentOption => Boolean(item)) : []
    },
  })
  const titleModelOptions = useMemo(() => modelsForChannel(catalog, titleUserChannelID), [catalog, titleUserChannelID])
  const titleSelectOptions = useMemo(
    () => titleModelName && !titleModelOptions.includes(titleModelName) ? [titleModelName, ...titleModelOptions] : titleModelOptions,
    [titleModelName, titleModelOptions]
  )

  useEffect(() => {
    if (!advancedChatSettings) {
      return
    }
    setTitleModelName(advancedChatSettings.title_model_name || "")
    setTitleUserChannelID(advancedChatSettings.title_user_channel_id || 0)
    setTitleGenerationScope(advancedChatSettings.title_generation_scope || "recent")
    setConnectorApprovalAgentID(advancedChatSettings.connector_approval_agent_id || "")
  }, [advancedChatSettings])

  const saveSettings = useMutation({
    mutationFn: async () => normalizeAdvancedChatUserSettings((await api.put("/user/advanced-chat/settings", {
      title_model_name: titleModelName.trim(),
      title_user_channel_id: titleUserChannelID || 0,
      title_generation_scope: titleGenerationScope,
      connector_approval_agent_id: connectorApprovalAgentID,
    })).data),
    onSuccess: (saved) => {
      setTitleModelName(saved.title_model_name || "")
      setTitleUserChannelID(saved.title_user_channel_id || 0)
      setTitleGenerationScope(saved.title_generation_scope || "recent")
      setConnectorApprovalAgentID(saved.connector_approval_agent_id || "")
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.assistantSettings}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.assistantDescription}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquareText size={18} />{copy.titleGeneration}</CardTitle>
            <CardDescription>{copy.titleGenerationDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <label className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Radio size={17} /></div>
              <div className="min-w-0 flex-1 text-sm font-medium">{copy.titleChannel}</div>
              <div className="w-56 shrink-0">
                <Select value={String((titleUserChannelID || "") || "__shadcn_empty__")} onValueChange={(value) => {
                  const nextID = Number((value === "__shadcn_empty__" ? "" : value)) || 0
                  setTitleUserChannelID(nextID)
                  const nextModels = modelsForChannel(catalog, nextID)
                  if (titleModelName && !nextModels.includes(titleModelName)) {
                    setTitleModelName("")
                  }
                }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.anyChannel}</SelectItem>
                {catalog.map((channel) => (
                  <SelectItem key={channel.id} value={String(channel.id)}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent></Select>
              </div>
            </label>
            <label className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Bot size={17} /></div>
              <div className="min-w-0 flex-1 text-sm font-medium">{copy.titleModel}</div>
              <div className="w-56 shrink-0">
                <Select value={String((titleModelName) || "__shadcn_empty__")} onValueChange={(value) => setTitleModelName((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.titleDisabled}</SelectItem>
                {titleSelectOptions.map((model) => (
                  <SelectItem key={model} value={String(model)}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent></Select>
              </div>
            </label>
            <label className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><ListRestart size={17} /></div>
              <div className="min-w-0 flex-1 text-sm font-medium">{copy.titleScope}</div>
              <div className="w-56 shrink-0">
                <Select value={String((titleGenerationScope) || "__shadcn_empty__")} onValueChange={(value) => setTitleGenerationScope(normalizeTitleScope((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="recent">{copy.titleScopeRecent}</SelectItem>
                <SelectItem value="all">{copy.titleScopeAll}</SelectItem>
              </SelectContent></Select>
              </div>
            </label>
          </CardContent>
          <CardFooter className="border-t">
            <Button className="gap-2" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              <Save size={16} />{saveSettings.isPending ? copy.saving : copy.saveTitleSettings}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={18} />{copy.connectorApproval}</CardTitle>
            <CardDescription>{copy.connectorApprovalDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <label className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><UserCheck size={17} /></div>
              <div className="min-w-0 flex-1 text-sm font-medium">{copy.approvalAssistant}</div>
              <div className="w-56 shrink-0">
                <Select value={String((connectorApprovalAgentID) || "__shadcn_empty__")} onValueChange={(value) => setConnectorApprovalAgentID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.noApprovalAssistant}</SelectItem>
                {advancedChatAgents.map((agent) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                ))}
              </SelectContent></Select>
              </div>
            </label>
          </CardContent>
          <CardFooter className="border-t">
            <Button className="gap-2" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              <Save size={16} />{saveSettings.isPending ? copy.saving : copy.saveApprovalSettings}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function modelsForChannel(catalog: UserChannelCatalog[], channelID: number) {
  if (!channelID) {
    return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
  }
  return catalog.find((channel) => channel.id === channelID)?.models || []
}

function normalizeAdvancedChatAgentOption(value: unknown): AdvancedChatAgentOption | null {
  const item = isRecord(value) ? value : {}
  const id = typeof item.id === "string" ? item.id : String(item.id || "")
  if (!id) {
    return null
  }
  return { id, name: typeof item.name === "string" && item.name ? item.name : id }
}

function normalizeAdvancedChatUserSettings(value: unknown): AdvancedChatUserSettings {
  const item = isRecord(value) ? value : {}
  return {
    title_model_name: typeof item.title_model_name === "string" ? item.title_model_name : "",
    title_user_channel_id: Number(item.title_user_channel_id || 0) || undefined,
    title_generation_scope: normalizeTitleScope(item.title_generation_scope),
    connector_approval_agent_id: typeof item.connector_approval_agent_id === "string" ? item.connector_approval_agent_id : "",
  }
}

function normalizeTitleScope(value: unknown): "all" | "recent" {
  return value === "all" ? "all" : "recent"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhAssistantCopy = {
  titleGeneration: "会话标题生成",
  titleGenerationDescription: "发送第一条消息后，系统会并行调用这里配置的模型生成会话标题。留空则继续使用本地摘要标题。",
  titleChannel: "标题生成渠道",
  titleModel: "标题生成模型",
  anyChannel: "任意可用渠道",
  titleDisabled: "不使用模型生成标题",
  titleScope: "重新生成范围",
  titleScopeRecent: "最近对话",
  titleScopeAll: "全部对话",
  saveTitleSettings: "保存标题设置",
  connectorApproval: "连接器审批",
  connectorApprovalDescription: "选择一个助手来审核连接器的文件修改和命令执行。选择后，可在聊天输入框中启用“助手审批”。",
  approvalAssistant: "审批助手",
  noApprovalAssistant: "暂不使用助手审批",
  saveApprovalSettings: "保存审批设置",
  assistantSettings: "助手设置",
  assistantDescription: "配置会话标题生成与连接器审批所使用的模型。",
  saving: "保存中...",
}

const enAssistantCopy: typeof zhAssistantCopy = {
  titleGeneration: "Conversation title generation",
  titleGenerationDescription: "After the first message is sent, the system calls this model in parallel to generate the session title. Leave it empty to keep the local fallback title.",
  titleChannel: "Title channel",
  titleModel: "Title model",
  anyChannel: "Any available channel",
  titleDisabled: "Do not generate titles with a model",
  titleScope: "Regeneration scope",
  titleScopeRecent: "Recent conversation",
  titleScopeAll: "Full conversation",
  saveTitleSettings: "Save title settings",
  connectorApproval: "Connector approval",
  connectorApprovalDescription: "Choose an assistant to review connector file changes and command execution. It can then be enabled from the chat composer.",
  approvalAssistant: "Approval assistant",
  noApprovalAssistant: "Do not use assistant approval",
  saveApprovalSettings: "Save approval settings",
  assistantSettings: "Assistant settings",
  assistantDescription: "Choose the models used for conversation titles and connector approval.",
  saving: "Saving...",
}
