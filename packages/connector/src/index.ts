import { Context, Database, Session } from "yumeri";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/model-catalog";
export const depend = ["dashboard", "database"];
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
    .route("/api/user/advanced-chat/devices/:id/token")
    .methods("POST")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      const token = randomBytes(32).toString("base64url");
      const existing = await db.selectOne("advanced_chat_connector_devices", {
        id: deviceId,
        user_id: id,
      });
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Device not found" }, "json");
        return;
      }
      await db.update(
        "advanced_chat_connector_devices",
        { id: deviceId, user_id: id },
        { token_hash: tokenHash(token), updated_at: new Date().toISOString() },
      );
      const device: any = await db.selectOne(
        "advanced_chat_connector_devices",
        {
          id: deviceId,
          user_id: id,
        },
      );
      const { token_hash: _hash, ...safe } = device;
      s.respond({ token, device: safe }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/desktop/connector/ensure")
    .methods("POST")
    .action(async (s) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const instance = String(input.desktop_instance_id ?? "")
        .trim()
        .slice(0, 120);
      if (!instance) {
        s.status = 400;
        s.respond({ error: "Desktop instance id is required" }, "json");
        return;
      }
      const existing: any = await db.selectOne(
        "advanced_chat_connector_devices",
        {
          user_id: id,
          kind: "desktop",
          desktop_instance_id: instance,
        },
      );
      const resume = String(
        s.client.req?.headers["x-desktop-connector-token"] ?? "",
      ).trim();
      if (existing && resume && existing.token_hash === tokenHash(resume)) {
        const { token_hash: _hash, ...safe } = existing;
        s.respond({ device: safe, reused: true }, "json");
        return;
      }
      const token = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();
      const values = {
        user_id: id,
        token_hash: tokenHash(token),
        name: `Veloce Desktop${input.hostname ? ` (${String(input.hostname).slice(0, 120)})` : ""}`,
        hostname: String(input.hostname ?? "").slice(0, 120),
        os: String(input.os ?? "").slice(0, 40),
        arch: String(input.arch ?? "").slice(0, 40),
        version: String(input.version ?? "").slice(0, 80),
        kind: "desktop",
        desktop_instance_id: instance,
        mode: "platform",
        status: "offline",
        updated_at: now,
      };
      let device: any;
      if (existing) {
        await db.update(
          "advanced_chat_connector_devices",
          { id: existing.id },
          values,
        );
        device = await db.selectOne("advanced_chat_connector_devices", {
          id: existing.id,
        });
      } else {
        device = await db.create("advanced_chat_connector_devices", {
          id: randomUUID(),
          ...values,
          remark: "",
          last_seen_at: null,
          created_at: now,
        } as any);
      }
      const { token_hash: _hash, ...safe } = device;
      s.respond({ token, device: safe, reused: false }, "json");
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
  ctx
    .route("/api/user/advanced-chat/devices/:id")
    .methods("GET")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      const device = id
        ? await db.selectOne("advanced_chat_connector_devices", {
            id: deviceId,
            user_id: id,
          })
        : undefined;
      if (!device) {
        s.status = 404;
        s.respond({ error: "Device not found" }, "json");
        return;
      }
      const { token_hash: _hash, ...safe } = device;
      s.respond(safe, "json");
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id")
    .methods("PUT")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      const existing = await db.selectOne("advanced_chat_connector_devices", {
        id: deviceId,
        user_id: id,
      });
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Device not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      await db.update(
        "advanced_chat_connector_devices",
        { id: deviceId, user_id: id },
        {
          name: String(input.name ?? existing.name).slice(0, 120),
          remark: String(input.remark ?? existing.remark).slice(0, 200),
          mode: String(input.mode ?? existing.mode),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_connector_devices", {
          id: deviceId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id/tasks")
    .methods("GET")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (id)
        s.respond(
          await db.select("advanced_chat_connector_tasks", {
            device_id: deviceId,
            user_id: id,
          }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id/tasks/:task_id/cancel")
    .methods("POST")
    .action(async (s, _p, deviceId, taskId) => {
      const id = uid(s);
      const task = id
        ? await db.selectOne("advanced_chat_connector_tasks", {
            id: taskId,
            device_id: deviceId,
            user_id: id,
          })
        : undefined;
      if (!task) {
        s.status = 404;
        s.respond({ error: "Task not found" }, "json");
        return;
      }
      await db.update(
        "advanced_chat_connector_tasks",
        { id: taskId, user_id: id },
        {
          status: "cancelled",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond({ success: true }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id/credentials")
    .methods("GET")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      const bindings = await db.select(
        "advanced_chat_connector_credential_bindings",
        { device_id: deviceId, user_id: id },
      );
      const values = await Promise.all(
        bindings.map((binding: any) =>
          db.selectOne("advanced_chat_connector_credentials", {
            id: binding.credential_id,
            user_id: id,
          }),
        ),
      );
      s.respond(
        values
          .filter(Boolean)
          .map((row: any) => ({ ...row, value: undefined })),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id/credentials")
    .methods("PUT")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      await db.remove("advanced_chat_connector_credential_bindings", {
        device_id: deviceId,
        user_id: id,
      });
      for (const credentialId of Array.isArray(input.credential_ids)
        ? input.credential_ids.map(String)
        : [])
        await db.create("advanced_chat_connector_credential_bindings", {
          id: randomUUID(),
          user_id: id,
          device_id: deviceId,
          credential_id: credentialId,
          created_at: new Date().toISOString(),
        } as any);
      s.respond({ success: true }, "json");
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
  ctx
    .route("/api/user/advanced-chat/devices/:id/mcp-processes")
    .methods("GET")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      try {
        s.respond(
          await (ctx.component.connector as ConnectorService).execute(
            id,
            "list_mcp_processes",
            { device_id: deviceId },
          ),
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
    .route("/api/user/advanced-chat/devices/:id/mcp-processes/stop")
    .methods("POST")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      try {
        s.respond(
          await (ctx.component.connector as ConnectorService).execute(
            id,
            "stop_mcp_process",
            { device_id: deviceId, key: String(input.key ?? "") },
          ),
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
