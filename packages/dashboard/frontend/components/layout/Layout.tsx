import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import { ResizableSidebar } from "./ResizableSidebar";
import { Menu } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import type { PublicSettings } from "@/lib/public-settings";
import { withPublicSettingsDefaults } from "@/lib/public-settings";
import { cn } from "@/lib/utils";
import { DashboardSlot } from "@/lib/slots";

export function Layout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings");
      return res.data;
    },
  });
  const publicSettings = withPublicSettingsDefaults(settings);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardSlot name="header.before" />
      {/* The top bar belongs to its own package and is rendered from the slot;
          the console only supplies the control that drives its own sidebar. */}
      <DashboardSlot
        name="frame.topbar"
        className="shrink-0"
        data={{
          frame: "console",
          leading: (
            <Button
              className="lg:hidden"
              variant="outline"
              size="icon"
              onClick={() => setIsSidebarOpen((open) => !open)}
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              <Menu size={18} />
            </Button>
          ),
        }}
      />
      <DashboardSlot name="header.after" />

      <div className="flex min-h-0 flex-1">
        {!isSettingsRoute && (
          <ResizableSidebar
            storageKey="main-navigation"
            side="left"
            defaultWidth={240}
            minWidth={192}
            maxWidth={420}
            className="hidden lg:block lg:h-full"
          >
            <DashboardSlot name="sidebar.before" />
            <Sidebar className="w-full" />
            <DashboardSlot name="sidebar.after" />
          </ResizableSidebar>
        )}

        {!isSettingsRoute && <div
          className={cn(
            "fixed inset-0 top-16 z-40 transition-opacity duration-200 lg:hidden",
            isSidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          aria-hidden={!isSidebarOpen}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200"
            aria-label="Close menu"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div
            className={cn(
              "relative z-50 h-full w-64 max-w-[85vw] transition-transform duration-200 ease-out",
              isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar
              className="w-full"
              onNavigate={() => setIsSidebarOpen(false)}
            />
          </div>
        </div>}

        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto transition-[filter] duration-200",
            isSidebarOpen && "max-lg:blur-sm",
          )}
        >
          <DashboardSlot name="content.before" />
          <div
            className={cn(
              "mx-auto w-full flex-1",
              "max-w-6xl p-4 sm:p-6 lg:p-8",
            )}
          >
            <PageTransition className="page-shell-transition">
              <div
                className="space-y-6"
              >
                <DashboardSlot name="content.header" />
                <DashboardSlot name="content.toolbar" />
                {children ?? <Outlet />}
              </div>
            </PageTransition>
          </div>
          <DashboardSlot name="content.after" />
          {publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
