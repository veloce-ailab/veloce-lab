import { createContext, useContext, useEffect, useMemo, useState, type ComponentType } from "react"

export type DashboardSlotName =
  | "app.before" | "app.after"
  | "header.before" | "header.brand.after" | "header.nav" | "header.actions" | "header.after"
  | "sidebar.before" | "sidebar.navigation.before" | "sidebar.navigation.after" | "sidebar.footer" | "sidebar.after"
  | "content.before" | "content.header" | "content.toolbar" | "content.after"
  | "footer.before" | "footer.after"

export interface DashboardSlotRegistration {
  id: string
  slot: DashboardSlotName
  component: ComponentType<Record<string, unknown>>
  order?: number
}

const entries = new Map<string, DashboardSlotRegistration>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export const dashboardSlots = {
  register(entry: DashboardSlotRegistration) {
    entries.set(entry.id, entry)
    notify()
    return () => { entries.delete(entry.id); notify() }
  },
  list(slot: DashboardSlotName) {
    return [...entries.values()].filter((entry) => entry.slot === slot).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },
}

const SlotContext = createContext(0)
export function DashboardSlotProvider({ children }: { children: React.ReactNode }) {
  const [revision, setRevision] = useState(0)
  useEffect(() => { const listener = () => setRevision((value) => value + 1); listeners.add(listener); return () => { listeners.delete(listener) } }, [])
  return <SlotContext.Provider value={revision}>{children}</SlotContext.Provider>
}
export function DashboardSlot({ name, className }: { name: DashboardSlotName; className?: string }) {
  const revision = useContext(SlotContext)
  const items = useMemo(() => dashboardSlots.list(name), [name, revision])
  if (!items.length) return null
  return <div className={className} data-dashboard-slot={name}>{items.map(({ id, component: Component }) => <Component key={id} />)}</div>
}

declare global { interface Window { __VELOCE_DASHBOARD__?: { slots: typeof dashboardSlots } } }
window.__VELOCE_DASHBOARD__ = { slots: dashboardSlots }
