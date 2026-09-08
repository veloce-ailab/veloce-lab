import { createHash, randomUUID } from "node:crypto";
import type { Context, Database, Session } from "yumeri";
import type { FileService } from "@velocelab/file";

const maxFileBytes = 32 << 20;
const textExtensions = /\.(md|txt|json|csv|xml|yaml|yml|log|ini|toml)$/i;
const attachmentPattern = /file_id=(acf-[A-Za-z0-9_-]+)/g;

export async function attachImageFiles(
  userId: number,
  messages: Array<{ role: string; content: string; [key: string]: unknown }>,
  db: Database,
  files: FileService,
) {
  for (const message of messages) {
    if (message.role !== "user" || !message.content) continue;
    const ids = [...message.content.matchAll(attachmentPattern)].map(
      (match) => match[1],
    );
    if (!ids.length) continue;
    const parts: Array<Record<string, unknown>> = [
      { type: "text", text: message.content },
    ];
    for (const id of [...new Set(ids)]) {
      const row: any = await db.selectOne("advanced_chat_files", {
        id,
        user_id: userId,
      });
      if (
        !row ||
        !String(row.mime_type ?? "")
          .toLowerCase()
          .startsWith("image/") ||
        Number(row.size) > 20 * 1024 * 1024
      )
        continue;
      try {
        const data = await files.read(String(row.storage_path));
        parts.push({
          type: "image_url",
          image_url: {
            url: `data:${row.mime_type};base64,${data.toString("base64")}`,
          },
        });
      } catch {
        // Ignore missing attachments and preserve the text message.
      }
    }
    if (parts.length > 1) (message as any).content = parts;
  }
  return messages;
}

export function registerChatFileRoutes(
  ctx: Context,
  db: Database,
  files: FileService,
) {
  const user = (session: Session) =>
    Number((session.properties.user as any)?.id ?? 0);
  const response = (row: any) => ({
    id: row.id,
    name: row.name,
    type: row.mime_type,
    size: row.size,
    source: row.source,
    text_available: Boolean(row.text_available),
    download_url: `/api/user/advanced-chat/files/${encodeURIComponent(String(row.id))}/download`,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  ctx
    .route("/api/user/advanced-chat/files")
    .methods("GET")
    .action(async (session) => {
      const id = user(session);
      if (id)
        session.respond(
          {
            files: (
              await db.select("advanced_chat_files", { user_id: id })
            ).map(response),
          },
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/files")
    .methods("POST")
    .action(async (session) => {
      const id = user(session);
      if (!id) return;
      const input = (await session.parseRequestBody()) as any;
      const raw = String(input.data ?? input.base64 ?? "").trim();
      if (!raw) {
        session.status = 400;
        session.respond({ error: "File data is required" }, "json");
        return;
      }
      const data = raw.startsWith("data:")
        ? Buffer.from(raw.slice(raw.indexOf(",") + 1), "base64")
        : Buffer.from(raw, "base64");
      if (!data.length || data.length > maxFileBytes) {
        session.status = 413;
        session.respond({ error: "File is empty or too large" }, "json");
        return;
      }
      const fileId = `acf-${randomUUID()}`;
      const name =
        String(input.name ?? "file")
          .replace(/[\\/\0]/g, "_")
          .slice(0, 200) || "file";
      const mime = String(
        input.mime_type ?? input.type ?? "application/octet-stream",
      )
        .split(";", 1)[0]
        .toLowerCase();
      const storage = `advanced-chat/files/${id}/${fileId}/${name}`;
      await files.write(storage, data);
      const text =
        (mime.startsWith("text/") || textExtensions.test(name)) &&
        data.toString("utf8").length <= 100000
          ? data.toString("utf8")
          : "";
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_files", {
        id: fileId,
        user_id: id,
        name,
        mime_type: mime,
        size: data.length,
        storage_path: storage,
        text_extract: text,
        hash: createHash("sha256").update(data).digest("hex"),
        source: String(input.source ?? "upload"),
        source_key: String(input.source_key ?? `${id}:${fileId}`),
        text_available: Boolean(text),
        created_at: now,
        updated_at: now,
      } as any);
      session.status = 201;
      session.respond(
        {
          file: response(row),
          content: { id: row.id, text, binary: !text, truncated: false },
        },
        "json",
      );
    });
  const load = async (session: Session, fileId: string) => {
    const id = user(session);
    const row = id
      ? await db.selectOne("advanced_chat_files", { id: fileId, user_id: id })
      : undefined;
    if (!row) {
      session.status = 404;
      session.respond({ error: "File not found" }, "json");
      return undefined;
    }
    return row as any;
  };
  ctx
    .route("/api/user/advanced-chat/files/:id/content")
    .methods("GET")
    .action(async (session, _params, fileId) => {
      const row = await load(session, fileId);
      if (!row) return;
      const text = String(row.text_extract ?? "");
      session.respond(
        {
          id: row.id,
          text: text.slice(0, 20000),
          binary: !text,
          truncated: text.length > 20000,
        },
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/files/:id/download")
    .methods("GET")
    .action(async (session, _params, fileId) => {
      const row = await load(session, fileId);
      if (!row) return;
      try {
        const data = await files.read(String(row.storage_path));
        session.respond(data, row.mime_type || "application/octet-stream");
      } catch {
        session.status = 500;
        session.respond({ error: "Failed to read file" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/files/:id")
    .methods("DELETE")
    .action(async (session, _params, fileId) => {
      const row = await load(session, fileId);
      if (!row) return;
      if (row.source === "knowledge_document") {
        session.status = 400;
        session.respond(
          {
            error:
              "Knowledge base documents must be deleted from their knowledge base",
          },
          "json",
        );
        return;
      }
      await files.remove(String(row.storage_path)).catch(() => undefined);
      await db.remove("advanced_chat_files", {
        id: row.id,
        user_id: user(session),
      });
      session.respond({ message: "File deleted" }, "json");
    });
}
