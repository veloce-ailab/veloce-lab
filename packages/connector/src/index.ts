import { Context, Database, Session } from "yumeri";
import { randomUUID } from "node:crypto";
import "@velocelab/dashboard";
export const depend = ["dashboard", "database"];
export const provide = ["connector"];
export interface ConnectorService {
  execute(userId: number, action: string, input: Record<string, unknown>): Promise<unknown>;
  register(handler: ConnectorHandler): () => void;
}
export interface ConnectorHandler {
  execute(userId: number, action: string, input: Record<string, unknown>): Promise<unknown>;
}
declare module "yumeri" { interface Components { connector: ConnectorService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/connector.js", import.meta.url).pathname, plugin: "connector" });
  const handlers: ConnectorHandler[] = [];
  const db = ctx.component.database as Database;
  const uid = (s: Session) => Number((s.properties.user as { id?: number } | undefined)?.id ?? 0);
  ctx.route("/api/user/advanced-chat/connector-credentials").methods("GET").action(async s => { const id = uid(s); if (id) s.respond(await db.select("advanced_chat_connector_credentials", { user_id: id }), "json"); });
  ctx.route("/api/user/advanced-chat/connector-credentials").methods("POST").action(async s => { const id = uid(s); if (!id) return; const input = await s.parseRequestBody() as any; const now = new Date().toISOString(); const row = await db.create("advanced_chat_connector_credentials", { id: randomUUID(), user_id: id, name: String(input.name ?? "Credential").slice(0, 120), type: String(input.type ?? "generic"), key: String(input.key ?? ""), value: String(input.value ?? ""), created_at: now, updated_at: now }); s.status = 201; s.respond({ ...row, value: undefined }, "json"); });
  ctx.route("/api/user/advanced-chat/connector-credentials/:id").methods("PUT").action(async (s, _p, credentialId) => { const id = uid(s); if (!id) return; const input = await s.parseRequestBody() as any; const existing = await db.selectOne("advanced_chat_connector_credentials", { id: credentialId, user_id: id }); if (!existing) { s.status = 404; s.respond({ error: "Credential not found" }, "json"); return; } await db.update("advanced_chat_connector_credentials", { id: credentialId, user_id: id }, { name: String(input.name ?? existing.name), type: String(input.type ?? existing.type), key: String(input.key ?? existing.key), value: String(input.value ?? existing.value), updated_at: new Date().toISOString() }); const row = await db.selectOne("advanced_chat_connector_credentials", { id: credentialId, user_id: id }); s.respond({ ...row, value: undefined }, "json"); });
  ctx.route("/api/user/advanced-chat/connector-credentials/:id").methods("DELETE").action(async (s, _p, credentialId) => { const id = uid(s); if (id) { await db.remove("advanced_chat_connector_credential_bindings", { credential_id: credentialId, user_id: id }); await db.remove("advanced_chat_connector_credentials", { id: credentialId, user_id: id }); s.respond({ success: true }, "json"); } });
  ctx.registerComponent("connector", {
    async execute(userId, action, input) {
      for (const handler of [...handlers].reverse()) {
        try { return await handler.execute(userId, action, input); } catch (error) {
          if (error instanceof Error && error.message !== "Unsupported connector action") throw error;
        }
      }
      throw Error("No connector runtime is enabled");
    },
    register(handler) {
      handlers.push(handler);
      return () => { const index = handlers.indexOf(handler); if (index >= 0) handlers.splice(index, 1); };
    },
  });
}
