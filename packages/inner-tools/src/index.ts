import { Context } from "yumeri";
import { ConnectorService } from "@velocelab/connector";
import { AdvancedChatService, ChatToolDefinition } from "@velocelab/advanced-chat";

export const depend = ["advanced-chat", "connector"];
export const provide: string[] = [];

/** What the run told us about the machine and folder this session works in. */
export interface ConnectorContext {
  runId?: string;
  connectorDeviceId?: string;
  connectorWorkspacePath?: string;
  connectorApprovalMode?: string;
  connectorAutoApprove?: boolean;
}

/**
 * The connector input for one tool call.
 *
 * The workspace and the device come from the session, not from the model: the
 * arguments are model output, so a `workspace_path` it invents would otherwise
 * move the action to another folder (or another machine) entirely. Assigning
 * them after the spread is what makes the session's choice win.
 */
export function connectorInput(
  input: Record<string, unknown>,
  context: ConnectorContext,
): Record<string, unknown> {
  const workspacePath = context.connectorWorkspacePath ?? "";
  return {
    ...input,
    workspace_path: workspacePath,
    connector_workspace_path: workspacePath,
    // A queued task records which run asked for it, which is how a pending
    // command is traced back to the conversation that wants its output.
    ...(context.runId ? { run_id: context.runId } : {}),
    ...(context.connectorDeviceId ? { device_id: context.connectorDeviceId } : {}),
    approval_mode: context.connectorApprovalMode ?? "manual",
    ...(context.connectorAutoApprove ? { auto_approve: true } : {}),
  };
}

export function apply(ctx: Context) {
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const connector = ctx.component.connector as ConnectorService;
  const register = (tool: ChatToolDefinition) => chat.registerTool(tool);
  register({
    name: "connector_read_file",
    description: "Read a text file through the connected workspace.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    execute: (input, context) =>
      connector.execute(
        context.userId,
        "read_file",
        connectorInput(input as Record<string, unknown>, context),
      ),
  });
  register({
    name: "connector_write_file",
    description: "Write a text file through the connected workspace.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    execute: (input, context) =>
      connector.execute(
        context.userId,
        "write_file",
        connectorInput(input as Record<string, unknown>, context),
      ),
  });
  register({
    name: "connector_list_directory",
    description: "List files in a connected workspace directory.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    execute: (input, context) =>
      connector.execute(
        context.userId,
        "list_directory",
        connectorInput(input as Record<string, unknown>, context),
      ),
  });
  const connectorTools: Array<[string, string, string, Record<string, unknown>]> = [
    ["list_files", "List files in a workspace directory.", "list_files", { path: { type: "string" } }],
    ["list_windows_drives", "List available Windows drives.", "list_windows_drives", {}],
    ["run_command", "Run an approved command through the connector.", "run_command", { command: { type: "string" } }],
    ["replace_text", "Replace text in a workspace file.", "replace_text", { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }],
    ["web_search", "Search the web through the connector.", "web_search", { query: { type: "string" } }],
    ["web_fetch", "Fetch a web page through the connector.", "web_fetch", { url: { type: "string" } }],
    ["file_sha256", "Calculate a file SHA-256 through the connector.", "file_sha256", { path: { type: "string" } }],
    // `ask_user` belongs to the chat runtime (`ask-user.ts`), which owns the
    // question/options payload and the turn-ending semantics. Registering a
    // second one here would put a duplicate function name in every request.
  ];
  for (const [name, description, action, properties] of connectorTools) {
    register({
      name,
      description,
      parameters: { type: "object", properties },
      execute: (input, context) =>
        connector.execute(
          context.userId,
          action,
          connectorInput(input as Record<string, unknown>, context),
        ),
    });
  }
}
