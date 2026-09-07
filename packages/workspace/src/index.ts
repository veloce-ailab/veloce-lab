import { randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/model";
export const depend = ["database", "dashboard", "model"];
export const provide = ["workspace"];
export interface WorkspaceService {
  list(userId: number): Promise<any[]>;
  create(userId: number, input: Record<string, unknown>): Promise<any>;
  files(userId: number, workspaceId: string): Promise<any[]>;
}
export const config: Schema<{ enabled: boolean }> = Schema.object({
  enabled: Schema.boolean("Enable workspaces").default(true),
});
declare module "yumeri" {
  interface Components {
    workspace: WorkspaceService;
  }
}
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/workspace.js", import.meta.url).pathname,
    plugin: "workspace",
  });
  const db = ctx.component.database as Database;
  const service: WorkspaceService = {
    list: (userId) =>
      db.select("advanced_chat_workspaces", { user_id: userId }),
    create: (userId, input) =>
      db.create("advanced_chat_workspaces", {
        id: randomUUID(),
        user_id: userId,
        name: String(input.name ?? "Workspace"),
        location: String(input.location ?? "server"),
        path: String(input.path ?? ""),
        model: String(input.model ?? ""),
        agent: String(input.agent ?? ""),
        device_id: String(input.device_id ?? ""),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any),
    files: (userId, workspaceId) =>
      db.select("advanced_chat_workspace_files", {
        user_id: userId,
        workspace_id: workspaceId,
      }),
  };
  ctx.registerComponent("workspace", service);
  const user = (s: Session) =>
    (s.properties.user as any)?.id as number | undefined;
  ctx
    .route("/api/user/advanced-chat/workspaces")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/workspaces")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      s.status = 201;
      s.respond(
        await service.create(id, (await s.parseRequestBody()) as any),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id")
    .methods("PUT")
    .action(async (s, _p, workspaceId) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const existing = await db.selectOne("advanced_chat_workspaces", {
        id: workspaceId,
        user_id: id,
      });
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Workspace not found" }, "json");
        return;
      }
      await db.update(
        "advanced_chat_workspaces",
        { id: workspaceId, user_id: id },
        {
          name: String(input.name ?? existing.name),
          location: String(input.location ?? existing.location),
          path: String(input.path ?? existing.path),
          model: String(input.model ?? existing.model),
          agent: String(input.agent ?? existing.agent),
          device_id: String(input.device_id ?? existing.device_id),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_workspaces", {
          id: workspaceId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id")
    .methods("DELETE")
    .action(async (s, _p, workspaceId) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_workspace_files", {
          workspace_id: workspaceId,
          user_id: id,
        });
        await db.remove("advanced_chat_workspaces", {
          id: workspaceId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id/files")
    .methods("GET")
    .action(async (s, _p, workspaceId) => {
      const id = user(s);
      if (id) s.respond(await service.files(id, workspaceId), "json");
    });
  ctx
    .route("/api/user/advanced-chat/files")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          await db.select("advanced_chat_files", { user_id: id }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/files")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const data = String(input.data ?? input.content ?? "");
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_files", {
        id: randomUUID(),
        user_id: id,
        name: String(input.name ?? "file"),
        mime_type: String(input.mime_type ?? "text/plain"),
        size: Buffer.byteLength(data),
        data,
        storage_path: "",
        text_extract: data,
        hash: "",
        source: "upload",
        source_key: "",
        created_at: now,
        updated_at: now,
      } as any);
      s.status = 201;
      s.respond(row, "json");
    });
  ctx
    .route("/api/user/advanced-chat/files/:id/content")
    .methods("GET")
    .action(async (s, _p, fileId) => {
      const id = user(s);
      const row = id
        ? await db.selectOne("advanced_chat_files", { id: fileId, user_id: id })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "File not found" }, "json");
        return;
      }
      s.respond({ content: row.data ?? row.text_extract ?? "" }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/files/:id/download")
    .methods("GET")
    .action(async (s, _p, fileId) => {
      const id = user(s);
      const row = id
        ? await db.selectOne("advanced_chat_files", { id: fileId, user_id: id })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "File not found" }, "json");
        return;
      }
      s.respond(
        { name: row.name, mime_type: row.mime_type, data: row.data ?? "" },
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/files/:id")
    .methods("DELETE")
    .action(async (s, _p, fileId) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_files", { id: fileId, user_id: id });
        s.respond({ success: true }, "json");
      }
    });
}
