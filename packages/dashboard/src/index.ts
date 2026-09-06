import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { Context, Schema, Session } from "yumeri";
export const depend: string[] = [];
export const provide = ["dashboard"];
export interface DashboardSlot { id: string; script: string; order?: number; }
export interface DashboardAsset { id: string; file: string; mime?: string; plugin?: string; }
export interface DashboardService { registerSlot(slot: DashboardSlot): () => void; slots(): DashboardSlot[]; registerAsset(asset: DashboardAsset): () => void; assets(): DashboardAsset[]; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable dashboard").default(true) });
declare module "yumeri" { interface Components { dashboard: DashboardService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const slots: DashboardSlot[] = [];
  const assets: DashboardAsset[] = [];
  const service: DashboardService = { registerSlot(slot) { slots.push(slot); return () => { const i = slots.indexOf(slot); if (i >= 0) slots.splice(i, 1); }; }, slots: () => [...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), registerAsset(asset) { const value = { ...asset, id: asset.id || createHash("md5").update(asset.file).digest("hex") }; assets.push(value); return () => { const i = assets.indexOf(value); if (i >= 0) assets.splice(i, 1); }; }, assets: () => [...assets] };
  ctx.registerComponent("dashboard", service);
  ctx.route("/api/dashboard/manifest").methods("GET").action(async (session: Session) => { session.respond({ assets: service.assets().map(({ id, mime, plugin }) => ({ id, mime, plugin, url: `/api/static/plugin?file=${encodeURIComponent(id)}` })) }, "json"); });
  ctx.route("/api/static/plugin").methods("GET").action(async (session: Session) => { const id = String(session.query?.file ?? ""); const asset = assets.find(item => item.id === id); if (!asset || !existsSync(asset.file)) { session.status = 404; session.respond({ error: "Static plugin file not found" }, "json"); return; } if (asset.mime) session.setMime(asset.mime); session.sendFile(asset.file); });
  ctx.route("root").methods("GET").action(async (session: Session) => {
    const requested = session.pathname === "/" ? "index.html" : session.pathname.replace(/^\//, "");
    const safe = requested.includes("..") ? "index.html" : requested;
    const file = path.resolve(packageRoot, "web", safe);
    try { session.file(file, { maxAge: 3600, etag: true }); } catch { session.file(path.resolve(packageRoot, "web", "index.html"), { maxAge: 60, etag: true }); }
  });
}
