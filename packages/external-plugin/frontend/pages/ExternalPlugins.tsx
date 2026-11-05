import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Boxes, Check, ChevronLeft, ChevronRight, Download, ExternalLink, GitBranch, Info, Package, RefreshCw, Search, Trash2 } from "lucide-react"
import { api, useI18n, useToast, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@velocelab/dashboard/frontend"

type Marketplace = {
  id: string
  url: string
  name: string
  revision: string
  syncedAt: string
  error: string
  pluginCount: number
}

type Skill = { id: string; name: string; description: string; content: string }
type Server = { id: string; name: string; url: string; description?: string }

type Plugin = {
  id: string
  marketplaceId: string
  slug: string
  name: string
  version: string
  description: string
  author: string
  homepage: string
  license: string
  manifestPath: string
  skills: Skill[]
  mcpServers: Server[]
  ignored: string[]
  unsupported: string[]
  category: string
  source: { url: string; path?: string; ref?: string } | null
  materialized: boolean
  installed: boolean
}

const copy = {
  zh: {
    title: "外部插件",
    subtitle: "添加插件市场只是登记来源，插件要自己挑。安装后它带来的 skill 和 MCP 才会提供给你自己的对话，其它用户看不到。",
    addMarketplace: "添加插件市场",
    addTitle: "添加插件市场",
    addBody: "填一个 git 仓库地址，例如 https://github.com/openai/plugins.git。服务端只克隆并读取清单、skill 文本和 MCP 地址，不会运行仓库里的代码。",
    url: "仓库地址",
    urlPlaceholder: "https://github.com/openai/plugins.git",
    installed: "已安装",
    installedEmpty: "还没有安装任何插件。",
    installedEmptyHint: "切到下面的市场分页，选一个插件查看详情再安装。",
    searchPlaceholder: "搜索插件、skill 或 MCP",
    noMatches: "没有匹配的插件。",
    pageOf: (page: number, total: number) => `第 ${page} / ${total} 页`,
    pluginsEmpty: "这个市场里没有可识别的插件。",
    detail: "查看详情",
    install: "安装",
    installedAlready: "已安装",
    uninstall: "卸载",
    sync: "刷新",
    remove: "移除",
    removeTitle: "移除插件市场？",
    removeBody: (name: string) => `会连同它带来的全部插件一起移除，“${name}”。已安装的插件也会随之卸载。`,
    never: "尚未读取",
    revision: "版本",
    skills: "Skill",
    mcp: "MCP",
    skillsCount: (count: number) => `${count} 个 skill`,
    mcpCount: (count: number) => `${count} 个 MCP`,
    noSkills: "没有 skill",
    noMcp: "没有 MCP",
    unsupported: "这个插件还声明了本服务器提供不了的能力：",
    manifest: "清单",
    author: "作者",
    license: "许可证",
    category: "分类",
    homepage: "主页",
    installedToast: (name: string) => `已安装 ${name}`,
    uninstalledToast: (name: string) => `已卸载 ${name}`,
    added: "插件市场已添加",
    synced: "已刷新",
    removed: "已移除",
    failed: "操作失败",
    cancel: "取消",
    close: "关闭",
    syncing: "正在读取…",
    remote: "外部仓库",
    remoteNote: (url: string) => `这个插件不在市场仓库里。安装时会从 ${url} 拉取并读取它的内容。`,
    fetchInstall: "下载并安装",
  },
  en: {
    title: "External plugins",
    subtitle: "Adding a marketplace only records where plugins come from; you choose the plugins yourself. Once installed, its skills and MCP servers are offered to your own chats and nobody else's.",
    addMarketplace: "Add marketplace",
    addTitle: "Add a marketplace",
    addBody: "A git repository URL, for example https://github.com/openai/plugins.git. The server only clones and reads its manifest, skill text and MCP endpoints — it never runs code from the repository.",
    url: "Repository URL",
    urlPlaceholder: "https://github.com/openai/plugins.git",
    installed: "Installed",
    installedEmpty: "No plugins installed yet.",
    installedEmptyHint: "Open a marketplace tab, look through a plugin, and install the ones you want.",
    searchPlaceholder: "Search plugins, skills or MCP servers",
    noMatches: "Nothing matches that.",
    pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
    pluginsEmpty: "This marketplace has no plugins this server can read.",
    detail: "Details",
    install: "Install",
    installedAlready: "Installed",
    uninstall: "Uninstall",
    sync: "Refresh",
    remove: "Remove",
    removeTitle: "Remove marketplace?",
    removeBody: (name: string) => `This removes “${name}” and every plugin it brought, including the installed ones.`,
    never: "Never",
    revision: "Revision",
    skills: "Skills",
    mcp: "MCP",
    skillsCount: (count: number) => `${count} skill${count === 1 ? "" : "s"}`,
    mcpCount: (count: number) => `${count} MCP${count === 1 ? "" : "s"}`,
    noSkills: "No skills",
    noMcp: "No MCP servers",
    unsupported: "This plugin also declares surfaces this server cannot provide:",
    manifest: "Manifest",
    author: "Author",
    license: "License",
    category: "Category",
    homepage: "Homepage",
    installedToast: (name: string) => `Installed ${name}`,
    uninstalledToast: (name: string) => `Uninstalled ${name}`,
    added: "Marketplace added",
    synced: "Refreshed",
    removed: "Removed",
    failed: "That did not work",
    cancel: "Cancel",
    close: "Close",
    syncing: "Reading…",
    remote: "External repo",
    remoteNote: (url: string) => `This plugin lives in its own repository. Installing fetches from ${url} and reads it.`,
    fetchInstall: "Fetch and install",
  },
}

export default function ExternalPlugins() {
  const { language } = useI18n()
  const t = language === "zh" ? copy.zh : copy.en
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("installed")
  const [addOpen, setAddOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [detail, setDetail] = useState<Plugin | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<Marketplace | null>(null)
  const [query, setQuery] = useState("")
  const [pages, setPages] = useState<Record<string, number>>({})

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
    mutationFn: async (value: string) => (await api.post("/user/external-plugin/marketplaces", { url: value })).data,
    onSuccess: (data) => {
      setAddOpen(false)
      setUrl("")
      refresh()
      toast.success(t.added)
      const id = data?.marketplace?.id
      if (typeof id === "string") setTab(id)
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
      setTab("installed")
      refresh()
      toast.success(t.removed)
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const setInstalled = useMutation({
    mutationFn: async (input: { id: string; installed: boolean }) =>
      api.post(`/user/external-plugin/plugins/${input.id}`, { installed: input.installed }),
    onSuccess: (_data, input) => {
      refresh()
      const name = pluginName(plugins.data, input.id)
      toast.success(input.installed ? t.installedToast(name) : t.uninstalledToast(name))
      setDetail((current) => (current && current.id === input.id ? { ...current, installed: input.installed } : current))
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, t.failed)),
  })

  const all = plugins.data || []
  const installed = all.filter((plugin) => plugin.installed)
  const markets = marketplaces.data || []

  // A plugin is worth showing when anything a user can read about it matches.
  const needle = query.trim().toLowerCase()
  const matches = (plugin: Plugin) =>
    !needle ||
    [
      plugin.name,
      plugin.slug,
      plugin.description,
      plugin.author,
      plugin.category,
      ...plugin.skills.map((skill) => skill.name),
      ...plugin.mcpServers.map((server) => server.name),
    ]
      .join("\n")
      .toLowerCase()
      .includes(needle)

  const pageOf = (key: string) => pages[key] ?? 0
  const setPage = (key: string, page: number) =>
    setPages((current) => ({ ...current, [key]: page }))

  const pluginRow = (plugin: Plugin, options: { installable: boolean }) => (
    <div key={plugin.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(plugin)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{plugin.name || plugin.slug}</span>
          {plugin.version && <Badge variant="outline">{plugin.version}</Badge>}
          {plugin.source && !plugin.materialized && (
            <Badge variant="outline" className="gap-1">
              <GitBranch size={11} />
              {t.remote}
            </Badge>
          )}
          {plugin.installed && (
            <Badge variant="secondary" className="gap-1">
              <Check size={11} />
              {t.installedAlready}
            </Badge>
          )}
        </div>
        {plugin.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span>{plugin.skills.length ? t.skillsCount(plugin.skills.length) : t.noSkills}</span>
          <span>·</span>
          <span>{plugin.mcpServers.length ? t.mcpCount(plugin.mcpServers.length) : t.noMcp}</span>
          {plugin.unsupported.length > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-500">{plugin.unsupported.length} ⚠</span>
            </>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setDetail(plugin)} title={t.detail}>
          <Info size={15} />
        </Button>
        {options.installable ? (
          <Button
            size="sm"
            variant={plugin.installed ? "outline" : "default"}
            disabled={setInstalled.isPending}
            onClick={() => setInstalled.mutate({ id: plugin.id, installed: !plugin.installed })}
          >
            {plugin.installed ? <Check size={15} /> : <Download size={15} />}
            {plugin.installed
              ? t.installedAlready
              : plugin.materialized
                ? t.install
                : t.fetchInstall}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={setInstalled.isPending}
            onClick={() => setInstalled.mutate({ id: plugin.id, installed: false })}
          >
            <Trash2 size={15} />
            {t.uninstall}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <GitBranch size={15} />
          {t.addMarketplace}
        </Button>
      </div>

      {all.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder={t.searchPlaceholder}
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value)
              setPages({})
            }}
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="installed" className="gap-1.5">
            <Boxes size={14} />
            {t.installed}
            {installed.length > 0 && <Badge variant="secondary">{installed.length}</Badge>}
          </TabsTrigger>
          {markets.map((marketplace) => (
            <TabsTrigger key={marketplace.id} value={marketplace.id} className="gap-1.5">
              <Package size={14} />
              <span className="max-w-40 truncate">{marketplace.name || marketplace.url}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="installed" className="mt-4">
          {installed.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <div className="text-sm font-medium">{t.installedEmpty}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.installedEmptyHint}</div>
              </CardContent>
            </Card>
          ) : (
            <Listing
              items={installed.filter(matches)}
              page={pageOf("installed")}
              onPage={(page) => setPage("installed", page)}
              empty={t.noMatches}
              label={t.pageOf}
              render={(plugin) => pluginRow(plugin, { installable: false })}
            />
          )}
        </TabsContent>

        {markets.map((marketplace) => {
          const available = all.filter((plugin) => plugin.marketplaceId === marketplace.id)
          return (
            <TabsContent key={marketplace.id} value={marketplace.id} className="mt-4 space-y-3">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{marketplace.name || marketplace.url}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{marketplace.url}</span>
                      <span>
                        {t.revision}: {marketplace.revision || "—"}
                      </span>
                      <span>
                        {marketplace.syncedAt ? new Date(marketplace.syncedAt).toLocaleString() : t.never}
                      </span>
                    </div>
                    {marketplace.error && <div className="mt-1 text-xs text-destructive">{marketplace.error}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={syncMarketplace.isPending}
                      onClick={() => syncMarketplace.mutate(marketplace.id)}
                    >
                      <RefreshCw size={15} className={syncMarketplace.isPending ? "animate-spin" : undefined} />
                      {syncMarketplace.isPending ? t.syncing : t.sync}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(marketplace)} title={t.remove}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
              <Listing
                items={available.filter(matches)}
                page={pageOf(marketplace.id)}
                onPage={(page) => setPage(marketplace.id, page)}
                empty={available.length === 0 ? t.pluginsEmpty : t.noMatches}
                label={t.pageOf}
                render={(plugin) => pluginRow(plugin, { installable: true })}
              />
            </TabsContent>
          )
        })}
      </Tabs>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="truncate">{detail?.name || detail?.slug}</span>
              {detail?.version && <Badge variant="outline">{detail.version}</Badge>}
              {detail?.installed && (
                <Badge variant="secondary" className="gap-1">
                  <Check size={11} />
                  {t.installedAlready}
                </Badge>
              )}
            </DialogTitle>
            {detail?.description && <DialogDescription>{detail.description}</DialogDescription>}
          </DialogHeader>

          {detail && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {detail.author && <Field label={t.author} value={detail.author} />}
                {detail.license && <Field label={t.license} value={detail.license} />}
                {detail.manifestPath && <Field label={t.manifest} value={detail.manifestPath} mono />}
                {detail.homepage && (
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t.homepage}</dt>
                    <dd className="truncate">
                      <a className="inline-flex items-center gap-1 text-primary hover:underline" href={detail.homepage} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} />
                        {detail.homepage}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">{t.skills}</div>
                {detail.skills.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t.noSkills}</div>
                ) : (
                  <ul className="space-y-1">
                    {detail.skills.map((skill) => (
                      <li key={skill.id} className="rounded-md border px-2 py-1.5">
                        <div className="text-xs font-medium">{skill.name}</div>
                        {skill.description && <div className="text-xs text-muted-foreground">{skill.description}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">{t.mcp}</div>
                {detail.mcpServers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t.noMcp}</div>
                ) : (
                  <ul className="space-y-1">
                    {detail.mcpServers.map((server) => (
                      <li key={server.id} className="rounded-md border px-2 py-1.5">
                        <div className="text-xs font-medium">{server.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{server.url}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail.source && !detail.materialized && (
                <div className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                  {t.remoteNote(detail.source.path ? `${detail.source.url} (${detail.source.path})` : detail.source.url)}
                </div>
              )}

              {detail.unsupported.length > 0 && (
                <div className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs">
                  <div className="text-amber-700 dark:text-amber-500">{t.unsupported}</div>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {detail.unsupported.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              {t.close}
            </Button>
            {detail && (
              <Button
                variant={detail.installed ? "outline" : "default"}
                disabled={setInstalled.isPending}
                onClick={() => setInstalled.mutate({ id: detail.id, installed: !detail.installed })}
              >
                {detail.installed ? <Trash2 size={15} /> : <Download size={15} />}
                {detail.installed ? t.uninstall : detail.materialized ? t.install : t.fetchInstall}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.addTitle}</DialogTitle>
            <DialogDescription>{t.addBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="external-plugin-url">{t.url}</Label>
            <Input id="external-plugin-url" value={url} placeholder={t.urlPlaceholder} onChange={(event) => setUrl(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t.cancel}
            </Button>
            <Button disabled={!url.trim() || addMarketplace.isPending} onClick={() => addMarketplace.mutate(url.trim())}>
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
          <p className="text-sm text-muted-foreground">{t.removeBody(pendingRemoval?.name || pendingRemoval?.url || "")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              {t.cancel}
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

const PAGE_SIZE = 10

function Listing({
  items,
  page,
  onPage,
  empty,
  label,
  render,
}: {
  items: Plugin[]
  page: number
  onPage: (page: number) => void
  empty: string
  label: (page: number, total: number) => string
  render: (plugin: Plugin) => ReactNode
}) {
  if (items.length === 0) {
    return <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">{empty}</div>
  }
  const total = Math.ceil(items.length / PAGE_SIZE)
  const current = Math.min(page, total - 1)
  const visible = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  return (
    <div className="space-y-2">
      {visible.map(render)}
      {total > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <span>{label(current + 1, total)}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={current === 0} onClick={() => onPage(current - 1)}>
              <ChevronLeft size={15} />
            </Button>
            <Button variant="outline" size="sm" disabled={current >= total - 1} onClick={() => onPage(current + 1)}>
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono" : "truncate"}>{value}</dd>
    </div>
  )
}

function pluginName(plugins: Plugin[] | undefined, id: string): string {
  const plugin = plugins?.find((entry) => entry.id === id)
  return plugin?.name || plugin?.slug || ""
}

function apiErrorMessage(cause: unknown, fallback: string): string {
  const value = cause as { response?: { data?: { error?: unknown } }; message?: string }
  const error = value?.response?.data?.error
  if (typeof error === "string" && error.trim()) return error
  return value?.message || fallback
}
