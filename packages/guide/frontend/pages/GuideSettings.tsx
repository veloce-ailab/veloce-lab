import { ArrowRight, CheckCircle2, Circle } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DashboardSlot,
  Link,
  PageTitleSlot,
  Skeleton,
  api,
  useI18n,
  useQuery,
} from "@velocelab/dashboard/frontend"

export interface GuideStep {
  id: string
  done: boolean
  detail?: string
  path: string
}

/** The outstanding checklist, and the page every step points back to. */
export default function GuideSettings() {
  const { t } = useI18n()
  const query = useQuery<{ steps: GuideStep[] }>({
    queryKey: ["guide", "steps"],
    queryFn: async () => (await api.get("/guide/steps")).data,
  })
  const steps = query.data?.steps ?? []
  const remaining = steps.filter((step) => !step.done)

  return (
    <div className="space-y-6">
      <DashboardSlot name="guide.before" />
      <div>
        <h1 className="text-3xl font-bold">{t("guide.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("guide.subtitle")}</p>
      </div>
      <PageTitleSlot />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {query.isLoading || query.isError
              ? t("guide.title")
              : remaining.length
                ? `${remaining.length} ${t("guide.remaining")}`
                : t("guide.allDone")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading && <div className="space-y-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-14 w-full" />)}</div>}
          {query.isError && <p className="text-sm text-destructive">{t("guide.loadFailed")}</p>}
          {!query.isLoading && !query.isError && steps.map((step) => (
            <div key={step.id} className="flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {step.done
                  ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                  : <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t(`guide.step.${step.id}.title`)}
                    <Badge variant={step.done ? "secondary" : "outline"}>{step.done ? t("guide.done") : t("guide.todo")}</Badge>
                  </div>
                  {!step.done && <p className="mt-1 text-sm text-muted-foreground">{t(`guide.step.${step.id}.description`)}</p>}
                  {!step.done && step.detail && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{step.detail}</p>}
                </div>
              </div>
              {!step.done && (
                <Button asChild variant="outline" className="shrink-0 gap-2">
                  <Link to={step.path}>{t("guide.open")}<ArrowRight size={16} /></Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <DashboardSlot name="guide.after" />
    </div>
  )
}
