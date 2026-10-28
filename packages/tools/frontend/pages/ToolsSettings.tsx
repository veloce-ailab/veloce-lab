import { useMemo } from "react"
import { Loader2, Power, PowerOff, Wrench } from "lucide-react"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, api, cn, useI18n, useMutation, useQuery, useQueryClient, useToast } from "@velocelab/dashboard/frontend"

interface Tool { name: string; description: string; parameters: Record<string, unknown>; enabled: boolean }

export default function ToolsSettings() {
  const { t } = useI18n()
  const { success, error } = useToast()
  const queryClient = useQueryClient()
  const tools = useQuery<{ tools: Tool[] }>({ queryKey: ["tools", "registered"], queryFn: async () => (await api.get("/tools")).data })
  const toggle = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => (await api.post(`/tools/${encodeURIComponent(name)}`, { enabled })).data,
    onSuccess: (_data, variables) => { success(variables.enabled ? t("tools.enabled") : t("tools.disabled")); void queryClient.invalidateQueries({ queryKey: ["tools", "registered"] }) },
    onError: (cause: unknown) => error((cause as { response?: { data?: { error?: string } } }).response?.data?.error ?? t("tools.failed")),
  })
  const registered = useMemo(() => tools.data?.tools ?? [], [tools.data])
  return <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Wrench size={22} />{t("tools.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("tools.description")}</p></div>
    <Card><CardHeader><CardTitle className="text-base">{t("tools.registered")}</CardTitle></CardHeader><CardContent className="space-y-2">
      {tools.isLoading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />{t("tools.loading")}</div>}
      {!tools.isLoading && !registered.length && <p className="py-6 text-sm text-muted-foreground">{t("tools.empty")}</p>}
      {registered.map((tool) => <div key={tool.name} className="flex items-start gap-3 rounded-md border p-3">
        <Wrench size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-medium">{tool.name}</span><Badge variant={tool.enabled ? "default" : "secondary"}>{tool.enabled ? t("tools.on") : t("tools.off")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{tool.description}</p></div>
        <Button variant="outline" size="sm" className={cn("shrink-0 gap-1.5", !tool.enabled && "text-muted-foreground")} disabled={toggle.isPending} onClick={() => toggle.mutate({ name: tool.name, enabled: !tool.enabled })}>{tool.enabled ? <PowerOff size={15} /> : <Power size={15} />}{tool.enabled ? t("tools.disable") : t("tools.enable")}</Button>
      </div>)}
    </CardContent></Card>
  </div>
}
