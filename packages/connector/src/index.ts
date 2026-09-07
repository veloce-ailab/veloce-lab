import { Context, Database, Session } from "yumeri";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/model";
export const depend = ["dashboard", "database", "model"];
export const provide = ["connector"];
export interface ConnectorService {
  execute(
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  register(handler: ConnectorHandler): () => void;
}
export interface ConnectorHandler {
  execute(
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
}
declare module "yumeri" {
  interface Components {
    connector: ConnectorService;
  }
}
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/connector.js", import.meta.url).pathname,
    plugin: "connector",
  });
  const handlers: ConnectorHandler[] = [];
  const db = ctx.component.database as Database;
  const uid = (s: Session) =>
    Number((s.properties.user as { id?: number } | undefined)?.id ?? 0);
  const connectorToken = (s: Session) => {
    const value =
      s.client.req?.headers["x-connector-token"] ??
      s.client.req?.headers.authorization ??
      "";
    return String(Array.isArray(value) ? value[0] : value)
      .replace(/^bearer\s+/i, "")
      .trim();
  };
  const tokenHash = (token: string) =>
    createHash("sha256").update(token).digest("hex");
  const deviceByToken = async (token: string) =>
    token
      ? db.selectOne("advanced_chat_connector_devices", {
          token_hash: tokenHash(token),
        })
      : undefined;
  ctx
    .route("/api/user/advanced-chat/devices")
    .methods("GET")
    .action(async (s) => {
      const id = uid(s);
      if (id)
        s.respond(
          (
            await db.select("advanced_chat_connector_devices", { user_id: id })
          ).map(({ token_hash: _hash, ...row }) => row),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/devices/token")
    .methods("POST")
    .action(async (s) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const token = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_connector_devices", {
        id: randomUUID(),
        user_id: id,
        token_hash: tokenHash(token),
        name: String(input.name ?? "Connector").slice(0, 120),
        remark: String(input.remark ?? "").slice(0, 200),
        hostname: "",
        os: "",
        arch: "",
        version: "",
        kind: "cli",
        desktop_instance_id: "",
        mode: "platform",
        status: "offline",
        last_seen_at: null,
        created_at: now,
        updated_at: now,
      });
      s.status = 201;
      const { token_hash: _hash, ...device } = row;
      s.respond({ ...device, token }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id")
    .methods("DELETE")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (id) {
        await db.remove("advanced_chat_connector_devices", {
          id: deviceId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  const heartbeat = async (s: Session) => {
    const token = connectorToken(s);
    const device: any = await deviceByToken(token);
    if (!device) {
      s.status = 401;
      s.respond({ error: "Invalid connector token" }, "json");
      return undefined;
    }
    const input = (await s.parseRequestBody()) as any;
    const now = new Date().toISOString();
    await db.update(
      "advanced_chat_connector_devices",
      { id: device.id },
      {
        ...Object.fromEntries(
          [
            "hostname",
            "os",
            "arch",
            "version",
            "mode",
            "kind",
            "desktop_instance_id",
          ]
            .filter((key) => input[key] !== undefined)
            .map((key) => [key, String(input[key])]),
        ),
        status: "online",
        last_seen_at: now,
        updated_at: now,
      },
    );
    return db.selectOne("advanced_chat_connector_devices", { id: device.id });
  };
  ctx
    .route("/api/advanced-chat/connectors/register")
    .methods("POST")
    .action(async (s) => {
      const value = await heartbeat(s);
      if (value) {
        const { token_hash: _hash, ...device } = value as any;
        s.respond(device, "json");
      }
    });
  ctx
    .route("/api/advanced-chat/connectors/heartbeat")
    .methods("POST")
    .action(async (s) => {
      const value = await heartbeat(s);
      if (value) s.respond({ ok: true, device_id: value.id }, "json");
    });
  ctx
    .route("/api/advanced-chat/connectors/tasks/next")
    .methods("GET")
    .action(async (s) => {
      const device: any = await deviceByToken(connectorToken(s));
      if (!device) {
        s.status = 401;
        s.respond({ error: "Invalid connector token" }, "json");
        return;
      }
      const task = await db.selectOne("advanced_chat_connector_tasks", {
        device_id: device.id,
        status: "approved",
      });
      if (task)
        await db.update(
          "advanced_chat_connector_tasks",
          { id: task.id },
          {
            status: "running",
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        );
      s.respond({ task: task ?? null }, "json");
    });
  ctx
    .route("/api/advanced-chat/connectors/tasks/:id/result")
    .methods("POST")
    .action(async (s, _p, taskId) => {
      const device: any = await deviceByToken(connectorToken(s));
      if (!device) {
        s.status = 401;
        s.respond({ error: "Invalid connector token" }, "json");
        return;
      }
      const task: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: taskId,
        device_id: device.id,
      });
      if (!task) {
        s.status = 404;
        s.respond({ error: "Task not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      await db.update(
        "advanced_chat_connector_tasks",
        { id: taskId },
        {
          status: input.success === true ? "completed" : "failed",
          result: String(input.result ?? ""),
          error_message: String(input.error_message ?? ""),
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond({ ok: true }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/connector-credentials")
    .methods("GET")
    .action(async (s) => {
      const id = uid(s);
      if (id)
        s.respond(
          await db.select("advanced_chat_connector_credentials", {
            user_id: id,
          }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/connector-credentials")
    .methods("POST")
    .action(async (s) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_connector_credentials", {
        id: randomUUID(),
        user_id: id,
        name: String(input.name ?? "Credential").slice(0, 120),
        type: String(input.type ?? "generic"),
        key: String(input.key ?? ""),
        value: String(input.value ?? ""),
        created_at: now,
        updated_at: now,
      });
      s.status = 201;
      s.respond({ ...row, value: undefined }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/connector-credentials/:id")
    .methods("PUT")
    .action(async (s, _p, credentialId) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const existing = await db.selectOne(
        "advanced_chat_connector_credentials",
        { id: credentialId, user_id: id },
      );
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Credential not found" }, "json");
        return;
      }
      await db.update(
        "advanced_chat_connector_credentials",
        { id: credentialId, user_id: id },
        {
          name: String(input.name ?? existing.name),
          type: String(input.type ?? existing.type),
          key: String(input.key ?? existing.key),
          value: String(input.value ?? existing.value),
          updated_at: new Date().toISOString(),
        },
      );
      const row = await db.selectOne("advanced_chat_connector_credentials", {
        id: credentialId,
        user_id: id,
      });
      s.respond({ ...row, value: undefined }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/connector-credentials/:id")
    .methods("DELETE")
    .action(async (s, _p, credentialId) => {
      const id = uid(s);
      if (id) {
        await db.remove("advanced_chat_connector_credential_bindings", {
          credential_id: credentialId,
          user_id: id,
        });
        await db.remove("advanced_chat_connector_credentials", {
          id: credentialId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/connector-tasks/:id")
    .methods("GET")
    .action(async (s, _p, taskId) => {
      const id = uid(s);
      const task = id
        ? await db.selectOne("advanced_chat_connector_tasks", {
            id: taskId,
            user_id: id,
          })
        : undefined;
      if (!task) {
        s.status = 404;
        s.respond({ error: "Connector task not found" }, "json");
        return;
      }
      s.respond(task, "json");
    });
  ctx
    .route("/api/user/advanced-chat/connector-tasks/:id/decision")
    .methods("POST")
    .action(async (s, _p, taskId) => {
      const id = uid(s);
      if (!id) return;
      const task: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: taskId,
        user_id: id,
      });
      if (!task) {
        s.status = 404;
        s.respond({ error: "Connector task not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const approved = input.approved === true || input.decision === "approve";
      await db.update(
        "advanced_chat_connector_tasks",
        { id: taskId, user_id: id },
        {
          status: approved ? "approved" : "rejected",
          error_message: approved
            ? ""
            : String(input.reason ?? "Rejected by user"),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_connector_tasks", {
          id: taskId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx.registerComponent("connector", {
    async execute(userId, action, input) {
      for (const handler of [...handlers].reverse()) {
        try {
          return await handler.execute(userId, action, input);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message !== "Unsupported connector action"
          )
            throw error;
        }
      }
      throw Error("No connector runtime is enabled");
    },
    register(handler) {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
  });
}
