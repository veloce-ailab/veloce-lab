import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { Badge, api } from "@velocelab/dashboard/frontend"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import UpdateCheckerPage from "./page"

type ManagedPlugin = { name: string }
type PluginUpdate = { name: string; currentVersion: string; availableVersion: string; fixedVersion?: string | null; marketMetadataAvailable: boolean }
function PluginVersionNotice({ name }: { name?: string }) {
  const installed = useQuery<{ plugins: ManagedPlugin[] }>({ queryKey: ["settings", "plugins", "update-notice"], queryFn: async () => (await api.get("/settings/plugins")).data })
  const check = useQuery<{ plugins: PluginUpdate[] }>({ queryKey: ["update-checker", "notice", installed.data?.plugins.map((plugin) => plugin.name).join(",")], enabled: Boolean(installed.data?.plugins.length), queryFn: async () => (await api.post("/user/update-checker/check", { names: installed.data?.plugins.map((plugin) => plugin.name) || [] })).data })
  const item = check.data?.plugins.find((plugin) => plugin.name === name)
  if (!item) return null
  if (!item.marketMetadataAvailable) return <Badge variant="secondary">版本 {item.currentVersion || "未知"} · 市场未提供版本数据</Badge>
  const update = item.availableVersion && item.availableVersion !== item.currentVersion
  return <Badge variant={update ? "outline" : "secondary"}>{update ? `可更新：${item.currentVersion} → ${item.availableVersion}` : `已是最新：${item.currentVersion}`}{item.fixedVersion ? ` · 已固定 ${item.fixedVersion}` : ""}</Badge>
}
export function apply(ctx: DashboardContext) {
  ctx.page({ frame: "settings", path: "/settings/plugin-updates", component: UpdateCheckerPage, nav: { id: "settings-plugin-updates", label: "插件更新", icon: RefreshCw, order: 55, scope: "settings", group: "general" } })
  ctx.slot("settings.plugins.header", PluginVersionNotice, "update-checker.plugin-version-notice", 20)
}
export default apply
