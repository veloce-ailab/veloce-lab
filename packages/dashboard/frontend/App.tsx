import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { ToastProvider } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { DashboardSlot, DashboardSlotProvider } from "./lib/slots";
import { routes as extensionRoutes, subscribeExtensions } from "./extension";
import { DashboardPluginLoader } from "./plugin-loader";
import { Layout } from "./components/layout/Layout";

const queryClient = new QueryClient();

function App() {
  const [, refreshExtensions] = useState(0);
  useEffect(
    () => subscribeExtensions(() => refreshExtensions((value) => value + 1)),
    [],
  );
  useEffect(() => {
    const loader = new DashboardPluginLoader()
    let active = true
    fetch("/api/dashboard/manifest")
      .then((response) => response.json())
      .then((manifest: { assets?: Array<{ id?: string; url: string; mime?: string; plugin?: string; data?: Record<string, unknown> }> }) => {
        if (active) void loader.sync((manifest.assets ?? []).map((asset, index) => ({ ...asset, id: asset.id || asset.url || String(index) }))).catch(() => undefined)
      })
      .catch(() => undefined);
    return () => { active = false; void loader.dispose() }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardSlotProvider>
        <DashboardSlot name="app.before" />
        <ThemeProvider>
          <I18nProvider>
            <TooltipProvider>
              <ToastProvider>
                <BrowserRouter>
                  <Routes>
                      {extensionRoutes().map((route) => {
                        const Component = route.component;
                        return <Route key={route.path} path={route.path} element={route.shell === "owned" ? <Component /> : <Layout><Component /></Layout>} />;
                      })}
                      {/* Settings and admin pages are owned by feature plugins. */}
                      <Route
                        path="/"
                        element={
                          <Navigate to="/chat" replace />
                        }
                      />
                      <Route
                        path="*"
                        element={
                          <Navigate to="/chat" replace />
                        }
                      />
                    </Routes>
                </BrowserRouter>
              </ToastProvider>
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
        <DashboardSlot name="app.after" />
      </DashboardSlotProvider>
    </QueryClientProvider>
  );
}

export default App;
