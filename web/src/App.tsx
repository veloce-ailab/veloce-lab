import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { PageTransition } from "./components/layout/PageTransition"
import { ToastProvider } from "./components/ui/toast"
import api from "./lib/api"
import { I18nProvider, useI18n } from "./lib/i18n"
import { ThemeProvider } from "./lib/theme"
import AdvancedChat from "./pages/AdvancedChat"
import Login from "./pages/Login"
import SettingsWorkspace from "./pages/SettingsWorkspace"
import Setup from "./pages/Setup"

const queryClient = new QueryClient()

interface SetupStatus {
  required: boolean
}

function ProtectedRoute({ children, authenticated }: { children: React.ReactNode; authenticated: boolean }) {
  const location = useLocation()
  if (!authenticated && location.pathname !== "/login") {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function SetupGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { t } = useI18n()
  const [status, setStatus] = useState<SetupStatus | null>(null)

  useEffect(() => {
    api.get("/setup/status").then((response) => setStatus(response.data)).catch(() => setStatus({ required: false }))
  }, [])

  if (!status) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">{t("common.loading")}</div>
  }
  if (status.required && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }
  if (!status.required && location.pathname === "/setup") {
    return <Navigate to={localStorage.getItem("token") ? "/chat" : "/login"} replace />
  }
  return <>{children}</>
}

function App() {
  const [authenticated] = useState(() => Boolean(localStorage.getItem("token")))

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token")
    if (token) {
      localStorage.setItem("token", token)
      window.history.replaceState(null, "", "/chat")
      window.location.reload()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <BrowserRouter>
              <SetupGate>
                <Routes>
                  <Route path="/setup" element={<PageTransition><Setup /></PageTransition>} />
                  <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
                  <Route path="/chat/*" element={<ProtectedRoute authenticated={authenticated}><AdvancedChat /></ProtectedRoute>} />
                  <Route path="/settings/*" element={<ProtectedRoute authenticated={authenticated}><SettingsWorkspace /></ProtectedRoute>} />
                  <Route path="/admin/*" element={<Navigate to="/settings/channels" replace />} />
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  <Route path="*" element={<Navigate to={authenticated ? "/chat" : "/login"} replace />} />
                </Routes>
              </SetupGate>
            </BrowserRouter>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
