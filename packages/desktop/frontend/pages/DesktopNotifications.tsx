import { Bell, CheckCircle2, ClipboardCheck } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n"
import { isDesktopTarget } from "@/lib/api"
import { getDesktopNotificationPreferences, saveDesktopNotificationPreferences } from "@/lib/desktop-notifications"

export default function DesktopNotifications() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const [preferences, setPreferences] = useState(getDesktopNotificationPreferences)
  const isDesktop = isDesktopTarget()

  const update = (next: Partial<typeof preferences>) => {
    const value = { ...preferences, ...next }
    setPreferences(value)
    saveDesktopNotificationPreferences(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      {!isDesktop && <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">{copy.desktopOnly}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell size={18} />{copy.desktopNotifications}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <NotificationRow title={copy.enableAll} description={copy.enableAllDescription} checked={preferences.enabled} disabled={!isDesktop} onCheckedChange={(enabled) => update({ enabled })} />
          <NotificationRow title={copy.taskCompleted} description={copy.taskCompletedDescription} icon={<CheckCircle2 size={17} />} checked={preferences.taskCompleted} disabled={!isDesktop || !preferences.enabled} onCheckedChange={(taskCompleted) => update({ taskCompleted })} />
          <NotificationRow title={copy.connectorApproval} description={copy.connectorApprovalDescription} icon={<ClipboardCheck size={17} />} checked={preferences.connectorApproval} disabled={!isDesktop || !preferences.enabled} onCheckedChange={(connectorApproval) => update({ connectorApproval })} />
        </CardContent>
      </Card>
    </div>
  )
}

function NotificationRow({ title, description, icon, checked, disabled, onCheckedChange }: { title: string; description: string; icon?: ReactNode; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon || <Bell size={17} />}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{title}</div><div className="mt-0.5 text-xs text-muted-foreground">{description}</div></div><Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={title} /></div>
}

const zhCopy = { title: "通知", subtitle: "为当前桌面端单独设置系统通知。设置仅保存于这台设备。", desktopOnly: "桌面系统通知仅在 Veloce 桌面端可用。", desktopNotifications: "桌面通知", enableAll: "启用桌面通知", enableAllDescription: "关闭后不会显示任何 Veloce 系统通知。", taskCompleted: "任务完成", taskCompletedDescription: "助理任务完成时通知。", connectorApproval: "连接器审批", connectorApprovalDescription: "本地连接器等待批准或拒绝时通知。" }
const enCopy: typeof zhCopy = { title: "Notifications", subtitle: "Configure system notifications for this desktop device. These preferences are stored locally.", desktopOnly: "Desktop system notifications are only available in the Veloce desktop app.", desktopNotifications: "Desktop notifications", enableAll: "Enable desktop notifications", enableAllDescription: "Turn this off to suppress all Veloce system notifications.", taskCompleted: "Task completed", taskCompletedDescription: "Notify when an assistant task finishes.", connectorApproval: "Connector approval", connectorApprovalDescription: "Notify when a local connector awaits approval or rejection." }
