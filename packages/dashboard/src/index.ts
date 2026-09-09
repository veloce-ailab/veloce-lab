import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { Context, Core, Schema, Service, Session, Logger } from "yumeri";

const logger = new Logger("dashboard");
export const depend: string[] = [];
export const provide = ["dashboard"];

export interface DashboardAsset { id: string; file: string; mime?: string; plugin?: string; data?: Record<string, unknown>; }
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

function stateFor(context: Context): DashboardState {
  const core = context.getCore();
  const existing = states.get(core);
  if (existing) return existing;
  const state: DashboardState = { assets: [], entries: new Map(), revision: 0 };
  states.set(core, state);
  return state;
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
    // Yumeri serves registered assets through its static route. Until a Vite
    // middleware is attached, source TS/TSX entries cannot be sent directly
    // to the browser, so always prefer the built production entry when it is
    // available and fall back to dev only for local development packages.
    const production = Array.isArray(entry.prod) ? entry.prod : [entry.prod];
    const hasProduction = production.some((file) => {
      const absolute = /^\/[A-Za-z]:[\\/]/.test(file) ? file.slice(1) : file;
      return existsSync(absolute);
    });
    const requested = hasProduction || !entry.dev ? entry.prod : entry.dev;
    const files = (Array.isArray(requested) ? requested : [requested]).flatMap((file) => {
      const absolute = /^\/[A-Za-z]:[\\/]/.test(file) ? file.slice(1) : file;
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [file];
      return ["index.js", "style.css"].map((name) => path.join(file, name)).filter((name) => existsSync(name));
    });
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

export const config: Schema<Record<string, never>> = Schema.object({});
declare module "yumeri" { interface Components { dashboard: DashboardService; } }

export function apply(ctx: Context) {
  ctx.registerService("dashboard", Dashboard);
  const state = stateFor(ctx);
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "web");

  ctx.route("/api/dashboard/manifest").methods("GET").action(async (session: Session) => {
    const entries = [...state.entries.values()].map((entry) => ({
      id: entry.id,
      plugin: entry.plugin,
      data: entry.data,
      files: entry.assets.map(({ id, mime }) => ({ id, mime, url: `/api/static/plugin?file=${encodeURIComponent(id)}` })),
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
    if (asset.mime) session.setMime(asset.mime);
    session.sendFile(asset.file);
  });
  logger.info(`Dashboard web root: ${webRoot}`);
  ctx.route("root").methods("GET").action(async (session: Session) => {
    logger.info(`Serving dashboard`);
    const requested = session.pathname === "/" ? "index.html" : session.pathname.replace(/^\//, "");
    const safe = requested.includes("..") ? "index.html" : requested;
    const file = path.resolve(webRoot, safe);
    try {
      const mime = mimeFor(file);
      if (mime) session.setMime(mime);
      // The shared runtime is referenced by a stable URL from every plugin bundle.
      // Do not let browsers keep an incompatible runtime after an upgrade.
      const maxAge = safe === "dashboard-client.js" || safe === "index.html" ? 0 : 3600;
      session.file(file, { maxAge, etag: true });
    } catch {
      const fallback = path.resolve(webRoot, "index.html");
      session.setMime("text/html; charset=utf-8");
      session.file(fallback, { maxAge: 60, etag: true });
    }
  });
}
