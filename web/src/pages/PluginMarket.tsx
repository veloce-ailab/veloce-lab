import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, Download, ExternalLink, PackageOpen, Store } from "lucide-react"
import { Link } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface PluginMarketItem {
  id: string
  title: string
  repository_url: string
  description: string
  author: string
  author_level: number
  categories: { id: string; name: string }[]
}

interface PluginMarketResponse {
  items?: PluginMarketItem[]
}

export default function PluginMarket() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { success, error } = useToast()
  const { data: marketItems = [], isFetching } = useQuery<PluginMarketItem[]>({
    queryKey: ["plugin-market"],
    queryFn: async () => {
      const res = await api.get<PluginMarketResponse>("/user/plugins/market")
      return Array.isArray(res.data?.items) ? res.data.items : []
    },
  })
  const installFromMarket = useMutation({
    mutationFn: async (item: PluginMarketItem) => api.post(`/user/plugins/market/${encodeURIComponent(item.id)}/install`),
    onSuccess: async () => {
      success("插件已从市场安装")
      await queryClient.invalidateQueries({ queryKey: ["plugins"] })
    },
    onError: (err) => error(apiErrorMessage(err, "插件市场安装失败")),
  })

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5">
          <Link to="/dashboard/plugins"><ChevronLeft size={16} />返回插件</Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold"><Store size={24} />{t("nav.pluginMarket")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">浏览社区审核通过的插件；安装时会下载其 GitHub 最新 Release 并校验 WASM 清单。</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">可安装插件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isFetching && marketItems.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">社区暂时没有可安装插件</div>
          ) : marketItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PackageOpen className="size-4 text-muted-foreground" />
                  <span className="font-medium">{item.title}</span>
                  {item.categories.map((category) => (
                    <span key={category.id} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{category.name}</span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{item.description || "没有描述"}</p>
                <div className="text-xs text-muted-foreground">{item.author}{item.author_level ? ` · Lv.${item.author_level}` : ""}</div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={item.repository_url} target="_blank" rel="noreferrer"><ExternalLink size={14} />仓库</a>
                </Button>
                <Button size="sm" className="gap-2" disabled={installFromMarket.isPending} onClick={() => installFromMarket.mutate(item)}>
                  <Download size={14} />{installFromMarket.isPending ? "安装中" : "安装最新版本"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
