import { useSyncExternalStore, type ComponentType } from "react"

export type DashboardSlotName = string

export interface DashboardSlotRegistration {
  id: string
  slot: DashboardSlotName
  component: ComponentType<Record<string, unknown>>
  order?: number
  scope?: string
}

interface DashboardSlotStore {
  entries: Map<string, DashboardSlotRegistration>
  listeners: Set<() => void>
  revision: number
}

const globalObject = globalThis as typeof globalThis & {
  __VELOCE_DASHBOARD_SLOTS_STORE__?: DashboardSlotStore
}
const store = globalObject.__VELOCE_DASHBOARD_SLOTS_STORE__ ??= {
  entries: new Map<string, DashboardSlotRegistration>(),
  listeners: new Set<() => void>(),
  revision: 0,
}
const notify = () => { store.revision += 1; store.listeners.forEach((listener) => listener()) }
const subscribe = (listener: () => void) => { store.listeners.add(listener); return () => store.listeners.delete(listener) }
const snapshot = () => store.revision

export const dashboardSlots = {
  register(entry: DashboardSlotRegistration) {
    store.entries.set(entry.id, entry)
    notify()
    return () => { store.entries.delete(entry.id); notify() }
  },
  list(slot: DashboardSlotName, scope?: string) {
    return [...store.entries.values()].filter((entry) => entry.slot === slot && entry.scope === scope).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },
}

export function DashboardSlot({ name, className, scope, data }: { name: DashboardSlotName; className?: string; scope?: string; data?: Record<string, unknown> }) {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  const items = dashboardSlots.list(name, scope)
  if (!items.length) return null
  return <div className={className} data-dashboard-slot={name}>{items.map(({ id, component: Component }) => <Component key={id} {...data} />)}</div>
}

declare global { interface Window { __VELOCE_DASHBOARD__?: { slots: typeof dashboardSlots } } }
window.__VELOCE_DASHBOARD__ = { slots: dashboardSlots }
