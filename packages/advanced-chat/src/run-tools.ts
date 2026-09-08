import { createHash, randomUUID } from "node:crypto";
import type { Database } from "yumeri";
import type { ChatToolDefinition } from "./index.js";

export function registerRunTools(
  db: Database,
  register: (tool: ChatToolDefinition) => () => void,
) {
  return register({
    name: "report_generated_file",
    description:
      "Register a file already generated in the selected workspace. This records metadata only and does not create the file.",
    parameters: {
      type: "object",
      required: ["path", "description"],
      properties: {
        path: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
    },
    execute: async (input, context) => {
      const value = input as any;
      const path = String(value.path ?? "").trim();
      const description = String(value.description ?? "")
        .trim()
        .slice(0, 2000);
      if (!path || !description)
        throw Error("path and description are required");
      const sourceKey = `generated:${createHash("sha256")
        .update(`${context.runId ?? ""}:${path}`)
        .digest("hex")}`;
      const existing = await db.selectOne("advanced_chat_files", {
        user_id: context.userId,
        source_key: sourceKey,
      });
      if (existing) return existing;
      return db.create("advanced_chat_files", {
        id: `acf-${randomUUID()}`,
        user_id: context.userId,
        name: String(
          value.name ?? path.split(/[\\/]/).pop() ?? "generated-file",
        ).slice(0, 200),
        mime_type: "application/octet-stream",
        size: 0,
        storage_path: path,
        text_extract: description,
        hash: "",
        source: "generated",
        source_key: sourceKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    },
  });
}
