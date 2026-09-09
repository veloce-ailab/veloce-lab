import type { ComponentType } from "react"

export interface DashboardRoute { path: string; component: ComponentType; protected?: boolean; shell?: "layout" | "owned" }
export interface DashboardNavItem { id: string; label: string; path: string; icon?: ComponentType; order?: number; scope?: string }
export type DashboardSlotName = string
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void
  nav(item: DashboardNavItem): () => void
  slot(name: DashboardSlotName, component: ComponentType<Record<string, unknown>>, id: string, order?: number, scope?: string): () => void
}
export interface DashboardContext extends DashboardExtensionApi {
  readonly data: Record<string, unknown>
  affect(effect: () => void | Promise<void>): void
  plugin(plugin: DashboardPlugin): Promise<void>
  dispose(): Promise<void>
}
export type DashboardPlugin = (ctx: DashboardContext) => void | Promise<void>

declare global {
  interface Window {
    __VELOCE_DASHBOARD_EXTENSION__?: {
      defineExtension(setup: (api: DashboardExtensionApi) => void): void
    }
  }
}

/** Browser entry used by plugin bundles. The dashboard application owns the implementation. */
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { return setup }
