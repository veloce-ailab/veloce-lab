import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Infinity as InfinityIcon, Pencil } from "lucide-react"
import { api, useI18n, useToast, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@velocelab/dashboard/frontend"

type Period = "total" | "monthly"

type Quota = {
  user_id: number
  username: string
  email: string
  is_admin: boolean
  limit_amount: number | null
  period: Period
  spent: number
  remaining: number | null
  unlimited: boolean
  request_count: number
  input_tokens: number
  output_tokens: number
}

const copy = {
  zh: {
    title: "用户额度",
    subtitle: (currency: string) =>
      `默认所有用户不限额度，只记录用量。给某个用户设定了上限之后，用尽即停止新的对话请求。金额单位为 ${currency}。`,
    user: "用户",
    usage: "用量",
    requests: "请求数",
    tokens: "Token",
    spent: "已用",
    limit: "额度上限",
    remaining: "剩余",
    period: "周期",
    unlimited: "不限",
    edit: "设置额度",
    dialogTitle: "设置用户额度",
    dialogBody: "留空表示不限制。额度按已记录的用量累计。",
    limitPlaceholder: "留空为不限",
    total: "累计",
    monthly: "每月",
    cancel: "取消",
    save: "保存",
    saved: "额度已保存",
    failed: "额度保存失败",
    empty: "还没有用户。",
    loading: "加载中...",
  },
  en: {
    title: "User quotas",
    subtitle: (currency: string) =>
      `Every user is unlimited by default and usage is only recorded. Once a limit is set, that user stops being able to start new chats when it runs out. Amounts are in ${currency}.`,
    user: "User",
    usage: "Usage",
    requests: "Requests",
    tokens: "Tokens",
    spent: "Spent",
    limit: "Limit",
    remaining: "Remaining",
    period: "Period",
    unlimited: "Unlimited",
    edit: "Set quota",
    dialogTitle: "Set user quota",
    dialogBody: "Leave the limit empty for unlimited. The quota counts recorded usage.",
    limitPlaceholder: "Empty for unlimited",
    total: "All time",
    monthly: "Monthly",
    cancel: "Cancel",
    save: "Save",
    saved: "Quota saved",
    failed: "Could not save the quota",
    empty: "No users yet.",
    loading: "Loading...",
  },
  ja: {
    title: "ユーザー割当",
    subtitle: (currency: string) =>
      `既定では全ユーザーが無制限で、利用量のみ記録します。上限を設定したユーザーは、使い切ると新しいチャットを開始できません。金額の単位は ${currency} です。`,
    user: "ユーザー",
    usage: "利用量",
    requests: "リクエスト数",
    tokens: "トークン",
    spent: "使用額",
    limit: "上限",
    remaining: "残り",
    period: "期間",
    unlimited: "無制限",
    edit: "割当を設定",
    dialogTitle: "ユーザー割当を設定",
    dialogBody: "空欄は無制限です。記録された利用量に対して計算します。",
    limitPlaceholder: "空欄で無制限",
    total: "累計",
    monthly: "毎月",
    cancel: "キャンセル",
    save: "保存",
    saved: "割当を保存しました",
    failed: "割当を保存できませんでした",
    empty: "ユーザーがいません。",
    loading: "読み込み中...",
  },
}

/** Costs are fractions of a currency unit, so a plain `toLocaleString` hides them. */
const money = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  if (value === 0) return "0"
  return Math.abs(value) < 0.01 ? value.toPrecision(3) : value.toFixed(2)
}

const count = (value: number) => (Number.isFinite(value) ? value.toLocaleString() : "-")

export default function UserQuotas() {
  const { language } = useI18n()
  const t = language === "zh" ? copy.zh : language === "ja" ? copy.ja : copy.en
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ quota: Quota; limit: string; period: Period } | null>(null)

  const quotas = useQuery<{ quotas: Quota[]; currency: string }>({
    queryKey: ["billing", "quotas"],
    queryFn: async () => (await api.get("/billing/quotas")).data,
  })
  const rows = useMemo(() => quotas.data?.quotas ?? [], [quotas.data])
  const currency = quotas.data?.currency ?? "USD"

  const save = useMutation({
    mutationFn: async (value: { user_id: number; limit_amount: number | null; period: Period }) =>
      (await api.post("/billing/quotas", value)).data,
    onSuccess: () => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ["billing", "quotas"] })
      toast.success(t.saved)
    },
    onError: () => toast.error(t.failed),
  })

  const submit = () => {
    if (!draft) return
    const trimmed = draft.limit.trim()
    // An empty field clears the limit, returning the user to the default unlimited state.
    const limit = trimmed === "" ? null : Number(trimmed)
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      toast.error(t.failed)
      return
    }
    save.mutate({ user_id: draft.quota.user_id, limit_amount: limit, period: draft.period })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t.subtitle(currency)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {quotas.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.user}</TableHead>
                    <TableHead>{t.requests}</TableHead>
                    <TableHead>{t.tokens}</TableHead>
                    <TableHead>{t.spent}</TableHead>
                    <TableHead>{t.limit}</TableHead>
                    <TableHead>{t.remaining}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((quota) => (
                    <TableRow key={quota.user_id}>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{quota.username || `#${quota.user_id}`}</div>
                          {quota.email && <div className="truncate text-xs text-muted-foreground">{quota.email}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{count(quota.request_count)}</TableCell>
                      <TableCell className="text-sm">{count(quota.input_tokens + quota.output_tokens)}</TableCell>
                      <TableCell className="text-sm">{money(quota.spent)}</TableCell>
                      <TableCell className="text-sm">
                        {quota.unlimited ? (
                          <Badge variant="outline" className="gap-1"><InfinityIcon size={12} />{t.unlimited}</Badge>
                        ) : (
                          <span>
                            {money(quota.limit_amount ?? 0)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {quota.period === "monthly" ? t.monthly : t.total}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {quota.unlimited ? <span className="text-muted-foreground">{t.unlimited}</span> : (
                          <span className={quota.remaining !== null && quota.remaining <= 0 ? "text-destructive" : ""}>
                            {money(quota.remaining ?? 0)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t.edit}
                          onClick={() => setDraft({
                            quota,
                            limit: quota.limit_amount === null ? "" : String(quota.limit_amount),
                            period: quota.period,
                          })}
                        >
                          <Pencil size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogBody}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium">{draft.quota.username || `#${draft.quota.user_id}`}</div>
                <div className="text-xs text-muted-foreground">
                  {t.spent}: {money(draft.quota.spent)} {currency} · {t.requests}: {count(draft.quota.request_count)}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.limit}</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t.limitPlaceholder}
                  value={draft.limit}
                  onChange={(event) => setDraft({ ...draft, limit: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.period}</Label>
                <Select value={draft.period} onValueChange={(value) => setDraft({ ...draft, period: value === "monthly" ? "monthly" : "total" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">{t.total}</SelectItem>
                    <SelectItem value="monthly">{t.monthly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t.cancel}</Button>
            <Button disabled={save.isPending} onClick={submit}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
