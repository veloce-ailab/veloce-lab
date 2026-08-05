import { Link } from "react-router-dom"
import type { PublicSettings } from "@/lib/public-settings"
import { parseTopNavItems } from "@/lib/public-settings"

export function PublicTopBar({ settings, fixed = false }: { settings: PublicSettings; fixed?: boolean }) {
  const topNavItems = parseTopNavItems(settings.top_nav_items)

  return (
    <header className={fixed ? "fixed inset-x-0 top-0 z-50 border-b bg-background px-4 sm:px-6" : "border-b px-4 sm:px-6"}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <div className="truncate text-lg font-semibold">Veloce</div>
        </Link>
        {settings.top_nav_enabled && topNavItems.length > 0 && (
          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
            {topNavItems.map((item) => (
              <TopNavLink key={`${item.label}-${item.href}`} label={item.label} href={item.href} external={item.external} />
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}

function TopNavLink({ label, href, external }: { label: string; href: string; external: boolean }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return <Link to={href}>{label}</Link>
}
