import type { ComponentType } from "react"
import { dashboardSlots, type DashboardSlotName } from "@/lib/slots"
import type { DashboardContext as DashboardContextType, DashboardPlugin, DashboardRoute, DashboardNavItem } from "./runtime"

export type { DashboardRoute, DashboardNavItem }
export interface DashboardExtensionApi { route(route: DashboardRoute): () => void; page(route: DashboardRoute): () => void; nav(item: DashboardNavItem): () => void; slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number, scope?: string): () => void }

interface DashboardExtensionStore {
  routes: DashboardRoute[]
  navItems: DashboardNavItem[]
  listeners: Set<() => void>
}

const globalObject = globalThis as typeof globalThis & {
  __VELOCE_DASHBOARD_EXTENSION_STORE__?: DashboardExtensionStore
}
const store = globalObject.__VELOCE_DASHBOARD_EXTENSION_STORE__ ??= {
  routes: [],
  navItems: [],
  listeners: new Set<() => void>(),
}
const notifyExtensions = () => store.listeners.forEach((listener) => listener())
export const dashboardExtension: DashboardExtensionApi = {
  route(route) { store.routes.push(route); notifyExtensions(); return () => { const i = store.routes.indexOf(route); if (i >= 0) store.routes.splice(i, 1); notifyExtensions() } },
  page(route) { return this.route(route) },
  nav(item) { store.navItems.push(item); notifyExtensions(); return () => { const i = store.navItems.indexOf(item); if (i >= 0) store.navItems.splice(i, 1); notifyExtensions() } },
  slot(name, component, id, order = 0, scope) { return dashboardSlots.register({ id, slot: name, component, order, scope }) },
}
export class DashboardContext implements DashboardContextType {
  private readonly effects: Array<() => void | Promise<void>> = []
  private disposed = false
  constructor(private readonly api: DashboardExtensionApi = dashboardExtension, public readonly data: Record<string, unknown> = {}) {}
  route(route: DashboardRoute) { this.track(this.api.route(route)) }
  page(route: DashboardRoute) { this.track(this.api.page(route)) }
  nav(item: DashboardNavItem) { this.track(this.api.nav(item)) }
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order = 0, scope?: string) { this.track(this.api.slot(name, component, id, order, scope)) }
  affect(effect: () => void | Promise<void>) { if (this.disposed) { void effect(); return } this.effects.push(effect) }
  async plugin(plugin: DashboardPlugin) { if (!this.disposed) await plugin(this) }
  async dispose() { if (this.disposed) return; this.disposed = true; for (const effect of this.effects.splice(0).reverse()) await effect() }
  private track(dispose: () => void) { this.affect(dispose) }
}
export function routes() { return [...store.routes] }
export function nav(scope?: string) { return store.navItems.filter((item) => item.scope === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }
export function subscribeExtensions(listener: () => void) { store.listeners.add(listener); return () => store.listeners.delete(listener) }
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { return setup }
