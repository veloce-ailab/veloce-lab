import { Bell, BellRing, CheckCircle2, ClipboardCheck } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@velocelab/dashboard/frontend"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from "@/lib/desktop-notifications"

function PreferenceRow({ title, description, checked, disabled, icon, onCheckedChange }: { title: string; description: string; checked: boolean; disabled?: boolean; icon: ReactNode; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div className="flex min-w-0 gap-3">{icon}<div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div><Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} /></div>
}

export default function NotificationSettings() {
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  const [preferences, setPreferences] = useState<NotificationPreferences>(getNotificationPreferences)
  const update = (next: Partial<NotificationPreferences>) => { const value = { ...preferences, ...next }; setPreferences(value); saveNotificationPreferences(value) }
  const request = async () => { if (!("Notification" in window)) return; setPermission(await Notification.requestPermission()) }
  const test = async () => { const registration = await navigator.serviceWorker.ready; registration.active?.postMessage({ type: "veloce.notification", title: "Veloce 通知测试", body: "网页通知已经就绪。", tag: "veloce-notification-test", url: "/settings/notifications" }) }
  const granted = permission === "granted"
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="text-3xl font-bold">通知</h1><p className="mt-2 text-sm text-muted-foreground">管理此浏览器的网页通知和提醒类型。</p></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell size={20} />网页通知</CardTitle><CardDescription>{granted ? "浏览器已允许 Veloce 发送网页通知。" : permission === "denied" ? "浏览器已拒绝通知，请在浏览器站点权限中重新允许。" : "允许后，Veloce 可以在后台显示重要提醒。"}</CardDescription></CardHeader><CardContent className="space-y-3">{!granted && <Button onClick={() => void request()}><BellRing size={16} />允许通知</Button>}{granted && <Button variant="outline" onClick={() => void test()}><BellRing size={16} />发送测试通知</Button>}<PreferenceRow title="启用通知" description="关闭后不会显示任何 Veloce 网页通知。" icon={<Bell className="mt-0.5 shrink-0" size={18} />} checked={preferences.enabled} disabled={!granted} onCheckedChange={(enabled) => update({ enabled })} /><PreferenceRow title="任务完成" description="助理任务完成时发送通知。" icon={<CheckCircle2 className="mt-0.5 shrink-0" size={18} />} checked={preferences.taskCompleted} disabled={!granted || !preferences.enabled} onCheckedChange={(taskCompleted) => update({ taskCompleted })} /><PreferenceRow title="连接器审批" description="本地连接器等待批准或拒绝时发送通知。" icon={<ClipboardCheck className="mt-0.5 shrink-0" size={18} />} checked={preferences.connectorApproval} disabled={!granted || !preferences.enabled} onCheckedChange={(connectorApproval) => update({ connectorApproval })} /></CardContent></Card></div>
}
