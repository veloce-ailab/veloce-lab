import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Play, Power, Puzzle, RefreshCw, Save, Search } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  ResizableSidebar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  api,
  cn,
  useConfirmDialog,
  useI18n,
  useMutation,
  useQuery,
  useQueryClient,
  useToast,
} from "@velocelab/dashboard/frontend"
import PluginConfigForm, { type PluginSchema } from "../lib/PluginConfigForm"

interface ManagedPlugin {
  name: string
  title: string
  enabled: boolean
  status: "enabled" | "disabled" | "pending" | string
  depend: string[]
  provide: string[]
  dependents: string[]
  schema: PluginSchema | null
  config: Record<string, unknown>
}

type PluginAction = "enable" | "disable" | "reload" | "save"

interface ActionResult {
  ok: boolean
  status?: string
  unloaded?: string[]
}

/**
 * Plugin management page owned by the settings plugin. The list and the detail
 * pane are both driven by the configuration file the loader writes: a plugin is
 * enabled or disabled by its key there, and every action saves before it acts.
 */
export default function PluginsSettings() {
  const { t } = useI18n()
  const { success, error: toastError } = useToast()
  const { confirm } = useConfirmDialog()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState("")
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])
  const [syncToken, setSyncToken] = useState(0)

  const plugins = useQuery<{ plugins: ManagedPlugin[] }>({
    queryKey: ["settings", "plugins"],
    queryFn: async () => (await api.get("/settings/plugins")).data,
  })

  const all = plugins.data?.plugins ?? []
  const needle = filter.trim().toLowerCase()
  const visible = useMemo(
    () => (needle ? all.filter((plugin) => plugin.name.toLowerCase().includes(needle) || plugin.title.toLowerCase().includes(needle)) : all),
    [all, needle],
  )
  const selected = all.find((plugin) => plugin.name === selectedName) ?? visible[0] ?? all[0]

  // The draft follows the selection and every completed action, never a
  // background refetch: an edit in progress must survive one.
  const latestConfig = useRef<Record<string, unknown> | undefined>(undefined)
  latestConfig.current = selected?.config
  const activeName = selected?.name ?? null
  useEffect(() => {
    setDraft(latestConfig.current ? structuredClone(latestConfig.current) : null)
    setInvalid([])
  }, [activeName, syncToken])

  const act = useMutation({
    mutationFn: async (action: PluginAction): Promise<ActionResult> => {
      if (!selected) throw new Error("no plugin selected")
      const body = { name: selected.name, config: draft ?? {} }
      if (action === "save") return (await api.post("/settings/plugins/config", body)).data
      return (await api.post("/settings/plugins/action", { ...body, action })).data
    },
    onSuccess: (result, action) => {
      const message = action === "save"
        ? t("settings.plugins.saved")
        : action === "enable"
          ? t("settings.plugins.enabled")
          : action === "disable"
            ? t("settings.plugins.disabled")
            : t("settings.plugins.reloaded")
      success(result.unloaded?.length ? `${message} · ${t("settings.plugins.unloaded")}: ${result.unloaded.join(", ")}` : message)
      setSyncToken((value) => value + 1)
      void queryClient.invalidateQueries({ queryKey: ["settings", "plugins"] })
    },
    onError: (cause: unknown) => toastError(apiError(cause, t("settings.plugins.failed"))),
  })

  const runAction = async (action: PluginAction) => {
    if (action === "disable") {
      // Disabling cascades through the loader, so the plugins that go down with
      // it are named before the click rather than discovered afterwards.
      const cascade = selected?.dependents ?? []
      const description = cascade.length
        ? `${t("settings.plugins.confirmDisable")}\n${t("settings.plugins.confirmDisableDependents")}: ${cascade.join(", ")}`
        : t("settings.plugins.confirmDisable")
      if (!(await confirm({ description, destructive: true, confirmLabel: t("settings.plugins.disable") }))) return
    }
    act.mutate(action)
  }

  const onValidity = (path: string, valid: boolean) =>
    setInvalid((current) => (valid ? current.filter((item) => item !== path) : current.includes(path) ? current : [...current, path]))

  const blocked = act.isPending || invalid.length > 0
  const status = pluginStatus(selected?.status)

  return (
    <div className="flex h-full min-h-0">
      <ResizableSidebar storageKey="settings-plugins" side="left" defaultWidth={300} minWidth={220} maxWidth={440} className="hidden lg:block lg:h-full">
        <aside className="flex h-full min-h-0 w-full flex-col border-r bg-card">
          <div className="shrink-0 space-y-2 border-b px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Puzzle size={16} />{t("settings.plugins.list")}</div>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("settings.plugins.search")} aria-label={t("settings.plugins.search")} />
            </div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {plugins.isLoading && <div className="space-y-2 p-1">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-11 w-full" />)}</div>}
            {!plugins.isLoading && plugins.isError && <p className="p-3 text-sm text-destructive">{t("settings.plugins.loadFailed")}</p>}
            {!plugins.isLoading && !plugins.isError && !visible.length && <p className="p-3 text-sm text-muted-foreground">{t("settings.plugins.empty")}</p>}
            {visible.map((plugin) => (
              <button
                key={plugin.name}
                type="button"
                onClick={() => setSelectedName(plugin.name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  plugin.name === selected?.name ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", plugin.status === "enabled" ? "bg-emerald-500" : plugin.status === "pending" ? "bg-amber-500" : "bg-muted-foreground/40")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{plugin.title}</span>
                  <span className={cn("block truncate font-mono text-xs", plugin.name === selected?.name ? "text-primary-foreground/70" : "text-muted-foreground")}>{plugin.name}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
      </ResizableSidebar>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="lg:hidden">
            <Select value={selected?.name ?? ""} onValueChange={(next) => setSelectedName(next)}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("settings.plugins.select")} /></SelectTrigger>
              <SelectContent>
                {all.map((plugin) => <SelectItem key={plugin.name} value={plugin.name}>{plugin.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!selected && !plugins.isLoading && (
            <p className={cn("text-sm", plugins.isError ? "text-destructive" : "text-muted-foreground")}>
              {plugins.isError ? t("settings.plugins.loadFailed") : t("settings.plugins.select")}
            </p>
          )}

          {selected && (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                    {selected.title}
                    <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                  </h1>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selected.name}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {selected.enabled ? (
                    <>
                      <Button variant="outline" className="gap-2" disabled={blocked} onClick={() => void runAction("disable")}>
                        <Power size={16} />{t("settings.plugins.disable")}
                      </Button>
                      <Button className="gap-2" disabled={blocked} onClick={() => void runAction("reload")}>
                        {act.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}{t("settings.plugins.reload")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" className="gap-2" disabled={blocked} onClick={() => void runAction("save")}>
                        <Save size={16} />{t("settings.plugins.save")}
                      </Button>
                      <Button className="gap-2" disabled={blocked} onClick={() => void runAction("enable")}>
                        {act.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{t("settings.plugins.enable")}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("settings.plugins.title")}</CardTitle>
                  <CardDescription>
                    {selected.enabled ? t("settings.plugins.saveHint") : t("settings.plugins.disabledHint")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {plugins.isLoading || draft === null ? (
                    <div className="space-y-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-12 w-full" />)}</div>
                  ) : selected.status === "pending" && (
                    <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-muted-foreground">{t("settings.plugins.pendingHint")}</p>
                  )}
                  {!plugins.isLoading && draft !== null && (selected.schema ? (
                    <PluginConfigForm schema={selected.schema} value={draft} onChange={setDraft} onValidity={onValidity} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("settings.plugins.noSchema")}</p>
                  ))}
                </CardContent>
              </Card>

              {(selected.depend.length > 0 || selected.provide.length > 0 || selected.dependents.length > 0) && (
                <Card>
                  <CardContent className="space-y-3 pt-6 text-sm">
                    {selected.depend.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{t("settings.plugins.dependsOn")}</span>
                        {selected.depend.map((name) => <Badge key={name} variant="outline" className="font-mono text-xs">{name}</Badge>)}
                      </div>
                    )}
                    {selected.provide.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{t("settings.plugins.provides")}</span>
                        {selected.provide.map((name) => <Badge key={name} variant="secondary" className="font-mono text-xs">{name}</Badge>)}
                      </div>
                    )}
                    {selected.dependents.length > 0 && (
                      <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">{t("settings.plugins.dependents")}</span>
                          {selected.dependents.map((name) => <Badge key={name} variant="outline" className="font-mono text-xs">{name}</Badge>)}
                        </div>
                        {selected.dependents.some((name) => shortName(name) === "settings") && (
                          <p className="text-xs text-muted-foreground">{t("settings.plugins.dependentsSelf")}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function pluginStatus(status?: string): { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (status === "enabled") return { labelKey: "settings.plugins.status.enabled", variant: "default" }
  if (status === "pending") return { labelKey: "settings.plugins.status.pending", variant: "outline" }
  return { labelKey: "settings.plugins.status.disabled", variant: "secondary" }
}

/** Plugin names are package names; dependencies are named by their short form. */
function shortName(name: string) {
  return name.split("/").pop() ?? name
}

function apiError(cause: unknown, fallback: string) {
  const value = cause as { response?: { data?: { error?: string } }; message?: string }
  return value.response?.data?.error || value.message || fallback
}
