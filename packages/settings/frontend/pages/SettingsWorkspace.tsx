import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Home, LogOut, MessageSquare, Settings as SettingsIcon, UserCircle } from "lucide-react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import {
  AppHeader,
  DashboardFrameOutlet,
  DashboardSlot,
  PageTransition,
  ResizableSidebar,
  api,
  apiURL,
  cn,
  frameHome,
  isDesktopTarget,
  navItemForPath,
  navItemLabel,
  navSections,
  pageForPath,
  subscribeExtensions,
  useI18n,
  withPublicSettingsDefaults,
  type DashboardIconComponent,
  type PublicSettings,
} from "@velocelab/dashboard/frontend"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
}

interface SettingsNavEntry {
  href: string
  label: string
  icon: DashboardIconComponent
}

interface SettingsNavGroup {
  id: string
  label: string
  items: SettingsNavEntry[]
}

type Translate = (key: string) => string

/**
 * Settings shell owned by this plugin. It only knows the contribution contract:
 * pages registered on the `settings` frame, navigation items scoped to
 * `settings`, and translation keys. Which pages exist, in which order they are
 * grouped and which page is the landing page are all decided by the plugins that
 * contribute them.
 */
export default function SettingsWorkspace() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [, refreshNavigation] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const isDesktop = isDesktopTarget()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const homePath = frameHome("settings")
  const fullHeight = pageForPath("settings", location.pathname)?.layout === "full"
  const title = settingsPageTitle(location.pathname, t)
  useEffect(() => subscribeExtensions(() => refreshNavigation((value) => value + 1)), [])

  useEffect(() => {
    if (!isDesktop) {
      return
    }
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title, path: location.pathname }, "*")
  }, [isDesktop, location.pathname, title])

  const logout = () => {
    localStorage.removeItem("token")
    navigate("/login", { replace: true })
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", isDesktop ? "desktop-acrylic-window h-full min-h-0" : "h-screen bg-background")}>
      {!isDesktop && (
        <AppHeader
          publicSettings={publicSettings}
          user={user}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <ResizableSidebar storageKey="settings-navigation" side="left" defaultWidth={288} minWidth={216} maxWidth={440} className="hidden lg:block lg:h-full">
          <SettingsSidebar className="h-full w-full" homePath={homePath} user={user} onLogout={logout} />
        </ResizableSidebar>
        <div className={cn("fixed inset-0 z-40 transition-opacity duration-200 lg:hidden", isDesktop ? "top-0" : "top-16", isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!isSidebarOpen}>
          <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200" aria-label={t("settings.closeMenu")} onClick={() => setIsSidebarOpen(false)} />
          <SettingsSidebar className={cn("relative z-50 max-w-[85vw] transition-transform duration-200 ease-out", isSidebarOpen ? "translate-x-0" : "-translate-x-full")} homePath={homePath} user={user} onLogout={logout} onNavigate={() => setIsSidebarOpen(false)} />
        </div>
        <main className={cn("flex min-h-0 flex-1 flex-col transition-[filter] duration-200", fullHeight ? "overflow-hidden" : "overflow-y-auto", isSidebarOpen && "max-lg:blur-sm")}>
          <DashboardSlot name="content.before" />
          {fullHeight ? (
            <PageTransition transitionKey={location.pathname} className="page-shell-transition h-full min-h-0">
              <DashboardFrameOutlet frame="settings" fallback={homePath} />
            </PageTransition>
          ) : (
            <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
              <PageTransition transitionKey={location.pathname} className="page-shell-transition">
                <div className="space-y-6">
                  <DashboardSlot name="content.header" />
                  <DashboardSlot name="content.toolbar" />
                  <DashboardFrameOutlet frame="settings" fallback={homePath} />
                </div>
              </PageTransition>
            </div>
          )}
          <DashboardSlot name="content.after" />
        </main>
      </div>
    </div>
  )
}

function SettingsSidebar({ homePath, user, onLogout, className, onNavigate }: {
  homePath?: string
  user?: CurrentUser
  onLogout: () => void
  className?: string
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const groups = settingsNavigationGroups(t)
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const toggleGroup = (groupID: string) => setCollapsedGroups((current) => current.includes(groupID) ? current.filter((id) => id !== groupID) : [...current, groupID])
  const displayName = user?.username || user?.email || t("settings.account")
  const initials = avatarInitials(displayName)
  const accountPath = homePath ?? "/chat"

  return (
    <aside className={cn("flex h-full min-h-0 w-full shrink-0 flex-col border-r bg-card", className)}>
      <div className="shrink-0 border-b px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/chat" onClick={onNavigate} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted" title={t("nav.chat")} aria-label={t("nav.chat")}><Home size={15} /></Link>
          <ChevronRight size={13} />
          <span className="font-medium text-foreground">{t("settings.title")}</span>
        </div>
        <Link to={accountPath} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold">
            {user?.avatar_url ? <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" /> : initials || <UserCircle size={18} />}
          </span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{displayName}</span><span className="block truncate text-xs text-muted-foreground">{t("settings.account")}</span></span>
        </Link>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        <DashboardSlot name="settings.sidebar.before" />
        {groups.map((group) => {
          const collapsed = collapsedGroups.includes(group.id)
          return (
            <section key={group.id}>
              <button type="button" className="flex h-8 w-full items-center justify-between rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => toggleGroup(group.id)} aria-expanded={!collapsed}>
                <span>{group.label}</span>
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              {!collapsed && <div className="mt-1 space-y-0.5">{group.items.map((item) => {
                const Icon = item.icon
                return <NavLink key={item.href} to={item.href} onClick={onNavigate} className={({ isActive }) => cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon size={16} /><span className="truncate">{item.label}</span></NavLink>
              })}</div>}
            </section>
          )
        })}
        <DashboardSlot name="settings.sidebar.after" />
      </nav>
      <div className="mt-auto shrink-0 border-t p-3">
        <Link to="/chat" onClick={onNavigate} className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MessageSquare size={16} /><span>{t("nav.chat")}</span></Link>
        <button type="button" onClick={onLogout} className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><LogOut size={16} /><span>{t("common.signOut")}</span></button>
      </div>
    </aside>
  )
}

/**
 * Navigation sections come from the contributions themselves: a package that
 * owns a capability declares its own heading (`group: { id, labelKey, order }`),
 * and this shell only renders what it is given. `settings.group.<id>` stays as a
 * fallback for the shell's own buckets (`general`, `system`), and the same table
 * supplies their default order so undeclared and declared sections interleave
 * predictably.
 */
function settingsNavigationGroups(t: Translate): SettingsNavGroup[] {
  return navSections("settings")
    .map((section, index) => ({ section, index, order: section.order ?? settingsGroupOrder(section.id) }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ section }) => {
      const declared = section.label ?? (section.labelKey ? translate(t, section.labelKey) : undefined)
      return {
        id: section.id,
        label: declared ?? settingsGroupLabel(section.id, t),
        items: section.items.map((item) => ({
          href: item.path,
          label: navItemLabel(item, t),
          icon: item.icon || SettingsIcon,
        })),
      }
    })
}

/** Default order of the shell's own buckets; a declared section keeps its own order. */
function settingsGroupOrder(id: string) {
  const order: Record<string, number> = { general: 10, ai: 20, chat: 30, system: 40 }
  return order[id] ?? 100
}

function settingsGroupLabel(id: string, t: Translate) {
  const key = `settings.group.${id}`
  return translate(t, key) ?? id
}

function translate(t: Translate, key: string) {
  const label = t(key)
  return label === key ? undefined : label
}

function settingsPageTitle(pathname: string, t: Translate) {
  const item = navItemForPath("settings", pathname)
  return item ? navItemLabel(item, t) : t("settings.title")
}

function avatarInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return parts[0]?.slice(0, 2).toUpperCase() || ""
}
