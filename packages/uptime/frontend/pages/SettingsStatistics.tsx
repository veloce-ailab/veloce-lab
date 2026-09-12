import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useMemo, useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"

type UsagePoint = { date: string; request_count: number; total_tokens: number; total_cost: string | number }
type UsageResponse = { from: string; to: string; summary: { request_count: number; input_tokens: number; output_tokens: number; total_tokens: number; total_cost: string | number }; series: UsagePoint[] }

function isoDate(date: Date) { return date.toISOString().slice(0, 10) }

export default function SettingsStatistics() {
  const initialTo = isoDate(new Date())
  const initialFrom = isoDate(new Date(Date.now() - 29 * 86400000))
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [range, setRange] = useState({ from: initialFrom, to: initialTo })
  const usage = useQuery<UsageResponse>({
    queryKey: ["user-usage-statistics", range],
    queryFn: async () => (await api.get("/user/usage/statistics", { params: range })).data,
  })
  const summary = usage.data?.summary
  const series = useMemo(() => usage.data?.series || [], [usage.data])
  const apply = () => { if (from && to && from <= to) setRange({ from, to }) }
  const formatNumber = (value: number | undefined) => (value || 0).toLocaleString()
  const formatCost = (value: string | number | undefined) => Number(value || 0).toFixed(4)

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-3xl font-bold">统计信息</h1><p className="mt-2 text-sm text-muted-foreground">查看你在当前时间范围内的调用量和费用。</p></div>
      <div className="flex flex-wrap items-end gap-2"><label className="w-40 text-xs text-muted-foreground">开始日期<DatePicker value={from} onValueChange={setFrom} className="mt-1 h-9" /></label><label className="w-40 text-xs text-muted-foreground">结束日期<DatePicker value={to} onValueChange={setTo} className="mt-1 h-9" /></label><Button size="sm" onClick={apply}>筛选</Button></div>
    </div>
    {usage.isError && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">统计信息加载失败。</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[["请求数", formatNumber(summary?.request_count)], ["总 Token", formatNumber(summary?.total_tokens)], ["输入 Token", formatNumber(summary?.input_tokens)], ["输出 Token", formatNumber(summary?.output_tokens)], ["费用", formatCost(summary?.total_cost)]].map(([label, value]) => <Card key={label} size="sm"><CardContent><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{usage.isLoading ? "..." : value}</div></CardContent></Card>)}
    </div>
    <Card>
      <CardHeader><CardTitle>每日用量</CardTitle><CardDescription>按天统计请求数和 Token。</CardDescription></CardHeader>
      <CardContent className="h-[320px]">{series.length === 0 && !usage.isLoading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">所选时间范围暂无数据。</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => [Number(value || 0).toLocaleString(), name === "request_count" ? "请求数" : "总 Token"]} /><Bar dataKey="request_count" name="request_count" fill="var(--primary)" radius={[3, 3, 0, 0]} /><Bar dataKey="total_tokens" name="total_tokens" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>}</CardContent>
    </Card>
  </div>
}
