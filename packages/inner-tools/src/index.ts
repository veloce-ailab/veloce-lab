import { Context } from "yumeri";
import type { ConnectorService } from "@velocelab/connector";
import type { ToolDefinition, ToolsService } from "@velocelab/tools";

export const depend = ["tools", "connector"];
export const provide: string[] = [];

export function apply(ctx: Context) {
  const tools = ctx.component.tools as ToolsService;
  const connector = ctx.component.connector as ConnectorService;
  const register = (tool: ToolDefinition) => tools.register(tool);
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
}
