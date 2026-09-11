import { createElement, useSyncExternalStore, type ComponentType } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { dashboardSlots, type DashboardSlotName } from "@/lib/slots"
import type { DashboardContext as DashboardContextType, DashboardPlugin, DashboardRoute, DashboardFrame, DashboardPage, DashboardNavItem } from "./runtime"

export type { DashboardRoute, DashboardFrame, DashboardPage, DashboardNavItem }
export interface DashboardExtensionApi { route(route: DashboardRoute): () => void; frame(frame: DashboardFrame): () => void; page(page: DashboardPage): () => void; nav(item: DashboardNavItem): () => void; slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number, scope?: string): () => void }

interface DashboardExtensionStore {
  routes: DashboardRoute[]
  frames: DashboardFrame[]
  pages: DashboardPage[]
  navItems: DashboardNavItem[]
  listeners: Set<() => void>
  revision: number
}

const globalObject = globalThis as typeof globalThis & {
  __VELOCE_DASHBOARD_EXTENSION_STORE__?: DashboardExtensionStore
}
const store = globalObject.__VELOCE_DASHBOARD_EXTENSION_STORE__ ??= {
  routes: [],
  frames: [],
  pages: [],
  navItems: [],
  listeners: new Set<() => void>(),
  revision: 0,
}
store.frames ??= []
store.pages ??= []
store.revision ??= 0
const notifyExtensions = () => { store.revision += 1; store.listeners.forEach((listener) => listener()) }
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { store.routes.push(route); notifyExtensions(); return () => { const i = store.routes.indexOf(route); if (i >= 0) store.routes.splice(i, 1); notifyExtensions() } },
  frame(frame) { store.frames.push(frame); notifyExtensions(); return () => { const i = store.frames.indexOf(frame); if (i >= 0) store.frames.splice(i, 1); notifyExtensions() } },
  page(page) {
    store.pages.push(page)
    const navItem = page.nav ? { ...page.nav, path: page.path } : undefined
    if (navItem) store.navItems.push(navItem)
    notifyExtensions()
    return () => {
      const i = store.pages.indexOf(page); if (i >= 0) store.pages.splice(i, 1)
      if (navItem) { const ni = store.navItems.indexOf(navItem); if (ni >= 0) store.navItems.splice(ni, 1) }
      notifyExtensions()
    }
  },
  nav(item) { store.navItems.push(item); notifyExtensions(); return () => { const i = store.navItems.indexOf(item); if (i >= 0) store.navItems.splice(i, 1); notifyExtensions() } },
  slot(name, component, id, order = 0, scope) { return dashboardSlots.register({ id, slot: name, component, order, scope }) },
}
export class DashboardContext implements DashboardContextType {
  private readonly effects: Array<() => void | Promise<void>> = []
  private disposed = false
  constructor(private readonly api: DashboardExtensionApi = dashboardExtension, public readonly data: Record<string, unknown> = {}) {}
  route(route: DashboardRoute) { this.track(this.api.route(route)) }
  frame(frame: DashboardFrame) { this.track(this.api.frame(frame)) }
  page(page: DashboardPage) { this.track(this.api.page(page)) }
  nav(item: DashboardNavItem) { this.track(this.api.nav(item)) }
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order = 0, scope?: string) { this.track(this.api.slot(name, component, id, order, scope)) }
  affect(effect: () => void | Promise<void>) { if (this.disposed) { void effect(); return } this.effects.push(effect) }
  async plugin(plugin: DashboardPlugin) { if (!this.disposed) await plugin(this) }
  async dispose() { if (this.disposed) return; this.disposed = true; for (const effect of this.effects.splice(0).reverse()) await effect() }
  private track(dispose: () => void) { this.affect(dispose) }
}
export function routes() { return [...store.routes] }
export function frames() { return [...store.frames] }
export function pages(frame?: string) { return store.pages.filter((page) => frame === undefined || page.frame === frame) }
export function nav(scope?: string) { return store.navItems.filter((item) => item.scope === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
export function subscribeExtensions(listener: () => void) { store.listeners.add(listener); return () => store.listeners.delete(listener) }
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { return setup }

export function DashboardFrameOutlet({ frame, fallback }: { frame: string; fallback?: string }) {
  useSyncExternalStore(subscribeExtensions, () => store.revision, () => store.revision)
  const owner = [...store.frames].reverse().find((item) => item.id === frame)
  const basePath = owner?.path.replace(/\/$/, "") ?? ""
  const registeredPages = pages(frame)
  return (
    <Routes>
      {registeredPages.map((page) => {
        const Component = page.component
        const path = relativePath(page.path, basePath)
        return <Route key={`${frame}:${page.path}`} path={path} element={createElement(Component)} />
      })}
      {fallback ? <Route path="*" element={<Navigate to={fallback} replace />} /> : null}
    </Routes>
  )
}

function relativePath(path: string, basePath: string) {
  if (path === basePath) return ""
  if (basePath && path.startsWith(`${basePath}/`)) return path.slice(basePath.length + 1)
  return path.replace(/^\//, "")
}
