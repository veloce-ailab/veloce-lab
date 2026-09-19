import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
import { api, useI18n, useToast } from "@velocelab/dashboard/frontend"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@velocelab/dashboard/frontend"

type ModelPrice = { id?: number; model_name: string; input_price: string; output_price: string; cached_input_price: string; currency: string; updated_at?: string }
type Draft = Pick<ModelPrice, "model_name" | "input_price" | "output_price" | "cached_input_price" | "currency">
const emptyDraft: Draft = { model_name: "", input_price: "0", output_price: "0", cached_input_price: "0", currency: "USD" }

export default function ModelPrices() {
  const { language } = useI18n()
  const copy = language === "zh" ? zh : language === "ja" ? ja : en
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const prices = useQuery<ModelPrice[]>({ queryKey: ["billing", "model-prices"], queryFn: async () => (await api.get("/billing/model-prices")).data.prices ?? [] })
  const rows = useMemo(() => [...(prices.data ?? [])].sort((a, b) => a.model_name.localeCompare(b.model_name)), [prices.data])
  const save = useMutation({
    mutationFn: async (value: Draft) => (await api.post("/billing/model-prices", value)).data as ModelPrice,
    onSuccess: () => { setDraft(null); queryClient.invalidateQueries({ queryKey: ["billing", "model-prices"] }); toast.success(copy.saved) },
    onError: () => toast.error(copy.saveFailed),
  })
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-bold">{copy.title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.description}</p></div><Button className="gap-2" onClick={() => setDraft({ ...emptyDraft })}><Plus size={16} />{copy.add}</Button></div>
    <Card><CardHeader><CardTitle>{copy.title}</CardTitle></CardHeader><CardContent>{prices.isLoading ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{copy.empty}</p> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{copy.model}</TableHead><TableHead>{copy.input}</TableHead><TableHead>{copy.output}</TableHead><TableHead>{copy.cached}</TableHead><TableHead>{copy.currency}</TableHead><TableHead className="text-right">{copy.actions}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.model_name}><TableCell className="font-mono text-sm">{row.model_name}</TableCell><TableCell>{row.input_price}</TableCell><TableCell>{row.output_price}</TableCell><TableCell>{row.cached_input_price}</TableCell><TableCell><Badge variant="outline">{row.currency}</Badge></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" title={copy.edit} onClick={() => setDraft({ model_name: row.model_name, input_price: row.input_price, output_price: row.output_price, cached_input_price: row.cached_input_price, currency: row.currency })}><Pencil size={16} /></Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}><DialogContent><DialogHeader><DialogTitle>{draft?.model_name ? copy.edit : copy.add}</DialogTitle><DialogDescription>{copy.unit}</DialogDescription></DialogHeader>{draft && <div className="space-y-4"><div className="space-y-2"><Label>{copy.model}</Label><Input value={draft.model_name} disabled={Boolean(rows.find((row) => row.model_name === draft.model_name))} onChange={(event) => setDraft({ ...draft, model_name: event.target.value })} /></div><PriceField label={copy.input} value={draft.input_price} onChange={(value) => setDraft({ ...draft, input_price: value })} /><PriceField label={copy.output} value={draft.output_price} onChange={(value) => setDraft({ ...draft, output_price: value })} /><PriceField label={copy.cached} value={draft.cached_input_price} onChange={(value) => setDraft({ ...draft, cached_input_price: value })} /><div className="space-y-2"><Label>{copy.currency}</Label><Input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>{copy.cancel}</Button><Button disabled={!draft?.model_name.trim() || save.isPending} onClick={() => draft && save.mutate(draft)}>{copy.save}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} /></div> }
const zh = { title: "模型价格", description: "设置每百万 Token 的记录价格。当前只记录费用，不会扣除余额。", add: "添加模型", edit: "编辑模型价格", model: "模型", input: "输入价格", output: "输出价格", cached: "缓存输入价格", currency: "货币", unit: "价格单位：每 1,000,000 Token。", actions: "操作", save: "保存", cancel: "取消", saved: "模型价格已保存", saveFailed: "模型价格保存失败", loading: "加载中...", empty: "还没有配置模型价格" }
const en = { title: "Model prices", description: "Set recorded prices per million tokens. Billing is record-only and does not debit balances.", add: "Add model", edit: "Edit model price", model: "Model", input: "Input price", output: "Output price", cached: "Cached input price", currency: "Currency", unit: "Price unit: per 1,000,000 tokens.", actions: "Actions", save: "Save", cancel: "Cancel", saved: "Model price saved", saveFailed: "Failed to save model price", loading: "Loading...", empty: "No model prices configured" }
const ja = { ...en, title: "モデル価格", description: "100万トークン単位の記録価格を設定します。残高は引き落としません。", add: "モデルを追加", edit: "モデル価格を編集", model: "モデル", input: "入力価格", output: "出力価格", cached: "キャッシュ入力価格", currency: "通貨", unit: "価格単位: 1,000,000トークンあたり。", saved: "モデル価格を保存しました", saveFailed: "モデル価格の保存に失敗しました", empty: "モデル価格が設定されていません" }
