import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, MessageSquare, Plus, Power, QrCode, Save, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface IDName {
  id: string
  name: string
  description: string
}

interface ChatAgentOption {
  id: string
  name: string
  default_model: string
  user_channel_id?: number
  skill_ids: string[]
}

interface StudioOption {
  id: string
  name: string
}

interface Device {
  id: string
  name: string
  online: boolean
}

interface GroupConfig {
  external_id: string
  name: string
  enabled: boolean
  device_id: string
  workspace_path: string
  workspace_unrestricted: boolean
  connector_auto_approve: boolean
  connector_command_prefixes: string[]
  user_channel_id?: number | null
  model: string
  agent_id?: number | null
  agent_key: string
  agent_group_id: string
  skill_ids: string[]
  context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt_override: string
}

interface AdvancedOptions {
  temperature?: number | null
  max_tokens: number
  reply_prefix: string
  reply_suffix: string
  language: string
  timezone: string
  mention_policy: string
  attachment_mode: string
  thread_mode: string
  deduplication_window_seconds: number
  response_timeout_seconds: number
  error_fallback: string
  custom_provider_config_json: string
}

interface ChannelConfigOption {
  label: string
  value: string
}

interface ChannelConfigField {
  type: string
  name: string
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  default?: unknown
  options?: ChannelConfigOption[]
  min?: number | string
  max?: number | string
  step?: number | string
}

interface ChannelProviderDescriptor {
  id: string
  name: string
  description?: string
  plugin_id?: string
  config?: { fields?: ChannelConfigField[] }
}

interface MessageChannelSettings {
  enabled: boolean
  providers: ChannelProviderDescriptor[]
}

interface MessageChannel {
  id: number
  name: string
  provider: ChannelProvider | string
  enabled: boolean
  bot_token_configured: boolean
  bot_token_preview?: string
  webhook_path: string
  default_device_id: string
  default_workspace_path: string
  default_workspace_unrestricted: boolean
  default_connector_auto_approve: boolean
  default_connector_command_prefixes: string[]
  default_user_channel_id?: number | null
  default_model: string
  default_agent_id?: number | null
  default_agent_key: string
  default_agent_group_id: string
  default_skill_ids: string[]
  default_context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
  last_event_at?: string
  created_at?: string
  updated_at?: string
}

interface MessageRecord {
  id: number
  direction: string
  status: string
  external_chat_id: string
  content: string
  error?: string
  created_at?: string
}

interface Draft {
  id?: number
  name: string
  provider: ChannelProvider | string
  bot_token: string
  enabled: boolean
  default_device_id: string
  default_workspace_path: string
  default_workspace_unrestricted: boolean
  default_connector_auto_approve: boolean
  default_connector_command_prefixes: string
  default_user_channel_id: string
  default_model: string
  default_agent_id: string
  default_agent_group_id: string
  default_skill_ids: string[]
  default_context_message_count: string
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
}

const channelQueryKey = ["message-channels"] as const
type ChannelProvider = "telegram" | "discord" | "qq" | "onebot" | "weixin" | "tencent_channel"
const providerOptions: ChannelProviderDescriptor[] = [
  { id: "telegram", name: "Telegram" },
  { id: "discord", name: "Discord" },
  { id: "qq", name: "QQ 官方机器人" },
  { id: "onebot", name: "OneBot" },
  { id: "weixin", name: "微信 Bot" },
  { id: "tencent_channel", name: "腾讯频道 Gateway" },
]
const emptyAdvancedOptions: AdvancedOptions = {
  temperature: null,
  max_tokens: 0,
  reply_prefix: "",
  reply_suffix: "",
  language: "",
  timezone: "",
  mention_policy: "default",
  attachment_mode: "ignore",
  thread_mode: "channel",
  deduplication_window_seconds: 60,
  response_timeout_seconds: 120,
  error_fallback: "",
  custom_provider_config_json: "",
}

const emptyDraft: Draft = {
  name: "",
  provider: "telegram",
  bot_token: "",
  enabled: true,
  default_device_id: "",
  default_workspace_path: "",
  default_workspace_unrestricted: false,
  default_connector_auto_approve: false,
  default_connector_command_prefixes: "",
  default_user_channel_id: "",
  default_model: "",
  default_agent_id: "",
  default_agent_group_id: "",
  default_skill_ids: [],
  default_context_message_count: "12",
  reply_mode: "mention",
  trigger_mode: "mention",
  system_prompt: "",
  group_configs: [],
  advanced_options: emptyAdvancedOptions,
}

export default function MessageChannelsWorkspace() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { data: settings } = useMessageChannelSettings()

  if (settings && !settings.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.disabled}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Routes>
      <Route index element={<ChannelList copy={copy} />} />
      <Route path="new" element={<ChannelDetail copy={copy} mode="create" />} />
      <Route path=":id" element={<ChannelDetail copy={copy} mode="edit" />} />
      <Route path="*" element={<Navigate to="/chat/channels" replace />} />
    </Routes>
  )
}

function ChannelList({ copy }: { copy: CopyText }) {
  const { data: channels = [] } = useChannels()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const toggleChannel = useMutation({
    mutationFn: async (channel: MessageChannel) => api.post(`/user/message-channels/${channel.id}/${channel.enabled ? "disable" : "enable"}`),
    onSuccess: (_, channel) => {
      success(channel.enabled ? copy.disabledSaved : copy.enabledSaved)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/chat/channels/new">
            <Plus size={16} />
            {copy.newChannel}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {channels.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.empty}</CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <div key={channel.id} className="grid gap-3 rounded-md border p-4 transition-colors hover:bg-muted/50 md:grid-cols-[1fr_auto] md:items-center">
              <Link to={`/chat/channels/${channel.id}`} className="min-w-0">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare size={16} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold">{channel.name}</span>
                    <Badge>{channel.provider}</Badge>
                    <Badge muted>{channel.enabled ? copy.enabled : copy.disabledState}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{copy.model}: {channel.default_model || "-"}</span>
                    <span>{copy.contextCount}: {channel.default_context_message_count || 0}</span>
                    <span>{copy.groups}: {channel.group_configs.length}</span>
                    <span>{copy.lastEvent}: {formatDateTime(channel.last_event_at) || "-"}</span>
                  </div>
                </div>
                <div className="text-sm font-medium text-primary">{copy.details}</div>
              </div>
              </Link>
              <Button variant="outline" size="sm" className="gap-2" disabled={toggleChannel.isPending} onClick={() => toggleChannel.mutate(channel)}>
                <Power size={15} />
                {channel.enabled ? copy.disableChannel : copy.enableChannel}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ChannelDetail({ copy, mode }: { copy: CopyText; mode: "create" | "edit" }) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { id = "" } = useParams()
  const numericID = Number(id)
  const [activeTab, setActiveTab] = useState("basic")
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft, name: copy.defaultName, advanced_options: { ...emptyAdvancedOptions } }))
  const [tencentLoginAutoKey, setTencentLoginAutoKey] = useState(0)

  const { data: channels = [] } = useChannels()
  const { data: channelSettings } = useMessageChannelSettings()
  const current = mode === "edit" ? channels.find((channel) => channel.id === numericID) : undefined
  const lookups = useLookups()
  const modelOptions = useMemo(() => uniqueModels(lookups.catalog), [lookups.catalog])
  const selectedUserChannel = lookups.catalog.find((item) => String(item.id) === draft.default_user_channel_id)
  const defaultModelOptions = selectedUserChannel?.models.length ? selectedUserChannel.models : modelOptions
  const configuredProviders = channelSettings?.providers?.length ? channelSettings.providers : providerOptions
  const providers = useMemo(() => {
    if (configuredProviders.some((provider) => provider.id === draft.provider)) return configuredProviders
    return [...configuredProviders, { id: draft.provider, name: draft.provider }]
  }, [configuredProviders, draft.provider])

  useEffect(() => {
    if (mode === "create") {
      setDraft({ ...emptyDraft, name: copy.defaultName, advanced_options: { ...emptyAdvancedOptions } })
      return
    }
    if (current) {
      setDraft(channelToDraft(current))
    }
  }, [copy.defaultName, current, mode])

  const saveChannel = useMutation({
    mutationFn: async () => {
      const payload = draftToPayload(draft)
      const res = draft.id
        ? await api.put(`/user/message-channels/${draft.id}`, payload)
        : await api.post("/user/message-channels", payload)
      return normalizeChannel(res.data)
    },
    onSuccess: (saved) => {
      success(copy.saved)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      if (saved) {
        if (saved.provider === "tencent_channel") {
          setActiveTab("basic")
          if (mode === "create") {
            navigate(`/chat/channels/${saved.id}?login=tencent`, { replace: true })
          } else {
            setTencentLoginAutoKey(Date.now())
            navigate(`/chat/channels/${saved.id}`, { replace: true })
          }
          return
        }
        navigate(`/chat/channels/${saved.id}`, { replace: mode === "create" })
      }
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  const deleteChannel = useMutation({
    mutationFn: async (channelID: number) => api.delete(`/user/message-channels/${channelID}`),
    onSuccess: () => {
      success(copy.deleted)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      navigate("/chat/channels", { replace: true })
    },
    onError: (err) => error(apiErrorMessage(err, copy.deleteFailed)),
  })
  const toggleChannel = useMutation({
    mutationFn: async () => api.post(`/user/message-channels/${draft.id}/${draft.enabled ? "disable" : "enable"}`),
    onSuccess: () => {
      success(draft.enabled ? copy.disabledSaved : copy.enabledSaved)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      updateDraft({ enabled: !draft.enabled })
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  const updateDraft = (patch: Partial<Draft>) => setDraft((currentDraft) => ({ ...currentDraft, ...patch }))
  const updateAdvanced = (patch: Partial<AdvancedOptions>) => setDraft((currentDraft) => ({ ...currentDraft, advanced_options: { ...currentDraft.advanced_options, ...patch } }))

  const locationTencentLoginKey = new URLSearchParams(location.search).get("login") === "tencent" ? `route-${numericID}` : ""
  const tencentLoginAutoStartKey = tencentLoginAutoKey || locationTencentLoginKey

  const tabs = useMemo(() => [
    { id: "basic", label: copy.tabBasic },
    ...(draft.provider === "tencent_channel" ? [{ id: "tencent", label: copy.tabTencentChannel }] : []),
    { id: "routing", label: copy.tabRouting },
    { id: "groups", label: copy.tabGroups },
    { id: "advanced", label: copy.tabAdvanced },
    ...(draft.id ? [{ id: "messages", label: copy.tabMessages }] : []),
  ], [copy.tabAdvanced, copy.tabBasic, copy.tabGroups, copy.tabMessages, copy.tabRouting, copy.tabTencentChannel, draft.id, draft.provider])

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("basic")
    }
  }, [activeTab, tabs])

  if (mode === "edit" && channels.length > 0 && !current) {
    return <Navigate to="/chat/channels" replace />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3 gap-2">
            <Link to="/chat/channels">
              <ArrowLeft size={16} />
              {copy.back}
            </Link>
          </Button>
          <h1 className="mt-2 text-3xl font-bold">{draft.id ? draft.name : copy.newChannel}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.id && (
            <>
              <Button variant="outline" className="gap-2" disabled={toggleChannel.isPending} onClick={() => toggleChannel.mutate()}>
                <Power size={16} />
                {draft.enabled ? copy.disableChannel : copy.enableChannel}
              </Button>
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" disabled={deleteChannel.isPending} onClick={() => deleteChannel.mutate(draft.id!)}>
                <Trash2 size={16} />
                {copy.delete}
              </Button>
            </>
          )}
          <Button className="gap-2" disabled={saveChannel.isPending} onClick={() => saveChannel.mutate()}>
            <Save size={16} />
            {saveChannel.isPending ? copy.saving : copy.save}
          </Button>
        </div>
      </div>

      <PageTabs className="flex-wrap" aria-label={copy.title}>
        {tabs.map((tab) => (
          <PageTab
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </PageTab>
        ))}
      </PageTabs>

      {activeTab === "basic" && (
        <BasicTab copy={copy} draft={draft} current={current} providers={providers} lookups={lookups} tencentLoginAutoStartKey={tencentLoginAutoStartKey} onDraftChange={updateDraft} onAdvancedChange={updateAdvanced} />
      )}
      {activeTab === "routing" && (
        <RoutingTab copy={copy} draft={draft} lookups={lookups} modelOptions={modelOptions} defaultModelOptions={defaultModelOptions} onDraftChange={updateDraft} />
      )}
      {activeTab === "tencent" && draft.provider === "tencent_channel" && (
        <TencentChannelTab copy={copy} draft={draft} current={current} onAdvancedChange={updateAdvanced} />
      )}
      {activeTab === "groups" && (
        <GroupsTab copy={copy} draft={draft} lookups={lookups} modelOptions={modelOptions} onDraftChange={updateDraft} />
      )}
      {activeTab === "advanced" && (
        <AdvancedTab copy={copy} draft={draft} onAdvancedChange={updateAdvanced} />
      )}
      {activeTab === "messages" && draft.id && (
        <MessagesTab copy={copy} channelID={draft.id} />
      )}
    </div>
  )
}

function BasicTab({
  copy,
  draft,
  current,
  providers,
  lookups,
  tencentLoginAutoStartKey,
  onDraftChange,
  onAdvancedChange,
}: {
  copy: CopyText
  draft: Draft
  current?: MessageChannel
  providers: ChannelProviderDescriptor[]
  lookups: LookupData
  tencentLoginAutoStartKey: string | number
  onDraftChange: (patch: Partial<Draft>) => void
  onAdvancedChange: (patch: Partial<AdvancedOptions>) => void
}) {
  const { success } = useToast()
  const providerConfig = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  const showWebhook = current?.webhook_path && !(draft.provider === "qq" && normalizeQQConnectionMode(providerConfig.connection_mode) === "websocket")
  const copyWebhook = async () => {
    if (!showWebhook) {
      return
    }
    await navigator.clipboard.writeText(`${window.location.origin}${current.webhook_path}`)
    success(copy.copied)
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabBasic}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={copy.name}>
            <Input value={draft.name} onChange={(event) => onDraftChange({ name: event.target.value })} />
          </Field>
          <SelectField
            label={copy.provider}
            value={draft.provider}
            onChange={(provider) => onDraftChange({ provider, bot_token: providerUsesBotToken(provider) ? draft.bot_token : "" })}
          >
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </SelectField>
          <Field label={copy.status}>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ enabled: checked })} />
              {draft.enabled ? copy.enabled : copy.disabledState}
            </label>
          </Field>
        </div>
        {showWebhook && (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center">
            <div className="font-medium">{copy.webhook}</div>
            <div className="min-w-0 break-all rounded bg-background p-2 font-mono text-xs">{`${window.location.origin}${current.webhook_path}`}</div>
            <Button variant="outline" size="sm" className="gap-2" onClick={copyWebhook}>
              <Copy size={15} />
              {copy.copy}
            </Button>
          </div>
        )}
        <ConnectionSettings copy={copy} draft={draft} current={current} provider={providers.find((item) => item.id === draft.provider)} lookups={lookups} tencentLoginAutoStartKey={tencentLoginAutoStartKey} onDraftChange={onDraftChange} onAdvancedChange={onAdvancedChange} />
      </CardContent>
    </Card>
  )
}

function ConnectionSettings({
  copy,
  draft,
  current,
  provider,
  lookups,
  tencentLoginAutoStartKey,
  onDraftChange,
  onAdvancedChange,
}: {
  copy: CopyText
  draft: Draft
  current?: MessageChannel
  provider?: ChannelProviderDescriptor
  lookups: LookupData
  tencentLoginAutoStartKey: string | number
  onDraftChange: (patch: Partial<Draft>) => void
  onAdvancedChange: (patch: Partial<AdvancedOptions>) => void
}) {
  const config = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  const qqConnectionMode = normalizeQQConnectionMode(config.connection_mode)
  const updateConfig = (key: string, value: string) => {
    const next = { ...config }
    if (value.trim() === "") {
      delete next[key]
    } else {
      next[key] = value
    }
    onAdvancedChange({ custom_provider_config_json: stringifyProviderConfig(next) })
  }

  if (provider?.plugin_id) {
    return <PluginChannelConnectionSettings copy={copy} provider={provider} config={config} onAdvancedChange={onAdvancedChange} />
  }

  return (
    <div className="space-y-5 border-t pt-5">
      <div>
        <h2 className="text-sm font-semibold">{copy.tabConnection}</h2>
      </div>
        {draft.provider === "telegram" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.telegramBotToken}>
              <Input type="password" value={draft.bot_token} placeholder={current?.bot_token_preview || copy.botTokenPlaceholder} onChange={(event) => onDraftChange({ bot_token: event.target.value })} />
            </Field>
            <Field label={copy.telegramBaseURL}>
              <Input value={config.base_url || ""} placeholder="https://api.telegram.org" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <SelectField label={copy.telegramParseMode} value={config.parse_mode || ""} onChange={(value) => updateConfig("parse_mode", value)}>
              <option value="">{copy.inheritNone}</option>
              <option value="MarkdownV2">MarkdownV2</option>
              <option value="HTML">HTML</option>
              <option value="Markdown">Markdown</option>
            </SelectField>
          </div>
        )}

        {draft.provider === "discord" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.discordBotToken}>
              <Input type="password" value={draft.bot_token} placeholder={current?.bot_token_preview || copy.botTokenPlaceholder} onChange={(event) => onDraftChange({ bot_token: event.target.value })} />
            </Field>
            <Field label={copy.discordBaseURL}>
              <Input value={config.base_url || ""} placeholder="https://discord.com/api/v10" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
          </div>
        )}

        {draft.provider === "qq" && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label={copy.qqConnectionMode} value={qqConnectionMode} onChange={(value) => updateConfig("connection_mode", value)}>
                <option value="webhook">{copy.qqConnectionWebhook}</option>
                <option value="websocket">{copy.qqConnectionWebSocket}</option>
              </SelectField>
              <Field label={copy.qqBotID}>
                <Input value={config.bot_id || ""} placeholder="1020..." onChange={(event) => updateConfig("bot_id", event.target.value)} />
              </Field>
              <Field label={copy.qqBotSecret}>
                <Input type="password" value={config.bot_secret || ""} placeholder={copy.qqBotSecretPlaceholder} onChange={(event) => updateConfig("bot_secret", event.target.value)} />
              </Field>
              <Field label={copy.qqBaseURL}>
                <Input value={config.base_url || ""} placeholder="https://api.sgroup.qq.com" onChange={(event) => updateConfig("base_url", event.target.value)} />
              </Field>
              <Field label={copy.qqTokenURL}>
                <Input value={config.token_url || ""} placeholder="https://bots.qq.com/app/getAppAccessToken" onChange={(event) => updateConfig("token_url", event.target.value)} />
              </Field>
              <QQIntentsPicker copy={copy} value={config.intents || ""} onChange={(value) => updateConfig("intents", value)} />
              <Field label={copy.qqShard}>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={config.shard_index || ""} placeholder="0" onChange={(event) => updateConfig("shard_index", event.target.value)} />
                  <Input value={config.shard_total || ""} placeholder="1" onChange={(event) => updateConfig("shard_total", event.target.value)} />
                </div>
              </Field>
              <SelectField label={copy.qqMsgType} value={config.msg_type || "2"} onChange={(value) => updateConfig("msg_type", value)}>
                <option value="0">{copy.qqMsgTypeText}</option>
                <option value="2">{copy.qqMsgTypeMarkdown}</option>
              </SelectField>
            </div>
            <QQLoginPanel copy={copy} current={current} />
          </div>
        )}

        {draft.provider === "onebot" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.oneBotBaseURL}>
              <Input value={config.base_url || ""} placeholder="http://127.0.0.1:3000" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <Field label={copy.oneBotAccessToken}>
              <Input type="password" value={config.access_token || ""} onChange={(event) => updateConfig("access_token", event.target.value)} />
            </Field>
            <Field label={copy.oneBotAction}>
              <Input value={config.send_action || ""} placeholder="send_group_msg / send_private_msg" onChange={(event) => updateConfig("send_action", event.target.value)} />
            </Field>
          </div>
        )}

        {draft.provider === "weixin" && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.weixinBaseURL}>
                <Input value={config.base_url || ""} placeholder="https://ilinkai.weixin.qq.com" onChange={(event) => updateConfig("base_url", event.target.value)} />
              </Field>
              <Field label={copy.weixinCDNBaseURL}>
                <Input value={config.cdn_base_url || ""} placeholder="https://novac2c.cdn.weixin.qq.com/c2c" onChange={(event) => updateConfig("cdn_base_url", event.target.value)} />
              </Field>
              <Field label={copy.weixinAccountID}>
                <Input value={config.account_id || ""} readOnly placeholder={copy.weixinAccountPending} />
              </Field>
              <Field label={copy.weixinUserID}>
                <Input value={config.user_id || ""} readOnly placeholder={copy.weixinAccountPending} />
              </Field>
            </div>
            <WeixinLoginPanel copy={copy} current={current} />
          </div>
        )}

        {draft.provider === "tencent_channel" && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              {copy.tencentConnectorRequired}
              <div className="mt-2 rounded bg-background/70 px-2 py-1 font-mono">npm i -g tencent-channel-cli</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label={copy.tencentConnectorDevice} value={draft.default_device_id} onChange={(value) => onDraftChange({ default_device_id: value })}>
                <option value="">{copy.tencentSelectConnector}</option>
                {lookups.devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.online ? "" : ` (${copy.offline})`}</option>)}
              </SelectField>
              <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                <Switch checked={draft.default_workspace_unrestricted} onCheckedChange={(checked) => onDraftChange({ default_workspace_unrestricted: checked, default_workspace_path: checked ? "" : draft.default_workspace_path })} />
                {copy.unrestrictedWorkspace}
              </label>
              <Field label={copy.workspacePath}>
                <Input disabled={draft.default_workspace_unrestricted} value={draft.default_workspace_path} placeholder={draft.default_workspace_unrestricted ? copy.unrestrictedWorkspace : copy.workspacePathPlaceholder} onChange={(event) => onDraftChange({ default_workspace_path: event.target.value })} />
              </Field>
              <Field label={copy.tencentCLIProfile}>
                <Input value={config.cli_profile || ""} placeholder="default" onChange={(event) => updateConfig("cli_profile", event.target.value)} />
              </Field>
            </div>
            <TencentChannelLoginPanel copy={copy} current={current} autoStartKey={tencentLoginAutoStartKey} />
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          {copy.connectionHint}
        </div>
    </div>
  )
}

function PluginChannelConnectionSettings({
  copy,
  provider,
  config,
  onAdvancedChange,
}: {
  copy: CopyText
  provider: ChannelProviderDescriptor
  config: Record<string, string>
  onAdvancedChange: (patch: Partial<AdvancedOptions>) => void
}) {
  const fields = provider.config?.fields || []
  const updateConfig = (key: string, value: string) => {
    const next = { ...config }
    if (value.trim() === "") delete next[key]
    else next[key] = value
    onAdvancedChange({ custom_provider_config_json: stringifyProviderConfig(next) })
  }

  return (
    <div className="space-y-5 border-t pt-5">
      <div>
        <h2 className="text-sm font-semibold">{copy.tabConnection}</h2>
        {provider.description && <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>}
      </div>
      {fields.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{copy.connectionHint}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const value = config[field.name] ?? (field.default === undefined ? "" : String(field.default))
            const description = field.description ? <p className="mt-1 text-xs text-muted-foreground">{field.description}</p> : null
            if (field.type === "select") {
              return <Field key={field.name} label={field.label || field.name}><SelectField value={value} onChange={(next) => updateConfig(field.name, next)} label={field.label || field.name}><option value="">{copy.inheritNone}</option>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField>{description}</Field>
            }
            if (field.type === "textarea") {
              return <Field key={field.name} label={field.label || field.name}><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={value} placeholder={field.placeholder} required={field.required} onChange={(event) => updateConfig(field.name, event.target.value)} />{description}</Field>
            }
            if (field.type === "switch" || field.type === "checkbox" || field.type === "boolean") {
              return <Field key={field.name} label={field.label || field.name}><label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><Switch checked={value === "true"} onCheckedChange={(checked) => updateConfig(field.name, checked ? "true" : "false")} />{field.label || field.name}</label>{description}</Field>
            }
            return <Field key={field.name} label={field.label || field.name}><Input type={field.type === "secret" ? "password" : field.type === "number" ? "number" : field.type === "password" ? "password" : "text"} value={value} placeholder={field.placeholder} required={field.required} min={field.min} max={field.max} step={field.step} onChange={(event) => updateConfig(field.name, event.target.value)} />{description}</Field>
          })}
        </div>
      )}
      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{copy.connectionHint}</div>
    </div>
  )
}

interface TencentGuildOption {
  id: string
  name: string
  role: string
}

interface TencentChannelOption {
  id: string
  name: string
  guild_id: string
}

function TencentChannelTab({ copy, draft, current, onAdvancedChange }: { copy: CopyText; draft: Draft; current?: MessageChannel; onAdvancedChange: (patch: Partial<AdvancedOptions>) => void }) {
  const { success, error } = useToast()
  const config = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  const [guilds, setGuilds] = useState<TencentGuildOption[]>([])
  const [channels, setChannels] = useState<TencentChannelOption[]>([])

  const updateConfig = (key: string, value: string) => {
    const next = { ...config }
    if (value.trim() === "") {
      delete next[key]
    } else {
      next[key] = value
    }
    onAdvancedChange({ custom_provider_config_json: stringifyProviderConfig(next) })
  }
  const updateConfigs = (patch: Record<string, string>) => {
    const next = { ...config }
    for (const [key, value] of Object.entries(patch)) {
      if (value.trim() === "") {
        delete next[key]
      } else {
        next[key] = value
      }
    }
    onAdvancedChange({ custom_provider_config_json: stringifyProviderConfig(next) })
  }

  const loadGuilds = useMutation({
    mutationFn: async () => {
      if (!current?.id) throw new Error(copy.tencentSaveFirst)
      const res = await api.post(`/user/message-channels/${current.id}/tencent-channel/guilds`)
      return normalizeTencentGuildOptions(res.data)
    },
    onSuccess: (items) => {
      setGuilds(items)
      success(copy.tencentGuildsLoaded)
    },
    onError: (err) => error(apiErrorMessage(err, copy.tencentGuildsFailed)),
  })

  const loadChannels = useMutation({
    mutationFn: async (guildID: string) => {
      if (!current?.id) throw new Error(copy.tencentSaveFirst)
      if (!guildID) throw new Error(copy.tencentSelectGuildFirst)
      const res = await api.post(`/user/message-channels/${current.id}/tencent-channel/channels`, { guild_id: guildID })
      return normalizeTencentChannelOptions(res.data)
    },
    onSuccess: (items) => {
      setChannels(items)
      success(copy.tencentChannelsLoaded)
    },
    onError: (err) => error(apiErrorMessage(err, copy.tencentChannelsFailed)),
  })

  const selectedGuildID = config.guild_id || ""
  const selectedChannelID = config.channel_id || ""
  const selectGuild = (guildID: string) => {
    updateConfigs({ guild_id: guildID, channel_id: "" })
    setChannels([])
    if (guildID && current?.id) {
      loadChannels.mutate(guildID)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabTencentChannel}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {!current?.id && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{copy.tencentSaveFirst}</div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{copy.tencentGuild}</div>
              <Button type="button" variant="outline" size="sm" disabled={!current?.id || loadGuilds.isPending} onClick={() => loadGuilds.mutate()}>
                {loadGuilds.isPending ? copy.loading : copy.tencentRefreshGuilds}
              </Button>
            </div>
            <Select value={String((selectedGuildID) || "__shadcn_empty__")} onValueChange={(value) => selectGuild((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.tencentSelectGuild}</SelectItem>
              {guilds.map((guild) => (
                <SelectItem key={guild.id} value={String(guild.id)}>{guild.name}{guild.role ? ` · ${guild.role}` : ""}</SelectItem>
              ))}
            </SelectContent></Select>
            <Input value={selectedGuildID} placeholder="guild_id" onChange={(event) => updateConfigs({ guild_id: event.target.value, channel_id: selectedChannelID })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{copy.tencentChannel}</div>
              <Button type="button" variant="outline" size="sm" disabled={!current?.id || !selectedGuildID || loadChannels.isPending} onClick={() => loadChannels.mutate(selectedGuildID)}>
                {loadChannels.isPending ? copy.loading : copy.tencentRefreshChannels}
              </Button>
            </div>
            <Select value={String((selectedChannelID) || "__shadcn_empty__")} onValueChange={(value) => updateConfig("channel_id", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.tencentSelectChannel}</SelectItem>
              {channels.map((channel) => (
                <SelectItem key={channel.id} value={String(channel.id)}>{channel.name}</SelectItem>
              ))}
            </SelectContent></Select>
            <Input value={selectedChannelID} placeholder="channel_id" onChange={(event) => updateConfig("channel_id", event.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
          <SelectField label={copy.tencentGatewayEnabled} value={config.gateway_enabled || "true"} onChange={(value) => updateConfig("gateway_enabled", value)}>
            <option value="true">{copy.enabled}</option>
            <option value="false">{copy.disabledState}</option>
          </SelectField>
          <SelectField label={copy.tencentPollMentions} value={config.poll_mentions || "true"} onChange={(value) => updateConfig("poll_mentions", value)}>
            <option value="true">{copy.enabled}</option>
            <option value="false">{copy.disabledState}</option>
          </SelectField>
          <SelectField label={copy.tencentPollPosts} value={config.poll_posts || "false"} onChange={(value) => updateConfig("poll_posts", value)}>
            <option value="false">{copy.disabledState}</option>
            <option value="true">{copy.enabled}</option>
          </SelectField>
          <SelectField label={copy.tencentAutoReplyMentions} value={config.auto_reply_mentions || "true"} onChange={(value) => updateConfig("auto_reply_mentions", value)}>
            <option value="true">{copy.enabled}</option>
            <option value="false">{copy.disabledState}</option>
          </SelectField>
          <SelectField label={copy.tencentReplyMode} value={config.reply_mode || "comment"} onChange={(value) => updateConfig("reply_mode", value)}>
            <option value="comment">{copy.tencentReplyCommentPost}</option>
            <option value="reply">{copy.tencentReplyExistingComment}</option>
          </SelectField>
          <SelectField label={copy.tencentDefaultGetType} value={config.default_get_type || "2"} onChange={(value) => updateConfig("default_get_type", value)}>
            <option value="2">{copy.tencentNewest}</option>
            <option value="1">{copy.tencentHot}</option>
          </SelectField>
          <Field label={copy.tencentPollInterval}>
            <Input value={config.poll_interval_seconds || "30"} placeholder="30" onChange={(event) => updateConfig("poll_interval_seconds", event.target.value)} />
          </Field>
          <Field label={copy.tencentMaxEvents}>
            <Input value={config.max_events || "20"} placeholder="20" onChange={(event) => updateConfig("max_events", event.target.value)} />
          </Field>
        </div>
      </CardContent>
    </Card>
  )
}

interface WeixinLoginState {
  session_key: string
  qrcode_url: string
  qr_data_url: string
  status: string
  message: string
  connected: boolean
}

interface QQLoginState {
  session_key: string
  qrcode_url: string
  qr_data_url: string
  status: string
  connected: boolean
}

interface TencentChannelLoginState {
  qrcode_url: string
  verification_uri: string
  qr_data_url: string
  qrcode_path: string
  status: string
  message: string
  connected: boolean
  cli_version: string
  connectivity: string
  expires_in_s: number
  setup_hint?: unknown
}

function QQLoginPanel({ copy, current }: { copy: CopyText; current?: MessageChannel }) {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [loginState, setLoginState] = useState<QQLoginState | null>(null)
  const [polling, setPolling] = useState(false)

  const startLogin = useMutation({
    mutationFn: async () => {
      if (!current?.id) throw new Error(copy.qqSaveFirst)
      const res = await api.post(`/user/message-channels/${current.id}/qq/login/start`)
      return normalizeQQLoginState(res.data)
    },
    onSuccess: (state) => {
      setLoginState(state)
      setPolling(true)
    },
    onError: (err) => error(apiErrorMessage(err, copy.qqLoginFailed)),
  })

  useEffect(() => {
    if (!current?.id || !loginState?.session_key || loginState.connected || !polling) {
      return
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await api.post(`/user/message-channels/${current.id}/qq/login/wait`, {
          session_key: loginState.session_key,
        })
        const state = normalizeQQLoginState({ ...loginState, ...res.data })
        setLoginState(state)
        if (state.connected) {
          setPolling(false)
          success(copy.qqConnected)
          queryClient.invalidateQueries({ queryKey: channelQueryKey })
        } else if (state.status === "expired") {
          setPolling(false)
          error(copy.qqLoginExpired)
        }
      } catch (err) {
        setPolling(false)
        error(apiErrorMessage(err, copy.qqLoginFailed))
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [copy.qqConnected, copy.qqLoginExpired, copy.qqLoginFailed, current?.id, error, loginState, polling, queryClient, success])

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-medium">{copy.qqQrLogin}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {current?.bot_token_configured ? copy.qqConfigured : copy.qqNotConfigured}
          </div>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={startLogin.isPending || !current?.id} onClick={() => startLogin.mutate()}>
          <QrCode size={16} />
          {startLogin.isPending ? copy.qqStarting : copy.qqStartLogin}
        </Button>
      </div>
      {loginState?.qr_data_url && (
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <img src={loginState.qr_data_url} alt={copy.qqQrLogin} className="h-40 w-40 rounded-md border bg-white p-2" />
          <div className="space-y-2 text-sm">
            <div>{loginState.connected ? copy.qqConnected : copy.qqWaiting}</div>
            {loginState.qrcode_url && <div className="break-all font-mono text-xs text-muted-foreground">{loginState.qrcode_url}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function WeixinLoginPanel({ copy, current }: { copy: CopyText; current?: MessageChannel }) {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [loginState, setLoginState] = useState<WeixinLoginState | null>(null)
  const [polling, setPolling] = useState(false)

  const startLogin = useMutation({
    mutationFn: async () => {
      if (!current?.id) throw new Error(copy.weixinSaveFirst)
      const res = await api.post(`/user/message-channels/${current.id}/weixin/login/start`)
      return normalizeWeixinLoginState(res.data)
    },
    onSuccess: (state) => {
      setLoginState(state)
      setPolling(true)
    },
    onError: (err) => error(apiErrorMessage(err, copy.weixinLoginFailed)),
  })

  useEffect(() => {
    if (!current?.id || !loginState?.session_key || loginState.connected || !polling) {
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const res = await api.post(`/user/message-channels/${current.id}/weixin/login/wait`, {
          session_key: loginState.session_key,
          timeout_ms: 10000,
        })
        if (cancelled) return
        const next = normalizeWeixinLoginState({ ...res.data, session_key: loginState.session_key, qrcode_url: loginState.qrcode_url, qr_data_url: loginState.qr_data_url })
        setLoginState(next)
        if (next.connected) {
          setPolling(false)
          success(copy.weixinConnected)
          queryClient.invalidateQueries({ queryKey: channelQueryKey })
          return
        }
        if (next.status === "expired") {
          setPolling(false)
          return
        }
        timer = setTimeout(poll, 1200)
      } catch (err) {
        if (cancelled) return
        setLoginState((state) => state ? { ...state, message: apiErrorMessage(err, copy.weixinLoginFailed) } : state)
        timer = setTimeout(poll, 2500)
      }
    }
    timer = setTimeout(poll, 300)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [copy.weixinConnected, copy.weixinLoginFailed, current?.id, error, loginState?.connected, loginState?.qr_data_url, loginState?.qrcode_url, loginState?.session_key, polling, queryClient, success])

  if (!current?.id) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {copy.weixinSaveFirst}
      </div>
    )
  }

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-medium">{copy.weixinQrLogin}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {current.bot_token_configured ? copy.weixinConfigured : copy.weixinNotConfigured}
          </div>
        </div>
        <Button variant="outline" className="gap-2" disabled={startLogin.isPending} onClick={() => startLogin.mutate()}>
          <QrCode size={16} />
          {startLogin.isPending ? copy.weixinStarting : copy.weixinStartLogin}
        </Button>
      </div>
      {loginState && (
        <div className="mt-4 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          {loginState.qr_data_url ? (
            <img src={loginState.qr_data_url} alt={copy.weixinQrLogin} className="h-48 w-48 rounded-md border bg-white p-2" />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-md border text-sm text-muted-foreground">QR</div>
          )}
          <div className="min-w-0 space-y-2 text-sm">
            <div className="font-medium">{loginState.connected ? copy.weixinConnected : (loginState.message || copy.weixinWaiting)}</div>
            <div className="text-muted-foreground">{copy.status}: {loginState.status || "wait"}</div>
            {loginState.qrcode_url && (
              <a className="block break-all text-primary underline-offset-4 hover:underline" href={loginState.qrcode_url} target="_blank" rel="noreferrer">
                {loginState.qrcode_url}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TencentChannelLoginPanel({ copy, current, autoStartKey }: { copy: CopyText; current?: MessageChannel; autoStartKey: string | number }) {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [loginState, setLoginState] = useState<TencentChannelLoginState | null>(null)
  const startedAutoKey = useRef<string | number>("")

  const startLogin = useMutation({
    mutationFn: async () => {
      if (!current?.id) throw new Error(copy.tencentSaveFirst)
      const res = await api.post(`/user/message-channels/${current.id}/tencent-channel/login/start`)
      return normalizeTencentChannelLoginState(res.data)
    },
    onSuccess: (state) => setLoginState(state),
    onError: (err) => error(apiErrorMessage(err, copy.tencentLoginFailed)),
  })

  const finishLogin = useMutation({
    mutationFn: async () => {
      if (!current?.id) throw new Error(copy.tencentSaveFirst)
      const res = await api.post(`/user/message-channels/${current.id}/tencent-channel/login/wait`)
      return normalizeTencentChannelLoginState({ ...loginState, ...res.data })
    },
    onSuccess: (state) => {
      setLoginState(state)
      if (state.connected) {
        success(copy.tencentConnected)
        queryClient.invalidateQueries({ queryKey: channelQueryKey })
      }
    },
    onError: (err) => error(apiErrorMessage(err, copy.tencentLoginFailed)),
  })

  useEffect(() => {
    if (!current?.id || !autoStartKey || startedAutoKey.current === autoStartKey) {
      return
    }
    startedAutoKey.current = autoStartKey
    startLogin.mutate()
  }, [autoStartKey, current?.id])

  if (!current?.id) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {copy.tencentSaveFirst}
      </div>
    )
  }

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-medium">{copy.tencentQrLogin}</div>
          <div className="mt-1 text-sm text-muted-foreground">{copy.tencentLoginDescription}</div>
          {loginState?.cli_version && <div className="mt-1 text-xs text-muted-foreground">tencent-channel-cli {loginState.cli_version}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={startLogin.isPending} onClick={() => startLogin.mutate()}>
            <QrCode size={16} />
            {startLogin.isPending ? copy.tencentStarting : copy.tencentStartLogin}
          </Button>
          <Button variant="outline" disabled={finishLogin.isPending || !loginState} onClick={() => finishLogin.mutate()}>
            {finishLogin.isPending ? copy.tencentFinishing : copy.tencentFinishLogin}
          </Button>
        </div>
      </div>
      {loginState && (
        <div className="mt-4 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          {loginState.qr_data_url ? (
            <img src={loginState.qr_data_url} alt={copy.tencentQrLogin} className="h-48 w-48 rounded-md border bg-white p-2" />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-md border text-sm text-muted-foreground">QR</div>
          )}
          <div className="min-w-0 space-y-2 text-sm">
            <div className="font-medium">{loginState.connected ? copy.tencentConnected : (loginState.message || copy.tencentWaiting)}</div>
            <div className="text-muted-foreground">{copy.status}: {loginState.status || "pending"}</div>
            {loginState.expires_in_s > 0 && <div className="text-muted-foreground">{copy.tencentExpiresIn}: {loginState.expires_in_s}s</div>}
            {loginState.connectivity && <div className="text-muted-foreground">{copy.tencentConnectivity}: {loginState.connectivity}</div>}
            {loginState.qrcode_path && <div className="break-all font-mono text-xs text-muted-foreground">{loginState.qrcode_path}</div>}
            {loginState.qrcode_url && (
              <a className="block break-all text-primary underline-offset-4 hover:underline" href={loginState.qrcode_url} target="_blank" rel="noreferrer">
                {loginState.qrcode_url}
              </a>
            )}
            {isRecord(loginState.setup_hint) && stringValue(loginState.setup_hint.message) && (
              <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{stringValue(loginState.setup_hint.message)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RoutingTab({
  copy,
  draft,
  lookups,
  modelOptions,
  defaultModelOptions,
  onDraftChange,
}: {
  copy: CopyText
  draft: Draft
  lookups: LookupData
  modelOptions: string[]
  defaultModelOptions: string[]
  onDraftChange: (patch: Partial<Draft>) => void
}) {
  const applyAgentDefaults = (agentID: string) => {
    const agent = lookups.agents.find((item) => item.id === agentID)
    if (!agent) {
      onDraftChange({ default_agent_id: agentID })
      return
    }
    onDraftChange({
      default_agent_id: agentID,
      default_user_channel_id: agent.user_channel_id ? String(agent.user_channel_id) : "",
      default_model: agent.default_model || "",
      default_skill_ids: skillIDsFromAgent(agent),
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabRouting}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label={copy.device} value={draft.default_device_id} onChange={(value) => onDraftChange({ default_device_id: value })}>
            <option value="">{copy.inheritNone}</option>
            {lookups.devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.online ? "" : ` (${copy.offline})`}</option>)}
          </SelectField>
          <Field label={copy.workspacePath}>
            <Input disabled={draft.default_workspace_unrestricted} value={draft.default_workspace_path} placeholder={draft.default_workspace_unrestricted ? copy.unrestrictedWorkspace : copy.workspacePathPlaceholder} onChange={(event) => onDraftChange({ default_workspace_path: event.target.value })} />
          </Field>
          <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
            <Switch checked={draft.default_workspace_unrestricted} onCheckedChange={(checked) => onDraftChange({ default_workspace_unrestricted: checked, default_workspace_path: checked ? "" : draft.default_workspace_path })} />
            {copy.unrestrictedWorkspace}
          </label>
          <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
            <Switch checked={draft.default_connector_auto_approve} onCheckedChange={(checked) => onDraftChange({ default_connector_auto_approve: checked })} />
            {copy.connectorAutoApprove}
          </label>
          <Field label={copy.commandPrefixes}>
            <Input value={draft.default_connector_command_prefixes} placeholder="go test,npm run build" onChange={(event) => onDraftChange({ default_connector_command_prefixes: event.target.value })} />
          </Field>
          <SelectField label={copy.userChannel} value={draft.default_user_channel_id} onChange={(value) => onDraftChange({ default_user_channel_id: value, default_model: "" })}>
            <option value="">{copy.inheritNone}</option>
            {lookups.catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </SelectField>
          <SelectField label={copy.model} value={draft.default_model} onChange={(value) => onDraftChange({ default_model: value })}>
            <option value="">{copy.inheritNone}</option>
            {(defaultModelOptions.length ? defaultModelOptions : modelOptions).map((model) => <option key={model} value={model}>{model}</option>)}
          </SelectField>
          <SelectField label={copy.agent} value={draft.default_agent_id} onChange={applyAgentDefaults}>
            <option value="">{copy.inheritNone}</option>
            {lookups.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </SelectField>
          <SelectField label={copy.studio} value={draft.default_agent_group_id} onChange={(value) => onDraftChange({ default_agent_group_id: value })}>
            <option value="">{copy.noStudio}</option>
            {lookups.studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
          </SelectField>
          <SelectField label={copy.replyMode} value={draft.reply_mode} onChange={(value) => onDraftChange({ reply_mode: value })}>
            <option value="mention">{copy.modeMention}</option>
            <option value="always">{copy.modeAlways}</option>
            <option value="manual">{copy.modeManual}</option>
          </SelectField>
          <SelectField label={copy.triggerMode} value={draft.trigger_mode} onChange={(value) => onDraftChange({ trigger_mode: value })}>
            <option value="mention">{copy.modeMention}</option>
            <option value="direct">{copy.modeDirect}</option>
            <option value="command">{copy.modeCommand}</option>
            <option value="manual">{copy.modeManual}</option>
          </SelectField>
          <Field label={copy.contextCount}>
            <Input type="number" min={0} max={100} value={draft.default_context_message_count} onChange={(event) => onDraftChange({ default_context_message_count: event.target.value })} />
          </Field>
          <SkillPicker copy={copy} label={copy.skills} skills={lookups.skills} selected={draft.default_skill_ids} onChange={(ids) => onDraftChange({ default_skill_ids: ids })} />
        </div>
        <Field label={copy.systemPrompt}>
          <textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.system_prompt} onChange={(event) => onDraftChange({ system_prompt: event.target.value })} />
        </Field>
      </CardContent>
    </Card>
  )
}

function GroupsTab({ copy, draft, lookups, modelOptions, onDraftChange }: { copy: CopyText; draft: Draft; lookups: LookupData; modelOptions: string[]; onDraftChange: (patch: Partial<Draft>) => void }) {
  const updateGroup = (index: number, patch: Partial<GroupConfig>) => {
    onDraftChange({ group_configs: draft.group_configs.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) })
  }
  const applyGroupAgentDefaults = (index: number, agentID: string) => {
    const agent = lookups.agents.find((item) => item.id === agentID)
    if (!agent) {
      updateGroup(index, { agent_key: agentID, agent_id: nullableNumber(agentID) })
      return
    }
    updateGroup(index, {
      agent_key: agentID,
      agent_id: nullableNumber(agentID),
      user_channel_id: agent.user_channel_id || null,
      model: agent.default_model || "",
      skill_ids: skillIDsFromAgent(agent),
    })
  }
  const addGroup = () => {
    onDraftChange({
      group_configs: [...draft.group_configs, {
        external_id: "",
        name: "",
        enabled: true,
        device_id: "",
        workspace_path: draft.default_workspace_path,
        workspace_unrestricted: draft.default_workspace_unrestricted,
        connector_auto_approve: draft.default_connector_auto_approve,
        connector_command_prefixes: commandPrefixesFromText(draft.default_connector_command_prefixes),
        user_channel_id: null,
        model: "",
        agent_id: null,
        agent_key: "",
        agent_group_id: "",
        skill_ids: [],
        context_message_count: Number(draft.default_context_message_count) || 12,
        reply_mode: "",
        trigger_mode: "",
        system_prompt_override: "",
      }],
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{copy.tabGroups}</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={addGroup}>
            <Plus size={15} />
            {copy.addGroup}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {draft.group_configs.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.noGroups}</div>
        ) : (
          <div className="space-y-3">
            {draft.group_configs.map((group, index) => (
              <div key={index} className="space-y-4 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{group.name || group.external_id || `${copy.group} #${index + 1}`}</div>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDraftChange({ group_configs: draft.group_configs.filter((_, groupIndex) => groupIndex !== index) })} aria-label={copy.delete}>
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={copy.externalGroupID}><Input value={group.external_id} onChange={(event) => updateGroup(index, { external_id: event.target.value })} /></Field>
                  <Field label={copy.groupName}><Input value={group.name} onChange={(event) => updateGroup(index, { name: event.target.value })} /></Field>
                  <SelectField label={copy.device} value={group.device_id} onChange={(value) => updateGroup(index, { device_id: value })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                  </SelectField>
                  <Field label={copy.workspacePath}><Input disabled={group.workspace_unrestricted} value={group.workspace_path} placeholder={group.workspace_unrestricted ? copy.unrestrictedWorkspace : copy.workspacePathPlaceholder} onChange={(event) => updateGroup(index, { workspace_path: event.target.value })} /></Field>
                  <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                    <Switch checked={group.workspace_unrestricted} onCheckedChange={(checked) => updateGroup(index, { workspace_unrestricted: checked, workspace_path: checked ? "" : group.workspace_path })} />
                    {copy.unrestrictedWorkspace}
                  </label>
                  <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                    <Switch checked={group.connector_auto_approve} onCheckedChange={(checked) => updateGroup(index, { connector_auto_approve: checked })} />
                    {copy.connectorAutoApprove}
                  </label>
                  <Field label={copy.commandPrefixes}><Input value={group.connector_command_prefixes.join(",")} placeholder="go test,npm run build" onChange={(event) => updateGroup(index, { connector_command_prefixes: commandPrefixesFromText(event.target.value) })} /></Field>
                  <SelectField label={copy.userChannel} value={group.user_channel_id ? String(group.user_channel_id) : ""} onChange={(value) => updateGroup(index, { user_channel_id: value ? Number(value) : null })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                  </SelectField>
                  <SelectField label={copy.model} value={group.model} onChange={(value) => updateGroup(index, { model: value })}>
                    <option value="">{copy.inheritDefault}</option>
                    {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </SelectField>
                  <SelectField label={copy.agent} value={group.agent_key || (group.agent_id ? String(group.agent_id) : "")} onChange={(value) => applyGroupAgentDefaults(index, value)}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </SelectField>
                  <SelectField label={copy.studio} value={group.agent_group_id || ""} onChange={(value) => updateGroup(index, { agent_group_id: value })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
                  </SelectField>
                  <Field label={copy.contextCount}><Input type="number" min={0} max={100} value={group.context_message_count} onChange={(event) => updateGroup(index, { context_message_count: Number(event.target.value) || 0 })} /></Field>
                  <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                    <Switch checked={group.enabled} onCheckedChange={(checked) => updateGroup(index, { enabled: checked })} />
                    {group.enabled ? copy.enabled : copy.disabledState}
                  </label>
                  <SkillPicker copy={copy} label={copy.skills} skills={lookups.skills} selected={group.skill_ids} onChange={(ids) => updateGroup(index, { skill_ids: ids })} />
                </div>
                <Field label={copy.systemPromptOverride}>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={group.system_prompt_override} onChange={(event) => updateGroup(index, { system_prompt_override: event.target.value })} />
                </Field>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AdvancedTab({ copy, draft, onAdvancedChange }: { copy: CopyText; draft: Draft; onAdvancedChange: (patch: Partial<AdvancedOptions>) => void }) {
  const options = draft.advanced_options
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabAdvanced}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={copy.temperature}><Input type="number" min={0} max={2} step={0.1} value={options.temperature ?? ""} onChange={(event) => onAdvancedChange({ temperature: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
          <Field label={copy.maxTokens}><Input type="number" min={0} value={options.max_tokens || ""} onChange={(event) => onAdvancedChange({ max_tokens: Number(event.target.value) || 0 })} /></Field>
          <Field label={copy.replyPrefix}><Input value={options.reply_prefix} onChange={(event) => onAdvancedChange({ reply_prefix: event.target.value })} /></Field>
          <Field label={copy.replySuffix}><Input value={options.reply_suffix} onChange={(event) => onAdvancedChange({ reply_suffix: event.target.value })} /></Field>
          <Field label={copy.language}><Input value={options.language} onChange={(event) => onAdvancedChange({ language: event.target.value })} /></Field>
          <Field label={copy.timezone}><Input value={options.timezone} onChange={(event) => onAdvancedChange({ timezone: event.target.value })} /></Field>
          <SelectField label={copy.mentionPolicy} value={options.mention_policy} onChange={(value) => onAdvancedChange({ mention_policy: value })}>
            <option value="default">{copy.defaultOption}</option>
            <option value="strip">{copy.stripMentions}</option>
            <option value="preserve">{copy.preserveMentions}</option>
          </SelectField>
          <SelectField label={copy.attachmentMode} value={options.attachment_mode} onChange={(value) => onAdvancedChange({ attachment_mode: value })}>
            <option value="ignore">{copy.ignoreAttachments}</option>
            <option value="text">{copy.textAttachments}</option>
            <option value="vision">{copy.visionAttachments}</option>
          </SelectField>
          <SelectField label={copy.threadMode} value={options.thread_mode} onChange={(value) => onAdvancedChange({ thread_mode: value })}>
            <option value="channel">{copy.threadChannel}</option>
            <option value="thread">{copy.threadNative}</option>
          </SelectField>
          <Field label={copy.dedupWindow}><Input type="number" min={0} value={options.deduplication_window_seconds || ""} onChange={(event) => onAdvancedChange({ deduplication_window_seconds: Number(event.target.value) || 0 })} /></Field>
          <Field label={copy.responseTimeout}><Input type="number" min={0} value={options.response_timeout_seconds || ""} onChange={(event) => onAdvancedChange({ response_timeout_seconds: Number(event.target.value) || 0 })} /></Field>
        </div>
        <Field label={copy.errorFallback}><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={options.error_fallback} onChange={(event) => onAdvancedChange({ error_fallback: event.target.value })} /></Field>
        <Field label={copy.providerJSON}><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" value={options.custom_provider_config_json} onChange={(event) => onAdvancedChange({ custom_provider_config_json: event.target.value })} /></Field>
      </CardContent>
    </Card>
  )
}

function MessagesTab({ copy, channelID }: { copy: CopyText; channelID: number }) {
  const { data: messages = [] } = useQuery<MessageRecord[]>({
    queryKey: ["message-channel-messages", channelID],
    queryFn: async () => {
      const res = await api.get(`/user/message-channels/${channelID}/messages`)
      return Array.isArray(res.data) ? res.data.map(normalizeMessage).filter(Boolean) as MessageRecord[] : []
    },
  })
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabMessages}</CardTitle></CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.noMessages}</div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge>{message.direction}</Badge>
                  <Badge muted>{message.status}</Badge>
                  <span>{message.external_chat_id || "-"}</span>
                  <span>{formatDateTime(message.created_at) || "-"}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap">{message.content || "-"}</div>
                {message.error && <div className="mt-2 text-xs text-destructive">{message.error}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label}>
      <Select value={String((value) || "__shadcn_empty__")} onValueChange={(value) => onChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
        {children}
      </SelectContent></Select>
    </Field>
  )
}

function SkillPicker({ copy, label, skills, selected, onChange }: { copy: CopyText; label: string; skills: IDName[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedSkills = skills.filter((skill) => selectedSet.has(skill.id))
  const availableSkills = skills.filter((skill) => !selectedSet.has(skill.id))
  const toggleSkill = (skillID: string) => {
    onChange(selectedSet.has(skillID) ? selected.filter((id) => id !== skillID) : [...selected, skillID])
  }
  const addSkill = (skillID: string) => {
    if (!selectedSet.has(skillID)) {
      onChange([...selected, skillID])
    }
    setOpen(false)
  }

  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{label}</div>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-2" onClick={() => setOpen(true)}>
          <Plus size={14} />
          {copy.addSkills}
        </Button>
      </div>
      <div className="min-h-10 rounded-md border p-2">
        {selectedSkills.length === 0 ? (
          <div className="px-1 py-1 text-sm text-muted-foreground">{copy.noSelectedSkills}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedSkills.map((skill) => (
              <button key={skill.id} type="button" className="rounded border bg-muted px-2 py-1 text-xs hover:bg-muted/80" onClick={() => toggleSkill(skill.id)}>
                {skill.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {availableSkills.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">-</div>
            ) : availableSkills.map((skill) => {
              return (
                <button
                  key={skill.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => addSkill(skill.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{skill.name}</span>
                    {skill.description && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{skill.description}</span>}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{copy.add}</span>
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{copy.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QQIntentsPicker({ copy, value, onChange }: { copy: CopyText; value: string; onChange: (value: string) => void }) {
  const selected = parseQQIntentValue(value)
  const toggle = (bit: number, checked: boolean) => {
    const next = checked ? selected | bit : selected & ~bit
    onChange(String(next || defaultQQIntentValue))
  }
  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <div className="font-medium">{copy.qqIntents}</div>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {qqIntentOptions.map((option) => (
          <label key={option.bit} className="flex items-center gap-2 text-sm">
            <Switch checked={(selected & option.bit) === option.bit} onCheckedChange={(checked) => toggle(option.bit, checked)} />
            <span className="min-w-0 flex-1 truncate">{copy[option.labelKey]}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{option.bit}</span>
          </label>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{copy.qqIntentsValue}: {selected}</div>
    </div>
  )
}

function Badge({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>{children}</span>
}

interface LookupData {
  catalog: UserChannelCatalog[]
  agents: ChatAgentOption[]
  studios: StudioOption[]
  skills: IDName[]
  devices: Device[]
}

function useChannels() {
  return useQuery<MessageChannel[]>({
    queryKey: channelQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/message-channels")
      return Array.isArray(res.data) ? res.data.map(normalizeChannel).filter(Boolean) as MessageChannel[] : []
    },
  })
}

function useMessageChannelSettings() {
  return useQuery<MessageChannelSettings>({
    queryKey: ["message-channel-settings"],
    queryFn: async () => {
      const res = await api.get("/user/message-channels/settings")
      const data = isRecord(res.data) ? res.data : {}
      return {
        enabled: data.enabled === true,
        providers: Array.isArray(data.providers) ? data.providers.map(normalizeChannelProvider).filter((provider): provider is ChannelProviderDescriptor => Boolean(provider)) : providerOptions,
      }
    },
  })
}

function useLookups(): LookupData {
  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })
  const { data: agents = [] } = useQuery<ChatAgentOption[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeAgentOption).filter(Boolean) as ChatAgentOption[] : []
    },
  })
  const { data: studios = [] } = useQuery<StudioOption[]>({
    queryKey: ["advanced-chat-agent-groups"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups")
      const data = isRecord(res.data) ? res.data : {}
      const groups = Array.isArray(data.groups) ? data.groups : []
      return groups.map(normalizeStudioOption).filter((item): item is StudioOption => Boolean(item))
    },
  })
  const { data: skills = [] } = useQuery<IDName[]>({
    queryKey: ["advanced-chat-skills"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data) ? res.data.map(normalizeIDName).filter(Boolean) as IDName[] : []
    },
  })
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["advanced-chat-connector-devices"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeDevice).filter(Boolean) as Device[] : []
    },
  })
  return { catalog, agents, studios, skills, devices }
}

function draftToPayload(draft: Draft) {
  return {
    name: draft.name.trim(),
    provider: draft.provider,
    bot_token: providerUsesBotToken(draft.provider) ? draft.bot_token.trim() || undefined : undefined,
    enabled: draft.enabled,
    default_device_id: draft.default_device_id,
    default_workspace_path: draft.default_workspace_path.trim(),
    default_workspace_unrestricted: draft.default_workspace_unrestricted,
    default_connector_auto_approve: draft.default_connector_auto_approve,
    default_connector_command_prefixes: commandPrefixesFromText(draft.default_connector_command_prefixes),
    default_user_channel_id: draft.default_user_channel_id ? Number(draft.default_user_channel_id) : null,
    default_model: draft.default_model,
    default_agent_id: numericAgentID(draft.default_agent_id),
    default_agent_key: draft.default_agent_id,
    default_agent_group_id: draft.default_agent_group_id,
    default_skill_ids: draft.default_skill_ids,
    default_context_message_count: Number(draft.default_context_message_count) || 0,
    reply_mode: draft.reply_mode,
    trigger_mode: draft.trigger_mode,
    system_prompt: draft.system_prompt,
    group_configs: draft.group_configs.map((group) => ({
      ...group,
      agent_id: numericAgentID(group.agent_key || (group.agent_id ? String(group.agent_id) : "")),
      agent_key: group.agent_key || (group.agent_id ? String(group.agent_id) : ""),
    })),
    advanced_options: advancedOptionsForPayload(draft),
  }
}

function providerUsesBotToken(provider: string) {
  return provider === "telegram" || provider === "discord"
}

const defaultQQIntentValue = 513
const qqIntentOptions = [
  { bit: 1, labelKey: "qqIntentGuilds" },
  { bit: 512, labelKey: "qqIntentGuildMessages" },
  { bit: 4096, labelKey: "qqIntentDirectMessage" },
  { bit: 1 << 25, labelKey: "qqIntentGroupAndC2C" },
  { bit: 1 << 30, labelKey: "qqIntentPublicGuildMessages" },
] as const

function parseQQIntentValue(value: string) {
  const parsed = Number(value || defaultQQIntentValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultQQIntentValue
}

function advancedOptionsForPayload(draft: Draft): AdvancedOptions {
  if (draft.provider !== "qq") {
    return draft.advanced_options
  }
  const config = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  config.connection_mode = normalizeQQConnectionMode(config.connection_mode)
  return { ...draft.advanced_options, custom_provider_config_json: stringifyProviderConfig(config) }
}

function normalizeQQConnectionMode(value: unknown) {
  return stringValue(value).toLowerCase() === "websocket" || stringValue(value).toLowerCase() === "ws" ? "websocket" : "webhook"
}

function channelToDraft(channel: MessageChannel): Draft {
  return {
    id: channel.id,
    name: channel.name,
    provider: normalizeProviderValue(channel.provider),
    bot_token: "",
    enabled: channel.enabled,
    default_device_id: channel.default_device_id || "",
    default_workspace_path: channel.default_workspace_path || "",
    default_workspace_unrestricted: channel.default_workspace_unrestricted === true,
    default_connector_auto_approve: channel.default_connector_auto_approve === true,
    default_connector_command_prefixes: (channel.default_connector_command_prefixes || []).join(", "),
    default_user_channel_id: channel.default_user_channel_id ? String(channel.default_user_channel_id) : "",
    default_model: channel.default_model || "",
    default_agent_id: channel.default_agent_key || (channel.default_agent_id ? String(channel.default_agent_id) : ""),
    default_agent_group_id: channel.default_agent_group_id || "",
    default_skill_ids: channel.default_skill_ids || [],
    default_context_message_count: String(channel.default_context_message_count || 12),
    reply_mode: channel.reply_mode || "mention",
    trigger_mode: channel.trigger_mode || "mention",
    system_prompt: channel.system_prompt || "",
    group_configs: channel.group_configs || [],
    advanced_options: { ...emptyAdvancedOptions, ...(channel.advanced_options || {}) },
  }
}

function normalizeChannel(value: unknown): MessageChannel | null {
  if (!isRecord(value) || !Number(value.id)) return null
  return {
    id: Number(value.id),
    name: stringValue(value.name),
    provider: stringValue(value.provider) || "telegram",
    enabled: value.enabled !== false,
    bot_token_configured: value.bot_token_configured === true,
    bot_token_preview: stringValue(value.bot_token_preview),
    webhook_path: stringValue(value.webhook_path),
    default_device_id: stringValue(value.default_device_id),
    default_workspace_path: stringValue(value.default_workspace_path),
    default_workspace_unrestricted: value.default_workspace_unrestricted === true,
    default_connector_auto_approve: value.default_connector_auto_approve === true,
    default_connector_command_prefixes: stringArray(value.default_connector_command_prefixes),
    default_user_channel_id: nullableNumber(value.default_user_channel_id),
    default_model: stringValue(value.default_model),
    default_agent_id: nullableNumber(value.default_agent_id),
    default_agent_key: stringValue(value.default_agent_key),
    default_agent_group_id: stringValue(value.default_agent_group_id),
    default_skill_ids: skillIDArray(value.default_skill_ids),
    default_context_message_count: Number(value.default_context_message_count || 12),
    reply_mode: stringValue(value.reply_mode) || "mention",
    trigger_mode: stringValue(value.trigger_mode) || "mention",
    system_prompt: stringValue(value.system_prompt),
    group_configs: Array.isArray(value.group_configs) ? value.group_configs.map(normalizeGroup).filter(Boolean) as GroupConfig[] : [],
    advanced_options: normalizeAdvancedOptions(value.advanced_options),
    last_event_at: stringValue(value.last_event_at),
    created_at: stringValue(value.created_at),
    updated_at: stringValue(value.updated_at),
  }
}

function normalizeProviderValue(value: unknown): ChannelProvider {
  switch (stringValue(value).toLowerCase()) {
    case "discord":
      return "discord"
    case "qq":
    case "qq-official":
    case "qq_official":
      return "qq"
    case "onebot":
    case "one-bot":
    case "one_bot":
      return "onebot"
    case "weixin":
    case "wechat":
    case "we-chat":
    case "we_chat":
      return "weixin"
    case "tencent_channel":
    case "tencent-channel":
    case "qq_channel":
    case "qq-channel":
      return "tencent_channel"
    default:
      return "telegram"
  }
}

function normalizeChannelProvider(value: unknown): ChannelProviderDescriptor | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  const config = isRecord(value.config) ? value.config : undefined
  const fields = config && Array.isArray(config.fields)
    ? config.fields.map(normalizeChannelConfigField).filter((field): field is ChannelConfigField => Boolean(field))
    : []
  return {
    id,
    name: stringValue(value.name) || id,
    description: stringValue(value.description),
    plugin_id: stringValue(value.plugin_id) || undefined,
    config: config ? { fields } : undefined,
  }
}

function normalizeChannelConfigField(value: unknown): ChannelConfigField | null {
  if (!isRecord(value)) return null
  const name = stringValue(value.name)
  if (!name) return null
  const options = Array.isArray(value.options)
    ? value.options.map((option) => {
      if (!isRecord(option)) return null
      const optionValue = stringValue(option.value)
      return optionValue ? { value: optionValue, label: stringValue(option.label) || optionValue } : null
    }).filter((option): option is ChannelConfigOption => Boolean(option))
    : []
  return {
    name,
    type: stringValue(value.type).toLowerCase() || "input",
    label: stringValue(value.label) || name,
    description: stringValue(value.description),
    placeholder: stringValue(value.placeholder),
    required: value.required === true,
    default: value.default,
    options,
    min: typeof value.min === "number" || typeof value.min === "string" ? value.min : undefined,
    max: typeof value.max === "number" || typeof value.max === "string" ? value.max : undefined,
    step: typeof value.step === "number" || typeof value.step === "string" ? value.step : undefined,
  }
}

function normalizeAdvancedOptions(value: unknown): AdvancedOptions {
  const item = isRecord(value) ? value : {}
  return {
    ...emptyAdvancedOptions,
    temperature: item.temperature === null || item.temperature === undefined ? null : Number(item.temperature),
    max_tokens: Number(item.max_tokens || 0),
    reply_prefix: stringValue(item.reply_prefix),
    reply_suffix: stringValue(item.reply_suffix),
    language: stringValue(item.language),
    timezone: stringValue(item.timezone),
    mention_policy: stringValue(item.mention_policy) || "default",
    attachment_mode: stringValue(item.attachment_mode) || "ignore",
    thread_mode: stringValue(item.thread_mode) || "channel",
    deduplication_window_seconds: Number(item.deduplication_window_seconds || 0),
    response_timeout_seconds: Number(item.response_timeout_seconds || 0),
    error_fallback: stringValue(item.error_fallback),
    custom_provider_config_json: stringValue(item.custom_provider_config_json),
  }
}

function normalizeGroup(value: unknown): GroupConfig | null {
  if (!isRecord(value)) return null
  return {
    external_id: stringValue(value.external_id),
    name: stringValue(value.name),
    enabled: value.enabled !== false,
    device_id: stringValue(value.device_id),
    workspace_path: stringValue(value.workspace_path),
    workspace_unrestricted: value.workspace_unrestricted === true,
    connector_auto_approve: value.connector_auto_approve === true,
    connector_command_prefixes: stringArray(value.connector_command_prefixes),
    user_channel_id: nullableNumber(value.user_channel_id),
    model: stringValue(value.model),
    agent_id: nullableNumber(value.agent_id),
    agent_key: stringValue(value.agent_key) || (nullableNumber(value.agent_id) ? String(nullableNumber(value.agent_id)) : ""),
    agent_group_id: stringValue(value.agent_group_id),
    skill_ids: skillIDArray(value.skill_ids),
    context_message_count: Number(value.context_message_count || 0),
    reply_mode: stringValue(value.reply_mode),
    trigger_mode: stringValue(value.trigger_mode),
    system_prompt_override: stringValue(value.system_prompt_override),
  }
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: stringValue(item.name),
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function normalizeIDName(value: unknown): IDName | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id) || (Number(value.id) ? String(Number(value.id)) : "")
  if (!id) return null
  return { id, name: stringValue(value.name) || id, description: stringValue(value.description) }
}

function normalizeAgentOption(value: unknown): ChatAgentOption | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id) || (Number(value.id) ? String(Number(value.id)) : "")
  if (!id) return null
  return {
    id,
    name: stringValue(value.name) || id,
    default_model: stringValue(value.default_model),
    user_channel_id: nullableNumber(value.user_channel_id) || undefined,
    skill_ids: stringArray(value.skill_ids),
  }
}

function normalizeStudioOption(value: unknown): StudioOption | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return { id, name: stringValue(value.name) || id }
}

function normalizeDevice(value: unknown): Device | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id, online: value.online === true } : null
}

function normalizeMessage(value: unknown): MessageRecord | null {
  if (!isRecord(value) || !Number(value.id)) return null
  return {
    id: Number(value.id),
    direction: stringValue(value.direction),
    status: stringValue(value.status),
    external_chat_id: stringValue(value.external_chat_id),
    content: stringValue(value.content),
    error: stringValue(value.error),
    created_at: stringValue(value.created_at),
  }
}

function normalizeWeixinLoginState(value: unknown): WeixinLoginState {
  const item = isRecord(value) ? value : {}
  return {
    session_key: stringValue(item.session_key),
    qrcode_url: stringValue(item.qrcode_url),
    qr_data_url: stringValue(item.qr_data_url),
    status: stringValue(item.status),
    message: stringValue(item.message) || stringValue(item.error),
    connected: item.connected === true,
  }
}

function normalizeQQLoginState(value: unknown): QQLoginState {
  const item = isRecord(value) ? value : {}
  return {
    session_key: stringValue(item.session_key),
    qrcode_url: stringValue(item.qrcode_url),
    qr_data_url: stringValue(item.qr_data_url),
    status: stringValue(item.status),
    connected: item.connected === true,
  }
}

function normalizeTencentChannelLoginState(value: unknown): TencentChannelLoginState {
  const item = isRecord(value) ? value : {}
  const data = isRecord(item.data) ? item.data : item
  const status = firstStringValue(item.status, data.status)
  const connected = item.connected === true || ["authorized", "connected", "success", "ok"].includes(status.toLowerCase())
  const expires = Number(item.expires_in_s || data.expires_in_s || data.expires_in || 0)
  return {
    qrcode_url: firstStringValue(item.qrcode_url, data.qrcode_url, data.qr_url, data.verification_uri),
    verification_uri: firstStringValue(item.verification_uri, data.verification_uri),
    qr_data_url: firstStringValue(item.qr_data_url, data.qr_data_url) || qrCodeDataURLFromBase64(firstStringValue(item.qr_code, item.qrcode, data.qr_code, data.qrcode, data.qr_code_base64, data.qrcode_base64)),
    qrcode_path: firstStringValue(item.qrcode_path, data.qrcode_path),
    status,
    message: firstStringValue(item.message, data.message, item.error, data.error),
    connected,
    cli_version: firstStringValue(item.cli_version, data.cli_version),
    connectivity: firstStringValue(item.connectivity, data.connectivity),
    expires_in_s: Number.isFinite(expires) ? expires : 0,
    setup_hint: item.setup_hint || data.setup_hint,
  }
}

function normalizeTencentGuildOptions(value: unknown): TencentGuildOption[] {
  const item = isRecord(value) ? value : {}
  const data = isRecord(item.data) ? item.data : item
  const groups = [
    ...(Array.isArray(data.managed_guilds) ? data.managed_guilds : []),
    ...(Array.isArray(data.created_guilds) ? data.created_guilds : []),
    ...(Array.isArray(data.joined_guilds) ? data.joined_guilds : []),
  ]
  const seen = new Set<string>()
  const result: TencentGuildOption[] = []
  for (const group of groups) {
    if (!isRecord(group)) continue
    const id = scalarString(group.guild_id || group.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      name: firstNonEmptyScalar(group.name, group.guild_name, id),
      role: firstNonEmptyScalar(group.role),
    })
  }
  return result
}

function normalizeTencentChannelOptions(value: unknown): TencentChannelOption[] {
  const item = isRecord(value) ? value : {}
  const data = isRecord(item.data) ? item.data : item
  const channels = Array.isArray(data.channels) ? data.channels : []
  return channels.map((channel) => {
    if (!isRecord(channel)) return null
    const id = scalarString(channel.channel_id || channel.id)
    if (!id) return null
    return {
      id,
      name: firstNonEmptyScalar(channel.channel_name, channel.name, id),
      guild_id: scalarString(channel.guild_id),
    }
  }).filter((channel): channel is TencentChannelOption => Boolean(channel))
}

function scalarString(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function firstNonEmptyScalar(...values: unknown[]) {
  for (const value of values) {
    const text = scalarString(value)
    if (text) return text
  }
  return ""
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function nullableNumber(value: unknown) {
  const next = Number(value || 0)
  return Number.isFinite(next) && next > 0 ? next : null
}

function skillIDArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : []
}

function numericAgentID(value: string) {
  const id = Number(value || 0)
  return Number.isFinite(id) && id > 0 ? id : null
}

function skillIDsFromAgent(agent: ChatAgentOption) {
  return skillIDArray(agent.skill_ids)
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => stringValue(item).trim()).filter(Boolean) : []
}

function commandPrefixesFromText(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value).trim()
    if (text) return text
  }
  return ""
}

function qrCodeDataURLFromBase64(value: string) {
  const text = value.trim()
  if (!text) return ""
  if (text.startsWith("data:image/")) return text
  return `data:image/png;base64,${text}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function formatDateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function parseProviderConfig(raw: string): Record<string, string> {
  if (!raw.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return {}
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]))
  } catch {
    return {}
  }
}

function stringifyProviderConfig(config: Record<string, string>) {
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, value]) => value.trim() !== ""))
  return Object.keys(cleaned).length ? JSON.stringify(cleaned, null, 2) : ""
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = {
  title: "消息通道",
  subtitle: "管理接入 AI 平台的 Telegram 和 Discord 机器人。",
  disabled: "管理员尚未启用消息通道。",
  empty: "暂无消息通道。",
  newChannel: "新建通道",
  details: "详情",
  back: "返回列表",
  defaultName: "Telegram 机器人",
  enabled: "启用",
  disabledState: "停用",
  groups: "群配置",
  lastEvent: "最近事件",
  tabBasic: "基础",
  tabConnection: "连接设置",
  tabTencentChannel: "腾讯频道",
  tabRouting: "默认路由",
  tabGroups: "群配置",
  tabAdvanced: "高级",
  tabMessages: "消息",
  name: "名称",
  provider: "渠道",
  botToken: "Bot Token",
  telegramBotToken: "Telegram bot token",
  discordBotToken: "Discord bot token",
  botTokenPlaceholder: "输入机器人 token",
  status: "状态",
  webhook: "Webhook",
  copy: "复制",
  copied: "已复制",
  loading: "加载中...",
  device: "设备开发环境",
  workspacePath: "工作目录",
  workspacePathPlaceholder: "例如 D:\\dev\\project",
  unrestrictedWorkspace: "不限工作目录",
  connectorAutoApprove: "自动批准写入/编辑",
  commandPrefixes: "自动批准命令前缀",
  userChannel: "用户渠道",
  model: "模型",
  agent: "代理",
  studio: "工作室",
  noStudio: "不使用工作室",
  skills: "Skills",
  contextCount: "上下文消息数量",
  replyMode: "回复模式",
  triggerMode: "触发模式",
  modeMention: "被提及时",
  modeAlways: "总是回复",
  modeManual: "手动",
  modeDirect: "私聊/直接消息",
  modeCommand: "命令触发",
  systemPrompt: "系统提示词",
  add: "添加",
  added: "已添加",
  addSkills: "添加技能",
  noSelectedSkills: "未添加技能",
  close: "关闭",
  addGroup: "添加群配置",
  noGroups: "暂无群级覆盖配置。",
  group: "群",
  groupName: "群名称",
  externalGroupID: "外部群/频道 ID",
  inheritNone: "不指定",
  inheritDefault: "继承默认",
  offline: "离线",
  systemPromptOverride: "群级提示词覆盖",
  temperature: "Temperature",
  maxTokens: "最大输出 tokens",
  replyPrefix: "回复前缀",
  replySuffix: "回复后缀",
  language: "语言",
  timezone: "时区",
  mentionPolicy: "提及处理",
  defaultOption: "默认",
  stripMentions: "移除提及",
  preserveMentions: "保留提及",
  attachmentMode: "附件处理",
  ignoreAttachments: "忽略",
  textAttachments: "按文本",
  visionAttachments: "视觉输入",
  threadMode: "会话模式",
  threadChannel: "按群/频道",
  threadNative: "按原生线程",
  dedupWindow: "去重窗口（秒）",
  responseTimeout: "回复超时（秒）",
  errorFallback: "错误兜底回复",
  providerJSON: "渠道扩展 JSON",
  telegramBaseURL: "Telegram Bot API 地址",
  telegramParseMode: "Telegram 解析模式",
  discordBaseURL: "Discord API 地址",
  qqBotID: "QQ 机器人 ID",
  qqBotSecret: "QQ 机器人 Secret",
  qqBotSecretPlaceholder: "输入 QQ 机器人 Secret",
  qqConnectionMode: "QQ 接入方式",
  qqConnectionWebhook: "Webhook",
  qqConnectionWebSocket: "WebSocket",
  qqBaseURL: "QQ 官方 API 地址",
  qqTokenURL: "QQ 调用凭证地址",
  qqIntents: "QQ 事件 Intents",
  qqIntentsValue: "当前值",
  qqIntentGuilds: "频道基础事件",
  qqIntentGuildMessages: "频道消息事件",
  qqIntentDirectMessage: "私信事件",
  qqIntentGroupAndC2C: "群聊与单聊事件",
  qqIntentPublicGuildMessages: "公域频道消息事件",
  qqShard: "QQ 分片",
  qqMsgType: "QQ 消息类型",
  qqMsgTypeText: "文本",
  qqMsgTypeMarkdown: "Markdown",
  qqQrLogin: "QQ 扫码绑定",
  qqConfigured: "已保存 QQ Bot 凭据，可重新扫码换绑。",
  qqNotConfigured: "尚未配置 QQ Bot，可扫码自动绑定，也可手动填写 AppID 和 Secret。",
  qqSaveFirst: "请先保存 QQ 官方通道，再生成二维码。",
  qqStartLogin: "生成二维码",
  qqStarting: "生成中...",
  qqWaiting: "等待手机 QQ 扫码确认。",
  qqConnected: "QQ Bot 已绑定",
  qqLoginExpired: "QQ 二维码已过期",
  qqLoginFailed: "QQ 扫码绑定失败",
  oneBotBaseURL: "OneBot HTTP 地址",
  oneBotAccessToken: "OneBot Access Token",
  oneBotAction: "OneBot 发送 action",
  weixinBaseURL: "微信 iLink API 地址",
  weixinCDNBaseURL: "微信 CDN 地址",
  weixinAccountID: "微信 Bot 账号",
  weixinUserID: "扫码用户",
  weixinAccountPending: "扫码连接后自动填充",
  weixinQrLogin: "微信扫码登录",
  weixinConfigured: "已保存微信 Bot token，可重新扫码换绑。",
  weixinNotConfigured: "尚未连接微信，请生成二维码并用手机微信扫码。",
  weixinSaveFirst: "请先保存微信通道，再生成二维码登录。",
  weixinStartLogin: "生成二维码",
  weixinStarting: "生成中...",
  weixinWaiting: "等待扫码确认。",
  weixinConnected: "微信已连接",
  weixinLoginFailed: "微信登录失败",
  tencentGuildID: "默认频道 ID",
  tencentChannelID: "默认版块 ID",
  tencentGuild: "频道",
  tencentChannel: "版块",
  tencentSelectGuild: "请选择频道",
  tencentSelectChannel: "请选择版块",
  tencentSelectGuildFirst: "请先选择频道。",
  tencentRefreshGuilds: "刷新频道",
  tencentRefreshChannels: "刷新版块",
  tencentGuildsLoaded: "腾讯频道列表已加载",
  tencentGuildsFailed: "加载腾讯频道列表失败",
  tencentChannelsLoaded: "版块列表已加载",
  tencentChannelsFailed: "加载版块列表失败",
  tencentCLIProfile: "CLI 配置档",
  tencentGatewayEnabled: "Gateway 轮询",
  tencentPollMentions: "监听被 @",
  tencentPollPosts: "轮询帖子",
  tencentAutoReplyMentions: "被 @ 后自动回复",
  tencentReplyMode: "回复落点",
  tencentReplyCommentPost: "评论帖子",
  tencentReplyExistingComment: "回复评论",
  tencentPollInterval: "轮询间隔（秒）",
  tencentMaxEvents: "单次事件上限",
  tencentDefaultGetType: "默认帖子排序",
  tencentNewest: "最新",
  tencentHot: "热门",
  tencentConnectorDevice: "腾讯频道连接器",
  tencentSelectConnector: "请选择连接器",
  tencentConnectorRequired: "腾讯频道必须通过连接器运行，本机连接器需要先安装 tencent-channel-cli。",
  tencentQrLogin: "腾讯频道扫码登录",
  tencentLoginDescription: "保存后通过所选连接器执行 tencent-channel-cli login --json --yes 强制获取登录二维码。",
  tencentSaveFirst: "请先保存腾讯频道，并选择一个连接器。",
  tencentStartLogin: "生成二维码",
  tencentStarting: "生成中...",
  tencentFinishLogin: "完成登录",
  tencentFinishing: "确认中...",
  tencentWaiting: "请扫码或打开授权链接完成授权，然后点击完成登录。",
  tencentConnected: "腾讯频道已登录",
  tencentLoginFailed: "腾讯频道登录失败",
  tencentExpiresIn: "有效期",
  tencentConnectivity: "连通性",
  connectionHint: "这些连接设置会自动保存到渠道扩展配置中，并由对应渠道发送消息时读取。",
  noMessages: "暂无消息记录。",
  save: "保存",
  saving: "保存中...",
  saved: "消息通道已保存",
  saveFailed: "保存消息通道失败",
  delete: "删除",
  deleted: "消息通道已删除",
  enabledSaved: "消息通道已启用",
  disabledSaved: "消息通道已禁用",
  enableChannel: "启用通道",
  disableChannel: "禁用通道",
  deleteFailed: "删除消息通道失败",
}

type CopyText = typeof zhCopy

const enCopy: CopyText = {
  title: "Message Channels",
  subtitle: "Manage Telegram and Discord bots connected to the AI platform.",
  disabled: "Message Channels have not been enabled by an administrator.",
  empty: "No message channels yet.",
  newChannel: "New Channel",
  details: "Details",
  back: "Back to list",
  defaultName: "Telegram bot",
  enabled: "Enabled",
  disabledState: "Disabled",
  groups: "Group configs",
  lastEvent: "Last event",
  tabBasic: "Basic",
  tabConnection: "Connection",
  tabTencentChannel: "Tencent Channel",
  tabRouting: "Default Routing",
  tabGroups: "Groups",
  tabAdvanced: "Advanced",
  tabMessages: "Messages",
  name: "Name",
  provider: "Provider",
  botToken: "Bot Token",
  telegramBotToken: "Telegram bot token",
  discordBotToken: "Discord bot token",
  botTokenPlaceholder: "Enter bot token",
  status: "Status",
  webhook: "Webhook",
  copy: "Copy",
  copied: "Copied",
  loading: "Loading...",
  device: "Device environment",
  workspacePath: "Workspace path",
  workspacePathPlaceholder: "For example D:\\dev\\project",
  unrestrictedWorkspace: "Unrestricted workspace",
  connectorAutoApprove: "Auto-approve writes/edits",
  commandPrefixes: "Auto-approved command prefixes",
  userChannel: "User channel",
  model: "Model",
  agent: "Agent",
  studio: "Studio",
  noStudio: "No studio",
  skills: "Skills",
  contextCount: "Context messages",
  replyMode: "Reply mode",
  triggerMode: "Trigger mode",
  modeMention: "On mention",
  modeAlways: "Always reply",
  modeManual: "Manual",
  modeDirect: "Direct messages",
  modeCommand: "Command",
  systemPrompt: "System prompt",
  add: "Add",
  added: "Added",
  addSkills: "Add skills",
  noSelectedSkills: "No skills selected",
  close: "Close",
  addGroup: "Add group",
  noGroups: "No per-group overrides.",
  group: "Group",
  groupName: "Group name",
  externalGroupID: "External group/channel ID",
  inheritNone: "Not set",
  inheritDefault: "Use default",
  offline: "offline",
  systemPromptOverride: "Group prompt override",
  temperature: "Temperature",
  maxTokens: "Max output tokens",
  replyPrefix: "Reply prefix",
  replySuffix: "Reply suffix",
  language: "Language",
  timezone: "Timezone",
  mentionPolicy: "Mention policy",
  defaultOption: "Default",
  stripMentions: "Strip mentions",
  preserveMentions: "Preserve mentions",
  attachmentMode: "Attachment mode",
  ignoreAttachments: "Ignore",
  textAttachments: "Text",
  visionAttachments: "Vision",
  threadMode: "Thread mode",
  threadChannel: "By channel",
  threadNative: "Native thread",
  dedupWindow: "Dedup window (seconds)",
  responseTimeout: "Response timeout (seconds)",
  errorFallback: "Error fallback reply",
  providerJSON: "Provider extension JSON",
  telegramBaseURL: "Telegram Bot API URL",
  telegramParseMode: "Telegram parse mode",
  discordBaseURL: "Discord API URL",
  qqBotID: "QQ bot ID",
  qqBotSecret: "QQ bot secret",
  qqBotSecretPlaceholder: "Enter QQ bot secret",
  qqConnectionMode: "QQ connection mode",
  qqConnectionWebhook: "Webhook",
  qqConnectionWebSocket: "WebSocket",
  qqBaseURL: "QQ Official API URL",
  qqTokenURL: "QQ access token URL",
  qqIntents: "QQ event intents",
  qqIntentsValue: "Current value",
  qqIntentGuilds: "Guild events",
  qqIntentGuildMessages: "Guild message events",
  qqIntentDirectMessage: "Direct messages",
  qqIntentGroupAndC2C: "Group and C2C events",
  qqIntentPublicGuildMessages: "Public guild messages",
  qqShard: "QQ shard",
  qqMsgType: "QQ message type",
  qqMsgTypeText: "Text",
  qqMsgTypeMarkdown: "Markdown",
  qqQrLogin: "QQ QR binding",
  qqConfigured: "QQ Bot credentials are saved. Scan again to relink.",
  qqNotConfigured: "QQ Bot is not configured. Scan to bind automatically or enter AppID and Secret manually.",
  qqSaveFirst: "Save this QQ channel before generating a QR code.",
  qqStartLogin: "Generate QR",
  qqStarting: "Generating...",
  qqWaiting: "Waiting for QQ scan confirmation.",
  qqConnected: "QQ Bot connected",
  qqLoginExpired: "QQ QR code expired",
  qqLoginFailed: "QQ QR binding failed",
  oneBotBaseURL: "OneBot HTTP URL",
  oneBotAccessToken: "OneBot access token",
  oneBotAction: "OneBot send action",
  weixinBaseURL: "Weixin iLink API URL",
  weixinCDNBaseURL: "Weixin CDN URL",
  weixinAccountID: "Weixin bot account",
  weixinUserID: "Scan user",
  weixinAccountPending: "Filled after QR login",
  weixinQrLogin: "Weixin QR login",
  weixinConfigured: "Weixin bot token is saved. Scan again to relink.",
  weixinNotConfigured: "Weixin is not connected. Generate a QR code and scan it in WeChat.",
  weixinSaveFirst: "Save this Weixin channel before generating a QR code.",
  weixinStartLogin: "Generate QR",
  weixinStarting: "Generating...",
  weixinWaiting: "Waiting for scan confirmation.",
  weixinConnected: "Weixin connected",
  weixinLoginFailed: "Weixin login failed",
  tencentGuildID: "Default guild ID",
  tencentChannelID: "Default channel ID",
  tencentGuild: "Guild",
  tencentChannel: "Channel",
  tencentSelectGuild: "Select a guild",
  tencentSelectChannel: "Select a channel",
  tencentSelectGuildFirst: "Select a guild first.",
  tencentRefreshGuilds: "Refresh guilds",
  tencentRefreshChannels: "Refresh channels",
  tencentGuildsLoaded: "Tencent Channel guilds loaded",
  tencentGuildsFailed: "Failed to load Tencent Channel guilds",
  tencentChannelsLoaded: "Channels loaded",
  tencentChannelsFailed: "Failed to load channels",
  tencentCLIProfile: "CLI profile",
  tencentGatewayEnabled: "Gateway polling",
  tencentPollMentions: "Poll mentions",
  tencentPollPosts: "Poll posts",
  tencentAutoReplyMentions: "Auto-reply mentions",
  tencentReplyMode: "Reply target",
  tencentReplyCommentPost: "Comment on post",
  tencentReplyExistingComment: "Reply to comment",
  tencentPollInterval: "Poll interval (seconds)",
  tencentMaxEvents: "Max events per poll",
  tencentDefaultGetType: "Default post order",
  tencentNewest: "Newest",
  tencentHot: "Hot",
  tencentConnectorDevice: "Tencent Channel connector",
  tencentSelectConnector: "Select a connector",
  tencentConnectorRequired: "Tencent Channel must run through a connector. Install tencent-channel-cli on the connector device first.",
  tencentQrLogin: "Tencent Channel QR login",
  tencentLoginDescription: "After saving, the selected connector runs tencent-channel-cli login --json --yes to force a fresh QR code.",
  tencentSaveFirst: "Save this Tencent Channel and select a connector first.",
  tencentStartLogin: "Generate QR",
  tencentStarting: "Generating...",
  tencentFinishLogin: "Finish login",
  tencentFinishing: "Confirming...",
  tencentWaiting: "Scan the QR code or open the auth link, then click Finish login.",
  tencentConnected: "Tencent Channel connected",
  tencentLoginFailed: "Tencent Channel login failed",
  tencentExpiresIn: "Expires in",
  tencentConnectivity: "Connectivity",
  connectionHint: "These connection settings are saved into the provider extension config and used by the selected provider when sending messages.",
  noMessages: "No messages yet.",
  save: "Save",
  saving: "Saving...",
  saved: "Message channel saved",
  saveFailed: "Failed to save message channel",
  delete: "Delete",
  deleted: "Message channel deleted",
  enabledSaved: "Message channel enabled",
  disabledSaved: "Message channel disabled",
  enableChannel: "Enable channel",
  disableChannel: "Disable channel",
  deleteFailed: "Failed to delete message channel",
}
