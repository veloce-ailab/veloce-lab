import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Edit, Eye, ListTree, Plus, Power, SlidersHorizontal, Trash } from "lucide-react"
import type { AxiosError } from "axios"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { formatCurrency, useCurrencyDisplayName } from "@/lib/currency"

interface UserChannel {
  id: number
  name: string
  description: string
  multiplier: string | number
  routing_algorithm: string
  enabled: boolean
  rate_limit_enabled: boolean
  rate_limit_requests_per_minute: number
  rate_limit_burst: number
  allowed_groups?: Array<{ id: number; group_id: number; group?: Group }>
  allowed_users?: Array<{ id: number; user_id: number; user?: AdminUserOption }>
}

interface AdminUserOption {
  id: number
  username: string
  email: string
}

interface Group {
  id: number
  name: string
  multiplier: string | number
}

interface GroupMultiplier {
  id?: number
  group_id: number
  group?: Group
  multiplier: string | number
}

interface UpstreamChannel {
  id: number
  user_channel_id?: number | null
  user_channel?: UserChannel
  name: string
  type: string
  base_url: string
  api_key: string
	plugin_config: string
  priority: number
  weight: number
  enabled: boolean
  price_sync_enabled: boolean
  price_sync_cron: string
  group_multipliers?: GroupMultiplier[]
}

interface PluginUpstreamType {
  id: string
  name: string
  description?: string
  protocol: string
	default_base_url?: string
  config?: unknown
}

interface PluginListItem {
  id: string
  enabled: boolean
  upstreams?: PluginUpstreamType[]
}

interface PluginSettingsResponse {
  config: unknown
}

interface PluginUpstreamConfigField {
  name: string
  label: string
  type: string
  description: string
  placeholder: string
  required: boolean
  options: Array<{ label: string; value: string }>
  optionsFrom: string
  optionLabel: string
  optionValue: string
}

interface ChannelModelConfig {
  id: number
  channel_id: number
  model_id: number
  model_name: string
  upstream_model_name: string
  provider: string
  provider_icon_url: string
  enabled: boolean
  group_multipliers?: GroupMultiplier[]
}

interface SyncResult {
  channel_id: number
  channel_name: string
  source: string
  created: number
  updated: number
  error?: string
}

interface SyncPreviewItem {
  model_name: string
  provider: string
  provider_name: string
  provider_icon_url: string
  exists: boolean
}

interface SyncPreview {
  channel_id: number
  channel_name: string
  source: string
  models: SyncPreviewItem[]
}

interface BrowserSyncFallback {
  channel: UpstreamChannel
  url: string
  source: string
  error: string
  includeToken: boolean
  manualPayload: string
}

interface UsageStats {
  request_count: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  total_cost: string | number
}

interface ChannelUsageResponse {
  user_channels: UserChannelUsage[]
  upstream_channels: UpstreamChannelUsage[]
}

interface UserChannelUsage extends UsageStats {
  id: number
  name: string
  routing_algorithm: string
}

interface UpstreamChannelUsage extends UsageStats {
  id: number
  name: string
  user_channel_id?: number | null
  user_channel_name: string
}

export default function Channels() {
  const { language, t } = useI18n()
  const currency = useCurrencyDisplayName()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [editingUserChannel, setEditingUserChannel] = useState<Partial<UserChannel> | null>(null)
  const [editingVisibility, setEditingVisibility] = useState<UserChannel | null>(null)
  const [editingUpstream, setEditingUpstream] = useState<Partial<UpstreamChannel> | null>(null)
  const [editingMultipliers, setEditingMultipliers] = useState<UpstreamChannel | null>(null)
  const [modelChannel, setModelChannel] = useState<UpstreamChannel | null>(null)

  const { data: userChannels = [], isLoading: isUserChannelsLoading } = useQuery<UserChannel[]>({
    queryKey: ["admin-user-channels"],
    queryFn: async () => {
      const res = await api.get("/user-channels")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: upstreamChannels = [], isLoading: isUpstreamsLoading } = useQuery<UpstreamChannel[]>({
    queryKey: ["admin-upstream-channels"],
    queryFn: async () => {
      const res = await api.get("/channels")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: async () => {
      const res = await api.get("/groups")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: adminUsers = [] } = useQuery<AdminUserOption[]>({
    queryKey: ["admin-users-options"],
    queryFn: async () => {
      const res = await api.get("/users")
      return Array.isArray(res.data)
        ? res.data.map((item: { id?: number; username?: string; email?: string }) => ({
            id: Number(item.id || 0),
            username: String(item.username || ""),
            email: String(item.email || ""),
          })).filter((item: AdminUserOption) => item.id > 0)
        : []
    },
  })

  const { data: pluginTypes = [] } = useQuery<ChannelTypeConfig[]>({
    queryKey: ["admin-plugin-upstream-types"],
    queryFn: async () => {
      const response = await api.get("/user/plugins")
      const items = Array.isArray(response.data?.plugins) ? response.data.plugins as PluginListItem[] : []
      return items.flatMap((plugin) => plugin.enabled ? (plugin.upstreams || []).filter((upstream) => upstream.protocol === "responses").map((upstream) => ({
        value: `plugin--${plugin.id}--${upstream.id}`,
        label: upstream.name || plugin.id,
		defaultBaseURL: upstream.default_base_url || "",
        baseURLPlaceholder: "https://api.example.com",
        baseURLHelp: upstream.description || "This upstream is provided by an installed WASM plugin.",
        pluginID: plugin.id,
        pluginConfig: upstream.config,
      })) : [])
    },
  })

  const availableProviderTypes = useMemo(() => [...providerTypes, ...pluginTypes], [pluginTypes])

  const { data: channelUsage = emptyChannelUsage() } = useQuery<ChannelUsageResponse>({
    queryKey: ["admin-channel-usage"],
    queryFn: async () => {
      const res = await api.get("/channel-usage")
      return normalizeChannelUsageResponse(res.data)
    },
  })

  const saveUserChannel = useMutation({
    mutationFn: async (channel: Partial<UserChannel>) => {
      const payload = userChannelPayload(channel)
      return channel.id
        ? (await api.put(`/user-channels/${channel.id}`, payload)).data
        : (await api.post("/user-channels", payload)).data
    },
    onSuccess: () => {
      success(t("admin.saved"))
      setEditingUserChannel(null)
      queryClient.invalidateQueries({ queryKey: ["admin-user-channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin-channel-usage"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.saveFailed")),
  })

  const saveUserChannelVisibility = useMutation({
    mutationFn: async ({ channelID, groupIDs, userIDs }: { channelID: number; groupIDs: number[]; userIDs: number[] }) => {
      await api.put(`/user-channels/${channelID}/allowed-groups`, { group_ids: groupIDs })
      await api.put(`/user-channels/${channelID}/allowed-users`, { user_ids: userIDs })
    },
    onSuccess: () => {
      success(t("admin.saved"))
      setEditingVisibility(null)
      queryClient.invalidateQueries({ queryKey: ["admin-user-channels"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.saveFailed")),
  })

  const deleteUserChannel = useMutation({
    mutationFn: async (id: number) => api.delete(`/user-channels/${id}`),
    onSuccess: () => {
      success(t("admin.deleted"))
      queryClient.invalidateQueries({ queryKey: ["admin-user-channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin-channel-usage"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.deleteFailed")),
  })

  const saveUpstream = useMutation({
    mutationFn: async (channel: Partial<UpstreamChannel>) => {
      const payload = upstreamPayload(channel)
      if (channel.id) {
        const res = await api.put(`/channels/${channel.id}`, payload)
        return res.data
      }
      const res = await api.post("/channels", payload)
      return res.data
    },
    onSuccess: () => {
      success(t("admin.saved"))
      setEditingUpstream(null)
      queryClient.invalidateQueries({ queryKey: ["admin-upstream-channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin-channel-usage"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.saveFailed")),
  })

  const deleteUpstream = useMutation({
    mutationFn: async (id: number) => api.delete(`/channels/${id}`),
    onSuccess: () => {
      success(t("admin.deleted"))
      queryClient.invalidateQueries({ queryKey: ["admin-upstream-channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin-channel-usage"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.deleteFailed")),
  })

  const toggleUpstream = useMutation({
    mutationFn: async (channel: UpstreamChannel) => {
      const res = await api.put(`/channels/${channel.id}`, upstreamPayload({ ...channel, enabled: !channel.enabled }))
      return res.data
    },
    onSuccess: () => {
      success(t("admin.saved"))
      queryClient.invalidateQueries({ queryKey: ["admin-upstream-channels"] })
      queryClient.invalidateQueries({ queryKey: ["admin-channel-usage"] })
      queryClient.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => error(t("admin.saveFailed")),
  })

  const saveGroupMultipliers = useMutation({
    mutationFn: async ({ channelID, multipliers }: { channelID: number; multipliers: GroupMultiplier[] }) => {
      const res = await api.put(`/channels/${channelID}/group-multipliers`, multipliers.map((item) => ({
        group_id: item.group_id,
        multiplier: Number(item.multiplier || 0),
      })))
      return res.data
    },
    onSuccess: () => {
      success(copy.groupMultipliersSaved)
      setEditingMultipliers(null)
      queryClient.invalidateQueries({ queryKey: ["admin-upstream-channels"] })
    },
    onError: () => error(copy.groupMultipliersSaveFailed),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("channels.title")}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{t("admin.channelsSubtitle")}</div>
        </div>
      </div>

      <PageTitleSlot />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("admin.userChannels")}</CardTitle>
          <Button className="gap-2" onClick={() => setEditingUserChannel(emptyUserChannel())}>
            <Plus size={16} />
            {t("admin.addUserChannel")}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("channels.name")}</TableHead>
                <TableHead>{t("admin.description")}</TableHead>
                <TableHead>{t("channels.multiplier")}</TableHead>
                <TableHead>{copy.routingAlgorithm}</TableHead>
                <TableHead>{copy.rateLimit}</TableHead>
                <TableHead>{copy.requests}</TableHead>
                <TableHead>{copy.tokens}</TableHead>
                <TableHead>{copy.cost}</TableHead>
                <TableHead>{t("channels.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isUserChannelsLoading ? (
                <EmptyRow colSpan={10} text={t("common.loading")} />
              ) : userChannels.length === 0 ? (
                <EmptyRow colSpan={10} text={t("admin.noUserChannels")} />
              ) : (
                userChannels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell className="font-medium">
                      <div>{channel.name}</div>
                      {((channel.allowed_groups?.length || 0) > 0 || (channel.allowed_users?.length || 0) > 0) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {copy.visibilityRestricted
                            .replace("{groups}", String(channel.allowed_groups?.length || 0))
                            .replace("{users}", String(channel.allowed_users?.length || 0))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{channel.description || "-"}</TableCell>
                    <TableCell>{channel.multiplier || 1}</TableCell>
                    <TableCell>{routingAlgorithmLabel(channel.routing_algorithm, copy)}</TableCell>
                    <TableCell>{channel.rate_limit_enabled ? copy.rateLimitValue.replace("{rpm}", String(channel.rate_limit_requests_per_minute || 0)).replace("{burst}", String(channel.rate_limit_burst || 0)) : copy.rateLimitDisabled}</TableCell>
                    <TableCell>{formatInteger(usageForUserChannel(channelUsage, channel.id).request_count)}</TableCell>
                    <TableCell>{formatInteger(usageForUserChannel(channelUsage, channel.id).total_tokens)}</TableCell>
                    <TableCell>{formatCost(usageForUserChannel(channelUsage, channel.id).total_cost, currency)}</TableCell>
                    <TableCell>
                      <StatusBadge enabled={channel.enabled} />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="icon" onClick={() => setEditingUserChannel(channel)} title={t("common.edit")}>
                        <Edit size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setEditingVisibility(channel)} title={copy.channelVisibility}>
                        <Eye size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteUserChannel.mutate(channel.id)}
                        title={t("common.delete")}
                      >
                        <Trash size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("admin.upstreamChannels")}</CardTitle>
          <Button className="gap-2" onClick={() => setEditingUpstream(emptyUpstream(userChannels[0]?.id))}>
            <Plus size={16} />
            {t("admin.addUpstream")}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("channels.name")}</TableHead>
                <TableHead>{t("admin.userChannel")}</TableHead>
                <TableHead>{t("channels.type")}</TableHead>
                <TableHead>{t("admin.baseURL")}</TableHead>
                <TableHead>{t("channels.priority")}</TableHead>
                <TableHead>{t("admin.weight")}</TableHead>
                <TableHead>{copy.requests}</TableHead>
                <TableHead>{copy.tokens}</TableHead>
                <TableHead>{copy.cost}</TableHead>
                <TableHead>{t("channels.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isUpstreamsLoading ? (
                <EmptyRow colSpan={11} text={t("common.loading")} />
              ) : upstreamChannels.length === 0 ? (
                <EmptyRow colSpan={11} text={t("channels.noChannels")} />
              ) : (
                upstreamChannels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell className="font-medium">{channel.name}</TableCell>
                    <TableCell>{channel.user_channel?.name || userChannelName(userChannels, channel.user_channel_id)}</TableCell>
                    <TableCell>{channel.type}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{channel.base_url}</TableCell>
                    <TableCell>{channel.priority}</TableCell>
                    <TableCell>{channel.weight}</TableCell>
                    <TableCell>{formatInteger(usageForUpstreamChannel(channelUsage, channel.id).request_count)}</TableCell>
                    <TableCell>{formatInteger(usageForUpstreamChannel(channelUsage, channel.id).total_tokens)}</TableCell>
                    <TableCell>{formatCost(usageForUpstreamChannel(channelUsage, channel.id).total_cost, currency)}</TableCell>
                    <TableCell>
                      <StatusBadge enabled={channel.enabled} />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="icon" onClick={() => setModelChannel(channel)} title={copy.modelConfigs}>
                        <ListTree size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setEditingMultipliers(channel)} title={copy.groupMultipliers}>
                        <SlidersHorizontal size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => toggleUpstream.mutate(channel)} title={channel.enabled ? t("common.disabled") : t("common.enabled")}>
                        <Power size={14} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => setEditingUpstream(channel)} title={t("common.edit")}>
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteUpstream.mutate(channel.id)}
                        title={t("common.delete")}
                      >
                        <Trash size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="secondary" />
      <UserChannelDialog
        channel={editingUserChannel}
        onClose={() => setEditingUserChannel(null)}
        onSave={(channel) => saveUserChannel.mutate(channel)}
      />
      <UserChannelVisibilityDialog
        channel={editingVisibility}
        groups={groups}
        users={adminUsers}
        onClose={() => setEditingVisibility(null)}
        onSave={(groupIDs, userIDs) => {
          if (editingVisibility) {
            saveUserChannelVisibility.mutate({ channelID: editingVisibility.id, groupIDs, userIDs })
          }
        }}
      />
      <UpstreamDialog
        channel={editingUpstream}
        userChannels={userChannels}
		providerTypes={availableProviderTypes}
        onClose={() => setEditingUpstream(null)}
        onSave={(channel) => saveUpstream.mutate(channel)}
      />
      <UpstreamModelConfigDialog
        channel={modelChannel}
        groups={groups}
        onClose={() => setModelChannel(null)}
      />
      <GroupMultiplierDialog
        title={copy.groupMultipliers}
        subject={editingMultipliers?.name || ""}
        groups={groups}
        multipliers={editingMultipliers?.group_multipliers || []}
        open={Boolean(editingMultipliers)}
        onClose={() => setEditingMultipliers(null)}
        onSave={(multipliers) => {
          if (editingMultipliers) {
            saveGroupMultipliers.mutate({ channelID: editingMultipliers.id, multipliers })
          }
        }}
      />
    </div>
  )
}

function UserChannelDialog({
  channel,
  onClose,
  onSave,
}: {
  channel: Partial<UserChannel> | null
  onClose: () => void
  onSave: (channel: Partial<UserChannel>) => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const [draft, setDraft] = useState<Partial<UserChannel>>(emptyUserChannel())

  useEffect(() => {
    setDraft(channel || emptyUserChannel())
  }, [channel])

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channel?.id ? t("admin.editUserChannel") : t("admin.addUserChannel")}</DialogTitle>
          <DialogDescription>{t("admin.userChannelsHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FieldLabel label={t("channels.name")}>
            <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("channels.name")} />
          </FieldLabel>
          <FieldLabel label={t("admin.description")}>
            <Input
              value={draft.description || ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder={t("admin.description")}
            />
          </FieldLabel>
          <FieldLabel label={t("channels.multiplier")}>
            <Input
              type="number"
              value={String(draft.multiplier ?? 1)}
              onChange={(e) => setDraft({ ...draft, multiplier: Number(e.target.value) })}
              placeholder={t("channels.multiplier")}
            />
          </FieldLabel>
          <FieldLabel label={copy.routingAlgorithm}>
            <Select value={String((draft.routing_algorithm || "priority") || "__shadcn_empty__")} onValueChange={(value) => setDraft({ ...draft, routing_algorithm: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              {routingAlgorithmOptions(copy).map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>
              ))}
            </SelectContent></Select>
          </FieldLabel>
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={Boolean(draft.rate_limit_enabled)} onCheckedChange={(checked) => setDraft({ ...draft, rate_limit_enabled: checked })} />
              <span className="font-medium">{copy.enableRateLimit}</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel label={copy.requestsPerMinute}>
                <Input type="number" min="1" max="1000000" disabled={!draft.rate_limit_enabled} value={String(draft.rate_limit_requests_per_minute ?? 60)} onChange={(e) => setDraft({ ...draft, rate_limit_requests_per_minute: Number(e.target.value) })} />
              </FieldLabel>
              <FieldLabel label={copy.rateLimitBurst}>
                <Input type="number" min="0" max="1000000" disabled={!draft.rate_limit_enabled} value={String(draft.rate_limit_burst ?? 0)} onChange={(e) => setDraft({ ...draft, rate_limit_burst: Number(e.target.value) })} />
              </FieldLabel>
            </div>
            <p className="text-xs text-muted-foreground">{copy.rateLimitHint}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(draft.enabled)} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} />
            {t("common.enabled")}
          </label>
          {Boolean(channel?.id) && <p className="text-xs text-muted-foreground">{copy.visibilityMovedHint}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(draft)}>{t("admin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UserChannelVisibilityDialog({
  channel,
  groups,
  users,
  onClose,
  onSave,
}: {
  channel: UserChannel | null
  groups: Group[]
  users: AdminUserOption[]
  onClose: () => void
  onSave: (groupIDs: number[], userIDs: number[]) => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const [allowedGroupIDs, setAllowedGroupIDs] = useState<number[]>([])
  const [allowedUserIDs, setAllowedUserIDs] = useState<number[]>([])
  const [userFilter, setUserFilter] = useState("")

  useEffect(() => {
    setAllowedGroupIDs((channel?.allowed_groups || []).map((item) => item.group_id).filter(Boolean))
    setAllowedUserIDs((channel?.allowed_users || []).map((item) => item.user_id).filter(Boolean))
    setUserFilter("")
  }, [channel])

  const toggleID = (list: number[], id: number) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  const filteredUsers = users.filter((user) => {
    const keyword = userFilter.trim().toLowerCase()
    if (!keyword) return true
    return user.username.toLowerCase().includes(keyword) || user.email.toLowerCase().includes(keyword)
  })

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.channelVisibility}{channel ? ` - ${channel.name}` : ""}</DialogTitle>
          <DialogDescription>{copy.channelVisibilityHint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{copy.visibleGroups}</div>
            {groups.length === 0 ? (
              <div className="text-xs text-muted-foreground">{copy.noGroupsAvailable}</div>
            ) : (
              <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={allowedGroupIDs.includes(group.id)}
                      onCheckedChange={() => setAllowedGroupIDs((list) => toggleID(list, group.id))}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{copy.visibleUsers}</div>
            <Input value={userFilter} placeholder={copy.filterUsersPlaceholder} onChange={(event) => setUserFilter(event.target.value)} />
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="text-xs text-muted-foreground">{copy.noUsersMatched}</div>
              ) : (
                filteredUsers.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={allowedUserIDs.includes(user.id)}
                      onCheckedChange={() => setAllowedUserIDs((list) => toggleID(list, user.id))}
                    />
                    <span className="min-w-0 truncate">{user.username}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{user.email}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(allowedGroupIDs, allowedUserIDs)}>{t("admin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UpstreamDialog({
  channel,
  userChannels,
	providerTypes,
  onClose,
  onSave,
}: {
  channel: Partial<UpstreamChannel> | null
  userChannels: UserChannel[]
	providerTypes: ChannelTypeConfig[]
  onClose: () => void
  onSave: (channel: Partial<UpstreamChannel>) => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const [draft, setDraft] = useState<Partial<UpstreamChannel>>(emptyUpstream(userChannels[0]?.id))
  const selectedType = draft.type || "completion"
	const selectedTypeConfig = channelTypeConfig(selectedType, providerTypes)
	const pluginID = selectedTypeConfig.pluginID || ""
	const pluginFields = useMemo(() => normalizePluginUpstreamConfigFields(selectedTypeConfig.pluginConfig), [selectedTypeConfig.pluginConfig])
	const { data: pluginSettings } = useQuery<PluginSettingsResponse>({
		queryKey: ["plugin-settings-for-upstream", pluginID],
		enabled: Boolean(pluginID),
		queryFn: async () => (await api.get(`/user/plugins/${encodeURIComponent(pluginID)}/settings`)).data as PluginSettingsResponse,
	})
	const pluginConfig = parsePluginUpstreamConfig(draft.plugin_config)

  useEffect(() => {
    setDraft(channel || emptyUpstream(userChannels[0]?.id))
  }, [channel, userChannels])

  const updateType = (type: string) => {
		const nextConfig = channelTypeConfig(type, providerTypes)
		const currentConfig = channelTypeConfig(draft.type || "", providerTypes)
    const currentBaseURL = (draft.base_url || "").trim()
    const shouldUseDefaultBaseURL = !currentBaseURL || currentBaseURL === currentConfig.defaultBaseURL
    setDraft({
      ...draft,
      type,
		base_url: shouldUseDefaultBaseURL ? nextConfig.defaultBaseURL || "" : draft.base_url,
		plugin_config: type === draft.type ? draft.plugin_config : "{}",
	})
  }

	const updatePluginConfig = (name: string, value: unknown) => {
		setDraft({ ...draft, plugin_config: JSON.stringify({ ...pluginConfig, [name]: value }) })
	}

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(open) => !open && onClose()}>
	  <DialogContent className="grid max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{channel?.id ? t("admin.editUpstream") : t("admin.addUpstream")}</DialogTitle>
          <DialogDescription>{t("admin.upstreamHint")}</DialogDescription>
        </DialogHeader>
		<div className="min-h-0 overflow-y-auto px-1">
		<div className="grid gap-3 pb-1 md:grid-cols-2">
          <FieldLabel label={t("channels.name")}>
            <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("channels.name")} />
          </FieldLabel>
          <FieldLabel label={t("channels.type")}>
            <Select value={String((selectedType) || "__shadcn_empty__")} onValueChange={(value) => updateType((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              {providerTypes.map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>
              ))}
            </SelectContent></Select>
          </FieldLabel>
          <FieldLabel label={t("admin.baseURL")}>
            <div className="flex gap-2">
              <Input
                value={draft.base_url || ""}
                onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
                placeholder={selectedTypeConfig.baseURLPlaceholder || "https://api.example.com/v1"}
              />
              {selectedTypeConfig.defaultBaseURL && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDraft({ ...draft, base_url: selectedTypeConfig.defaultBaseURL })}
                >
                  {selectedTypeConfig.defaultBaseURLAction}
                </Button>
              )}
            </div>
            {selectedTypeConfig.baseURLHelp && <p className="text-xs text-muted-foreground">{selectedTypeConfig.baseURLHelp}</p>}
          </FieldLabel>
		  <FieldLabel label={selectedTypeConfig.apiKeyLabel}>
            <Input
              value={draft.api_key || ""}
              onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
              placeholder={selectedTypeConfig.apiKeyPlaceholder}
            />
            {selectedTypeConfig.apiKeyHelp && <p className="text-xs text-muted-foreground">{selectedTypeConfig.apiKeyHelp}</p>}
		  </FieldLabel>
		  {pluginFields.map((field) => <PluginUpstreamConfigControl key={field.name} field={field} value={pluginConfig[field.name]} settings={pluginSettings?.config} onChange={(value) => updatePluginConfig(field.name, value)} />)}
          <FieldLabel label={t("admin.userChannel")}>
            <Select value={String((draft.user_channel_id || "") || "__shadcn_empty__")} onValueChange={(value) => setDraft({ ...draft, user_channel_id: Number((value === "__shadcn_empty__" ? "" : value)) || null })}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{t("admin.selectUserChannel")}</SelectItem>
              {userChannels.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
              ))}
            </SelectContent></Select>
          </FieldLabel>
          <FieldLabel label={t("channels.priority")}>
            <Input
              type="number"
              value={String(draft.priority ?? 1)}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              placeholder={t("channels.priority")}
            />
          </FieldLabel>
          <FieldLabel label={t("admin.weight")}>
            <Input
              type="number"
              value={String(draft.weight ?? 1)}
              onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })}
              placeholder={t("admin.weight")}
            />
          </FieldLabel>
          <div className="space-y-3 rounded-md border p-3 md:col-span-2">
		  <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.price_sync_enabled ?? true}
                onCheckedChange={(checked) => setDraft({ ...draft, price_sync_enabled: checked })}
              />
              <span className="font-medium">{copy.priceSyncEnabled}</span>
            </label>
            <FieldLabel label={copy.priceSyncCron}>
              <Input
                value={draft.price_sync_cron || "0 * * * *"}
                disabled={draft.price_sync_enabled === false}
                onChange={(e) => setDraft({ ...draft, price_sync_cron: e.target.value })}
                placeholder="0 * * * *"
              />
            </FieldLabel>
            <p className="text-xs text-muted-foreground">{copy.priceSyncCronHint}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(draft.enabled)} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} />
            {t("common.enabled")}
		  </label>
		</div>
		</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(draft)}>{t("admin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UpstreamModelConfigDialog({
  channel,
  groups,
  onClose,
}: {
  channel: UpstreamChannel | null
  groups: Group[]
  onClose: () => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const { success, error, info } = useToast()
  const queryClient = useQueryClient()
  const [editingModel, setEditingModel] = useState<Partial<ChannelModelConfig> | null>(null)
  const [editingModelMultipliers, setEditingModelMultipliers] = useState<ChannelModelConfig | null>(null)
  const [syncFormat, setSyncFormat] = useState("openai_models")
  const [customSyncPath, setCustomSyncPath] = useState("")
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [selectedModelNames, setSelectedModelNames] = useState<string[]>([])
  const [browserFallback, setBrowserFallback] = useState<BrowserSyncFallback | null>(null)

  const { data: models = [], isLoading } = useQuery<ChannelModelConfig[]>({
    queryKey: ["channel-models", channel?.id],
    enabled: Boolean(channel?.id),
    queryFn: async () => {
      const res = await api.get(`/channels/${channel?.id}/models`)
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["channel-models", channel?.id] })
    queryClient.invalidateQueries({ queryKey: ["admin-models-page"] })
    queryClient.invalidateQueries({ queryKey: ["catalog"] })
    queryClient.invalidateQueries({ queryKey: ["public-models"] })
  }

  const saveModel = useMutation({
    mutationFn: async (model: Partial<ChannelModelConfig>) => {
      if (!channel?.id) {
        throw new Error(copy.channelRequired)
      }
      const payload = channelModelPayload({ ...model, channel_id: channel.id })
      if (model.id) {
        const res = await api.put(`/channel-models/${model.id}`, payload)
        return res.data
      }
      const res = await api.post(`/channels/${channel.id}/models`, payload)
      return res.data
    },
    onSuccess: () => {
      success(t("admin.saved"))
      setEditingModel(null)
      invalidate()
    },
    onError: (err) => error(err instanceof Error ? err.message : t("admin.saveFailed")),
  })

  const deleteModel = useMutation({
    mutationFn: async (id: number) => api.delete(`/channel-models/${id}`),
    onSuccess: () => {
      success(t("admin.deleted"))
      invalidate()
    },
    onError: () => error(t("admin.deleteFailed")),
  })

  const saveModelMultipliers = useMutation({
    mutationFn: async ({ modelID, multipliers }: { modelID: number; multipliers: GroupMultiplier[] }) => {
      const res = await api.put(`/channel-models/${modelID}/group-multipliers`, multipliers.map((item) => ({
        group_id: item.group_id,
        multiplier: Number(item.multiplier || 0),
      })))
      return res.data
    },
    onSuccess: () => {
      success(copy.groupMultipliersSaved)
      setEditingModelMultipliers(null)
      invalidate()
    },
    onError: () => error(copy.groupMultipliersSaveFailed),
  })

  const previewSync = useMutation({
    mutationFn: async () => {
      if (!channel?.id) {
        throw new Error(copy.channelRequired)
      }
      const res = await api.post("/models/sync/preview", {
        channel_id: channel.id,
        format: syncFormat,
        path: customSyncPath,
      })
      return res.data as SyncPreview
    },
    onSuccess: (preview) => {
      setSyncPreview(preview)
      setSelectedModelNames(preview.models.map((item) => item.model_name))
    },
    onError: (err) => {
      console.error("Model sync preview failed", err)
      error(syncErrorMessage(err, copy.syncPreviewFailed))
      if (channel) {
        openBrowserFallback(channel, err)
      }
    },
  })

  const browserPreviewSync = useMutation({
    mutationFn: async ({ fallback, payload }: { fallback: BrowserSyncFallback; payload: unknown }) => {
      const res = await api.post("/models/sync/preview/browser", {
        channel_id: fallback.channel.id,
        source: fallback.source,
        payload,
      })
      return res.data as SyncPreview
    },
    onSuccess: (preview) => {
      setSyncPreview(preview)
      setSelectedModelNames(preview.models.map((item) => item.model_name))
      setBrowserFallback(null)
    },
    onError: (err) => {
      console.error("Browser model sync preview failed", err)
      error(syncErrorMessage(err, copy.browserPreviewFailed))
    },
  })

  const applySync = useMutation({
    mutationFn: async () => {
      if (!syncPreview) {
        return []
      }
      const selectedModels = syncPreview.models.filter((item) => selectedModelNames.includes(item.model_name))
      const res = await api.post("/models/sync/apply", {
        channel_id: syncPreview.channel_id,
        models: selectedModels,
      })
      return Array.isArray(res.data?.results) ? res.data.results as SyncResult[] : []
    },
    onSuccess: (results) => {
      success(syncSummary(results, t))
      setSyncPreview(null)
      setSelectedModelNames([])
      invalidate()
    },
    onError: (err) => {
      console.error("Model sync apply failed", err)
      error(syncErrorMessage(err, copy.syncFailed))
    },
  })

  const openBrowserFallback = (targetChannel: UpstreamChannel, err: unknown) => {
    const nextFallback = browserFallbackForChannel(targetChannel, syncFormat, customSyncPath, syncErrorMessage(err, copy.syncPreviewFailed))
    if (!nextFallback.url) {
      error(copy.missingBaseURL)
      return
    }
    setBrowserFallback(nextFallback)
  }

  const fetchPreviewWithBrowser = async () => {
    if (!browserFallback) {
      return
    }
    try {
      info(copy.browserFetching)
      const headers: HeadersInit = { Accept: "application/json, text/plain, */*" }
      if (browserFallback.includeToken && browserFallback.channel.api_key) {
        headers.Authorization = `Bearer ${browserFallback.channel.api_key}`
      }
      const response = await fetch(browserFallback.url, {
        method: "GET",
        credentials: "include",
        headers,
      })
      const text = await response.text()
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${text.slice(0, 300)}`)
      }
      const payload = JSON.parse(text)
      browserPreviewSync.mutate({ fallback: browserFallback, payload })
    } catch (err) {
      console.error("Browser model sync fetch failed", err)
      error(err instanceof Error ? `${copy.browserFetchFailed}: ${err.message}` : copy.browserFetchFailed)
    }
  }

  const submitManualPreviewPayload = () => {
    if (!browserFallback) {
      return
    }
    try {
      const payload = JSON.parse(browserFallback.manualPayload)
      browserPreviewSync.mutate({ fallback: browserFallback, payload })
    } catch (err) {
      console.error("Manual model sync payload parse failed", err)
      error(copy.manualPayloadInvalid)
    }
  }

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{copy.modelConfigs}</DialogTitle>
          <DialogDescription>{channel?.name || ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <FieldLabel label={copy.syncFormat}>
              <Select value={String((syncFormat) || "__shadcn_empty__")} onValueChange={(value) => setSyncFormat((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                {syncFormatOptionLabels(language).map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                ))}
              </SelectContent></Select>
            </FieldLabel>
            <FieldLabel label={copy.customSyncPath}>
              <Input
                value={customSyncPath}
                onChange={(event) => setCustomSyncPath(event.target.value)}
                placeholder="/v1/models"
                disabled={syncFormat !== "custom"}
              />
            </FieldLabel>
            <Button className="gap-2 self-end" disabled={!channel || previewSync.isPending || browserPreviewSync.isPending} onClick={() => previewSync.mutate()}>
              <Download size={16} />
              {copy.syncModels}
            </Button>
            <Button className="gap-2 self-end" variant="outline" onClick={() => setEditingModel(emptyChannelModel(channel?.id))}>
              <Plus size={16} />
              {copy.addChannelModel}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.model")}</TableHead>
                  <TableHead>{copy.upstreamModelName}</TableHead>
                  <TableHead>{copy.provider}</TableHead>
                  <TableHead>{t("channels.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <EmptyRow colSpan={5} text={t("common.loading")} />
                ) : models.length === 0 ? (
                  <EmptyRow colSpan={5} text={copy.noChannelModels} />
                ) : (
                  models.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.model_name}</TableCell>
                      <TableCell className="font-mono text-xs">{item.upstream_model_name || item.model_name}</TableCell>
                      <TableCell>
                        <ProviderLabel provider={item.provider} iconURL={item.provider_icon_url} />
                      </TableCell>
                      <TableCell><StatusBadge enabled={item.enabled} /></TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button variant="outline" size="icon" onClick={() => setEditingModelMultipliers(item)} title={copy.groupMultipliers}>
                          <SlidersHorizontal size={14} />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => setEditingModel(item)} title={t("common.edit")}>
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => deleteModel.mutate(item.id)}
                          title={t("common.delete")}
                        >
                          <Trash size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </DialogFooter>
        <ChannelModelDialog
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSave={(model) => saveModel.mutate(model)}
        />
        <GroupMultiplierDialog
          title={copy.groupMultipliers}
          subject={editingModelMultipliers?.model_name || ""}
          groups={groups}
          multipliers={editingModelMultipliers?.group_multipliers || []}
          open={Boolean(editingModelMultipliers)}
          onClose={() => setEditingModelMultipliers(null)}
          onSave={(multipliers) => {
            if (editingModelMultipliers) {
              saveModelMultipliers.mutate({ modelID: editingModelMultipliers.id, multipliers })
            }
          }}
        />
        <SyncPreviewDialog
          preview={syncPreview}
          selectedModelNames={selectedModelNames}
          isSaving={applySync.isPending}
          onSelectedChange={setSelectedModelNames}
          onClose={() => setSyncPreview(null)}
          onSubmit={() => applySync.mutate()}
        />
        <BrowserSyncFallbackDialog
          fallback={browserFallback}
          isSaving={browserPreviewSync.isPending}
          onChange={setBrowserFallback}
          onClose={() => setBrowserFallback(null)}
          onBrowserFetch={fetchPreviewWithBrowser}
          onManualSubmit={submitManualPreviewPayload}
        />
      </DialogContent>
    </Dialog>
  )
}

function ChannelModelDialog({
  model,
  onClose,
  onSave,
}: {
  model: Partial<ChannelModelConfig> | null
  onClose: () => void
  onSave: (model: Partial<ChannelModelConfig>) => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const [draft, setDraft] = useState<Partial<ChannelModelConfig>>(emptyChannelModel())
  const [providerMode, setProviderMode] = useState("auto")

  useEffect(() => {
    const nextDraft = model || emptyChannelModel()
    setDraft(nextDraft)
    setProviderMode(providerSelectID(nextDraft.provider || ""))
  }, [model])

  return (
    <Dialog open={Boolean(model)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{model?.id ? copy.editChannelModel : copy.addChannelModel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FieldLabel label={t("common.model")}>
            <Input value={draft.model_name || ""} onChange={(event) => setDraft({ ...draft, model_name: event.target.value })} placeholder="gpt-4o" />
          </FieldLabel>
          <FieldLabel label={copy.upstreamModelName}>
            <Input
              value={draft.upstream_model_name || ""}
              onChange={(event) => setDraft({ ...draft, upstream_model_name: event.target.value })}
              placeholder={draft.model_name || "gpt-4o"}
            />
          </FieldLabel>
          <FieldLabel label={copy.provider}>
            <Select value={String((providerMode) || "__shadcn_empty__")} onValueChange={(value) => {
                const providerID = (value === "__shadcn_empty__" ? "" : value)
                setProviderMode(providerID)
                if (providerID === "auto" || providerID === "custom") {
                  setDraft({ ...draft, provider: "", provider_icon_url: "" })
                  return
                }
                const preset = providerPresets.find((item) => item.id === providerID)
                setDraft({ ...draft, provider: providerID, provider_icon_url: preset?.iconURL || "" })
              }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="auto">{copy.autoProvider}</SelectItem>
              {providerPresets.map((provider) => (
                <SelectItem key={provider.id} value={String(provider.id)}>{provider.name}</SelectItem>
              ))}
              <SelectItem value="custom">{copy.customProvider}</SelectItem>
            </SelectContent></Select>
          </FieldLabel>
          {providerMode === "custom" && (
            <FieldLabel label={copy.customProviderName}>
              <Input value={draft.provider || ""} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} placeholder="my-provider" />
            </FieldLabel>
          )}
          <FieldLabel label={copy.providerIconURL}>
            <Input
              value={draft.provider_icon_url || ""}
              onChange={(event) => setDraft({ ...draft, provider_icon_url: event.target.value })}
              placeholder="https://cdn.example.com/provider.svg"
            />
          </FieldLabel>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={Boolean(draft.enabled)} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} />
            {t("common.enabled")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(draft)}>{t("admin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SyncPreviewDialog({
  preview,
  selectedModelNames,
  isSaving,
  onSelectedChange,
  onClose,
  onSubmit,
}: {
  preview: SyncPreview | null
  selectedModelNames: string[]
  isSaving: boolean
  onSelectedChange: (names: string[]) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const models = preview?.models || []
  const selectedSet = new Set(selectedModelNames)
  const allSelected = models.length > 0 && selectedModelNames.length === models.length

  const toggleAll = (checked: boolean) => {
    onSelectedChange(checked ? models.map((item) => item.model_name) : [])
  }

  const toggleModel = (modelName: string, checked: boolean) => {
    if (checked) {
      onSelectedChange(selectedSet.has(modelName) ? selectedModelNames : [...selectedModelNames, modelName])
      return
    }
    onSelectedChange(selectedModelNames.filter((item) => item !== modelName))
  }

  return (
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{copy.syncPreviewTitle}</DialogTitle>
        </DialogHeader>
        {preview && (
          <div className="min-h-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{preview.channel_name} · {preview.source}</span>
              <label className="flex items-center gap-2">
                <Switch checked={allSelected} onCheckedChange={(checked) => toggleAll(checked)} />
                {copy.selectAll}
              </label>
            </div>
            <div className="max-h-[52vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{t("common.model")}</TableHead>
                    <TableHead>{copy.provider}</TableHead>
                    <TableHead>{copy.syncStatus}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.length === 0 ? (
                    <EmptyRow colSpan={4} text={copy.noSyncModels} />
                  ) : (
                    models.map((item) => (
                      <TableRow key={item.model_name}>
                        <TableCell>
                          <Switch
                            checked={selectedSet.has(item.model_name)}
                            onCheckedChange={(checked) => toggleModel(item.model_name, checked)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.model_name}</TableCell>
                        <TableCell>
                          <ProviderLabel provider={item.provider} iconURL={item.provider_icon_url} />
                        </TableCell>
                        <TableCell>{item.exists ? copy.exists : copy.newModel}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={onSubmit} disabled={selectedModelNames.length === 0 || isSaving}>
            {copy.submitSelected}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BrowserSyncFallbackDialog({
  fallback,
  isSaving,
  onChange,
  onClose,
  onBrowserFetch,
  onManualSubmit,
}: {
  fallback: BrowserSyncFallback | null
  isSaving: boolean
  onChange: (fallback: BrowserSyncFallback | null) => void
  onClose: () => void
  onBrowserFetch: () => void
  onManualSubmit: () => void
}) {
  const { language } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy

  return (
    <Dialog open={Boolean(fallback)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.browserFallbackTitle}</DialogTitle>
        </DialogHeader>
        {fallback && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{fallback.channel.name}</div>
              <div className="mt-2 break-all">{fallback.error}</div>
            </div>
            <FieldLabel label={copy.browserRequestURL}>
              <Input value={fallback.url} readOnly />
            </FieldLabel>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={fallback.includeToken}
                onCheckedChange={(checked) => onChange({ ...fallback, includeToken: checked })}
              />
              {copy.includeChannelToken}
            </label>
            <Button className="w-full" onClick={onBrowserFetch} disabled={isSaving}>
              {copy.browserFetch}
            </Button>
            <FieldLabel label={copy.manualPayload}>
              <textarea
                className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={fallback.manualPayload}
                onChange={(event) => onChange({ ...fallback, manualPayload: event.target.value })}
                placeholder={copy.manualPayloadPlaceholder}
              />
            </FieldLabel>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{copy.close}</Button>
          <Button onClick={onManualSubmit} disabled={!fallback?.manualPayload.trim() || isSaving}>
            {copy.parseManualPayload}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupMultiplierDialog({
  title,
  subject,
  groups,
  multipliers,
  open,
  onClose,
  onSave,
}: {
  title: string
  subject: string
  groups: Group[]
  multipliers: GroupMultiplier[]
  open: boolean
  onClose: () => void
  onSave: (multipliers: GroupMultiplier[]) => void
}) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhChannelCopy : enChannelCopy
  const [draft, setDraft] = useState<GroupMultiplier[]>([])

  useEffect(() => {
    const byGroup = new Map(multipliers.map((item) => [item.group_id, item]))
    setDraft(groups.map((group) => ({
      group_id: group.id,
      group,
      multiplier: byGroup.get(group.id)?.multiplier ?? "",
    })))
  }, [groups, multipliers, open])

  const updateMultiplier = (groupID: number, multiplier: string) => {
    setDraft((current) => current.map((item) => (item.group_id === groupID ? { ...item, multiplier } : item)))
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.group}</TableHead>
                <TableHead>{copy.overrideMultiplier}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.length === 0 ? (
                <EmptyRow colSpan={2} text={copy.noGroups} />
              ) : (
                draft.map((item) => (
                  <TableRow key={item.group_id}>
                    <TableCell>{item.group?.name || item.group_id}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={String(item.multiplier ?? "")}
                        placeholder={copy.keepInherited}
                        onChange={(event) => updateMultiplier(item.group_id, event.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(draft.filter((item) => Number(item.multiplier || 0) > 0))}>{t("admin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useI18n()
  return (
    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
      {enabled ? t("common.enabled") : t("common.disabled")}
    </span>
  )
}

function ProviderLabel({ provider, iconURL }: { provider?: string; iconURL?: string }) {
  const label = providerName(provider || "")
  return (
    <span className="inline-flex max-w-[180px] items-center gap-2 truncate text-sm">
      {iconURL && <img src={iconURL} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />}
      <span className="truncate">{label}</span>
    </span>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function PluginUpstreamConfigControl({ field, value, settings, onChange }: { field: PluginUpstreamConfigField; value: unknown; settings: unknown; onChange: (value: unknown) => void }) {
  const options = pluginUpstreamConfigOptions(field, settings)
  if (field.type === "switch" || field.type === "boolean" || field.type === "checkbox") {
    return <div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><div className="text-sm font-medium">{field.label}</div>{field.description && <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>}</div><Switch checked={Boolean(value)} onCheckedChange={onChange} /></div>
  }
  if (field.type === "select" || field.type === "enum") {
    return <FieldLabel label={`${field.label}${field.required ? " *" : ""}`}><Select value={String(value || "__plugin_empty__")} onValueChange={(next) => onChange(next === "__plugin_empty__" ? "" : next)}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue placeholder={field.placeholder || "Select"} /></SelectTrigger><SelectContent>{!field.required && <SelectItem value="__plugin_empty__">Not set</SelectItem>}{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}</FieldLabel>
  }
  if (field.type === "textarea" || field.type === "text") {
    return <FieldLabel label={`${field.label}${field.required ? " *" : ""}`}><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}</FieldLabel>
  }
  return <FieldLabel label={`${field.label}${field.required ? " *" : ""}`}><Input type={field.type === "number" || field.type === "integer" ? "number" : "text"} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(field.type === "number" || field.type === "integer" ? Number(event.target.value) : event.target.value)} />{field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}</FieldLabel>
}

function parsePluginUpstreamConfig(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizePluginUpstreamConfigFields(schema: unknown): PluginUpstreamConfigField[] {
  const root = isRecord(schema) ? schema : {}
  const fields = Array.isArray(root.fields) ? root.fields : []
  return fields.flatMap((value) => {
    if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return []
    const rawOptions = Array.isArray(value.options) ? value.options : []
    const options = rawOptions.flatMap((option) => {
      if (isRecord(option)) {
        const optionValue = String(option.value ?? option.id ?? option.name ?? option.label ?? "").trim()
        return optionValue ? [{ value: optionValue, label: String(option.label ?? option.name ?? optionValue) }] : []
      }
      const optionValue = String(option).trim()
      return optionValue ? [{ value: optionValue, label: optionValue }] : []
    })
    return [{
      name: value.name.trim(), label: String(value.label ?? value.title ?? value.name), type: String(value.type ?? "input").toLowerCase(),
      description: String(value.description ?? value.help ?? ""), placeholder: String(value.placeholder ?? ""), required: value.required === true,
      options, optionsFrom: String(value.options_from ?? ""), optionLabel: String(value.option_label ?? "name"), optionValue: String(value.option_value ?? "id"),
    }]
  })
}

function pluginUpstreamConfigOptions(field: PluginUpstreamConfigField, settings: unknown) {
  if (!field.optionsFrom) return field.options
  const source = isRecord(settings) ? settings[field.optionsFrom] : undefined
  if (!Array.isArray(source)) return field.options
  return source.flatMap((value) => {
    if (!isRecord(value)) return []
    const optionValue = String(value[field.optionValue] ?? "").trim()
    if (!optionValue) return []
    return [{ value: optionValue, label: String(value[field.optionLabel] ?? optionValue) }]
  })
}

function emptyUserChannel(): Partial<UserChannel> {
  return { name: "", description: "", multiplier: 1, routing_algorithm: "priority", enabled: true, rate_limit_enabled: false, rate_limit_requests_per_minute: 60, rate_limit_burst: 0 }
}

function userChannelPayload(channel: Partial<UserChannel>) {
  return {
    name: channel.name || "",
    description: channel.description || "",
    multiplier: Number(channel.multiplier ?? 1),
    routing_algorithm: channel.routing_algorithm || "priority",
    enabled: channel.enabled ?? true,
    rate_limit_enabled: channel.rate_limit_enabled ?? false,
    rate_limit_requests_per_minute: Number(channel.rate_limit_requests_per_minute ?? 60),
    rate_limit_burst: Number(channel.rate_limit_burst ?? 0),
  }
}

function emptyUpstream(userChannelID?: number): Partial<UpstreamChannel> {
  return {
    user_channel_id: userChannelID || null,
    name: "",
    type: "completion",
    base_url: "",
    api_key: "",
	plugin_config: "{}",
    priority: 1,
    weight: 1,
    enabled: true,
    price_sync_enabled: true,
    price_sync_cron: "0 * * * *",
  }
}

function upstreamPayload(channel: Partial<UpstreamChannel>) {
  return {
    user_channel_id: channel.user_channel_id || null,
    name: channel.name || "",
    type: channel.type || "completion",
    base_url: channel.base_url || "",
    api_key: channel.api_key || "",
	plugin_config: channel.plugin_config || "{}",
    priority: Number(channel.priority ?? 1),
    weight: Number(channel.weight ?? 1),
    enabled: channel.enabled ?? true,
    price_sync_enabled: channel.price_sync_enabled ?? true,
    price_sync_cron: channel.price_sync_cron || "0 * * * *",
  }
}

function userChannelName(userChannels: UserChannel[], id?: number | null) {
  return userChannels.find((item) => item.id === id)?.name || "-"
}

function emptyChannelModel(channelID?: number): Partial<ChannelModelConfig> {
  return {
    channel_id: channelID || 0,
    model_id: 0,
    model_name: "",
    upstream_model_name: "",
    provider: "",
    provider_icon_url: "",
    enabled: true,
  }
}

function channelModelPayload(model: Partial<ChannelModelConfig>) {
  return {
    channel_id: Number(model.channel_id || 0),
    model_id: Number(model.model_id || 0),
    model_name: model.model_name || "",
    upstream_model_name: model.upstream_model_name || model.model_name || "",
    provider: model.provider || "",
    provider_icon_url: model.provider_icon_url || "",
    enabled: model.enabled ?? true,
  }
}

function browserFallbackForChannel(channel: UpstreamChannel, format: string, customPath: string, error: string): BrowserSyncFallback {
  const path = browserSyncPath(format, customPath)
  const url = upstreamURLForPath(channel.base_url, path)
  return {
    channel,
    url,
    source: `browser ${path || "custom"}`,
    error,
    includeToken: Boolean(channel.api_key) && shouldIncludeChannelToken(path),
    manualPayload: "",
  }
}

function browserSyncPath(format: string, customPath: string) {
  switch (format) {
    case "openai_models":
    case "openai":
      return "/v1/models"
    case "generic_models":
    case "models":
      return "/models"
    case "api_models":
      return "/api/models"
    case "custom":
      return normalizeBrowserSyncPath(customPath)
    case "auto":
    default:
      return "/v1/models"
  }
}

function normalizeBrowserSyncPath(path: string) {
  const nextPath = path.trim()
  if (!nextPath) {
    return ""
  }
  if (nextPath.startsWith("http://") || nextPath.startsWith("https://")) {
    return nextPath
  }
  return nextPath.startsWith("/") ? nextPath : `/${nextPath}`
}

function upstreamURLForPath(baseURL: string, path: string) {
  if (!path) {
    return ""
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path
  }

  const base = (baseURL || "").trim().replace(/\/+$/, "")
  const nextPath = path.startsWith("/") ? path : `/${path}`
  if (!base) {
    return ""
  }

  if (base.toLowerCase().endsWith("/v1")) {
    if (nextPath === "/v1") {
      return base
    }
    if (nextPath.startsWith("/v1/")) {
      return `${base}${nextPath.slice(3)}`
    }
    return `${base.slice(0, -3)}${nextPath}`
  }
  return `${base}${nextPath}`
}

function shouldIncludeChannelToken(_path: string) {
  return true
}

function emptyChannelUsage(): ChannelUsageResponse {
  return { user_channels: [], upstream_channels: [] }
}

function normalizeChannelUsageResponse(value: unknown): ChannelUsageResponse {
  const item = isRecord(value) ? value : {}
  return {
    user_channels: Array.isArray(item.user_channels) ? item.user_channels.map(normalizeUserChannelUsage) : [],
    upstream_channels: Array.isArray(item.upstream_channels) ? item.upstream_channels.map(normalizeUpstreamChannelUsage) : [],
  }
}

function normalizeUsage(value: Record<string, unknown>): UsageStats {
  return {
    request_count: Number(value.request_count || 0),
    input_tokens: Number(value.input_tokens || 0),
    output_tokens: Number(value.output_tokens || 0),
    total_tokens: Number(value.total_tokens || 0),
    total_cost: typeof value.total_cost === "string" || typeof value.total_cost === "number" ? value.total_cost : 0,
  }
}

function normalizeUserChannelUsage(value: unknown): UserChannelUsage {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    routing_algorithm: typeof item.routing_algorithm === "string" ? item.routing_algorithm : "priority",
    ...normalizeUsage(item),
  }
}

function normalizeUpstreamChannelUsage(value: unknown): UpstreamChannelUsage {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    user_channel_id: typeof item.user_channel_id === "number" ? item.user_channel_id : null,
    user_channel_name: typeof item.user_channel_name === "string" ? item.user_channel_name : "",
    ...normalizeUsage(item),
  }
}

function usageForUserChannel(usage: ChannelUsageResponse, id: number): UsageStats {
  return usage.user_channels.find((item) => item.id === id) || zeroUsage()
}

function usageForUpstreamChannel(usage: ChannelUsageResponse, id: number): UsageStats {
  return usage.upstream_channels.find((item) => item.id === id) || zeroUsage()
}

function zeroUsage(): UsageStats {
  return { request_count: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, total_cost: 0 }
}

function routingAlgorithmOptions(copy: typeof zhChannelCopy) {
  return [
    { value: "priority", label: copy.routingPriority },
    { value: "round_robin", label: copy.routingRoundRobin },
    { value: "weighted_round_robin", label: copy.routingWeightedRoundRobin },
  ]
}

function routingAlgorithmLabel(value: string, copy: typeof zhChannelCopy) {
  return routingAlgorithmOptions(copy).find((item) => item.value === value)?.label || copy.routingPriority
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Number.isFinite(value) ? value : 0)
}

function formatCost(value: string | number, currency: string) {
  const parsed = Number(value || 0)
  return formatCurrency((Number.isFinite(parsed) ? parsed : 0).toFixed(6), currency)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function syncSummary(results: SyncResult[], t: ReturnType<typeof useI18n>["t"]) {
  if (results.length === 0) {
    return t("models.syncDone", { created: 0, updated: 0 })
  }
  const failed = results.filter((item) => item.error).length
  const created = results.reduce((sum, item) => sum + (item.created || 0), 0)
  const updated = results.reduce((sum, item) => sum + (item.updated || 0), 0)
  if (failed > 0) {
    return t("models.syncPartial", { created, updated, failed })
  }
  return t("models.syncDone", { created, updated })
}

function syncErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ error?: string; message?: string; result?: SyncResult }>
  const status = axiosError.response?.status
  const data = axiosError.response?.data
  const detail = data?.error || data?.message || data?.result?.error
  if (status && detail) {
    return `${fallback}: HTTP ${status} ${detail}`
  }
  if (detail) {
    return `${fallback}: ${detail}`
  }
  if (error instanceof Error && error.message) {
    return `${fallback}: ${error.message}`
  }
  return fallback
}

function providerSelectID(provider: string) {
  if (!provider) {
    return "auto"
  }
  return providerPresets.some((item) => item.id === provider) ? provider : "custom"
}

function providerName(provider: string) {
  if (!provider) {
    return "-"
  }
  return providerPresets.find((item) => item.id === provider)?.name || provider
}

function syncFormatOptionLabels(language: string) {
  if (language === "zh") {
    return [
      { value: "auto", label: "自动识别" },
      { value: "openai_models", label: "OpenAI /v1/models" },
      { value: "generic_models", label: "通用 /models" },
      { value: "api_models", label: "通用 /api/models" },
      { value: "custom", label: "自定义路径" },
    ]
  }
  return [
    { value: "auto", label: "Auto detect" },
    { value: "openai_models", label: "OpenAI /v1/models" },
    { value: "generic_models", label: "Generic /models" },
    { value: "api_models", label: "Generic /api/models" },
    { value: "custom", label: "Custom path" },
  ]
}

interface ChannelTypeConfig {
  value: string
  label: string
  defaultBaseURL?: string
  baseURLPlaceholder?: string
  baseURLHelp?: string
  apiKeyLabel?: string
  apiKeyPlaceholder?: string
  apiKeyHelp?: string
  defaultBaseURLAction?: string
	pluginID?: string
	pluginConfig?: unknown
}

const providerTypes: ChannelTypeConfig[] = [
  {
    value: "completion",
    label: "OpenAI Chat Completions",
    defaultBaseURL: "https://api.openai.com",
    baseURLPlaceholder: "https://api.openai.com",
  },
  {
    value: "responses",
    label: "OpenAI Responses",
    defaultBaseURL: "https://api.openai.com",
    baseURLPlaceholder: "https://api.openai.com",
  },
  {
    value: "openai-video",
    label: "OpenAI Video",
    defaultBaseURL: "https://api.openai.com",
    baseURLPlaceholder: "https://api.openai.com",
  },
  {
    value: "veo",
    label: "VEO",
    baseURLPlaceholder: "https://api.example.com",
    baseURLHelp: "Uses the OpenAI video-compatible endpoint in this gateway.",
  },
  {
    value: "seedance",
    label: "Seedance",
    defaultBaseURL: "https://ark.cn-beijing.volces.com",
    baseURLPlaceholder: "https://ark.cn-beijing.volces.com",
  },
  {
    value: "seedream",
    label: "Seedream",
    defaultBaseURL: "https://ark.cn-beijing.volces.com",
    baseURLPlaceholder: "https://ark.cn-beijing.volces.com",
  },
  {
    value: "kling",
    label: "Kling",
    defaultBaseURL: "https://api.klingai.com",
    baseURLPlaceholder: "https://api.klingai.com",
  },
  { value: "midjourney", label: "Midjourney", baseURLPlaceholder: "https://api.example.com" },
  {
    value: "claude",
    label: "Claude",
    defaultBaseURL: "https://api.anthropic.com",
    baseURLPlaceholder: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-...",
  },
  {
    value: "gemini",
    label: "Gemini",
    defaultBaseURL: "https://generativelanguage.googleapis.com",
    baseURLPlaceholder: "https://generativelanguage.googleapis.com",
    apiKeyPlaceholder: "AIza...",
    apiKeyHelp: "The gateway sends this as x-goog-api-key and query key where needed.",
  },
  {
    value: "dashscope",
    label: "Ali DashScope",
    defaultBaseURL: "https://dashscope.aliyuncs.com",
    baseURLPlaceholder: "https://dashscope.aliyuncs.com",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    defaultBaseURL: "https://api.deepseek.com",
    baseURLPlaceholder: "https://api.deepseek.com",
    baseURLHelp: "Claude-compatible requests use /anthropic/v1/messages.",
  },
  {
    value: "moonshot",
    label: "Moonshot / Kimi",
    defaultBaseURL: "https://api.moonshot.cn",
    baseURLPlaceholder: "https://api.moonshot.cn",
    baseURLHelp: "Claude-compatible requests use /anthropic/v1/messages.",
  },
  {
    value: "zhipu_v4",
    label: "Zhipu v4",
    defaultBaseURL: "https://open.bigmodel.cn",
    baseURLPlaceholder: "https://open.bigmodel.cn",
    baseURLHelp: "Chat requests use /api/paas/v4/chat/completions.",
  },
  {
    value: "xai",
    label: "xAI",
    defaultBaseURL: "https://api.x.ai",
    baseURLPlaceholder: "https://api.x.ai",
    baseURLHelp: "Model suffixes like -search, -high, and -low are handled by the adapter.",
  },
  {
    value: "siliconflow",
    label: "SiliconFlow",
    defaultBaseURL: "https://api.siliconflow.cn",
    baseURLPlaceholder: "https://api.siliconflow.cn",
  },
  {
    value: "mistral",
    label: "Mistral",
    defaultBaseURL: "https://api.mistral.ai",
    baseURLPlaceholder: "https://api.mistral.ai",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    defaultBaseURL: "https://openrouter.ai/api",
    baseURLPlaceholder: "https://openrouter.ai/api",
    baseURLHelp: "Keep the /api prefix in the Base URL.",
  },
  {
    value: "perplexity",
    label: "Perplexity",
    defaultBaseURL: "https://api.perplexity.ai",
    baseURLPlaceholder: "https://api.perplexity.ai",
  },
  {
    value: "lingyiwanwu",
    label: "LingYiWanWu / 01.AI",
    defaultBaseURL: "https://api.lingyiwanwu.com",
    baseURLPlaceholder: "https://api.lingyiwanwu.com",
  },
  {
    value: "mokaai",
    label: "MokaAI",
    defaultBaseURL: "https://api.moka.ai",
    baseURLPlaceholder: "https://api.moka.ai",
  },
  {
    value: "xinference",
    label: "Xinference",
    baseURLPlaceholder: "http://localhost:9997",
    apiKeyLabel: "API Key (optional)",
    apiKeyPlaceholder: "optional",
  },
  {
    value: "submodel",
    label: "Submodel",
    defaultBaseURL: "https://llm.submodel.ai",
    baseURLPlaceholder: "https://llm.submodel.ai",
  },
  {
    value: "ollama",
    label: "Ollama",
    defaultBaseURL: "http://localhost:11434",
    baseURLPlaceholder: "http://localhost:11434",
    apiKeyLabel: "API Key (optional)",
    apiKeyPlaceholder: "optional",
  },
  {
    value: "qianfan_v2",
    label: "Baidu Qianfan v2",
    defaultBaseURL: "https://qianfan.baidubce.com",
    baseURLPlaceholder: "https://qianfan.baidubce.com",
  },
  {
    value: "minimax",
    label: "MiniMax",
    defaultBaseURL: "https://api.minimax.chat",
    baseURLPlaceholder: "https://api.minimax.chat",
  },
  {
    value: "volcengine",
    label: "VolcEngine / Doubao",
    defaultBaseURL: "https://ark.cn-beijing.volces.com",
    baseURLPlaceholder: "https://ark.cn-beijing.volces.com",
  },
]

function channelTypeConfig(type: string, types = providerTypes): Required<Pick<ChannelTypeConfig, "apiKeyLabel" | "apiKeyPlaceholder" | "defaultBaseURLAction">> & ChannelTypeConfig {
  const config = types.find((item) => item.value === type) || providerTypes.find((item) => item.value === "completion") || providerTypes[0]
  return {
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-...",
    defaultBaseURLAction: "Default",
    ...config,
  }
}

const providerPresets = [
  { id: "openai", name: "OpenAI", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg" },
  { id: "deepseek", name: "DeepSeek", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/deepseek.svg" },
  { id: "anthropic", name: "Anthropic", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/anthropic.svg" },
  { id: "google", name: "Google", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/google.svg" },
  { id: "meta", name: "Meta", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/meta.svg" },
  { id: "mistral", name: "Mistral AI", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/mistralai.svg" },
  { id: "qwen", name: "Qwen", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/alibabacloud.svg" },
  { id: "moonshot", name: "Moonshot AI", iconURL: "https://www.moonshot.cn/favicon.ico" },
  { id: "zhipu", name: "Zhipu AI", iconURL: "https://open.bigmodel.cn/favicon.ico" },
  { id: "xai", name: "xAI", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/x.svg" },
  { id: "groq", name: "Groq", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/groq.svg" },
  { id: "cohere", name: "Cohere", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/cohere.svg" },
  { id: "perplexity", name: "Perplexity", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/perplexity.svg" },
  { id: "minimax", name: "MiniMax", iconURL: "https://www.minimaxi.com/favicon.ico" },
  { id: "baichuan", name: "Baichuan AI", iconURL: "https://www.baichuan-ai.com/favicon.ico" },
  { id: "stepfun", name: "StepFun", iconURL: "https://www.stepfun.com/favicon.ico" },
  { id: "yi", name: "01.AI", iconURL: "https://www.01.ai/favicon.ico" },
  { id: "baidu", name: "Baidu", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/baidu.svg" },
  { id: "tencent", name: "Tencent", iconURL: "https://cloud.tencent.com/favicon.ico" },
  { id: "doubao", name: "Doubao", iconURL: "https://www.volcengine.com/favicon.ico" },
  { id: "siliconflow", name: "SiliconFlow", iconURL: "https://siliconflow.cn/favicon.ico" },
  { id: "openrouter", name: "OpenRouter", iconURL: "https://openrouter.ai/favicon.ico" },
  { id: "huggingface", name: "Hugging Face", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/huggingface.svg" },
  { id: "together", name: "Together AI", iconURL: "https://www.together.ai/favicon.ico" },
  { id: "fireworks", name: "Fireworks AI", iconURL: "https://fireworks.ai/favicon.ico" },
  { id: "cloudflare", name: "Cloudflare", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/cloudflare.svg" },
  { id: "ollama", name: "Ollama", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/ollama.svg" },
  { id: "jina", name: "Jina AI", iconURL: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/jina.svg" },
]

const zhChannelCopy = {
  modelConfigs: "模型配置",
  syncFormat: "同步格式",
  customSyncPath: "自定义路径",
  syncModels: "同步模型",
  addChannelModel: "添加模型配置",
  editChannelModel: "编辑模型配置",
  upstreamModelName: "上级模型名称",
  provider: "供应商",
  autoProvider: "自动识别",
  customProvider: "自定义供应商",
  customProviderName: "供应商名称",
  providerIconURL: "供应商图标 URL",
  channelRequired: "请选择上级渠道",
  noChannelModels: "暂无模型配置",
  syncPreviewFailed: "获取模型列表失败",
  syncFailed: "同步模型失败",
  syncPreviewTitle: "选择要同步的模型",
  selectAll: "全选",
  syncStatus: "状态",
  exists: "已存在",
  newModel: "新增",
  noSyncModels: "未获取到模型",
  submitSelected: "提交同步",
  browserFallbackTitle: "同步失败",
  browserRequestURL: "请求地址",
  includeChannelToken: "携带渠道令牌",
  browserFetch: "使用浏览器获取",
  browserFetching: "正在使用浏览器获取",
  browserFetchFailed: "浏览器获取失败",
  browserPreviewFailed: "解析模型列表失败",
  manualPayload: "手动 JSON",
  manualPayloadPlaceholder: "粘贴模型列表 JSON",
  manualPayloadInvalid: "JSON 格式不正确",
  parseManualPayload: "解析 JSON",
  missingBaseURL: "渠道 Base URL 不能为空",
  close: "关闭",
  routingAlgorithm: "路由算法",
  channelVisibility: "可见范围",
  channelVisibilityHint: "默认所有用户可选。勾选分组或用户后，仅这些分组成员和指定用户可以选择此渠道。",
  visibilityMovedHint: "可见范围请在渠道列表中通过“可见范围”按钮单独配置。",
  visibleGroups: "允许的分组",
  visibleUsers: "允许的用户",
  noGroupsAvailable: "暂无分组",
  filterUsersPlaceholder: "搜索用户名或邮箱",
  noUsersMatched: "没有匹配的用户",
  visibilityRestricted: "限 {groups} 组 / {users} 人",
  routingPriority: "优先级",
  routingRoundRobin: "轮询",
  routingWeightedRoundRobin: "按权重轮询",
  requests: "请求数",
  tokens: "Tokens",
  cost: "消耗",
  groupMultipliers: "分组倍率",
  groupMultipliersSaved: "分组倍率已保存",
  groupMultipliersSaveFailed: "分组倍率保存失败",
  group: "分组",
  overrideMultiplier: "覆盖倍率",
  keepInherited: "留空继承",
  noGroups: "暂无分组",
  priceSyncEnabled: "自动同步价格",
  priceSyncCron: "同步 Cron",
  priceSyncCronHint: "使用五段 Cron 表达式，例如“0 * * * *”表示每小时整点同步；关闭后不会自动同步。",
  rateLimit: "限速",
  rateLimitDisabled: "未启用",
  rateLimitValue: "{rpm}/分钟，突发 {burst}",
  enableRateLimit: "启用渠道限速",
  requestsPerMinute: "每分钟请求数",
  rateLimitBurst: "突发额度",
  rateLimitHint: "每位用户在此渠道都有独立限额；达到上限时 API 返回 429 和 Retry-After。",
}

const enChannelCopy: typeof zhChannelCopy = {
  modelConfigs: "Model configs",
  syncFormat: "Sync format",
  customSyncPath: "Custom path",
  syncModels: "Sync models",
  addChannelModel: "Add model config",
  editChannelModel: "Edit model config",
  upstreamModelName: "Upstream model name",
  provider: "Provider",
  autoProvider: "Auto detect",
  customProvider: "Custom provider",
  customProviderName: "Provider name",
  providerIconURL: "Provider icon URL",
  channelRequired: "Select an upstream channel",
  noChannelModels: "No model configs",
  syncPreviewFailed: "Failed to fetch models",
  syncFailed: "Failed to sync models",
  syncPreviewTitle: "Select models to sync",
  selectAll: "Select all",
  syncStatus: "Status",
  exists: "Exists",
  newModel: "New",
  noSyncModels: "No models fetched",
  submitSelected: "Submit sync",
  browserFallbackTitle: "Sync failed",
  browserRequestURL: "Request URL",
  includeChannelToken: "Include channel token",
  browserFetch: "Fetch in browser",
  browserFetching: "Fetching in browser",
  browserFetchFailed: "Browser fetch failed",
  browserPreviewFailed: "Failed to parse models",
  manualPayload: "Manual JSON",
  manualPayloadPlaceholder: "Paste model-list JSON",
  manualPayloadInvalid: "Invalid JSON",
  parseManualPayload: "Parse JSON",
  missingBaseURL: "Channel Base URL is required",
  close: "Close",
  routingAlgorithm: "Routing algorithm",
  channelVisibility: "Visibility",
  channelVisibilityHint: "Available to everyone by default. Selecting groups or users limits this channel to those group members and users.",
  visibilityMovedHint: "Configure visibility separately via the Visibility button in the channel list.",
  visibleGroups: "Allowed groups",
  visibleUsers: "Allowed users",
  noGroupsAvailable: "No groups",
  filterUsersPlaceholder: "Search username or email",
  noUsersMatched: "No matching users",
  visibilityRestricted: "{groups} groups / {users} users",
  routingPriority: "Priority",
  routingRoundRobin: "Round robin",
  routingWeightedRoundRobin: "Weighted round robin",
  requests: "Requests",
  tokens: "Tokens",
  cost: "Cost",
  groupMultipliers: "Group multipliers",
  groupMultipliersSaved: "Group multipliers saved",
  groupMultipliersSaveFailed: "Failed to save group multipliers",
  group: "Group",
  overrideMultiplier: "Override multiplier",
  keepInherited: "Empty inherits",
  noGroups: "No groups",
  priceSyncEnabled: "Automatically sync prices",
  priceSyncCron: "Sync cron",
  priceSyncCronHint: "Use a five-field cron expression. For example, “0 * * * *” syncs on the hour; disabled channels are not synced automatically.",
  rateLimit: "Rate limit",
  rateLimitDisabled: "Disabled",
  rateLimitValue: "{rpm}/min, burst {burst}",
  enableRateLimit: "Enable channel rate limit",
  requestsPerMinute: "Requests per minute",
  rateLimitBurst: "Burst allowance",
  rateLimitHint: "Each user has an independent limit for this channel. Rejected API calls return 429 with Retry-After.",
}
