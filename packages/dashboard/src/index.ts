import path from "node:path";
import { Context, Schema, Session } from "yumeri";
export const depend: string[] = [];
export const provide = ["dashboard"];
export interface DashboardSlot { id: string; script: string; order?: number; }
export interface DashboardService { registerSlot(slot: DashboardSlot): () => void; slots(): DashboardSlot[]; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable dashboard").default(true) });
declare module "yumeri" { interface Components { dashboard: DashboardService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  const slots: DashboardSlot[] = [];
  const service: DashboardService = { registerSlot(slot) { slots.push(slot); return () => { const i = slots.indexOf(slot); if (i >= 0) slots.splice(i, 1); }; }, slots: () => [...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) };
  ctx.registerComponent("dashboard", service);
  ctx.route("root").methods("GET").action(async (session: Session) => {
    const requested = session.pathname === "/" ? "index.html" : session.pathname.replace(/^\//, "");
    const safe = requested.includes("..") ? "index.html" : requested;
    const file = path.resolve("packages/dashboard/dist/web", safe);
    try { session.file(file, { maxAge: 3600, etag: true }); } catch { session.file(path.resolve("packages/dashboard/dist/web", "index.html"), { maxAge: 60, etag: true }); }
  });
}
