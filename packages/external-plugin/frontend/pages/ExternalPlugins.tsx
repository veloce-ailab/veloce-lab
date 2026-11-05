import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Boxes, GitBranch, Package, RefreshCw, Trash2 } from "lucide-react"
import { api, useI18n, useToast, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@velocelab/dashboard/frontend"

type Marketplace = {
  id: string
  url: string
  name: string
  revision: string
  syncedAt: string
  error: string
  pluginCount: number
}

type Skill = { id: string; name: string; description: string }
type Server = { id: string; name: string; url: string }

type Plugin = {
  id: string
  slug: string
  name: string
  version: string
  description: string
  author: string
  license: string
  category: string
  skills: Skill[]
  mcpServers: Server[]
  ignored: string[]
  unsupported: string[]
  enabled: boolean
}

const copy = {
  zh: {
    title: "外部插件",
    subtitle: "添加插件市场后，可以从里面挑插件启用。启用的插件会把它带的 skill 和 MCP 提供给你自己的对话，其它用户看不到，也不受影响。",
    marketplaces: "插件市场",
    marketplacesEmpty: "还没有添加插件市场。",
    addMarketplace: "添加插件市场",
    addTitle: "添加插件市场",
    addBody: "填一个 git 仓库地址，例如 https://github.com/openai/plugins.git。服务端只会克隆并读取其中的清单、skill 文本和 MCP 地址，不会运行仓库里的任何代码。",
    url: "仓库地址",
    urlPlaceholder: "https://github.com/openai/plugins.git",
    sync: "刷新",
    syncing: "正在读取…",
    remove: "移除",
    removeTitle: "移除插件市场？",
    removeBody: (name: string) => `会连同它带来的全部插件一起移除，“${name}”。已经启用的插件也会随之失效。`,
    revision: "版本",
    syncedAt: "上次读取",
    never: "尚未读取",
    pluginCount: (count: number) => `${count} 个插件`,
    plugins: "可用插件",
    pluginsEmpty: "还没有可用的插件。先添加一个插件市场。",
    enable: "启用",
    skills: "Skill",
    mcp: "MCP",
    none: "无",
    unsupported: "这个插件还声明了本服务器无法提供的能力：",
    ignoredFields: "未使用的字段",
    added: "插件市场已添加",
    synced: "已刷新",
    removed: "已移除",
    enabledToast: (name: string, on: boolean) => (on ? `已启用 ${name}` : `已停用 ${name}`),
    failed: "操作失败",
  },
  en: {
    title: "External plugins",
    subtitle: "Add a plugin marketplace, then pick plugins from it. An enabled plugin offers its skills and MCP servers to your own chats; nobody else sees or is affected by it.",
    marketplaces: "Marketplaces",
    marketplacesEmpty: "No marketplaces added yet.",
    addMarketplace: "Add marketplace",
    addTitle: "Add a marketplace",
    addBody: "A git repository URL, for example https://github.com/openai/plugins.git. The server only clones and reads its manifest, skill text, and MCP endpoints — it never runs code from the repository.",
    url: "Repository URL",
    urlPlaceholder: "https://github.com/openai/plugins.git",
    sync: "Refresh",
    syncing: "Reading…",
    remove: "Remove",
    removeTitle: "Remove marketplace?",
    removeBody: (name: string) => `This removes “${name}” and every plugin it brought, including any you had enabled.`,
    revision: "Revision",
    syncedAt: "Last read",
    never: "Never",
    pluginCount: (count: number) => `${count} plugin${count === 1 ? "" : "s"}`,
    plugins: "Available plugins",
    pluginsEmpty: "No plugins yet. Add a marketplace first.",
    enable: "Enabled",
    skills: "Skills",
    mcp: "MCP",
    none: "none",
    unsupported: "This plugin also declares surfaces this server cannot provide:",
    ignoredFields: "Unused fields",
    added: "Marketplace added",
    synced: "Refreshed",
    removed: "Removed",
    enabledToast: (name: string, on: boolean) => (on ? `Enabled ${name}` : `Disabled ${name}`),
    failed: "That did not work",
  },
}

export default function ExternalPlugins() {
  const { language } = useI18n()
  const t = language === "zh" ? copy.zh : copy.en
  const toast = useToast()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [pendingRemoval, setPendingRemoval] = useState<Marketplace | null>(null)

  const marketplaces = useQuery<Marketplace[]>({
    queryKey: ["external-plugin-marketplaces"],
    queryFn: async () => {
      const res = await api.get("/user/external-plugin/marketplaces")
      return Array.isArray(res.data?.marketplaces) ? res.data.marketplaces : []
    },
  })
  const plugins = useQuery<Plugin[]>({
    queryKey: ["external-plugin-plugins"],
    queryFn: async () => {
      const res = await api.get("/user/external-plugin/plugins")
      return Array.isArray(res.data?.plugins) ? res.data.plugins : []
    },
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["external-plugin-marketplaces"] })
    void queryClient.invalidateQueries({ queryKey: ["external-plugin-plugins"] })
  }

  const addMarketplace = useMutation({
    mutationFn: async (value: string) => {
      const res = await api.post("/user/external-plugin/marketplaces", { url: value })
      return res.data
    },
    onSuccess: () => {
      setAddOpen(false)
      setUrl("")
      refresh()
      toast.success(t.added)
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const syncMarketplace = useMutation({
    mutationFn: async (id: string) => api.post(`/user/external-plugin/marketplaces/${id}/sync`),
    onSuccess: () => {
      refresh()
      toast.success(t.synced)
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const removeMarketplace = useMutation({
    mutationFn: async (id: string) => api.delete(`/user/external-plugin/marketplaces/${id}`),
    onSuccess: () => {
      refresh()
      toast.success(t.removed)
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const setEnabled = useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) =>
      api.post(`/user/external-plugin/plugins/${input.id}`, { enabled: input.enabled }),
    onSuccess: (_data, input) => {
      refresh()
      const plugin = plugins.data?.find((entry) => entry.id === input.id)
      toast.success(t.enabledToast(plugin?.name || plugin?.slug || "", input.enabled))
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const rows = plugins.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch size={16} />
            {t.marketplaces}
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            {t.addMarketplace}
          </Button>
        </CardHeader>
        <CardContent>
          {marketplaces.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t.syncing}</div>
          ) : (marketplaces.data || []).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t.marketplacesEmpty}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.url}</TableHead>
                  <TableHead className="w-28">{t.revision}</TableHead>
                  <TableHead className="w-40">{t.syncedAt}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(marketplaces.data || []).map((marketplace) => (
                  <TableRow key={marketplace.id}>
                    <TableCell>
                      <div className="font-medium">{marketplace.name || marketplace.url}</div>
                      <div className="truncate text-xs text-muted-foreground">{marketplace.url}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{t.pluginCount(marketplace.pluginCount)}</Badge>
                        {marketplace.error && <span className="text-xs text-destructive">{marketplace.error}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{marketplace.revision || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {marketplace.syncedAt ? new Date(marketplace.syncedAt).toLocaleString() : t.never}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={syncMarketplace.isPending}
                          onClick={() => syncMarketplace.mutate(marketplace.id)}
                          title={t.sync}
                        >
                          <RefreshCw size={15} className={syncMarketplace.isPending ? "animate-spin" : undefined} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(marketplace)} title={t.remove}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes size={16} />
            {t.plugins}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t.pluginsEmpty}</div>
          ) : (
            <div className="space-y-2">
              {rows.map((plugin) => (
                <div key={plugin.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{plugin.name || plugin.slug}</span>
                        {plugin.version && <Badge variant="outline">{plugin.version}</Badge>}
                        {plugin.license && <span className="text-xs text-muted-foreground">{plugin.license}</span>}
                      </div>
                      {plugin.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>
                      )}
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <Package size={14} />
                      {t.enable}
                      <Switch
                        checked={plugin.enabled}
                        disabled={setEnabled.isPending}
                        onCheckedChange={(checked) => setEnabled.mutate({ id: plugin.id, enabled: checked })}
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plugin.skills.map((skill) => (
                      <Badge key={skill.id} variant="secondary" title={skill.description}>
                        {t.skills}: {skill.name}
                      </Badge>
                    ))}
                    {plugin.mcpServers.map((server) => (
                      <Badge key={server.id} variant="outline" title={server.url}>
                        {t.mcp}: {server.name}
                      </Badge>
                    ))}
                    {plugin.skills.length === 0 && plugin.mcpServers.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t.none}</span>
                    )}
                  </div>
                  {plugin.unsupported.length > 0 && (
                    <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      <div>{t.unsupported}</div>
                      <ul className="mt-1 list-disc pl-4">
                        {plugin.unsupported.map((entry) => (
                          <li key={entry}>{entry}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.addTitle}</DialogTitle>
            <DialogDescription>{t.addBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="external-plugin-url">{t.url}</Label>
            <Input
              id="external-plugin-url"
              value={url}
              placeholder={t.urlPlaceholder}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {language === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              disabled={!url.trim() || addMarketplace.isPending}
              onClick={() => addMarketplace.mutate(url.trim())}
            >
              {addMarketplace.isPending ? t.syncing : t.addMarketplace}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRemoval)} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.removeTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.removeBody(pendingRemoval?.name || pendingRemoval?.url || "")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              {language === "zh" ? "取消" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = pendingRemoval
                setPendingRemoval(null)
                if (target) removeMarketplace.mutate(target.id)
              }}
            >
              <Trash2 size={15} />
              {t.remove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function apiErrorMessage(cause: unknown, fallback: string): string {
  const value = cause as { response?: { data?: { error?: unknown } }; message?: string }
  const error = value?.response?.data?.error
  if (typeof error === "string" && error.trim()) return error
  return value?.message || fallback
}
