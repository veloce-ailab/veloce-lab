import { Bot, ChevronRight, Home, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings as SettingsIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PageTransition } from "@/components/layout/PageTransition"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { api, isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { withPublicSettingsDefaults, type PublicSettings } from "@/lib/public-settings"
import { cn } from "@/lib/utils"
import { DashboardSlot } from "@/lib/slots"
import {
  DashboardFrameOutlet,
  frameHome,
  navItemForPath,
  navItemLabel,
  navSections,
  pageForPath,
  subscribeExtensions,
  type DashboardNavItem,
  type DashboardNavSection,
} from "@velocelab/dashboard/frontend"

interface GlobalChatSession {
  id: string
  title?: string
  updated_at?: string
  created_at?: string
  archived?: boolean
}

interface ChatSidebarItem {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}

type Translate = (key: string) => string

const chatHomePath = "/chat"
const EMPTY_GLOBAL_SESSIONS: GlobalChatSession[] = []

/**
 * The chat frame. It owns the chrome around every `/chat/*` page and nothing
 * else: the pages themselves — including this plugin's own chat page — are
 * contributions, so a package that adds a chat capability only registers a page
 * and appears in the menu below.
 *
 * The menu has two levels. Items in the `direct` section are listed flat;
 * every other section is a heading that opens its own list of pages, which is
 * how a package introduces a new submenu without editing this file.
 */
export default function ChatWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const { language, t } = useI18n()
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")
  const { data: globalSessions = EMPTY_GLOBAL_SESSIONS } = useQuery<GlobalChatSession[]>({
    queryKey: ["advanced-chat-global-session-search"],
    enabled: isGlobalSearchOpen,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const filteredGlobalSessions = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()
    return globalSessions.slice()
      .filter((session) => session.archived !== true)
      .filter((session) => !query || (session.title || "").toLowerCase().includes(query))
      .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""))
      .slice(0, 50)
  }, [globalSearch, globalSessions])
  const { data: settings, isLoading: isSettingsLoading } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const isDesktop = isDesktopTarget()
  const isHome = location.pathname === chatHomePath || location.pathname.startsWith(`${chatHomePath}/session/`)
  // Pages that need the whole viewport declare `layout: "full"` when they register.
  const fullHeight = pageForPath("chat", location.pathname)?.layout === "full"
  const transitionKey = isHome ? chatHomePath : location.pathname
  const viewportHeightClass = isDesktopTarget() ? "h-full" : "h-dvh"

  useEffect(() => {
    if (!isDesktopTarget()) {
      return
    }
    const item = navItemForPath("chat", location.pathname)
    const title = item ? navItemLabel(item, t) : t("nav.chat")
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title, path: location.pathname }, "*")
  }, [location.pathname, t])

  if (isSettingsLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-background text-sm text-muted-foreground", viewportHeightClass)}>
        {t("common.loading")}
      </div>
    )
  }

  return (
    <SidebarProvider className={cn("overflow-hidden", isDesktop ? "desktop-acrylic-window" : "bg-background", viewportHeightClass)}>
      <ChatWorkspaceSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
      {/* The top bar is a contribution, not part of this frame: the frame hands
          over the control that drives its own sidebar and keeps the search. */}
      <DashboardSlot
        name="frame.topbar"
        className="shrink-0"
        data={{
          frame: "chat",
          leading: <SidebarTrigger className="h-8 w-8 md:hidden" aria-label={t("advancedChat.openMenu")} />,
          actions: (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsGlobalSearchOpen(true)} aria-label={language === "zh" ? "搜索会话" : "Search sessions"} title={language === "zh" ? "搜索会话" : "Search sessions"}><Search size={17} /></Button>
              <DashboardSlot name="topbar.actions" className="flex items-center gap-3" />
              <div id="chat-header-actions-slot" className="flex items-center gap-1" />
            </>
          ),
        }}
      />

      <div className={cn("flex min-h-0 flex-1", fullHeight && "bg-background")}>
        <main className={cn("flex min-h-0 min-w-0 flex-1 flex-col", fullHeight ? "overflow-hidden" : "overflow-y-auto bg-muted/20")}>
          <div className={cn("w-full flex-1", fullHeight ? "min-h-0" : "min-h-full p-4 sm:p-6 lg:p-8")}>
            <PageTransition transitionKey={transitionKey} className={cn("page-shell-transition", fullHeight && "h-full min-h-0")}>
              <div className={cn(fullHeight ? "h-full" : "space-y-6")}>
                <DashboardFrameOutlet frame="chat" fallback={chatHomePath} />
              </div>
            </PageTransition>
          </div>
          {!fullHeight && publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
      </SidebarInset>
      <Dialog open={isGlobalSearchOpen} onOpenChange={(open) => { setIsGlobalSearchOpen(open); if (!open) setGlobalSearch("") }}>
        <DialogContent className="max-h-[75vh] max-w-lg overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>{language === "zh" ? "搜索会话" : "Search sessions"}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <Input
              autoFocus
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder={language === "zh" ? "搜索会话标题" : "Search session titles"}
              aria-label={language === "zh" ? "搜索会话标题" : "Search session titles"}
              className="h-10"
            />
            <div className="mt-3 max-h-[48vh] overflow-y-auto rounded-md border p-1">
              {filteredGlobalSessions.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">{language === "zh" ? "没有找到会话" : "No sessions found"}</div>
              ) : filteredGlobalSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="flex min-h-10 w-full items-center rounded px-2 text-left hover:bg-muted"
                  onClick={() => { navigate(`/chat/session/${encodeURIComponent(session.id)}`); setIsGlobalSearchOpen(false); setGlobalSearch("") }}
                >
                  <span className="truncate text-sm font-medium">{session.title || (language === "zh" ? "未命名会话" : "Untitled session")}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}

function ChatWorkspaceSidebar() {
  const { isMobile, open } = useSidebar()
  const [hovered, setHovered] = useState(false)
  const preview = !isMobile && !open && hovered

  return (
    <Sidebar
      variant="floating"
      collapsible={isMobile ? "offcanvas" : "icon"}
      style={{ width: preview ? "var(--sidebar-width)" : undefined }}
      className={cn("motion-reduce:transition-none [&>[data-slot=sidebar-inner]]:overflow-hidden", preview && "z-40 [&>[data-slot=sidebar-inner]]:shadow-lg")}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
    >
      <ChatSidebar compact={!isMobile && !open && !preview} sessionSlotID="chat-sessions-sidebar-slot" />
    </Sidebar>
  )
}

function ChatSidebar({
  className,
  onNavigate,
  sessionSlotID,
  compact = false,
}: {
  className?: string
  onNavigate?: () => void
  sessionSlotID?: string
  compact?: boolean
}) {
  const location = useLocation()
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar()
  const { language, t } = useI18n()
  const [, refreshNavigation] = useState(0)
  // The settings frame decides its own landing page, so the entry point is
  // looked up rather than guessed.
  const settingsPath = frameHome("settings")
  useEffect(() => subscribeExtensions(() => refreshNavigation((value) => value + 1)), [])
  const homeItem: ChatSidebarItem = {
    href: `${chatHomePath}?new_session=1`,
    label: language === "zh" ? "主页" : language === "ja" ? "ホーム" : "Home",
    icon: Home,
    active: location.pathname === chatHomePath || location.pathname.startsWith(`${chatHomePath}/session/`),
  }
  const sections = chatSections(location.pathname, t, language)
  const flatItems = sections.filter((section) => section.id === "direct").flatMap((section) => section.items)
  const submenus = sections.filter((section) => section.id !== "direct" && section.items.length > 0)
  const [selectedSectionID, setSelectedSectionID] = useState("")
  const [moreOpen, setMoreOpen] = useState(false)
  const routeSection = submenus.find((section) => section.items.some((item) => item.active))
  const activeSection = submenus.find((section) => section.id === selectedSectionID) || routeSection
  const showingSection = Boolean(activeSection)

  useEffect(() => {
    if (homeItem.active) {
      setSelectedSectionID("")
      return
    }
    setSelectedSectionID(routeSection?.id || "")
  }, [homeItem.active, location.pathname, routeSection?.id])

  const handleNavigation = () => {
    onNavigate?.()
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const renderSidebarLink = (item: ChatSidebarItem) => (
    <div key={item.href}>
      <Link
        to={item.href}
        onClick={handleNavigation}
        className={cn(
          "relative flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          item.active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground after:absolute after:inset-y-2 after:left-0 after:w-[3px] after:rounded-r-full after:bg-primary" : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <span className={cn("flex size-6 shrink-0 items-center justify-center", item.active ? "text-primary" : "text-muted-foreground")}>
          <item.icon size={15} />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    </div>
  )

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar", className)}>
      {!isMobile && (
        <div className="flex h-12 shrink-0 items-center px-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={language === "zh" ? (open ? "收起侧边栏" : "固定展开侧边栏") : language === "ja" ? (open ? "サイドバーを閉じる" : "サイドバーを固定") : (open ? "Collapse sidebar" : "Pin sidebar open")}
            title={language === "zh" ? (open ? "收起侧边栏" : "固定展开侧边栏") : language === "ja" ? (open ? "サイドバーを閉じる" : "サイドバーを固定") : (open ? "Collapse sidebar" : "Pin sidebar open")}
          >
            {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </Button>
        </div>
      )}
      {compact && (
        <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col items-center gap-1 px-1.5 pb-3">
          <Link to={homeItem.href} onClick={handleNavigation} className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label={language === "zh" ? "新建对话" : language === "ja" ? "新しい会話" : "New chat"} title={language === "zh" ? "新建对话" : language === "ja" ? "新しい会話" : "New chat"}><Home size={16} /></Link>
          {flatItems.map((item) => <Link key={item.href} to={item.href} onClick={handleNavigation} title={item.label} aria-label={item.label} className="flex size-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><item.icon size={16} /></Link>)}
          {submenus.map((section) => { const item = section.items[0]; return <Link key={section.id} to={item.href} onClick={() => { setSelectedSectionID(section.id); handleNavigation() }} title={section.label} aria-label={section.label} className="flex size-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><item.icon size={16} /></Link> })}
          {settingsPath && <Link to={settingsPath} onClick={handleNavigation} aria-label={language === "zh" ? "设置" : language === "ja" ? "設定" : "Settings"} title={language === "zh" ? "设置" : language === "ja" ? "設定" : "Settings"} className="mt-auto flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><SettingsIcon size={16} /></Link>}
        </div>
      )}
      <div inert={compact || undefined} className={cn("flex min-h-0 w-[calc(var(--sidebar-width)-1rem)] flex-1 flex-col transition-opacity duration-150 motion-reduce:transition-none", isMobile && "w-full", compact ? "invisible pointer-events-none opacity-0" : "visible opacity-100")}>
      <SidebarHeader className="shrink-0 px-3 py-3">
        <Link
          to={homeItem.href}
          onClick={handleNavigation}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-5 items-center justify-center"><Home size={15} /></span>
          <span className="flex-1 truncate">{language === "zh" ? "新建对话" : language === "ja" ? "新しい会話" : "New chat"}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="relative min-h-0 flex-1 overflow-hidden p-0">
      <nav className="relative flex h-full min-h-0 flex-1">
        <div className={cn("w-full min-h-0 transition-transform duration-200 ease-out", homeItem.active && "flex h-full min-h-0 flex-1 flex-col", showingSection && "-translate-x-full")}>
          <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-2">
            <DashboardSlot name="sidebar.navigation.before" scope="/chat" />
            {homeItem.active && <div id={sessionSlotID} className="min-h-0 flex-1 overflow-hidden" />}
            <div className="mt-auto shrink-0 border-t border-sidebar-border pt-2">
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <MoreHorizontal size={16} className="shrink-0" />
                <span className="flex-1 text-left">{language === "zh" ? "更多功能" : language === "ja" ? "その他" : "More"}</span>
                <ChevronRight size={15} className={cn("text-muted-foreground transition-transform", moreOpen && "rotate-90")} />
              </button>
              {moreOpen && <div className="flex flex-col gap-1 pt-1">
                {flatItems.map((item) => renderSidebarLink(item))}
                {submenus.map((section) => {
                  const firstItem = section.items[0]
                  return (
                    <Link
                      key={section.id}
                      to={firstItem.href}
                      onClick={() => { setSelectedSectionID(section.id); handleNavigation() }}
                      className={cn(
                        "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        section.id === routeSection?.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"><firstItem.icon size={15} /></span>
                      <span className="flex-1 truncate">{section.label}</span>
                      <ChevronRight size={15} className="text-muted-foreground" />
                    </Link>
                  )
                })}
                <DashboardSlot name="sidebar.navigation.after" scope="/chat" />
              </div>}
            </div>
          </div>
        </div>
        <div className={cn("absolute inset-x-0 top-0 px-3 py-3 transition-transform duration-200 ease-out", showingSection ? "translate-x-0" : "translate-x-full")}>
          {activeSection && (
            <div className="flex flex-col gap-1">
              <div className="mb-3 flex items-center gap-1 border-b pb-3 text-sm">
                <Link
                  to={chatHomePath}
                  onClick={() => { setSelectedSectionID(""); handleNavigation() }}
                  className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
                  aria-label={t("nav.chat")}
                  title={t("nav.chat")}
                >
                  <Home size={16} />
                </Link>
                <ChevronRight size={14} className="text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">{activeSection.label}</span>
              </div>
              {activeSection.items.map((item) => renderSidebarLink(item))}
            </div>
          )}
        </div>
      </nav>
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border p-3">
        {settingsPath && (
        <Link
          to={settingsPath}
          onClick={handleNavigation}
          className={cn("flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors", location.pathname.startsWith("/settings") ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted")}
        >
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", location.pathname.startsWith("/settings") ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <SettingsIcon size={15} />
          </span>
          <span className="flex-1 truncate">{language === "zh" ? "设置" : language === "ja" ? "設定" : "Settings"}</span>
        </Link>
        )}
      </SidebarFooter>
      </div>
    </div>
  )
}

interface ChatSidebarSection {
  id: string
  label: string
  items: ChatSidebarItem[]
}

/**
 * Sections come from the contributions: a package may declare one
 * (`group: { id, labelKey, order }`) or join an existing one by id. This frame
 * only backstops the buckets nobody owns, so a new submenu needs no edit here.
 */
function chatSections(pathname: string, t: Translate, language: string): ChatSidebarSection[] {
  return navSections("chat").map((section) => ({
    id: section.id,
    label: chatSectionLabel(section, t, language),
    items: section.items.map((item) => chatSidebarItem(item, pathname, t)),
  }))
}

function chatSidebarItem(item: DashboardNavItem, pathname: string, t: Translate): ChatSidebarItem {
  const active = pathname === item.path || pathname.startsWith(`${item.path}/`)
  return { href: item.path, label: navItemLabel(item, t), icon: (item.icon as LucideIcon | undefined) || Bot, active }
}

function chatSectionLabel(section: DashboardNavSection, t: Translate, language: string) {
  if (section.label) {
    return section.label
  }
  if (section.labelKey) {
    const label = t(section.labelKey)
    if (label !== section.labelKey) {
      return label
    }
  }
  return chatFallbackSectionLabel(section.id, language)
}

function chatFallbackSectionLabel(id: string, language: string) {
  const labels: Record<string, [string, string, string]> = {
    direct: ["直接访问", "Direct", "直接アクセス"],
    library: ["库", "Library", "ライブラリ"],
    workflow: ["工作流", "Workflows", "ワークフロー"],
    agents: ["代理", "Agents", "エージェント"],
  }
  const value = labels[id] || [id, id, id]
  return language === "zh" ? value[0] : language === "ja" ? value[2] : value[1]
}
