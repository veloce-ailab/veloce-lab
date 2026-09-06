import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
export const depend = ["database"];
export const provide = ["workspace"];
export interface WorkspaceService { list(userId: number): Promise<any[]>; create(userId: number, input: Record<string, unknown>): Promise<any>; files(userId: number, workspaceId: string): Promise<any[]>; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable workspaces").default(true) });
declare module "yumeri" { interface Components { workspace: WorkspaceService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  const db = ctx.component.database as Database;
  const service: WorkspaceService = { list: userId => db.select("advanced_chat_workspaces", { user_id: userId }), create: (userId, input) => db.create("advanced_chat_workspaces", { id: randomUUID(), user_id: userId, name: String(input.name ?? "Workspace"), location: String(input.location ?? "server"), path: String(input.path ?? ""), model: String(input.model ?? ""), agent: String(input.agent ?? ""), device_id: String(input.device_id ?? ""), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any), files: (userId, workspaceId) => db.select("advanced_chat_workspace_files", { user_id: userId, workspace_id: workspaceId }) };
  ctx.registerComponent("workspace", service);
  const user = (s: Session) => (s.properties.user as any)?.id as number | undefined;
  ctx.route("/api/user/advanced-chat/workspaces").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await service.list(id), "json"); });
  ctx.route("/api/user/advanced-chat/workspaces").methods("POST").action(async s => { const id = user(s); if (!id) return; s.status = 201; s.respond(await service.create(id, await s.parseRequestBody() as any), "json"); });
  ctx.route("/api/user/advanced-chat/workspaces/:id/files").methods("GET").action(async (s, _p, workspaceId) => { const id = user(s); if (id) s.respond(await service.files(id, workspaceId), "json"); });
}

