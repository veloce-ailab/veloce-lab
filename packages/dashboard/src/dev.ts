import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import type { Plugin } from "vite";

/**
 * The development frontend.
 *
 * Vite runs in middleware mode inside the application server: nothing listens
 * on a second port, the module graph, the transformed sources and the HMR
 * socket all answer on the port the application already uses. The sources are
 * the packages themselves, so editing a dashboard component or a plugin page
 * updates the browser without a build step.
 */

/** Upgrades Vite owns. The application must keep its hands off them. */
const hmrProtocols = new Set(["vite-hmr", "vite-ping"]);

/** Dependencies pre-bundled up front, so plugin sources do not trigger reloads. */
const preBundled = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "react-router-dom",
  "@tanstack/react-query",
  "lucide-react",
  "radix-ui",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "date-fns",
  "recharts",
  "react-day-picker",
];

export interface DashboardDevLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface DashboardDevServerOptions {
  /** Directory of the dashboard package; its `frontend` directory is the Vite root. */
  packageRoot: string;
  /** The http server the application already listens on. */
  server: HttpServer;
  /** The URL built plugin bundles import the shared runtime from. */
  runtimePath: string;
  logger: DashboardDevLogger;
}

export interface DashboardDevServer {
  /** Answers a request from the module graph; resolves true when Vite answered it. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** The application document, transformed so it loads the sources. */
  document(): Promise<string>;
  /** URL a source file is served from. */
  url(file: string): string;
  close(): Promise<void>;
}

/** The URL a source file is served from, with imports rewritten by Vite. */
export function sourceUrl(file: string) {
  const normalized = file.replace(/\\/g, "/");
  return `/@fs/${normalized.replace(/^\//, "")}`;
}

/** The workspace the plugin sources live in, so Vite is allowed to read them. */
function workspaceRootOf(packageRoot: string) {
  let current = path.dirname(packageRoot);
  for (let depth = 0; depth < 6; depth += 1) {
    const manifest = path.join(current, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { workspaces?: unknown };
        if (parsed.workspaces) return current;
      } catch {
        // An unreadable manifest just means this directory is not the workspace.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.dirname(packageRoot);
}

/**
 * Keep the application's own upgrade listeners away from Vite's socket. The
 * server answers every unmatched upgrade with a 400 and closes it, which would
 * tear the HMR connection down right after Vite accepted it.
 */
function guardUpgrades(server: HttpServer) {
  const kept = server.listeners("upgrade").slice();
  server.removeAllListeners("upgrade");
  server.on("upgrade", (req, socket, head) => {
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "").split(",");
    if (protocols.some((name) => hmrProtocols.has(name.trim()))) return;
    for (const listener of kept) listener.call(server, req, socket, head);
  });
  return () => {
    server.removeAllListeners("upgrade");
    for (const listener of kept) server.on("upgrade", listener as never);
  };
}

/** The nearest `frontend` directory above a module, which is a package's root. */
const frontendRoots = new Map<string, string | null>();
function frontendRootOf(file: string): string | null {
  const known = frontendRoots.get(file);
  if (known !== undefined) return known;
  let directory = path.dirname(file);
  let found: string | null = null;
  while (directory !== path.dirname(directory)) {
    if (path.basename(directory) === "frontend") {
      found = directory;
      break;
    }
    directory = path.dirname(directory);
  }
  frontendRoots.set(file, found);
  return found;
}

/**
 * `@/…` is a shared namespace that each package builds slightly differently: a
 * package's own files win, and anything it does not have comes from the
 * dashboard, which is what every plugin's own vite config encodes. Resolving it
 * here keeps one module graph instead of one per package.
 */
function sourceAliases(dashboardRoot: string): Plugin {
  return {
    name: "velocelab-source-aliases",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.startsWith("@/") || !importer) return null;
      const own = frontendRootOf(importer);
      if (own && own !== dashboardRoot) {
        const local = await this.resolve(path.join(own, source.slice(2)), importer, { skipSelf: true });
        if (local) return local;
      }
      return (await this.resolve(path.join(dashboardRoot, source.slice(2)), importer, { skipSelf: true })) ?? null;
    },
  };
}

export async function startDashboardDevServer(options: DashboardDevServerOptions): Promise<DashboardDevServer | undefined> {
  const { packageRoot, server, runtimePath, logger } = options;
  const root = path.join(packageRoot, "frontend");
  const workspaceRoot = workspaceRootOf(packageRoot);
  const clientEntry = path.join(root, "client.ts");
  try {
    const vite = await import("vite");
    const react = (await import("@vitejs/plugin-react")).default;
    const tailwind = (await import("@tailwindcss/vite")).default;
    const releaseUpgrades = guardUpgrades(server);
    try {
      const instance = await vite.createServer({
        // The production config replaces the framework packages with one built
        // runtime URL; in development every package is resolved from source so
        // the dashboard and the plugins share a single module graph.
        configFile: false,
        root,
        base: "/",
        appType: "custom",
        mode: "development",
        cacheDir: path.join(workspaceRoot, "node_modules", ".vite", "dashboard"),
        define: { "process.env.NODE_ENV": JSON.stringify("development") },
        plugins: [sourceAliases(root), tailwind(), react()],
        resolve: {
          alias: [
            { find: "@velocelab/dashboard/frontend/extension", replacement: clientEntry },
            { find: "@velocelab/dashboard/frontend/runtime", replacement: clientEntry },
            { find: "@velocelab/dashboard/frontend/client", replacement: clientEntry },
            { find: "@velocelab/dashboard/frontend", replacement: clientEntry },
            { find: "@/AppEntry", replacement: path.join(root, "App.tsx") },
          ],
        },
        optimizeDeps: {
          include: preBundled,
          // The dashboard's own sources must stay modules, so editing one of
          // them updates the browser instead of re-bundling a dependency.
          exclude: [
            "@velocelab/dashboard/frontend",
            "@velocelab/dashboard/frontend/client",
            "@velocelab/dashboard/frontend/runtime",
            "@velocelab/dashboard/frontend/extension",
          ],
        },
        server: {
          middlewareMode: true,
          // Attach the HMR socket to the server the application already runs.
          ws: { server },
          fs: { allow: [workspaceRoot, root] },
        },
      });
      logger.info(`Dashboard development server attached (${root})`);
      return {
        handle(req, res) {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
          // Bundles that were built rather than compiled here import the shared
          // runtime by its stable URL. Send them to the source runtime, so the
          // whole application keeps one copy of React.
          if (pathname === runtimePath) {
            res.writeHead(302, { Location: sourceUrl(clientEntry) });
            res.end();
            return Promise.resolve(true);
          }
          return new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (handled: boolean) => {
              if (settled) return;
              settled = true;
              resolve(handled);
            };
            res.once("finish", () => settle(true));
            res.once("close", () => settle(true));
            instance.middlewares(req, res, () => settle(false));
          });
        },
        async document() {
          const html = readFileSync(path.join(root, "index.html"), "utf8");
          return instance.transformIndexHtml("/", html);
        },
        url(file) {
          return sourceUrl(file);
        },
        async close() {
          releaseUpgrades();
          await instance.close();
        },
      };
    } catch (error) {
      releaseUpgrades();
      throw error;
    }
  } catch (error) {
    logger.warn(`Dashboard development server unavailable, serving the build instead: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
