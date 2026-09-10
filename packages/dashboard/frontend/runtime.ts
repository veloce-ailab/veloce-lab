import type { ComponentType } from "react"

export interface DashboardRoute { path: string; component: ComponentType; shell?: "layout" | "owned" }
export interface DashboardFrame { id: string; path: string; component: ComponentType }
export interface DashboardPage extends DashboardRoute { frame: string }
export interface DashboardNavItem { id: string; label: string; path: string; icon?: ComponentType; order?: number; scope?: string; group?: string }
export type DashboardSlotName = string
export interface DashboardExtensionApi {
  route(route: DashboardRoute): () => void
  /** Register a shell which owns the chrome around a group of pages. */
  frame(frame: DashboardFrame): () => void
  /** Register a page in the body of a frame. */
  page(page: DashboardPage): () => void
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
