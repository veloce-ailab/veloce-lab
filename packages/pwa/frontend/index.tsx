import { useEffect } from "react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"

type WindowControlsOverlay = EventTarget & { visible: boolean }
type NavigatorWithOverlay = Navigator & { windowControlsOverlay?: WindowControlsOverlay }
function PWARegistration({ themeColor, iconUrl, windowControlsOverlay = true, followBrowserTitlebarHeight = true, titlebarHeightPx = 40 }: { themeColor?: string; iconUrl?: string; windowControlsOverlay?: boolean; followBrowserTitlebarHeight?: boolean; titlebarHeightPx?: number }) {
  useEffect(() => {
    const manifest = document.createElement("link"); manifest.rel = "manifest"; manifest.href = "/pwa-manifest.webmanifest"; document.head.append(manifest)
    const theme = document.createElement("meta"); theme.name = "theme-color"; theme.content = themeColor || "#09090b"; document.head.append(theme)
    const icon = document.createElement("link"); icon.rel = "icon"; icon.href = iconUrl || "/logo.png"; document.head.append(icon)
    const height = followBrowserTitlebarHeight ? "env(titlebar-area-height,auto)" : `${Math.max(24, Math.min(120, Number(titlebarHeightPx) || 40))}px`
    const overlayStyle = document.createElement("style"); overlayStyle.textContent = `.pwa-window-controls-overlay .pwa-titlebar{width:env(titlebar-area-width,100%);height:${height};margin-left:env(titlebar-area-x,0px);-webkit-app-region:drag}.pwa-window-controls-overlay .pwa-titlebar a,.pwa-window-controls-overlay .pwa-titlebar button,.pwa-window-controls-overlay .pwa-titlebar input,.pwa-window-controls-overlay .pwa-titlebar select{-webkit-app-region:no-drag}`; document.head.append(overlayStyle)
    const root = document.documentElement
    const overlay = (navigator as NavigatorWithOverlay).windowControlsOverlay
    const updateOverlay = () => root.classList.toggle("pwa-window-controls-overlay", Boolean(windowControlsOverlay && overlay?.visible))
    updateOverlay(); overlay?.addEventListener("geometrychange", updateOverlay)
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/pwa-service-worker.js", { scope: "/" }).catch(() => undefined)
    return () => { manifest.remove(); theme.remove(); icon.remove(); overlayStyle.remove(); root.classList.remove("pwa-window-controls-overlay"); overlay?.removeEventListener("geometrychange", updateOverlay) }
  }, [themeColor, iconUrl, windowControlsOverlay, followBrowserTitlebarHeight, titlebarHeightPx])
  return null
}
export function apply(ctx: DashboardContext) { ctx.slot("app.after", PWARegistration, "pwa.registration", 100) }
export default apply
