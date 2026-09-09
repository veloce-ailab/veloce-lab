import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";
import { ToastProvider } from "./components/ui/toast";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { DashboardSlot } from "@/lib/slots";
import { routes as extensionRoutes, subscribeExtensions } from "./extension";
import { DashboardPluginLoader, type DashboardManifest } from "./plugin-loader";
import { Layout } from "./components/layout/Layout";

const queryClient = new QueryClient();

function App() {
  const [, refreshExtensions] = useState(0);
  const [extensionError, setExtensionError] = useState<string>();
  const [extensionsReady, setExtensionsReady] = useState(false);
  const [manifest, setManifest] = useState<DashboardManifest>({});
  useEffect(
    () => subscribeExtensions(() => refreshExtensions((value) => value + 1)),
    [],
  );
  useEffect(() => {
    const loader = new DashboardPluginLoader()
    let active = true
    fetch("/api/dashboard/manifest")
      .then((response) => response.json())
      .then((nextManifest: DashboardManifest) => {
        if (!active) return
        setManifest(nextManifest)
        void loader.sync(nextManifest).catch((error) => {
          console.error("Failed to load dashboard extension", error)
          setExtensionError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => { if (active) setExtensionsReady(true) })
      })
      .catch((error) => {
        console.error("Failed to load dashboard manifest", error)
        if (active) {
          setExtensionError(error instanceof Error ? error.message : String(error))
          setExtensionsReady(true)
        }
      });
    return () => { active = false; void loader.dispose() }
  }, []);
  const registeredRoutes = extensionRoutes();
  return (
    <QueryClientProvider client={queryClient}>
      <>
        {extensionError ? <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">无法加载插件界面：{extensionError}</div> : null}
        <ThemeProvider>
          <I18nProvider translations={manifest.i18n}>
            <ToastProvider>
                <DashboardSlot name="app.before" />
                <BrowserRouter>
                  {extensionsReady ? (
                    <Routes>
                        {registeredRoutes.map((route) => {
                          const Component = route.component;
                          return <Route key={route.path} path={route.path} element={route.shell === "owned" ? <Component /> : <Layout><Component /></Layout>} />;
                        })}
                      </Routes>
                  ) : null}
                </BrowserRouter>
                <DashboardSlot name="app.after" />
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </>
    </QueryClientProvider>
  );
}

export default App;
