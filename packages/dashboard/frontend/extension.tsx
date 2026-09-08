import type { ComponentType } from "react"
import { dashboardSlots, type DashboardSlotName } from "./lib/slots"

export interface DashboardRoute { path: string; component: ComponentType; protected?: boolean; shell?: "layout" | "owned" }
export interface DashboardNavItem { id: string; label: string; path: string; icon?: ComponentType; order?: number; scope?: string }
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void
  nav(item: DashboardNavItem): () => void
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number, scope?: string): () => void
}
const registeredRoutes: DashboardRoute[] = []
const navItems: DashboardNavItem[] = []
const extensionListeners = new Set<() => void>()
const notifyExtensions = () => extensionListeners.forEach((listener) => listener())
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { registeredRoutes.push(route); notifyExtensions(); return () => { const i = registeredRoutes.indexOf(route); if (i >= 0) registeredRoutes.splice(i, 1); notifyExtensions() } },
  nav(item) { navItems.push(item); notifyExtensions(); return () => { const i = navItems.indexOf(item); if (i >= 0) navItems.splice(i, 1); notifyExtensions() } },
  slot(name, component, id, order = 0, scope) { return dashboardSlots.register({ id, slot: name, component, order, scope }) },
}
export function routes() { return [...registeredRoutes] }
export function nav(scope?: string) { return navItems.filter((item) => item.scope === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
export function subscribeExtensions(listener: () => void) { extensionListeners.add(listener); return () => extensionListeners.delete(listener) }
export function defineExtension(setup: (api: DashboardExtensionApi) => void) {
  if (typeof window !== "undefined" && window.__VELOCE_DASHBOARD_EXTENSION__ && window.__VELOCE_DASHBOARD_EXTENSION__.defineExtension !== defineExtension) {
    window.__VELOCE_DASHBOARD_EXTENSION__.defineExtension(setup)
  } else setup(dashboardExtension)
  return dashboardExtension
}

declare global { interface Window { __VELOCE_DASHBOARD_EXTENSION__?: { defineExtension(setup: (api: DashboardExtensionApi) => void): void } } }
if (typeof window !== "undefined") {
  window.__VELOCE_DASHBOARD_EXTENSION__ = { defineExtension: (setup) => setup(dashboardExtension) }
}
