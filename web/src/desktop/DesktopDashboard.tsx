import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { SystemManagementSidebar } from "@/components/layout/Sidebar"
import { PageTransition } from "@/components/layout/PageTransition"
import SystemManagement from "@/pages/SystemManagement"
import Channels from "@/pages/Channels"
import Models from "@/pages/Models"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"

interface CurrentUser {
  is_admin?: boolean
}

export default function DesktopDashboard() {
  const location = useLocation()
  const { language, t } = useI18n()
  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const title = desktopDashboardTitle(location.pathname, language === "zh", t("nav.system"), t("nav.channels"), t("nav.models"))

  useEffect(() => {
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title, path: location.pathname }, "*")
  }, [location.pathname, title])

  if (isLoading) {
    return <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">{t("common.loading")}</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/chat" replace />
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <SystemManagementSidebar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
          <PageTransition transitionKey={location.pathname} className="page-shell-transition">
            <Routes>
              <Route index element={<SystemManagement section="general" />} />
              <Route path="advanced-chat" element={<SystemManagement section="advancedChat" />} />
              <Route path="channels" element={<Channels />} />
              <Route path="models" element={<Models />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </PageTransition>
        </div>
      </main>
    </div>
  )
}

function desktopDashboardTitle(pathname: string, zh: boolean, systemTitle: string, channelsTitle: string, modelsTitle: string) {
  if (pathname === "/dashboard/channels") return channelsTitle
  if (pathname === "/dashboard/models") return modelsTitle
  return systemTitle
}
