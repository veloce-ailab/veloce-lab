import type { ComponentType } from "react"

export interface DashboardRoute { path: string; component: ComponentType; shell?: "layout" | "owned" }
export interface DashboardFrame { id: string; path: string; component: ComponentType }
/** Icon components contributed by plugins: lucide icons and plain components both fit. */
export type DashboardIconComponent = ComponentType<{ size?: number | string; className?: string }>
/** Page body layout hint the owning frame may honor. */
export type DashboardPageLayout = "default" | "full"
export interface DashboardPage extends DashboardRoute {
  frame: string
  nav?: Omit<DashboardNavItem, "path">
  /** Marks the frame landing page: frames use it for breadcrumbs and fallbacks. */
  home?: boolean
  layout?: DashboardPageLayout
}
/**
 * Section a navigation item belongs to. Pass the plain id when another
 * contribution already declares the section; pass the object form to declare the
 * section itself, so the package that owns a capability also owns the heading,
 * its label and its position instead of a central registry knowing about it.
 */
export interface DashboardNavGroup {
  id: string
  /** Literal group label. Use `labelKey` when the label follows the language. */
  label?: string
  labelKey?: string
  /** Sort position of the whole group; the frame decides the fallback. */
  order?: number
}
export interface DashboardNavItem {
  id: string
  path: string
  /** Literal label. Use `labelKey` when the label must follow the active language. */
  label?: string
  /** Translation key resolved through the dashboard i18n dictionary. */
  labelKey?: string
  icon?: DashboardIconComponent
  order?: number
  scope?: string
  group?: string | DashboardNavGroup
}
/** A rendered section: contributions grouped by id, in the order they were declared. */
export interface DashboardNavSection {
  id: string
  label?: string
  labelKey?: string
  /** Only set when a contribution declared one; the frame decides the fallback. */
  order?: number
  items: DashboardNavItem[]
}
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

/**
 * Resolve the visible label of a navigation item. Contributions may pass a
 * translation key, a literal label, or nothing at all; the i18n runtime returns
 * the key itself for unknown entries, so literal labels keep working.
 */
export function navItemLabel(item: DashboardNavItem, t: (key: string) => string): string {
  return t(item.labelKey ?? item.label ?? item.id)
}

declare global {
  interface Window {
    __VELOCE_DASHBOARD_EXTENSION__?: {
      defineExtension(setup: (api: DashboardExtensionApi) => void): void
    }
  }
}

/** Browser entry used by plugin bundles. The dashboard application owns the implementation. */
export function defineExtension(setup: (api: DashboardExtensionApi) => void) { return setup }
