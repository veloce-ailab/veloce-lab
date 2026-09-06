import type { ComponentType } from "react"
import { dashboardSlots, type DashboardSlotName } from "./lib/slots"

export interface DashboardRoute { path: string; component: ComponentType; protected?: boolean }
export interface DashboardNavItem { id: string; label: string; path: string; icon?: ComponentType; order?: number }
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void
  nav(item: DashboardNavItem): () => void
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number): () => void
}
const routes: DashboardRoute[] = []
const navItems: DashboardNavItem[] = []
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) } },
  nav(item) { navItems.push(item); return () => { const i = navItems.indexOf(item); if (i >= 0) navItems.splice(i, 1) } },
  slot(name, component, id, order = 0) { return dashboardSlots.register({ id, slot: name, component, order }) },
}
export function routes() { return [...routes] }
export function nav() { return [...navItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { setup(dashboardExtension); return dashboardExtension }
