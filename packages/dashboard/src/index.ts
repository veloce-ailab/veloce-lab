import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { Context, Core, Schema, Service, Session, Logger } from "yumeri";

const logger = new Logger("dashboard");
export const depend: string[] = [];
export const provide = ["dashboard"];

export interface DashboardSlot { id: string; script: string; order?: number; }
export interface DashboardAsset { id: string; file: string; mime?: string; plugin?: string; data?: Record<string, unknown>; }
export interface DashboardEntry { dev?: string | string[]; prod: string | string[]; plugin?: string; data?: Record<string, unknown>; }
export interface DashboardEntryHandle { id: string; remove(): void; }
export interface DashboardService {
  registerSlot(slot: DashboardSlot): () => void;
  slots(): DashboardSlot[];
  registerAsset(asset: DashboardAsset): () => void;
  assets(): DashboardAsset[];
  addEntry(entry: DashboardEntry): DashboardEntryHandle;
  removeEntry(id: string): boolean;
}

interface DashboardState { slots: DashboardSlot[]; assets: DashboardAsset[]; entries: Map<string, DashboardEntryHandle>; }
const states = new WeakMap<Core, DashboardState>();

function stateFor(context: Context): DashboardState {
  const core = context.getCore();
  const existing = states.get(core);
  if (existing) return existing;
  const state: DashboardState = { slots: [], assets: [], entries: new Map() };
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

  registerSlot(slot: DashboardSlot): () => void {
    this.state.slots.push(slot);
    const remove = () => {
      const index = this.state.slots.indexOf(slot);
      if (index >= 0) this.state.slots.splice(index, 1);
    };
    this.context.affect(remove);
    return remove;
  }

  slots(): DashboardSlot[] {
    return [...this.state.slots].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  registerAsset(asset: DashboardAsset): () => void {
    const file = /^\/[A-Za-z]:[\\/]/.test(asset.file) ? asset.file.slice(1) : asset.file;
    const value: DashboardAsset = { ...asset, file, mime: asset.mime ?? mimeFor(file), id: asset.id || createHash("md5").update(file).digest("hex") };
    this.state.assets.push(value);
    const remove = () => {
      const index = this.state.assets.indexOf(value);
      if (index >= 0) this.state.assets.splice(index, 1);
    };
    this.context.affect(remove);
    return remove;
  }

  assets(): DashboardAsset[] { return [...this.state.assets]; }

  addEntry(entry: DashboardEntry): DashboardEntryHandle {
    const files = (Array.isArray(entry.prod) ? entry.prod : [entry.prod]).flatMap((file) => {
      const absolute = /^\/[A-Za-z]:[\\/]/.test(file) ? file.slice(1) : file;
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [file];
      return ["index.js", "style.css"].map((name) => path.join(file, name)).filter((name) => existsSync(name));
    });
    if (!files.length) throw new Error("Dashboard entry has no files");
    const id = createHash("md5").update(files.join("\0")).digest("hex");
    const removeAssets = files.map((file, index) => this.registerAsset({
      id: index === 0 ? id : `${id}-${index}`,
      file,
      plugin: entry.plugin,
      data: entry.data,
    }));
    const handle: DashboardEntryHandle = {
      id,
      remove: () => {
        if (!this.state.entries.delete(id)) return;
        removeAssets.forEach((remove) => remove());
      },
    };
    this.state.entries.set(id, handle);
    this.context.affect(handle.remove);
    return handle;
  }

  removeEntry(id: string): boolean {
    const entry = this.state.entries.get(id);
    if (!entry) return false;
    entry.remove();
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
    session.respond({ assets: state.assets.map(({ id, mime, plugin, data }) => ({ id, mime, plugin, data, url: `/api/static/plugin?file=${encodeURIComponent(id)}` })) }, "json");
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
      const maxAge = safe === "dashboard-client.js" ? 0 : 3600;
      session.file(file, { maxAge, etag: true });
    } catch {
      const fallback = path.resolve(webRoot, "index.html");
      session.setMime("text/html; charset=utf-8");
      session.file(fallback, { maxAge: 60, etag: true });
    }
  });
}
