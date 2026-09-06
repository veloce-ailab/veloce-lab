import { Context, Schema, Session } from "yumeri";
export const depend: string[] = [];
export const provide = ["audit"];
export interface AuditRecord { type: string; action: string; resource?: string; userId?: number; statusCode?: number; path?: string; metadata?: Record<string, unknown>; createdAt: string; }
export interface AuditService { record(input: Omit<AuditRecord, "createdAt">): Promise<void>; list(limit?: number): AuditRecord[]; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable audit").default(true) });
declare module "yumeri" { interface Components { audit: AuditService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  const records: AuditRecord[] = [];
  const service: AuditService = { async record(input) { if (cfg.enabled) records.push({ ...input, createdAt: new Date().toISOString() }); }, list: (limit = 100) => records.slice(-limit).reverse() };
  ctx.registerComponent("audit", service);
  ctx.use("audit", async (session: Session, next: () => Promise<void>) => { const started = Date.now(); await next(); await service.record({ type: "api", action: `${session.client.req?.method ?? "GET"} ${session.pathname ?? ""}`, path: session.pathname, statusCode: session.status, userId: (session.properties.user as any)?.id, metadata: { durationMs: Date.now() - started } }); });
}
