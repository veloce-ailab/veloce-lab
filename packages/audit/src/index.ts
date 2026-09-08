import { Context, Database, Schema, Session } from "yumeri";
import type { AuditLog } from "./types.js";
import "@velocelab/database-core";
export const depend = ["database"];
export const provide = ["audit"];
export interface AuditRecord { type: string; action: string; resource?: string; userId?: number; statusCode?: number; path?: string; metadata?: Record<string, unknown>; createdAt: string; }
export interface AuditService { record(input: Omit<AuditRecord, "createdAt">): Promise<void>; list(limit?: number): AuditRecord[]; }
export const config: Schema<Record<string, never>> = Schema.object({});
declare module "@yumerijs/types" { interface Tables { audit_logs: AuditLog; } }
declare module "yumeri" { interface Components { audit: AuditService; } }
export async function apply(ctx: Context) {
  const db = ctx.component.database;
  await db.extend("audit_logs", {
    id: { type: "integer", autoIncrement: true }, log_type: { type: "string", nullable: false }, action: { type: "string", nullable: false }, resource: "string", user_id: "integer", api_key_id: "integer", method: "string", path: "string", query: "string", status_code: "integer", ip_address: "string", user_agent: "string", message: "string", metadata: "text", duration_ms: "bigint", created_at: "timestamp",
  });
  const records: AuditRecord[] = [];
  const service: AuditService = { async record(input) { records.push({ ...input, createdAt: new Date().toISOString() }); }, list: (limit = 100) => records.slice(-limit).reverse() };
  ctx.registerComponent("audit", service);
  ctx.use("audit", async (session: Session, next: () => Promise<void>) => { const started = Date.now(); await next(); await service.record({ type: "api", action: `${session.client.req?.method ?? "GET"} ${session.pathname ?? ""}`, path: session.pathname, statusCode: session.status, userId: (session.properties.user as any)?.id, metadata: { durationMs: Date.now() - started } }); });
}
