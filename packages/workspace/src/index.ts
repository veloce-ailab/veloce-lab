import { randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/advanced-chat";
import "@velocelab/connector";
import "@velocelab/file";
import { ensureTables } from "./tables.js";
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
export async function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/workspace.js", import.meta.url).pathname,
    plugin: "workspace",
  });
  const db = ctx.component.database as Database;
  await ensureTables(db);
  const connector = ctx.component.connector;
  const files = ctx.component.file;
  const migrateLegacySessions = async (userId: number) => {
    const sessions = await db.select("advanced_chat_sessions", { user_id: userId });
    const workspaces = await db.select("advanced_chat_workspaces", { user_id: userId });
    const byLocation = new Map<string, any>();
    for (const workspace of workspaces as any[]) {
      const key = `${workspace.device_id || ""}\0${workspace.path || ""}`;
      if (!byLocation.has(key)) byLocation.set(key, workspace);
    }
    for (const session of sessions as any[]) {
      const deviceId = String(session.connector_device_id || "");
      const path = String(session.connector_workspace_path || "");
      if (!deviceId || !path) continue;
      const key = `${deviceId}\0${path}`;
      let workspace = byLocation.get(key);
      if (!workspace) {
        const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) || "Workspace";
        workspace = await db.create("advanced_chat_workspaces", {
          id: randomUUID(), user_id: userId, name, location: "device",
          device_id: deviceId, path, model: "", agent: "",
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any);
        byLocation.set(key, workspace);
      }
      if (String(session.workspace_id || "") !== String(workspace.id)) {
        await db.update("advanced_chat_sessions", { id: session.id, user_id: userId }, { workspace_id: workspace.id });
      }
    }
  };
  const service: WorkspaceService = {
    list: async (userId) => {
      await migrateLegacySessions(userId);
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
  /** Whether an action failed because no connector type answers it inline. */
  const noRuntime = (error: unknown) =>
    error instanceof Error &&
    error.message.startsWith("No connector runtime serves the action");
  const asError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  /**
   * Queues an action for an external agent, which serves its work through the
   * task table rather than an inline handler. A git action waits for approval
   * unless the session runs with full access, mirroring the local connector.
   */
  const queueOnDevice = async (
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ) => {
    const deviceId = String(input.device_id ?? "").trim();
    if (!deviceId) throw Error("A connected device is required");
    const device: any = await db.selectOne("advanced_chat_connector_devices", {
      id: deviceId,
      user_id: userId,
    });
    if (!device) throw Error("Connector device not found");
    return connector.createTask(userId, {
      device_id: device.id,
      action,
      workspace_path: String(input.workspace_path ?? ""),
      payload: input,
      requiresApproval:
        action === "git_action" &&
        String(input.approval_mode ?? "manual") !== "full_access",
    });
  };
  /**
   * Queues an action and waits for the agent's answer, so a status request
   * reads like the inline one it fell back from. The deadline matches the
   * terminal routes: long enough for a poll round trip, short enough that a
   * busy device fails the request instead of hanging the sidebar.
   */
  const queueAndWait = async (
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ) => {
    const task = await queueOnDevice(userId, action, input);
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const current: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: String(task.id),
        user_id: userId,
      });
      if (current?.status === "completed") {
        try {
          return JSON.parse(String(current.result || "{}"));
        } catch {
          throw Error(`Invalid connector ${action} response`);
        }
      }
      if (current?.status === "failed" || current?.status === "rejected")
        throw Error(
          String(current.error_message || `Connector ${action} task failed`),
        );
      await new Promise((resolve) => ctx.setTimeout(resolve, 150));
    }
    throw Error(`Connector ${action} task timed out`);
  };
  ctx
    .route("/api/user/advanced-chat/workspaces")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id !== undefined) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/workspaces")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      if (id !== undefined) {
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
      if (id !== undefined) s.respond(await service.files(id, workspaceId), "json");
    });
  ctx
    .route("/api/user/advanced-chat/workspaces/:id/files")
    .methods("POST")
    .action(async (s, _p, workspaceId) => {
      const id = user(s);
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      if (id === undefined) return;
      const query = s.client.req?.url?.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      const input = {
        device_id: params.get("connector_device_id") ?? "",
        workspace_path: params.get("connector_workspace_path") ?? "",
        // The panel's compare-branch picker sends this; dropping it made every
        // request a plain worktree status no matter which branch was picked.
        compare_branch: params.get("compare_branch") ?? "",
      };
      try {
        s.respond(
          await connector.execute(id, "git_status", input),
          "json",
        );
      } catch (error) {
        // An external agent has no inline handler, so the same action is
        // queued as a connector task and waited for, the way the terminal
        // routes wait for theirs.
        if (!noRuntime(error)) {
          s.status = 502;
          s.respond({ error: asError(error) }, "json");
          return;
        }
        try {
          s.respond(await queueAndWait(id, "git_status", input), "json");
        } catch (error) {
          s.status = 502;
          s.respond({ error: asError(error) }, "json");
        }
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspace/directories")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
      const query = s.client.req?.url?.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      try {
        s.respond(
          await connector.execute(id, "list_directories", {
            device_id: params.get("connector_device_id") ?? "",
            // The picker sends `path`; the git routes use the longer name. Both
            // mean the folder being browsed, and ignoring `path` made every
            // drill-down list the root again.
            path:
              params.get("path") ?? params.get("connector_workspace_path") ?? "",
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
    .route("/api/user/advanced-chat/workspace/files")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
      const query = s.client.req?.url?.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      const input = {
        device_id: params.get("connector_device_id") ?? "",
        workspace_path: params.get("connector_workspace_path") ?? "",
        path: params.get("path") ?? params.get("connector_workspace_path") ?? "",
      };
      try {
        s.respond(await connector.execute(id, "list_directory", input), "json");
      } catch (error) {
        if (!noRuntime(error)) {
          s.status = 502;
          s.respond({ error: asError(error) }, "json");
          return;
        }
        try {
          s.respond(await queueAndWait(id, "list_directory", input), "json");
        } catch (error) {
          s.status = 502;
          s.respond({ error: asError(error) }, "json");
        }
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspace/git/action")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
      const input = (await s.parseRequestBody()) as any;
      try {
        // The connector dispatches on `device_id`/`workspace_path`, while the
        // chat client speaks `connector_device_id`/`connector_workspace_path`;
        // passing the body through unchanged sent the action to whatever device
        // happened to be the default instead of the one the user picked.
        s.respond(
          await connector.execute(id, "git_action", {
            ...input,
            device_id: String(input.connector_device_id ?? ""),
            workspace_path: String(input.connector_workspace_path ?? ""),
          }),
          "json",
        );
      } catch (error) {
        // No inline handler means an external agent, which answers through the
        // task queue instead: the task is queued with the approval gate the
        // session asked for and handed back for the client to poll.
        if (!noRuntime(error)) {
          s.status = 502;
          s.respond(
            { error: error instanceof Error ? error.message : String(error) },
            "json",
          );
          return;
        }
        try {
          s.respond(
            await queueOnDevice(id, "git_action", {
              ...input,
              device_id: String(input.connector_device_id ?? ""),
              workspace_path: String(input.connector_workspace_path ?? ""),
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
      }
    });
}
