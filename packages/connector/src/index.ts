import { Context, Database, Session } from "yumeri";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import { ensureTables } from "./tables.js";
export const depend = ["dashboard", "database"];
export const provide = ["connector"];
/** A row of `advanced_chat_connector_devices`, without its token hash. */
export interface ConnectorDeviceRecord {
  id: string;
  user_id: number;
  name: string;
  remark?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  version?: string;
  kind: string;
  desktop_instance_id?: string;
  mode?: string;
  status?: string;
  last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
/** A row of `advanced_chat_connector_tasks`. */
export interface ConnectorTaskRecord {
  id: string;
  user_id: number;
  device_id: string;
  action: string;
  workspace_path?: string;
  payload?: string;
  status: string;
  result?: string;
  error_message?: string;
  [key: string]: unknown;
}
export interface LocalizedText {
  zh: string;
  en: string;
  ja?: string;
}
/**
 * A connector type is what a device of that kind can do.
 *
 * Devices carry their type id in `advanced_chat_connector_devices.kind`, so a
 * plugin adds a connector simply by registering one here: `actions` answer
 * connector actions, `ensureDevice` brings an auto-connecting device online
 * without any agent process or token, and `pickDirectory` decides how *that*
 * connector lets the user choose a folder (a native dialog on the host, the
 * desktop app's own dialog, a remote browser, …).
 */
export interface ConnectorType {
  id: string;
  label: LocalizedText;
  description?: LocalizedText;
  /** Online whenever the host is: no token, no polling agent. */
  autoConnect?: boolean;
  /** Whether a user may mint a token for this type (default true). */
  creatable?: boolean;
  /**
   * Whether a user may remove this type's device. Defaults to the opposite of
   * `autoConnect`: a device the host provides for itself is part of the
   * installation, not something the user set up, so deleting it would only make
   * it reappear (or leave the deployment with no connector at all).
   */
  removable?: boolean;
  /** Action names this type answers; published by the connector-types route. */
  capabilities?: string[];
  /** Auto-connect hook: create or refresh this user's device row. */
  ensureDevice?(userId: number): Promise<ConnectorDeviceRecord>;
  /** Action handlers, keyed by action name. */
  actions?: Record<
    string,
    (
      userId: number,
      input: Record<string, unknown>,
      device: ConnectorDeviceRecord,
    ) => Promise<unknown> | unknown
  >;
  /**
   * How this connector picks a folder. Resolving to an empty path with
   * `cancelled` set means the user dismissed the picker.
   */
  pickDirectory?(
    userId: number,
    input: Record<string, unknown>,
    device: ConnectorDeviceRecord,
  ): Promise<{ path: string; cancelled: boolean }>;
  /**
   * Runs one queued task. Present on types that execute their own queue (an
   * auto-connect type is its own agent); absent when an external process polls
   * `connectors/tasks/next` instead.
   */
  runTask?(
    task: ConnectorTaskRecord,
    device: ConnectorDeviceRecord,
  ): Promise<{ success: boolean; result?: string; error_message?: string }>;
}
export interface ConnectorTypeInfo {
  id: string;
  label: LocalizedText;
  description: LocalizedText | null;
  auto_connect: boolean;
  creatable: boolean;
  removable: boolean;
  capabilities: string[];
}

/**
 * Whether this type's device may be removed. A connector the host provides for
 * itself (auto-connect) is part of the installation rather than something the
 * user set up, so removing it would either just recreate it or leave the
 * deployment with no connector at all.
 */
export function connectorTypeIsRemovable(type: ConnectorType): boolean {
  return type.removable ?? type.autoConnect !== true;
}
export interface ConnectorTaskInput {
  device_id: string;
  action: string;
  workspace_path?: string;
  payload?: Record<string, unknown>;
  /** A task needing approval waits for the decision route before it runs. */
  requiresApproval?: boolean;
  run_id?: string;
}
export interface ConnectorService {
  execute(
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  register(handler: ConnectorHandler): () => void;
  /** Adds a connector type; the returned function removes it again. */
  registerType(type: ConnectorType): () => void;
  types(): ConnectorTypeInfo[];
  /**
   * Asks the connector behind `device_id` to pick a folder. The connector type
   * decides how — this is the hook a plugin customises.
   */
  pickDirectory(
    userId: number,
    deviceId: string,
    input: Record<string, unknown>,
  ): Promise<{ path: string; cancelled: boolean }>;
  /** Queues a task for a device and runs it when the type can run its own. */
  createTask(
    userId: number,
    input: ConnectorTaskInput,
  ): Promise<ConnectorTaskRecord>;
  /**
   * Runs one queued task through the connector type of its device, for types
   * that execute their own queue. Resolves to whether the task was taken.
   */
  executeTask(userId: number, taskId: string): Promise<boolean>;
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
export async function apply(ctx: Context) {
  ctx.i18n({ connector: { settings: { zh: "设备管理", en: "Device management", ja: "デバイス管理" } } });
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/connector.js", import.meta.url).pathname,
    plugin: "connector",
  });
  const handlers: ConnectorHandler[] = [];
  const types: ConnectorType[] = [];
  const db = ctx.component.database as Database;
  await ensureTables(db);
  const uid = (s: Session) =>
    (s.properties.user as { id?: number } | undefined)?.id;
  const typeByID = (id: string) => types.find((type) => type.id === id);
  const deviceOf = async (userId: number, deviceId: string) =>
    db.selectOne("advanced_chat_connector_devices", {
      id: deviceId,
      user_id: userId,
    });
  /**
   * Auto-connecting types have no agent process to report in, so the device row
   * is created and kept online by the type itself.
   */
  const connectAutoDevices = async (userId: number) => {
    for (const type of types) {
      if (!type.autoConnect || !type.ensureDevice) continue;
      try {
        await type.ensureDevice(userId);
      } catch (error) {
        // A type that cannot establish its device must not take the whole
        // listing down; the device simply does not appear.
        console.warn(
          `[connector] type "${type.id}" failed to connect: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };
  const runGeneric = async (
    userId: number,
    action: string,
    input: Record<string, unknown>,
  ) => {
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
    // Naming the action matters: the model reads this verbatim, and a bare
    // "no runtime" left it telling the user the whole command line was missing
    // when what was missing was one action nobody serves.
    throw Error(`No connector runtime serves the action "${action}"`);
  };
  const dispatchTask = async (task: ConnectorTaskRecord, device: ConnectorDeviceRecord) => {
    const type = typeByID(String(device.kind ?? ""));
    if (!type?.runTask) return undefined;
    const changed = await db.update(
      "advanced_chat_connector_tasks",
      { id: task.id, status: task.status },
      { status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    );
    // Only the run that flipped the task to `running` may execute it, so a
    // repeated dispatch cannot run the same task twice.
    if (changed === 0) return undefined;
    const outcome = await type.runTask(task, device);
    await db.update(
      "advanced_chat_connector_tasks",
      { id: task.id },
      {
        status: outcome.success ? "completed" : "failed",
        result: String(outcome.result ?? "").slice(0, 1_000_000),
        error_message: String(outcome.error_message ?? "").slice(0, 100_000),
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    return outcome;
  };
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
      if (id !== undefined) {
        await connectAutoDevices(id);
        s.respond(
          (
            await db.select("advanced_chat_connector_devices", { user_id: id })
          )
            .map(({ token_hash: _hash, ...row }) => row)
            // The connector the host provides for itself is the default one, so
            // it leads the list instead of following whatever was added first.
            .sort((left: any, right: any) => {
              const leftDefault = typeByID(String(left.kind ?? ""))?.autoConnect === true;
              const rightDefault = typeByID(String(right.kind ?? ""))?.autoConnect === true;
              if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
              return String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
            }),
          "json",
        );
      }
    });
  // Published so a client can label devices and know which of them can pick a
  // folder itself. Declared before any `/devices/:id` route for clarity, though
  // the paths do not overlap.
  ctx
    .route("/api/user/advanced-chat/connector-types")
    .methods("GET")
    .action(async (s) => {
      if (uid(s) === undefined) return;
      s.respond(
        types.map((type) => ({
          id: type.id,
          label: type.label,
          description: type.description ?? null,
          auto_connect: type.autoConnect === true,
          creatable: type.creatable !== false,
          removable: connectorTypeIsRemovable(type),
          capabilities: [...(type.capabilities ?? [])],
        })),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/devices/token")
    .methods("POST")
    .action(async (s) => {
      const id = uid(s);
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      const existingType = typeByID(String(existing.kind ?? ""));
      if (existingType && existingType.creatable === false) {
        // A host-provided connector has no agent to hand a token to.
        s.status = 400;
        s.respond(
          {
            error: `${existingType.label?.zh || existingType.label?.en || existingType.id} 由本机提供，不需要令牌`,
            error_en: "This connector is provided by the host and needs no token",
          },
          "json",
        );
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
      if (id === undefined) return;
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
      if (id === undefined) return;
      const device: any = await db.selectOne(
        "advanced_chat_connector_devices",
        { id: deviceId, user_id: id },
      );
      if (!device) {
        s.status = 404;
        s.respond({ error: "Device not found" }, "json");
        return;
      }
      const type = typeByID(String(device.kind ?? ""));
      if (type && !connectorTypeIsRemovable(type)) {
        // Rejecting beats deleting and watching it come back on the next list.
        s.status = 403;
        s.respond(
          {
            error: `${type.label?.zh || type.label?.en || type.id} 由本机提供，是默认连接器，不能删除`,
            error_en: `This connector is provided by the host and cannot be removed`,
          },
          "json",
        );
        return;
      }
      await db.remove("advanced_chat_connector_devices", {
        id: deviceId,
        user_id: id,
      });
      s.respond({ success: true }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id")
    .methods("GET")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (id !== undefined) await connectAutoDevices(id);
      const device = id !== undefined
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
  // Asks the connector behind the device to pick a folder. Which window opens —
  // a native dialog on the host, the desktop app's picker, something else — is
  // the connector type's decision, so the client stays generic.
  ctx
    .route("/api/user/advanced-chat/devices/:id/pick-directory")
    .methods("POST")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (id === undefined) return;
      const input = (await s.parseRequestBody()) as any;
      try {
        s.respond(
          await service.pickDirectory(
            id,
            deviceId,
            input && typeof input === "object" ? input : {},
          ),
          "json",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        s.status = /not found/i.test(message)
          ? 404
          : /does not support|cannot pick/i.test(message)
            ? 400
            : /timed out/i.test(message)
              ? 504
              : 502;
        s.respond({ error: message }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/devices/:id")
    .methods("PUT")
    .action(async (s, _p, deviceId) => {
      const id = uid(s);
      if (id === undefined) return;
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
      if (id !== undefined)
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
      const task = id !== undefined
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
      if (id === undefined) return;
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
      if (id === undefined) return;
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
    const name = String(input.name ?? "").trim().slice(0, 120);
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
        // An empty name keeps the current one, so renaming stays an explicit
        // act instead of a side effect of every heartbeat.
        ...(name ? { name } : {}),
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
      const queued: any[] = await db.select("advanced_chat_connector_tasks", {
        device_id: device.id,
        status: "queued",
      });
      // Tasks are queued by the chat runtime (`chat.createConnectorTask` writes
      // `queued`), and `select` has no ORDER BY, so the oldest candidate is
      // chosen here to keep dispatch first-in-first-out.
      const candidate = queued.sort((left, right) =>
        String(left.created_at).localeCompare(String(right.created_at)),
      )[0];
      if (!candidate) {
        s.respond({ task: null }, "json");
        return;
      }
      const now = new Date().toISOString();
      // Only the run that flips `queued` to `running` may hand the task out, so
      // two concurrent long polls cannot both receive the same task.
      const changed = await db.update(
        "advanced_chat_connector_tasks",
        { id: candidate.id, status: "queued" },
        {
          status: "running",
          started_at: now,
          updated_at: now,
        },
      );
      s.respond(
        {
          task: changed
            ? await db.selectOne("advanced_chat_connector_tasks", {
                id: candidate.id,
              })
            : null,
        },
        "json",
      );
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
      // A result only counts for a task this device is currently running, so a
      // stale or duplicated report cannot flip a finished task again.
      const changed = await db.update(
        "advanced_chat_connector_tasks",
        { id: taskId, device_id: device.id, status: "running" },
        {
          status: input.success === true ? "completed" : "failed",
          result: String(input.result ?? "").slice(0, 1_000_000),
          error_message: String(input.error_message ?? "").slice(0, 100_000),
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond({ ok: true, ignored: changed === 0 }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/connector-credentials")
    .methods("GET")
    .action(async (s) => {
      const id = uid(s);
      if (id !== undefined)
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
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      if (id !== undefined) {
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
      const task = id !== undefined
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
      if (id === undefined) return;
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
      if (id === undefined) return;
      try {
        s.respond(
          await service.execute(
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
      if (id === undefined) return;
      const input = (await s.parseRequestBody()) as any;
      try {
        s.respond(
          await service.execute(
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
  /**
   * The device an action runs on when it names none: a connector type that is
   * online by itself (the machine running this instance) is the obvious default,
   * and a user who has exactly one of those has already made the choice.
   */
  const defaultAutoDevice = async (userId: number) => {
    const autoIDs = types.filter((type) => type.autoConnect).map((type) => type.id);
    if (autoIDs.length === 0) return undefined;
    const devices: any[] = await db.select("advanced_chat_connector_devices", {
      user_id: userId,
    });
    const candidates = devices.filter(
      (device) => autoIDs.includes(String(device.kind ?? "")) && device.status === "online",
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  // A plugin cannot read its own component back through `ctx.component` — that
  // table only carries the names the loader injected from other plugins — so the
  // routes below call this object directly.
  const service: ConnectorService = {
    async execute(userId, action, input) {
      const deviceId = String(input?.device_id ?? "").trim();
      const device: any = deviceId
        ? await deviceOf(userId, deviceId)
        : await defaultAutoDevice(userId);
      if (deviceId && !device) throw Error("Connector device not found");
      if (device) {
        const type = typeByID(String(device.kind ?? ""));
        const handler = type?.actions?.[action];
        if (handler) {
          // An auto-connect device is online by definition; refresh the row so
          // the client does not see a stale timestamp on a device it just used.
          if (type?.autoConnect && device.status !== "online" && type.ensureDevice)
            await type.ensureDevice(userId).catch(() => undefined);
          const { token_hash: _hash, ...record } = device;
          return handler(
            userId,
            { ...input, device_id: String(device.id) },
            record as ConnectorDeviceRecord,
          );
        }
        // A known type that does not answer this action, and a type nobody
        // registered at all, both fall through to the generic runtimes so an
        // external agent can still serve them.
      }
      return runGeneric(userId, action, input);
    },
    register(handler) {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
    registerType(type) {
      const existing = types.findIndex((item) => item.id === type.id);
      if (existing >= 0) types.splice(existing, 1, type);
      else types.push(type);
      return () => {
        const index = types.indexOf(type);
        if (index >= 0) types.splice(index, 1);
      };
    },
    types() {
      return types.map((type) => ({
        id: type.id,
        label: type.label,
        description: type.description ?? null,
        auto_connect: type.autoConnect === true,
        creatable: type.creatable !== false,
        removable: connectorTypeIsRemovable(type),
        capabilities: [...(type.capabilities ?? [])],
      }));
    },
    async pickDirectory(userId, deviceId, input) {
      const device: any = await deviceOf(userId, deviceId);
      if (!device) throw Error("Connector device not found");
      const type = typeByID(String(device.kind ?? ""));
      const { token_hash: _hash, ...record } = device;
      if (type?.pickDirectory)
        return type.pickDirectory(
          userId,
          input,
          record as ConnectorDeviceRecord,
        );
      // Fall back to a runtime that exposes folder selection as an action, so a
      // connector written before types existed still works.
      const viaAction = await runGeneric(userId, "pick_directory", {
        ...input,
        device_id: deviceId,
      }).catch(() => undefined);
      if (viaAction && typeof viaAction === "object")
        return viaAction as { path: string; cancelled: boolean };
      throw Error(
        `Connector type "${device.kind}" does not support folder selection`,
      );
    },
    async createTask(userId, input) {
      const device: any = await deviceOf(userId, input.device_id);
      if (!device) throw Error("Connector device not found");
      const now = new Date().toISOString();
      const task: any = await db.create("advanced_chat_connector_tasks", {
        id: `act-${randomUUID()}`,
        user_id: userId,
        device_id: input.device_id,
        run_id: String(input.run_id ?? ""),
        action: input.action.trim(),
        workspace_path: String(input.workspace_path ?? ""),
        payload: JSON.stringify(input.payload ?? {}),
        status: input.requiresApproval ? "pending_approval" : "queued",
        result: "",
        error_message: "",
        started_at: null,
        finished_at: null,
        created_at: now,
        updated_at: now,
      } as any);
      const { token_hash: _hash, ...record } = device;
      if (!input.requiresApproval)
        await dispatchTask(task, record as ConnectorDeviceRecord);
      return (await db.selectOne("advanced_chat_connector_tasks", {
        id: task.id,
      })) as ConnectorTaskRecord;
    },
    async executeTask(userId, taskId) {
      const task: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: taskId,
        user_id: userId,
      });
      if (!task) throw Error("Connector task not found");
      // Only a task that is waiting to run may be picked up; anything already
      // running, finished or awaiting a decision is left alone.
      if (!["queued", "approved"].includes(String(task.status))) return false;
      const device: any = await deviceOf(userId, String(task.device_id));
      if (!device) return false;
      const { token_hash: _hash, ...record } = device;
      return (
        (await dispatchTask(task, record as ConnectorDeviceRecord)) !== undefined
      );
    },
  };
  ctx.registerComponent("connector", service);
}
