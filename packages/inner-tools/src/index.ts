import { Context } from "yumeri";
import { ConnectorService } from "@velocelab/connector";
import { AdvancedChatService, ChatToolDefinition } from "@velocelab/advanced-chat";

export const depend = ["advanced-chat", "connector"];
export const provide: string[] = [];

export function apply(ctx: Context) {
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const connector = ctx.component.connector as ConnectorService;
  const register = (tool: ChatToolDefinition) => chat.registerTool(tool);
  register({
    name: "connector_read_file",
    description: "Read a text file through the connected workspace.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    execute: (input, context) => connector.execute(context.userId, "read_file", input as Record<string, unknown>),
  });
  register({
    name: "connector_write_file",
    description: "Write a text file through the connected workspace.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    execute: (input, context) => connector.execute(context.userId, "write_file", input as Record<string, unknown>),
  });
  register({
    name: "connector_list_directory",
    description: "List files in a connected workspace directory.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    execute: (input, context) => connector.execute(context.userId, "list_directory", input as Record<string, unknown>),
  });
  const connectorTools: Array<[string, string, string, Record<string, unknown>]> = [
    ["list_files", "List files in a workspace directory.", "list_files", { path: { type: "string" } }],
    ["list_windows_drives", "List available Windows drives.", "list_windows_drives", {}],
    ["run_command", "Run an approved command through the connector.", "run_command", { command: { type: "string" } }],
    ["replace_text", "Replace text in a workspace file.", "replace_text", { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } }],
    ["web_search", "Search the web through the connector.", "web_search", { query: { type: "string" } }],
    ["web_fetch", "Fetch a web page through the connector.", "web_fetch", { url: { type: "string" } }],
    ["file_sha256", "Calculate a file SHA-256 through the connector.", "file_sha256", { path: { type: "string" } }],
    ["ask_user", "Ask the user for additional information.", "ask_user", { prompt: { type: "string" } }],
  ];
  for (const [name, description, action, properties] of connectorTools) {
    register({
      name,
      description,
      parameters: { type: "object", properties },
      execute: (input, context) => connector.execute(context.userId, action, input as Record<string, unknown>),
    });
  }
}
