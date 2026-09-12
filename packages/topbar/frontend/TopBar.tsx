import { UserCircle } from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ComponentType, ReactNode } from "react"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { api, apiURL, isDesktopTarget } from "@/lib/api"
import { parseTopNavItems, withPublicSettingsDefaults, type PublicSettings } from "@/lib/public-settings"
import { DashboardSlot } from "@/lib/slots"
import { cn } from "@/lib/utils"
import { frameHome } from "@velocelab/dashboard/frontend"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
  is_admin?: boolean
}

export interface TopBarProps {
  /** Frame drawing this bar; kept for logging and for frame-specific tweaks. */
  frame?: string
  /** Frame-owned control pinned to the left edge, such as a sidebar trigger. */
  leading?: ReactNode
  /** Frame-owned controls shown beside the theme and language switchers. */
  actions?: ReactNode
}

/**
 * The application top bar.
 *
 * It is contributed by this package and rendered by every frame through the
 * `frame.topbar` slot, so brand, top navigation, switchers and the account entry
 * exist once instead of being copied into the console layout, the settings frame
 * and the chat frame. A frame only says what belongs to it: the `leading`
 * control that drives its own sidebar, and any `actions` of its own such as the
 * chat session search.
 */
export default function TopBar({ leading, actions }: TopBarProps) {
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  // Frames come and go with the packages that own them, so the bar asks where
  // they landed instead of guessing a path.
  const brandPath = frameHome("chat") ?? "/"
  const accountPath = frameHome("settings")
  const label = user?.username || user?.email || "User"
  const initials = avatarInitials(label)
  const avatar = (
    <>
      {user?.avatar_url ? (
        <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <UserCircle size={20} />
      )}
    </>
  )
  const avatarClass =
    "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold text-foreground hover:bg-accent"

  return (
    <header
      className={cn(
        "z-30 flex shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6",
        isDesktopTarget() ? "h-12" : "h-16",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <DashboardSlot name="header.brand.after" />
        <Link to={brandPath} className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{publicSettings.site_name || "Veloce"}</span>
        </Link>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <DashboardSlot name="header.nav" />
        {publicSettings.top_nav_enabled && topNavItems.length > 0 && (
          <div className="hidden min-w-0 items-center gap-4 text-sm text-muted-foreground lg:flex">
            {topNavItems.map((item) =>
              item.external ? (
                <a key={`${item.label}-${item.href}`} href={item.href} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ) : (
                <Link key={`${item.label}-${item.href}`} to={item.href}>
                  {item.label}
                </Link>
              ),
            )}
          </div>
        )}
        {actions}
        <DashboardSlot name="header.actions" />
        <ThemeSwitcher />
        <LanguageSwitcher compact />
        {accountPath ? (
          <Link to={accountPath} className={avatarClass} title={label} aria-label={label}>
            {avatar}
          </Link>
        ) : (
          <span className={avatarClass} title={label}>
            {avatar}
          </span>
        )}
      </div>
    </header>
  )
}

export const topBarComponent = TopBar as unknown as ComponentType<Record<string, unknown>>

function avatarInitials(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return trimmed.slice(0, 2).toUpperCase()
}
