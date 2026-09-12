import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { Context, Core, Schema, Service, Session, Logger } from "yumeri";
import { startDashboardDevServer, type DashboardDevServer } from "./dev.js";

const logger = new Logger("dashboard");
export const depend: string[] = [];
export const provide = ["dashboard"];

export interface DashboardConfig {
  /**
   * Serve the frontend from source through an embedded Vite server. Defaults to
   * on unless `NODE_ENV` is `production`.
   */
  dev?: boolean;
}
/** Stable URL every built plugin bundle imports the shared runtime from. */
const runtimePath = "/dashboard-client.js";
export const config: Schema<DashboardConfig> = Schema.object<DashboardConfig>({
  dev: Schema.boolean("Serve the frontend from source instead of the build"),
});

export interface DashboardAsset { id: string; file: string; mime?: string; plugin?: string; data?: Record<string, unknown>; dev?: boolean; }
export interface DashboardEntry { id?: string; dev?: string | string[]; prod: string | string[]; plugin?: string; data?: Record<string, unknown>; }
export interface DashboardEntryHandle { id: string; remove(): void; }
export interface DashboardManifestFile { id: string; url: string; mime?: string; }
export interface DashboardManifestEntry { id: string; plugin?: string; data?: Record<string, unknown>; files: DashboardManifestFile[]; }
export interface DashboardManifest {
  revision: string;
  entries: DashboardManifestEntry[];
  /** Legacy flat asset view kept for older dashboard clients. */
  assets: Array<DashboardManifestFile & { plugin?: string; data?: Record<string, unknown> }>;
  i18n: Record<string, Record<string, string>>;
}
export interface DashboardService {
  addEntry(entry: DashboardEntry): DashboardEntryHandle;
  removeEntry(id: string): boolean;
}

interface DashboardEntryState {
  id: string;
  plugin?: string;
  data?: Record<string, unknown>;
  assets: DashboardAsset[];
  handle: DashboardEntryHandle;
}
interface DashboardState { assets: DashboardAsset[]; entries: Map<string, DashboardEntryState>; revision: number; }
const states = new WeakMap<Core, DashboardState>();
/** The development server this application of the plugin started, if any. */
const devServers = new WeakMap<Core, DashboardDevServer>();

/**
 * Whether the frontend is served from source. Entry registration happens while
 * plugins apply, which is before any request, so the mode is settled by then.
 */
let development = process.env.NODE_ENV !== "production";

function stateFor(context: Context): DashboardState {
  const core = context.getCore();
  const existing = states.get(core);
  if (existing) return existing;
  const state: DashboardState = { assets: [], entries: new Map(), revision: 0 };
  states.set(core, state);
  return state;
}

function absoluteFile(file: string) {
  return /^\/[A-Za-z]:[\\/]/.test(file) ? file.slice(1) : file;
}

function anyExists(files: string[]) {
  return files.some((file) => existsSync(absoluteFile(file)));
}

/** Expand a built entry that was emitted as a directory into its files. */
function expandBuild(files: string[]) {
  return files.flatMap((file) => {
    const absolute = absoluteFile(file);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [file];
    return ["index.js", "style.css"].map((name) => path.join(file, name)).filter((name) => existsSync(name));
  });
}

function mimeFor(file: string): string | undefined {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[path.extname(file).toLowerCase()];
}

export class Dashboard extends Service implements DashboardService {
  private readonly state: DashboardState;
  private readonly context: Context;

  constructor(context: Context) {
    super(context);
    this.context = context;
    this.state = stateFor(context);
  }

  private registerAsset(asset: DashboardAsset): DashboardAsset {
    const file = /^\/[A-Za-z]:[\\/]/.test(asset.file) ? asset.file.slice(1) : asset.file;
    const value: DashboardAsset = { ...asset, file, mime: asset.mime ?? mimeFor(file), id: asset.id || createHash("md5").update(file).digest("hex") };
    this.state.assets.push(value);
    return value;
  }

  addEntry(entry: DashboardEntry): DashboardEntryHandle {
    // Plugins register both forms: the sources they are written in and the
    // bundle a build produces. Which one is served follows the mode, and the
    // other one is the fallback so a package without a build still loads.
    const sources = entry.dev ? (Array.isArray(entry.dev) ? entry.dev : [entry.dev]) : [];
    const builds = Array.isArray(entry.prod) ? entry.prod : [entry.prod];
    const hasSources = sources.length > 0 && anyExists(sources);
    const hasBuild = builds.length > 0 && anyExists(builds);
    // Sources are what the development server compiles; a build stands in when
    // the package has none on disk, and is the only form served in production.
    const servingSources = hasSources && (development || !hasBuild);
    const files = servingSources ? [...sources] : expandBuild(builds);
    // A library entry commonly emits a sibling stylesheet instead of a
    // directory containing `style.css`.
    for (const file of [...files]) {
      if (!/\.js$/i.test(file)) continue;
      const css = file.replace(/\.js$/i, ".css");
      if (existsSync(css) && !files.includes(css)) files.push(css);
    }
    if (!files.length) throw new Error("Dashboard entry has no files");
    const id = entry.id ?? entry.plugin ?? createHash("md5").update(files.join("\0")).digest("hex");
    this.removeEntry(id);
    const assets = files.map((file, index) => this.registerAsset({
      id: `${id}-${index}`,
      file,
      plugin: entry.plugin,
      data: entry.data,
      dev: servingSources,
    }));
    const handle: DashboardEntryHandle = {
      id,
      remove: () => {
        const current = this.state.entries.get(id);
        if (!current || current.handle !== handle) return;
        this.state.entries.delete(id);
        current.assets.forEach((asset) => {
          const index = this.state.assets.indexOf(asset);
          if (index >= 0) this.state.assets.splice(index, 1);
        });
        this.state.revision += 1;
      },
    };
    this.state.entries.set(id, { id, plugin: entry.plugin, data: entry.data, assets, handle });
    this.state.revision += 1;
    this.context.affect(handle.remove);
    return handle;
  }

  removeEntry(id: string): boolean {
    const entry = this.state.entries.get(id);
    if (!entry) return false;
    entry.handle.remove();
    return true;
  }
}

declare module "yumeri" { interface Components { dashboard: DashboardService; } }

export function apply(ctx: Context, pluginConfig?: DashboardConfig) {
  ctx.registerService("dashboard", Dashboard);
  development = pluginConfig?.dev ?? development;
  const state = stateFor(ctx);
  const core = ctx.getCore();
  // The plugin runs from `dist` after a build and from `src` in development, so
  // the package root is the parent of either and the build output is under it.
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const webRoot = path.join(packageRoot, "dist", "web");
  let devServerPromise: Promise<DashboardDevServer | undefined> | undefined;

  /**
   * The development server is created on the first request, because it attaches
   * its socket to the server that request arrived on.
   */
  const devServerFor = (req: IncomingMessage | undefined) => {
    if (!development) return Promise.resolve(undefined);
    if (!devServerPromise) {
      const server = (req?.socket as unknown as { server?: HttpServer } | undefined)?.server;
      devServerPromise = server
        ? startDashboardDevServer({ packageRoot, server, runtimePath, logger })
        : Promise.resolve(undefined);
      void devServerPromise.then((dev) => {
        // The watchers and the socket belong to this application of the plugin;
        // a reload has to be able to take them apart again.
        if (dev) devServers.set(core, dev);
      });
    }
    return devServerPromise;
  };

  ctx.route("/api/dashboard/manifest").methods("GET").action(async (session: Session) => {
    const dev = await devServerFor(session.client.req as IncomingMessage | undefined);
    const entries = [...state.entries.values()].map((entry) => ({
      id: entry.id,
      plugin: entry.plugin,
      data: entry.data,
      files: entry.assets.map(({ id, mime, file, dev: isSource }) => ({
        id,
        mime,
        // Sources are served by the development server, which compiles them on
        // the fly and rewrites their imports; builds are served as they are.
        url: isSource && dev ? dev.url(file) : `/api/static/plugin?file=${encodeURIComponent(id)}`,
      })),
    }));
    const assets = entries.flatMap((entry) => entry.files.map((file) => ({ ...file, plugin: entry.plugin, data: entry.data })));
    const manifest: DashboardManifest = {
      revision: String(state.revision),
      entries,
      assets,
      i18n: ctx.getCore().i18n.all(),
    };
    session.respond(manifest, "json");
  });
  ctx.route("/api/static/plugin").methods("GET").action(async (session: Session, query: URLSearchParams) => {
    const id = query.get("file") ?? "";
    const asset = state.assets.find((item) => item.id === id);
    if (!asset || !existsSync(asset.file)) {
      session.status = 404;
      session.respond({ error: "Static plugin file not found" }, "json");
      return;
    }
    const dev = await devServerFor(session.client.req as IncomingMessage | undefined);
    if (asset.dev && dev) {
      // A source is only meaningful once it has been compiled.
      session.status = 302;
      session.head.Location = dev.url(asset.file);
      session.respond("", "plain");
      return;
    }
    if (asset.mime) session.setMime(asset.mime);
    session.sendFile(asset.file);
  });
  logger.info(`Dashboard web root: ${webRoot}${development ? " (development sources)" : ""}`);
  ctx.route("root").methods("GET").action(async (session: Session) => {
    const req = session.client.req as IncomingMessage | undefined;
    const res = session.client.res;
    try {
      const dev = await devServerFor(req);
      if (dev && req && res) {
        if (await dev.handle(req, res)) {
          // The development server writes the response itself; without this the
          // core would write a second time and end the process.
          session.responseHandled = true;
          return;
        }
        // Documents are rendered from source too, so the application itself is
        // reloaded as it is edited.
        if (!path.extname(session.pathname)) {
          try {
            const document = await dev.document();
            session.setMime("text/html; charset=utf-8");
            session.head["Cache-Control"] = "no-store";
            session.respond(document, "plain");
            return;
          } catch (error) {
            logger.warn(`Dashboard development document unavailable, serving the build instead: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      const requested = session.pathname === "/" ? "index.html" : session.pathname.replace(/^\//, "");
      const safe = requested.includes("..") ? "index.html" : requested;
      const file = path.resolve(webRoot, safe);
      try {
        const mime = mimeFor(file);
        if (mime) session.setMime(mime);
        // The shared runtime is referenced by a stable URL from every plugin bundle.
        // Do not let browsers keep an incompatible runtime after an upgrade.
        const maxAge = safe === runtimePath.replace(/^\//, "") || safe === "index.html" ? 0 : 3600;
        session.file(file, { maxAge, etag: true });
      } catch {
        const fallback = path.resolve(webRoot, "index.html");
        session.setMime("text/html; charset=utf-8");
        session.file(fallback, { maxAge: 60, etag: true });
      }
    } catch (error) {
      // This route is the last stop for every path. Answering is what keeps a
      // single failure from ending the process, since the core cannot write a
      // response once one has started.
      logger.error(`Dashboard could not answer ${session.pathname}: ${error instanceof Error ? error.message : String(error)}`);
      if (res && !res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Dashboard error");
        return;
      }
      session.status = 500;
      session.respond("Dashboard error", "plain");
    }
  });
}

/**
 * Yumeri unloads a plugin before applying it again, which runs the effects its
 * context recorded — the `addEntry` registrations among them. The development
 * server is not a context effect, so it is taken down here instead.
 */
export async function disable(ctx: Context) {
  const core = ctx.getCore();
  const dev = devServers.get(core);
  if (!dev) return;
  devServers.delete(core);
  try {
    await dev.close();
    logger.info("Dashboard development server detached");
  } catch (error) {
    logger.warn(`Dashboard development server did not shut down cleanly: ${error instanceof Error ? error.message : String(error)}`);
  }
}
