import { useEffect } from "react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"

function PWARegistration({ themeColor, iconUrl }: { themeColor?: string; iconUrl?: string }) {
  useEffect(() => {
    const manifest = document.createElement("link"); manifest.rel = "manifest"; manifest.href = "/pwa-manifest.webmanifest"; document.head.append(manifest)
    const theme = document.createElement("meta"); theme.name = "theme-color"; theme.content = themeColor || "#09090b"; document.head.append(theme)
    const icon = document.createElement("link"); icon.rel = "icon"; icon.href = iconUrl || "/logo.png"; document.head.append(icon)
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/pwa-service-worker.js", { scope: "/" }).catch(() => undefined)
    return () => { manifest.remove(); theme.remove(); icon.remove() }
  }, [themeColor, iconUrl])
  return null
}
export function apply(ctx: DashboardContext) { ctx.slot("app.after", PWARegistration, "pwa.registration", 100) }
export default apply
