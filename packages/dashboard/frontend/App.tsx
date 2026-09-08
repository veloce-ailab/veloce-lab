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
import { Layout } from "./components/layout/Layout";

const queryClient = new QueryClient();

function App() {
  const [, refreshExtensions] = useState(0);
  useEffect(
    () => subscribeExtensions(() => refreshExtensions((value) => value + 1)),
    [],
  );
  useEffect(() => {
    fetch("/api/dashboard/manifest")
      .then((response) => response.json())
      .then((manifest: { assets?: Array<{ url: string; mime?: string }> }) => {
        manifest.assets
          ?.filter((asset) => asset.mime?.includes("javascript"))
          .forEach((asset) => {
            const script = document.createElement("script");
            script.type = "module";
            script.src = asset.url;
            script.dataset.dashboardPlugin = "true";
            document.head.appendChild(script);
          });
      })
      .catch(() => undefined);
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
                        return (
                          <Route
                            key={route.path}
                            path={route.path}
                            element={
                              <Layout><Component /></Layout>
                            }
                          />
                        );
                      })}
                      {/* Settings and admin pages are owned by feature plugins. */}
                      <Route
                        path="/"
                        element={
                          <Navigate to="/dashboard" replace />
                        }
                      />
                      <Route
                        path="/dashboard"
                        element={
                          <Layout><div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Dashboard</div></Layout>
                        }
                      />
                      <Route
                        path="*"
                        element={
                          <Navigate to="/dashboard" replace />
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
