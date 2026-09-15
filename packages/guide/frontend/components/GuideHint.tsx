import { ArrowRight, Compass } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  Link,
  api,
  useI18n,
  useQuery,
} from "@velocelab/dashboard/frontend"

interface GuideStep {
  id: string
  done: boolean
  detail?: string
  path: string
}

/**
 * Contributed into `settings.plugins.before`. It shows the first outstanding
 * step and nothing else, because a hint that appears next to the work is only
 * welcome while it is short; the full list stays on the guide page, and the card
 * disappears entirely once everything is settled.
 */
export default function GuideHint() {
  const { t } = useI18n()
  const query = useQuery<{ steps: GuideStep[] }>({
    queryKey: ["guide", "steps"],
    queryFn: async () => (await api.get("/guide/steps")).data,
  })
  const next = query.data?.steps.find((step) => !step.done)
  if (!next) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Compass size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{t(`guide.step.${next.id}.title`)}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t(`guide.step.${next.id}.description`)}</p>
            {next.detail && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{next.detail}</p>}
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 gap-2">
          <Link to={next.path}>{t("guide.open")}<ArrowRight size={16} /></Link>
        </Button>
      </CardContent>
    </Card>
  )
}
