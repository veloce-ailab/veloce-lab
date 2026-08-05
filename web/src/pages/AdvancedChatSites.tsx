import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Globe2, Power, RefreshCcw, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"

interface StaticSite {
  id: string
  device_id: string
  device_name?: string
  domain_name: string
  enabled: boolean
  last_task_id?: string
  created_at?: string
  updated_at?: string
}

interface StaticSiteListResponse {
  sites: StaticSite[]
  max_sites: number
  max_files: number
  max_file_bytes: number
  max_total_bytes: number
}

const staticSitesQueryKey = ["advanced-chat-static-sites"] as const

export default function AdvancedChatSites() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const queryClient = useQueryClient()
  const [pendingSiteID, setPendingSiteID] = useState("")

  const { data, isFetching, refetch } = useQuery<StaticSiteListResponse>({
    queryKey: staticSitesQueryKey,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/static-sites")
      return normalizeStaticSiteList(res.data)
    },
  })
  const sites = data?.sites || []
  const quotaLabel = useMemo(() => {
    if (!data) {
      return ""
    }
    return copy.quota.replace("{used}", String(sites.length)).replace("{max}", String(data.max_sites))
  }, [copy.quota, data, sites.length])

  const setEnabled = useMutation({
    mutationFn: async ({ site, enabled }: { site: StaticSite; enabled: boolean }) => {
      setPendingSiteID(site.id)
      const res = await api.put(`/user/advanced-chat/static-sites/${encodeURIComponent(site.id)}`, { enabled })
      return normalizeStaticSite(res.data?.site || res.data)
    },
    onSuccess: (_, input) => {
      success(input.enabled ? copy.enabled : copy.suspended)
      queryClient.invalidateQueries({ queryKey: staticSitesQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, copy.updateFailed)),
    onSettled: () => setPendingSiteID(""),
  })

  const deleteSite = useMutation({
    mutationFn: async (site: StaticSite) => {
      setPendingSiteID(site.id)
      await api.delete(`/user/advanced-chat/static-sites/${encodeURIComponent(site.id)}`)
    },
    onSuccess: () => {
      success(copy.deleted)
      queryClient.invalidateQueries({ queryKey: staticSitesQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, copy.deleteFailed)),
    onSettled: () => setPendingSiteID(""),
  })

  const remove = async (site: StaticSite) => {
    if (!await confirm({ description: copy.deleteConfirm.replace("{domain}", site.domain_name) })) {
      return
    }
    deleteSite.mutate(site)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{quotaLabel || copy.subtitle}</div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw size={16} />
          {copy.refresh}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 size={18} />
            {copy.list}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : (
            <div className="space-y-3">
              {sites.map((site) => (
                <div key={site.id} className="rounded-md border p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-medium">{site.domain_name}</div>
                        <span className={cn("shrink-0 text-xs", site.enabled ? "text-emerald-600" : "text-amber-600")}>
                          {site.enabled ? copy.enabledStatus : copy.suspendedStatus}
                        </span>
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{site.id}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[site.device_name || site.device_id, formatDateTime(site.updated_at)].filter(Boolean).join(" · ") || "-"}
                      </div>
                      {site.last_task_id && <div className="mt-1 break-all text-xs text-muted-foreground">{copy.lastTask}: {site.last_task_id}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2"
                        disabled={Boolean(pendingSiteID)}
                        onClick={() => setEnabled.mutate({ site, enabled: !site.enabled })}
                      >
                        <Power size={15} />
                        {site.enabled ? copy.suspend : copy.enable}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={Boolean(pendingSiteID)}
                        onClick={() => remove(site)}
                        aria-label={copy.deleteSite}
                        title={copy.deleteSite}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function normalizeStaticSiteList(value: unknown): StaticSiteListResponse {
  const item = isRecord(value) ? value : {}
  return {
    sites: Array.isArray(item.sites) ? item.sites.map(normalizeStaticSite).filter((site): site is StaticSite => Boolean(site)) : [],
    max_sites: numberFromUnknown(item.max_sites) || 20,
    max_files: numberFromUnknown(item.max_files) || 200,
    max_file_bytes: numberFromUnknown(item.max_file_bytes) || 0,
    max_total_bytes: numberFromUnknown(item.max_total_bytes) || 0,
  }
}

function normalizeStaticSite(value: unknown): StaticSite | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    device_id: stringFromUnknown(value.device_id),
    device_name: stringFromUnknown(value.device_name) || undefined,
    domain_name: stringFromUnknown(value.domain_name),
    enabled: value.enabled !== false,
    last_task_id: stringFromUnknown(value.last_task_id) || undefined,
    created_at: stringFromUnknown(value.created_at) || undefined,
    updated_at: stringFromUnknown(value.updated_at) || undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0)
}

function formatDateTime(value?: string) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = {
  title: "站点",
  subtitle: "管理由连接器托管的静态站点。",
  quota: "站点配额：{used}/{max}",
  list: "站点列表",
  empty: "暂无站点。AI 部署静态站点后会显示在这里。",
  refresh: "刷新",
  enabledStatus: "启用",
  suspendedStatus: "已暂停",
  enable: "启用",
  suspend: "暂停",
  enabled: "站点已启用",
  suspended: "站点已暂停",
  updateFailed: "更新站点失败",
  deleteSite: "删除站点",
  deleteConfirm: "确定删除站点 {domain} 吗？",
  deleted: "站点已删除",
  deleteFailed: "删除站点失败",
  lastTask: "最后任务",
}

const enCopy: typeof zhCopy = {
  title: "Sites",
  subtitle: "Manage static sites hosted by connector web servers.",
  quota: "Site quota: {used}/{max}",
  list: "Sites",
  empty: "No sites yet. Sites deployed by AI will appear here.",
  refresh: "Refresh",
  enabledStatus: "Enabled",
  suspendedStatus: "Suspended",
  enable: "Enable",
  suspend: "Suspend",
  enabled: "Site enabled",
  suspended: "Site suspended",
  updateFailed: "Failed to update site",
  deleteSite: "Delete site",
  deleteConfirm: "Delete site {domain}?",
  deleted: "Site deleted",
  deleteFailed: "Failed to delete site",
  lastTask: "Last task",
}

const jaCopy: typeof zhCopy = {
  ...enCopy,
  title: "サイト",
  subtitle: "コネクターでホストされる静的サイトを管理します。",
  list: "サイト一覧",
  empty: "サイトはありません。AI がデプロイしたサイトがここに表示されます。",
}
