// Makes the machine running this Yumeri instance a connector.
//
// Every other connector is a separate agent that holds a token and polls for
// work. This one is already there: the process that would dispatch the work is
// the process that can do it, so its device is online whenever the instance is
// — that is the "auto connect" — and it executes its own task queue instead of
// waiting for an agent to collect it.
//
// The connector plugin owns the device table and the action routing; all this
// plugin does is register a connector type with the actions this host can serve
// and the way it lets the user pick a folder.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { normalize } from "node:path";
import type {
  ConnectorDeviceRecord,
  ConnectorService,
  ConnectorTaskRecord,
  ConnectorType,
} from "@velocelab/connector";
import { Context, Database, Schema } from "yumeri";
import {
  fileSha256,
  gitAction,
  gitStatus,
  hostInfo,
  listDirectories,
  listDirectory,
  listWindowsDrives,
  readTextFile,
  replaceText,
  runCommand,
  writeTextFile,
} from "./actions.js";
import { pickFolder } from "./dialog.js";

// `advanced-chat` owns the device and task tables, so it has to have run first.
export const depend = ["database", "advanced-chat", "connector"];
export const provide = ["device-local"];
export const config: Schema<Record<string, never>> = Schema.object({});
/** The connector type id, which is also the device's `kind`. */
export const LOCAL_TYPE = "local";
declare module "yumeri" {
  interface Components {
    "device-local": { type(): ConnectorType };
  }
}

/**
 * Actions this host answers. `run_command` is here, but only as a queued task:
 * running an arbitrary shell command on the host from a chat tool is exactly
 * what the approval flow exists for, so it is never answered inline — the
 * session's approval mode decides whether the user is asked first.
 */
const CAPABILITIES = [
  "list_directories",
  "list_windows_drives",
  "pick_directory",
  "list_directory",
  "list_files",
  "read_file",
  "write_file",
  "replace_text",
  "file_sha256",
  "git_status",
  "git_action",
  "run_command",
];

/**
 * How long a chat request waits for a queued command before giving up and
 * telling the model to ask again. Long enough for an approved build, short
 * enough that a run does not look hung while the user reads the prompt.
 */
const COMMAND_WAIT_MS = 60_000;

export async function apply(ctx: Context) {
  ctx.i18n({
    "device-local": {
      settings: { zh: "本机连接器", en: "Local connector", ja: "ローカル接続" },
    },
  });
  const db = ctx.component.database as Database;
  const connector = ctx.component.connector as ConnectorService;

  /**
   * The auto-connect hook: one device per user for this machine, kept online. A
   * token hash is still written because the table makes it unique and a device
   * row without one would collide with the next user's.
   */
  const ensureDevice = async (userId: number): Promise<ConnectorDeviceRecord> => {
    const info = await hostInfo();
    const existing: any = await db.selectOne(
      "advanced_chat_connector_devices",
      { user_id: userId, kind: LOCAL_TYPE },
    );
    const now = new Date().toISOString();
    const values = {
      // The kind *is* the connector type id; leaving it out would fall back to
      // the table's "cli" default and the device would look like an external
      // agent nobody started.
      kind: LOCAL_TYPE,
      name: `${info.hostname || "local"} (${LOCAL_TYPE})`,
      hostname: info.hostname,
      os: info.os,
      arch: info.arch,
      version: info.version,
      mode: "platform",
      status: "online",
      last_seen_at: now,
      updated_at: now,
    };
    let row: any;
    if (existing) {
      await db.update(
        "advanced_chat_connector_devices",
        { id: existing.id },
        values,
      );
      row = await db.selectOne("advanced_chat_connector_devices", {
        id: existing.id,
      });
    } else {
      row = await db.create("advanced_chat_connector_devices", {
        id: randomUUID(),
        user_id: userId,
        token_hash: createHash("sha256")
          .update(randomBytes(32).toString("base64url"))
          .digest("hex"),
        remark: "",
        desktop_instance_id: randomUUID(),
        created_at: now,
        ...values,
      } as any);
    }
    const { token_hash: _hash, ...device } = row;
    return device as ConnectorDeviceRecord;
  };

  /** Runs one queued task on this machine. */
  const runTask = async (
    task: ConnectorTaskRecord,
  ): Promise<{ success: boolean; result?: string; error_message?: string }> => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(task.payload ?? "{}")) as Record<
        string,
        unknown
      >;
    } catch {
      payload = {};
    }
    const workspacePath = String(
      payload.connector_workspace_path ??
        payload.workspace_path ??
        task.workspace_path ??
        "",
    );
    try {
      if (String(task.action) === "git_action") {
        const outcome = await gitAction(
          String(payload.action ?? ""),
          workspacePath,
          String(payload.message ?? ""),
        );
        return { success: true, result: outcome.result };
      }
      if (String(task.action) === "run_command") {
        // The task's own workspace path wins over anything in the payload, so a
        // command cannot be talked into running outside the folder the session
        // works in.
        const outcome = await runCommand({
          ...payload,
          workspace_path: workspacePath,
        });
        return {
          success: outcome.exit_code === 0,
          result: [
            `$ ${outcome.command}`,
            `cwd: ${outcome.cwd}`,
            `exit code: ${outcome.exit_code}`,
            outcome.output,
          ]
            .filter((line) => line !== "")
            .join("\n"),
          error_message:
            outcome.exit_code === 0
              ? undefined
              : `exit code ${outcome.exit_code}`,
        };
      }
      return {
        success: false,
        error_message: `This machine cannot run the task action "${task.action}"`,
      };
    } catch (error) {
      return {
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  /**
   * Whether a queued action has to be approved first. The session carries both
   * switches: the newer approval mode and the older auto-approve flag, and
   * either one can be the reason a command is allowed to run unattended.
   */
  const needsApproval = (input: Record<string, unknown>) =>
    String(input.approval_mode ?? "manual") !== "full_access" &&
    input.auto_approve !== true;

  /**
   * Waits for a queued task to settle, so a command's output reaches the model
   * in the same turn. A task that is still waiting for approval is waited for
   * too — the user may be looking at the prompt right now — but only for as long
   * as a chat request can reasonably stay open; after that the model is told to
   * ask again rather than left hanging.
   */
  const waitForTask = async (userId: number, taskId: string) => {
    const deadline = Date.now() + COMMAND_WAIT_MS;
    for (;;) {
      const row: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: taskId,
        user_id: userId,
      });
      if (!row) return { task_id: taskId, status: "unknown" };
      const status = String(row.status ?? "");
      if (status === "completed" || status === "failed" || status === "rejected")
        return {
          task_id: taskId,
          status,
          output: String(row.result ?? "").trim(),
          error: String(row.error_message ?? "").trim() || undefined,
        };
      if (Date.now() >= deadline)
        return {
          task_id: taskId,
          status,
          message:
            status === "pending_approval"
              ? "The command is waiting for your approval; approve it on the device page and run the tool again to see the output."
              : "The command is still running; run the tool again to see the output.",
        };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const type: ConnectorType = {
    id: LOCAL_TYPE,
    label: { zh: "本机", en: "This computer", ja: "このコンピューター" },
    description: {
      zh: "运行 Yumeri 的这台计算机本身，自动连接，无需令牌或客户端。",
      en: "The machine running Yumeri, connected automatically — no token, no client.",
      ja: "Yumeri を実行しているコンピューター。トークン不要で自動接続します。",
    },
    autoConnect: true,
    // Nothing to install and nothing to authorise, so no token is minted for it.
    creatable: false,
    // Part of the installation rather than something the user set up: it would
    // come back on the next listing anyway, and a deployment without it has no
    // connector at all.
    removable: false,
    capabilities: CAPABILITIES,
    ensureDevice,
    pickDirectory: async (_userId, input) => {
      const result = await pickFolder({
        title:
          String(input.title ?? "").trim() ||
          "Select a workspace folder",
        initialPath: String(
          input.path ?? input.connector_workspace_path ?? "",
        ).trim(),
      });
      if (result.cancelled) return { path: "", cancelled: true };
      // The picker may return a file manager's own spelling of the folder
      // (a trailing separator, a `/` on Windows); the workspace stores a path
      // the rest of the system can resolve, so normalise it here.
      return { path: normalize(result.path), cancelled: false };
    },
    actions: {
      list_directories: (_userId, input) => listDirectories(input),
      list_windows_drives: () => listWindowsDrives(),
      list_directory: (_userId, input) => listDirectory(input),
      list_files: (_userId, input) => listDirectory(input),
      read_file: (_userId, input) => readTextFile(input),
      write_file: (_userId, input) => writeTextFile(input),
      replace_text: (_userId, input) => replaceText(input),
      file_sha256: (_userId, input) => fileSha256(input),
      git_status: (_userId, input) => gitStatus(input),
      // A git action is queued rather than answered inline: the client polls the
      // task, exactly as it would for an external connector, and the approval
      // mode decides whether it waits for the user.
      git_action: async (userId, input, device) => {
        const approvalMode = String(input.approval_mode ?? "manual");
        return connector.createTask(userId, {
          device_id: String(device.id),
          action: "git_action",
          workspace_path: String(input.connector_workspace_path ?? ""),
          run_id: String(input.run_id ?? ""),
          payload: input,
          requiresApproval: approvalMode !== "full_access",
        });
      },
      // `run_command` is queued and then waited for, so the model sees the
      // output of what it asked to run. A session that has not been given
      // full access still goes through the approval prompt first; the wait
      // covers the user answering it while the run is still open.
      run_command: async (userId, input, device) => {
        const requiresApproval = needsApproval(input);
        const task = await connector.createTask(userId, {
          device_id: String(device.id),
          action: "run_command",
          workspace_path: String(input.connector_workspace_path ?? ""),
          run_id: String(input.run_id ?? ""),
          payload: input,
          requiresApproval,
        });
        return await waitForTask(userId, String(task.id));
      },
    },
    runTask,
  };
  connector.registerType(type);
  ctx.registerComponent("device-local", { type: () => type });

  /**
   * Tasks queued by the chat runtime go straight into the table, and this
   * machine is its own agent, so a short sweep takes them — the in-process
   * equivalent of the long poll an external connector would run. Only `queued`
   * and approved tasks are taken; one waiting for approval is left for the user.
   */
  const sweep = async () => {
    const devices: any[] = await db.select("advanced_chat_connector_devices", {
      kind: LOCAL_TYPE,
    });
    for (const device of devices) {
      if (String(device.status ?? "") !== "online") continue;
      for (const status of ["queued", "approved"]) {
        const tasks: any[] = await db.select("advanced_chat_connector_tasks", {
          device_id: device.id,
          status,
        });
        for (const task of tasks)
          await connector.executeTask(Number(device.user_id), String(task.id));
      }
    }
  };
  // The context clears this timer when the plugin is unloaded, so a reload does
  // not leave a second sweep running beside the new one.
  ctx.setInterval(() => {
    void sweep().catch(() => undefined);
  }, 2_000);
  // A restart must not strand the work that was queued before it.
  void sweep().catch(() => undefined);
}
