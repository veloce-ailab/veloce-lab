import type { ComponentType } from "react"
import { dashboardSlots, type DashboardSlotName } from "./lib/slots"
import type { DashboardContext as DashboardContextType, DashboardPlugin } from "./runtime"

export interface DashboardRoute { path: string; component: ComponentType; protected?: boolean; shell?: "layout" | "owned" }
export interface DashboardNavItem { id: string; label: string; path: string; icon?: ComponentType; order?: number; scope?: string }
export interface DashboardExtensionApi { route(route: DashboardRoute): () => void; nav(item: DashboardNavItem): () => void; slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number, scope?: string): () => void }

const registeredRoutes: DashboardRoute[] = []
const navItems: DashboardNavItem[] = []
const extensionListeners = new Set<() => void>()
const notifyExtensions = () => extensionListeners.forEach((listener) => listener())
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { registeredRoutes.push(route); notifyExtensions(); return () => { const i = registeredRoutes.indexOf(route); if (i >= 0) registeredRoutes.splice(i, 1); notifyExtensions() } },
  nav(item) { navItems.push(item); notifyExtensions(); return () => { const i = navItems.indexOf(item); if (i >= 0) navItems.splice(i, 1); notifyExtensions() } },
  slot(name, component, id, order = 0, scope) { return dashboardSlots.register({ id, slot: name, component, order, scope }) },
}
export class DashboardContext implements DashboardContextType {
  private readonly effects: Array<() => void | Promise<void>> = []
  private disposed = false
  constructor(private readonly api: DashboardExtensionApi = dashboardExtension, public readonly data: Record<string, unknown> = {}) {}
  route(route: DashboardRoute) { this.track(this.api.route(route)) }
  nav(item: DashboardNavItem) { this.track(this.api.nav(item)) }
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order = 0, scope?: string) { this.track(this.api.slot(name, component, id, order, scope)) }
  affect(effect: () => void | Promise<void>) { if (this.disposed) { void effect(); return } this.effects.push(effect) }
  async plugin(plugin: DashboardPlugin) { if (!this.disposed) await plugin(this) }
  async dispose() { if (this.disposed) return; this.disposed = true; for (const effect of this.effects.splice(0).reverse()) await effect() }
  private track(dispose: () => void) { this.affect(dispose) }
}
export function routes() { return [...registeredRoutes] }
export function nav(scope?: string) { return navItems.filter((item) => item.scope === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
export function subscribeExtensions(listener: () => void) { extensionListeners.add(listener); return () => extensionListeners.delete(listener) }
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { return setup }
