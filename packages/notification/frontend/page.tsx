import { Bell, BellRing } from "lucide-react"
import { useState } from "react"
import { Button } from "@velocelab/dashboard/frontend"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function NotificationSettings() {
  const [permission, setPermission] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  const request = async () => { if (!("Notification" in window)) return; setPermission(await Notification.requestPermission()) }
  const test = async () => { const registration = await navigator.serviceWorker.ready; registration.active?.postMessage({ type: "veloce.notification", title: "Veloce 通知测试", body: "网页通知已经就绪。", tag: "veloce-notification-test", url: "/settings/notifications" }) }
  const granted = permission === "granted"
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="text-3xl font-bold">通知</h1><p className="mt-2 text-sm text-muted-foreground">管理此浏览器的网页通知权限。</p></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell size={20} />网页通知</CardTitle><CardDescription>{granted ? "浏览器已允许 Veloce 发送网页通知。" : permission === "denied" ? "浏览器已拒绝通知，请在浏览器站点权限中重新允许。" : "允许后，Veloce 可以在后台显示重要提醒。"}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{!granted && <Button onClick={() => void request()}><BellRing size={16} />允许通知</Button>}{granted && <Button variant="outline" onClick={() => void test()}><BellRing size={16} />发送测试通知</Button>}</CardContent></Card></div>
}
