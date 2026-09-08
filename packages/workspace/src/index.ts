import { randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/model-catalog";
import "@velocelab/connector";
import "@velocelab/file";
export const depend = ["database", "dashboard", "connector", "file"];
export const provide = ["workspace"];
export interface WorkspaceService {
  list(userId: number): Promise<any[]>;
  create(userId: number, input: Record<string, unknown>): Promise<any>;
  files(userId: number, workspaceId: string): Promise<any[]>;
}
export const config: Schema<Record<string, never>> = Schema.object({});
declare module "yumeri" {
  interface Components {
    workspace: WorkspaceService;
  }
}
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/workspace.js", import.meta.url).pathname,
    plugin: "workspace",
  });
  const db = ctx.component.database as Database;
  const connector = ctx.component.connector;
  const files = ctx.component.file;
  const service: WorkspaceService = {
    list: async (userId) => {
      const workspaces = await db.select("advanced_chat_workspaces", {
        user_id: userId,
      });
      return Promise.all(
        workspaces.map(async (workspace: any) => ({
          ...workspace,
          files: await db.select("advanced_chat_workspace_files", {
            workspace_id: workspace.id,
            user_id: userId,
          }),
        })),
      );
    },
    create: async (userId, input) => {
      const now = new Date().toISOString();
      const workspaceId = randomUUID();
      const workspace = await db.create("advanced_chat_workspaces", {
        id: workspaceId,
        user_id: userId,
        name: String(input.name ?? "Workspace"),
        location: String(input.location ?? "server"),
        path: String(input.path ?? ""),
        model: String(input.model ?? ""),
        agent: String(input.agent ?? ""),
        device_id: String(input.device_id ?? ""),
        created_at: now,
        updated_at: now,
      } as any);
      const fileId = randomUUID();
      const content = `# ${String(input.name ?? "Workspace")}\n\n`;
      const storagePath = `workspaces/${userId}/${workspaceId}/${fileId}.md`;
      await files.write(storagePath, content);
      await db.create("advanced_chat_workspace_files", {
        id: fileId,
        workspace_id: workspaceId,
        user_id: userId,
        name: "欢迎使用.md",
        content,
        storage_path: storagePath,
        created_at: now,
        updated_at: now,
      } as any);
      return workspace;
    },
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
    .route("/api/user/advanced-chat/workspaces/:id/files")
    .methods("POST")
    .action(async (s, _p, workspaceId) => {
      const id = user(s);
      if (!id) return;
      const workspace: any = await db.selectOne("advanced_chat_workspaces", {
        id: workspaceId,
        user_id: id,
      });
      if (!workspace) {
        s.status = 404;
        s.respond({ error: "Workspace not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const name = String(input.name ?? "").trim();
      const content = String(input.content ?? "");
      if (!name || /[\\/\0]/.test(name) || name === "." || name === "..") {
        s.status = 400;
        s.respond({ error: "Invalid file name" }, "json");
        return;
      }
      if (Buffer.byteLength(content) > 2 * 1024 * 1024) {
        s.status = 413;
        s.respond({ error: "file content exceeds 2 MiB" }, "json");
        return;
      }
      const exists = await db.selectOne("advanced_chat_workspace_files", {
        workspace_id: workspaceId,
        user_id: id,
        name,
      });
      if (exists) {
        s.status = 409;
        s.respond({ error: "A file with this name already exists" }, "json");
        return;
      }
      const fileId = randomUUID();
      const storagePath = `workspaces/${id}/${workspaceId}/${fileId}.md`;
      await files.write(storagePath, content);
      const row = await db.create("advanced_chat_workspace_files", {
        id: fileId,
        workspace_id: workspaceId,
        user_id: id,
        name,
        content,
        storage_path: storagePath,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
      s.status = 201;
      s.respond(row, "json");
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id/files/:file_id")
    .methods("PUT")
    .action(async (s, _p, workspaceId, fileId) => {
      const id = user(s);
      if (!id) return;
      const row: any = await db.selectOne("advanced_chat_workspace_files", {
        id: fileId,
        workspace_id: workspaceId,
        user_id: id,
      });
      if (!row) {
        s.status = 404;
        s.respond({ error: "File not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const content = String(input.content ?? row.content ?? "");
      if (Buffer.byteLength(content) > 2 * 1024 * 1024) {
        s.status = 413;
        s.respond({ error: "file content exceeds 2 MiB" }, "json");
        return;
      }
      const name = String(input.name ?? row.name).trim();
      if (!name || /[\\/\0]/.test(name)) {
        s.status = 400;
        s.respond({ error: "Invalid file name" }, "json");
        return;
      }
      if (row.storage_path)
        await files.write(String(row.storage_path), content);
      await db.update(
        "advanced_chat_workspace_files",
        { id: fileId, workspace_id: workspaceId, user_id: id },
        { name, content, updated_at: new Date().toISOString() },
      );
      s.respond(
        await db.selectOne("advanced_chat_workspace_files", {
          id: fileId,
          workspace_id: workspaceId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id/files/:file_id")
    .methods("DELETE")
    .action(async (s, _p, workspaceId, fileId) => {
      const id = user(s);
      if (!id) return;
      const row: any = await db.selectOne("advanced_chat_workspace_files", {
        id: fileId,
        workspace_id: workspaceId,
        user_id: id,
      });
      if (!row) {
        s.status = 404;
        s.respond({ error: "File not found" }, "json");
        return;
      }
      if (row.storage_path) await files.remove(String(row.storage_path));
      await db.remove("advanced_chat_workspace_files", {
        id: fileId,
        workspace_id: workspaceId,
        user_id: id,
      });
      s.respond({ success: true }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/workspace/git/status")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const query = s.client.req?.url?.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      const deviceId = params.get("connector_device_id") ?? "";
      const workspacePath = params.get("connector_workspace_path") ?? "";
      try {
        s.respond(
          await connector.execute(id, "git_status", {
            device_id: deviceId,
            workspace_path: workspacePath,
          }),
          "json",
        );
      } catch (error) {
        s.status = 502;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspace/directories")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const query = s.client.req?.url?.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      try {
        s.respond(
          await connector.execute(id, "list_directories", {
            device_id: params.get("connector_device_id") ?? "",
            workspace_path: params.get("connector_workspace_path") ?? "",
          }),
          "json",
        );
      } catch (error) {
        s.status = 502;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspace/git/action")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      try {
        s.respond(await connector.execute(id, "git_action", input), "json");
      } catch (error) {
        s.status = 502;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
}
