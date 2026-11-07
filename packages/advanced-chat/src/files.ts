import { createHash, randomUUID } from "node:crypto";
import type { Context, Database, Session } from "yumeri";
import { FileService } from "@velocelab/file";

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

/** Whether a file's content can be read and edited as text. */
export function isTextFile(name: string, mime: string) {
  return mime.startsWith("text/") || textExtensions.test(name);
}

/** The library's own view of a stored file, as every file route returns it. */
export function fileResponse(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.mime_type,
    size: row.size,
    source: row.source,
    text_available: Boolean(row.text_available),
    download_url: `/api/user/advanced-chat/files/${encodeURIComponent(String(row.id))}/download`,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface StoreChatFileInput {
  name: string;
  mimeType: string;
  data: Buffer;
  source?: string;
  sourceKey?: string;
}

/**
 * Put bytes in the user's file library: the file itself under the storage root,
 * and the row the library lists. Uploads and generated images both go through
 * here, so a generated picture is an ordinary library file afterwards.
 */
export async function storeChatFile(
  db: Database,
  files: FileService,
  userId: number,
  input: StoreChatFileInput,
) {
  const fileId = `acf-${randomUUID()}`;
  const name =
    String(input.name || "file")
      .replace(/[\\/\0]/g, "_")
      .slice(0, 200) || "file";
  const mime = String(input.mimeType || "application/octet-stream")
    .split(";", 1)[0]
    .toLowerCase();
  const storage = `advanced-chat/files/${userId}/${fileId}/${name}`;
  await files.write(storage, input.data);
  // The extracted text is what chat attachments and the knowledge index read;
  // binaries keep it empty rather than storing megabytes of mojibake.
  const text = isTextFile(name, mime) && input.data.toString("utf8").length <= 100000
    ? input.data.toString("utf8")
    : "";
  const now = new Date().toISOString();
  const row = await db.create("advanced_chat_files", {
    id: fileId,
    user_id: userId,
    name,
    mime_type: mime,
    size: input.data.length,
    storage_path: storage,
    text_extract: text,
    hash: createHash("sha256").update(input.data).digest("hex"),
    source: String(input.source ?? "upload"),
    source_key: String(input.sourceKey ?? `${userId}:${fileId}`),
    text_available: Boolean(text),
    created_at: now,
    updated_at: now,
  } as any);
  return row as any;
}

export function registerChatFileRoutes(
  ctx: Context,
  db: Database,
  files: FileService,
) {
  const user = (session: Session) =>
    (session.properties.user as { id?: number } | undefined)?.id;
  const response = fileResponse;
  ctx
    .route("/api/user/advanced-chat/files")
    .methods("GET")
    .action(async (session) => {
      const id = user(session);
      if (id !== undefined)
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
      if (id === undefined) return;
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
      const row = await storeChatFile(db, files, id, {
        name: String(input.name ?? "file"),
        mimeType: String(input.mime_type ?? input.type ?? "application/octet-stream"),
        data,
        source: String(input.source ?? "upload"),
        sourceKey: input.source_key,
      });
      const text = String(row.text_extract ?? "");
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
    const row = id !== undefined
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
    .action(async (session, params: URLSearchParams, fileId) => {
      const row = await load(session, fileId);
      if (!row) return;
      const text = String(row.text_extract ?? "");
      // The editor asks for the whole document, and it must know whether what it
      // got is the whole document: saving a truncated read back would cut the
      // file down without anyone noticing.
      const requested = Number(params.get("max") ?? 0);
      const limit = Math.min(100000, requested > 0 ? requested : 20000);
      session.respond(
        {
          id: row.id,
          text: text.slice(0, limit),
          binary: !text,
          truncated: text.length > limit,
          editable: Boolean(text) && text.length <= limit && row.source !== "knowledge_document",
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
        // The second argument of `respond` is a render type, not a media type:
        // passing the file's own MIME there sent every download as text/plain,
        // which a browser cannot use to preview a picture.
        session.head["Content-Type"] = row.mime_type || "application/octet-stream";
        session.respond(data, "buffer");
      } catch {
        session.status = 500;
        session.respond({ error: "Failed to read file" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/files/:id/content")
    .methods("PUT")
    .action(async (session, _params, fileId) => {
      const row = await load(session, fileId);
      if (!row) return;
      if (row.source === "knowledge_document") {
        session.status = 400;
        session.respond(
          { error: "Knowledge base documents are edited in their knowledge base" },
          "json",
        );
        return;
      }
      if (!isTextFile(String(row.name ?? ""), String(row.mime_type ?? ""))) {
        session.status = 400;
        session.respond({ error: "Only text files can be edited" }, "json");
        return;
      }
      const input = (await session.parseRequestBody()) as any;
      if (typeof input.text !== "string") {
        session.status = 400;
        session.respond({ error: "Text is required" }, "json");
        return;
      }
      const data = Buffer.from(input.text, "utf8");
      if (data.length > maxFileBytes) {
        session.status = 413;
        session.respond({ error: "File is too large" }, "json");
        return;
      }
      await files.write(String(row.storage_path), data);
      const now = new Date().toISOString();
      // The bytes on disk are the file; the extracted copy is only what the chat
      // and the index read, so it keeps its own size cap.
      const text = input.text.slice(0, 100000);
      await db.update(
        "advanced_chat_files",
        { id: row.id, user_id: user(session) },
        {
          size: data.length,
          text_extract: text,
          text_available: true,
          hash: createHash("sha256").update(data).digest("hex"),
          updated_at: now,
        },
      );
      session.respond(
        {
          file: fileResponse({ ...row, size: data.length, text_available: true, updated_at: now }),
          content: { id: row.id, text, binary: false, truncated: input.text.length > text.length },
        },
        "json",
      );
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
