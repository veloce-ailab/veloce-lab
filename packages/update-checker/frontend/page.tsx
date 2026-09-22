import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Save } from "lucide-react"
import { useMemo, useState } from "react"
import { api, Button } from "@velocelab/dashboard/frontend"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ManagedPlugin { name: string; title: string }
interface PluginUpdate { name: string; currentVersion: string; availableVersion: string; versions: string[]; fixedVersion?: string | null; registryAvailable: boolean; packageFound: boolean }
function options(item: PluginUpdate) { return [...new Set([item.currentVersion, ...item.versions].filter(Boolean))] }

export default function UpdateCheckerPage() {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const installed = useQuery<{ plugins: ManagedPlugin[] }>({ queryKey: ["settings", "plugins", "updates"], queryFn: async () => (await api.get("/settings/plugins")).data })
  const names = useMemo(() => installed.data?.plugins.map((plugin) => plugin.name) || [], [installed.data])
  const check = useQuery<{ plugins: PluginUpdate[] }>({ queryKey: ["update-checker", "plugins", names], enabled: Boolean(names.length), queryFn: async () => (await api.post("/user/update-checker/check", { names })).data })
  const save = useMutation({ mutationFn: async () => api.post("/user/update-checker/pins", { pins: draft }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["update-checker"] }) } })
  const title = new Map((installed.data?.plugins || []).map((plugin) => [plugin.name, plugin.title]))
  const plugins = check.data?.plugins || []
  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">插件更新</h1><p className="mt-2 text-sm text-muted-foreground">从 npm 检查版本，并保存当前用户的版本固定选择。</p></div><Button className="gap-2" disabled={save.isPending || !Object.keys(draft).length} onClick={() => save.mutate()}><Save size={16} />保存更改</Button></div>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>插件</TableHead><TableHead>当前版本</TableHead><TableHead>npm 最新版本</TableHead><TableHead className="min-w-56">固定版本</TableHead></TableRow></TableHeader><TableBody>{plugins.map((item) => { const versions = options(item); const value = draft[item.name] || item.fixedVersion || item.currentVersion || versions[0]; const update = item.packageFound && item.availableVersion !== item.currentVersion; const status = !item.registryAvailable ? "检查失败" : !item.packageFound ? "npm 未发布" : update ? item.availableVersion : `${item.availableVersion}（最新）`; return <TableRow key={item.name}><TableCell><div className="font-medium">{title.get(item.name) || item.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.name}</div></TableCell><TableCell className="font-mono text-sm">{item.currentVersion || "未知"}</TableCell><TableCell className={update ? "font-mono text-sm font-medium text-primary" : "font-mono text-sm text-muted-foreground"}>{status}</TableCell><TableCell><Select value={value} onValueChange={(version) => setDraft((current) => ({ ...current, [item.name]: version }))} disabled={!versions.length}><SelectTrigger className="w-full min-w-48"><SelectValue /></SelectTrigger><SelectContent>{versions.map((version) => <SelectItem key={version} value={version}>{version}{version === item.currentVersion ? "（当前）" : ""}{version === item.availableVersion ? "（最新）" : ""}</SelectItem>)}</SelectContent></Select></TableCell></TableRow>})}{!plugins.length && <TableRow><TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">没有可检查的插件。</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
  </div>
}
