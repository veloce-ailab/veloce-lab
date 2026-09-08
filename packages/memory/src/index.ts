import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/advanced-chat";
export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["memory"];
export interface MemoryConfig {
  root: string;
}
export const config: Schema<MemoryConfig> = Schema.object({
  root: Schema.string("Memory storage root").default("./data/memories"),
});
const kinds = new Set([
  "profile",
  "preferences",
  "facts",
  "projects",
  "rules",
  "scratch",
  "custom",
]);
export function apply(ctx: Context, cfg: MemoryConfig) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/memory.js", import.meta.url).pathname,
    plugin: "memory",
  });
  const db = ctx.component.database as Database;
  const root = path.resolve(cfg.root);
  void mkdir(root, { recursive: true });
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({
    id: "memory",
    async provide({ userId, agentId }) {
      const rows = await db.select("advanced_chat_memory_documents", {
        user_id: userId,
        enabled: true,
      });
      const visible = rows.filter(
        (row: any) =>
          !row.scope ||
          row.scope === "global" ||
          !agentId ||
          row.agent_id === agentId,
      );
      let attached = 0;
      const details: string[] = [];
      for (const row of visible) {
        let content = "";
        if (
          ["profile", "preferences", "facts", "projects", "rules"].includes(
            String(row.kind),
          ) &&
          row.storage_path &&
          attached < 32 * 1024
        )
          content = (
            await readFile(String(row.storage_path), "utf8").catch(() => "")
          ).slice(0, Math.min(8 * 1024, 32 * 1024 - attached));
        attached += Buffer.byteLength(content);
        details.push(
          `- ${row.title} (${row.kind})${content ? `\n  ${content}` : ""}`,
        );
      }
      return visible.length
        ? `Available memories:\n${details.join("\n")}`
        : undefined;
    },
  });
  chat.registerTool({
    name: "memory_list",
    description: "List saved memories",
    parameters: { type: "object", properties: {} },
    execute: async (_input, context) =>
      db.select("advanced_chat_memory_documents", {
        user_id: context.userId,
        enabled: true,
      }),
  });
  chat.registerTool({
    name: "memory_patch",
    description: "Replace exact text in a saved memory",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["id", "old_text", "new_text"],
    },
    execute: async (input, context) => {
      const value = input as any;
      const row: any = await db.selectOne("advanced_chat_memory_documents", {
        id: String(value.id),
        user_id: context.userId,
      });
      if (!row) throw Error("Memory not found");
      const content = row.storage_path
        ? await readFile(String(row.storage_path), "utf8").catch(() => "")
        : "";
      const oldText = String(value.old_text);
      if (!oldText || !content.includes(oldText))
        throw Error("old_text was not found in memory");
      const next = content.replace(oldText, String(value.new_text ?? ""));
      if (row.storage_path)
        await writeFile(String(row.storage_path), next, "utf8");
      await db.update(
        "advanced_chat_memory_documents",
        { id: row.id, user_id: context.userId },
        {
          size: Buffer.byteLength(next),
          hash: createHash("sha256").update(next).digest("hex"),
          updated_by: "assistant",
          updated_at: new Date().toISOString(),
        },
      );
      return { id: row.id, patched: true };
    },
  });
  chat.registerTool({
    name: "memory_upsert",
    description: "Create or replace a saved memory",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        kind: { type: "string" },
        content: { type: "string" },
      },
      required: ["content"],
    },
    execute: async (input, context) => {
      const value = input as any;
      const id = String(value.id ?? randomUUID());
      const content = String(value.content ?? "");
      const scope = String(value.scope ?? "global")
        .trim()
        .toLowerCase();
      if (
        !["global", "agent"].includes(scope) ||
        (scope === "agent" &&
          !String(value.agent_id ?? context.agentId ?? "").trim())
      )
        throw Error("Memory scope is invalid");
      if (Buffer.byteLength(content) > 512 * 1024)
        throw Error("Memory is too large");
      const now = new Date().toISOString();
      const storagePath = path.join(
        root,
        String(context.userId),
        scope,
        `${scope === "agent" ? String(value.agent_id ?? context.agentId ?? "default") : "global"}-${id}.md`,
      );
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, content, "utf8");
      const row = {
        id,
        user_id: context.userId,
        scope,
        agent_id:
          scope === "agent"
            ? String(value.agent_id ?? context.agentId ?? "").trim()
            : "",
        group_id: "",
        kind: kinds.has(String(value.kind)) ? String(value.kind) : "facts",
        title: String(value.title ?? "").slice(0, 200),
        storage_path: storagePath,
        size: Buffer.byteLength(content),
        hash: createHash("sha256").update(content).digest("hex"),
        enabled: true,
        updated_by: "assistant",
        created_at: now,
        updated_at: now,
      };
      const existing = await db.selectOne("advanced_chat_memory_documents", {
        id,
        user_id: context.userId,
      });
      if (existing)
        await db.update(
          "advanced_chat_memory_documents",
          { id, user_id: context.userId },
          row as any,
        );
      else await db.create("advanced_chat_memory_documents", row as any);
      return row;
    },
  });
  chat.registerTool({
    name: "memory_delete",
    description: "Delete a saved memory",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: async (input, context) => {
      const id = String((input as any).id ?? "");
      const row = await db.selectOne("advanced_chat_memory_documents", {
        id,
        user_id: context.userId,
      });
      if (row?.storage_path)
        await unlink(String(row.storage_path)).catch(() => undefined);
      await db.remove("advanced_chat_memory_documents", {
        id,
        user_id: context.userId,
      });
      return { success: true };
    },
  });
  chat.registerTool({
    name: "memory_read",
    description: "Read a saved memory",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: async (input, context) => {
      const row = await db.selectOne("advanced_chat_memory_documents", {
        id: String((input as any).id),
        user_id: context.userId,
      });
      return row?.storage_path
        ? {
            ...row,
            content: await readFile(String(row.storage_path), "utf8").catch(
              () => "",
            ),
          }
        : row;
    },
  });
  const user = (s: Session) =>
    Number((s.properties.user as { id?: number } | undefined)?.id ?? 0);
  ctx
    .route("/api/advanced-chat/memories")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          {
            memories: await db.select("advanced_chat_memory_documents", {
              user_id: id,
            }),
          },
          "json",
        );
    });
  ctx
    .route("/api/advanced-chat/memories/:id")
    .methods("GET")
    .action(async (s, _p, memoryId) => {
      const uid = user(s);
      const row = uid
        ? await db.selectOne("advanced_chat_memory_documents", {
            id: memoryId,
            user_id: uid,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Memory not found" }, "json");
        return;
      }
      const content = row.storage_path
        ? await readFile(String(row.storage_path), "utf8").catch(() => "")
        : "";
      s.respond(
        {
          ...row,
          content: content.slice(0, 200 * 1024),
          truncated: content.length > 200 * 1024,
        },
        "json",
      );
    });
  const save = async (s: Session, memoryId?: string) => {
    const uid = user(s);
    if (!uid) return;
    const input = (await s.parseRequestBody()) as any;
    const kind = String(input.kind ?? "facts");
    if (!kinds.has(kind)) {
      s.status = 400;
      s.respond({ error: "Invalid memory kind" }, "json");
      return;
    }
    const scope = String(input.scope ?? "global")
      .trim()
      .toLowerCase();
    if (
      !["global", "agent"].includes(scope) ||
      (scope === "agent" && !String(input.agent_id ?? "").trim())
    ) {
      s.status = 400;
      s.respond({ error: "Memory scope is invalid" }, "json");
      return;
    }
    const now = new Date().toISOString();
    const id = memoryId ?? randomUUID();
    const content = String(input.content ?? "");
    if (Buffer.byteLength(content) > 512 * 1024) {
      s.status = 413;
      s.respond({ error: "Memory is too large" }, "json");
      return;
    }
    const file = path.join(root, String(uid), scope, `${id}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    const value = {
      id,
      user_id: uid,
      scope,
      agent_id: scope === "agent" ? String(input.agent_id).trim() : "",
      group_id: String(input.group_id ?? ""),
      kind,
      title: String(input.title ?? ""),
      storage_path: file,
      size: Buffer.byteLength(content),
      hash: createHash("sha256").update(content).digest("hex"),
      enabled: input.enabled !== false,
      updated_by: "user",
      created_at: now,
      updated_at: now,
    };
    const existing = await db.selectOne("advanced_chat_memory_documents", {
      id,
      user_id: uid,
    });
    if (existing)
      await db.update(
        "advanced_chat_memory_documents",
        { id, user_id: uid },
        value as any,
      );
    else await db.create("advanced_chat_memory_documents", value as any);
    s.respond(value, "json");
  };
  ctx
    .route("/api/advanced-chat/memories")
    .methods("POST")
    .action((s) => save(s));
  ctx
    .route("/api/advanced-chat/memories/:id")
    .methods("PUT")
    .action((s, _p, id) => save(s, id));
  ctx
    .route("/api/advanced-chat/memories/:id")
    .methods("PATCH")
    .action(async (s, _p, id) => {
      const uid = user(s);
      if (!uid) return;
      const existing: any = await db.selectOne(
        "advanced_chat_memory_documents",
        { id, user_id: uid },
      );
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Memory not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const currentContent = existing.storage_path
        ? await readFile(String(existing.storage_path), "utf8").catch(() => "")
        : "";
      const content =
        input.content === undefined ? currentContent : String(input.content);
      if (Buffer.byteLength(content) > 512 * 1024) {
        s.status = 413;
        s.respond({ error: "Memory is too large" }, "json");
        return;
      }
      if (existing.storage_path)
        await writeFile(String(existing.storage_path), content, "utf8");
      await db.update("advanced_chat_memory_documents", { id, user_id: uid }, {
        ...(input.title !== undefined
          ? { title: String(input.title).slice(0, 200) }
          : {}),
        ...(input.kind !== undefined && kinds.has(String(input.kind))
          ? { kind: String(input.kind) }
          : {}),
        ...(input.enabled !== undefined
          ? { enabled: input.enabled !== false }
          : {}),
        ...(input.scope !== undefined ? { scope: String(input.scope) } : {}),
        content_size: Buffer.byteLength(content),
        size: Buffer.byteLength(content),
        hash: createHash("sha256").update(content).digest("hex"),
        updated_at: new Date().toISOString(),
      } as any);
      s.respond(
        await db.selectOne("advanced_chat_memory_documents", {
          id,
          user_id: uid,
        }),
        "json",
      );
    });
  ctx
    .route("/api/advanced-chat/memories/:id")
    .methods("DELETE")
    .action(async (s, _p, id) => {
      const uid = user(s);
      const row = uid
        ? await db.selectOne("advanced_chat_memory_documents", {
            id,
            user_id: uid,
          })
        : undefined;
      if (row?.storage_path)
        await unlink(String(row.storage_path)).catch(() => undefined);
      if (uid)
        await db.remove("advanced_chat_memory_documents", { id, user_id: uid });
      s.respond({ success: true }, "json");
    });
  const ownedGroup = async (uid: number, groupId: string) =>
    db.selectOne("advanced_chat_chat_groups", { id: groupId, user_id: uid });
  const groupMemory = async (uid: number, groupId: string, id?: string) =>
    db.selectOne(
      "advanced_chat_memory_documents",
      id
        ? { id, user_id: uid, scope: "group", group_id: groupId }
        : { user_id: uid, scope: "group", group_id: groupId },
    );
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/memories")
    .methods("GET")
    .action(async (s, _p, groupId) => {
      const uid = user(s);
      if (uid && (await ownedGroup(uid, groupId)))
        s.respond(
          await db.select("advanced_chat_memory_documents", {
            user_id: uid,
            group_id: groupId,
          }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/memories/:memory_id")
    .methods("GET")
    .action(async (s, _p, groupId, memoryId) => {
      const uid = user(s);
      const row = uid ? await groupMemory(uid, groupId, memoryId) : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Memory not found" }, "json");
        return;
      }
      const content = row.storage_path
        ? await readFile(String(row.storage_path), "utf8").catch(() => "")
        : "";
      s.respond({ ...row, content }, "json");
    });
  const saveGroup = async (s: Session, groupId: string, memoryId?: string) => {
    const uid = user(s);
    if (!uid || !(await ownedGroup(uid, groupId))) {
      s.status = 404;
      s.respond({ error: "Chat group not found" }, "json");
      return;
    }
    const input = (await s.parseRequestBody()) as any;
    const kind = String(input.kind ?? "facts");
    if (!kinds.has(kind)) {
      s.status = 400;
      s.respond({ error: "Invalid memory kind" }, "json");
      return;
    }
    const content = String(input.content ?? "");
    if (Buffer.byteLength(content) > 512 * 1024) {
      s.status = 413;
      s.respond({ error: "Memory is too large" }, "json");
      return;
    }
    const id = memoryId ?? randomUUID();
    const now = new Date().toISOString();
    const file = path.join(root, String(uid), "group", groupId, `${id}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    const value = {
      id,
      user_id: uid,
      scope: "group",
      agent_id: groupId,
      group_id: groupId,
      kind,
      title: String(input.title ?? ""),
      storage_path: file,
      size: Buffer.byteLength(content),
      hash: createHash("sha256").update(content).digest("hex"),
      enabled: input.enabled !== false,
      updated_by: "user",
      created_at: now,
      updated_at: now,
    };
    const exists = await groupMemory(uid, groupId, memoryId);
    if (exists)
      await db.update(
        "advanced_chat_memory_documents",
        { id, user_id: uid, group_id: groupId },
        value as any,
      );
    else await db.create("advanced_chat_memory_documents", value as any);
    s.respond(value, "json");
  };
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/memories")
    .methods("POST")
    .action((s, _p, id) => saveGroup(s, id));
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/memories/:memory_id")
    .methods("PUT")
    .action((s, _p, groupId, memoryId) => saveGroup(s, groupId, memoryId));
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/memories/:memory_id")
    .methods("DELETE")
    .action(async (s, _p, groupId, memoryId) => {
      const uid = user(s);
      const row = uid ? await groupMemory(uid, groupId, memoryId) : undefined;
      if (row?.storage_path)
        await unlink(String(row.storage_path)).catch(() => undefined);
      if (uid)
        await db.remove("advanced_chat_memory_documents", {
          id: memoryId,
          user_id: uid,
          group_id: groupId,
        });
      s.respond({ success: true }, "json");
    });
}
