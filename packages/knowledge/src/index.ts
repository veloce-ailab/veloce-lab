import { createHash, randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/file";
import "@velocelab/model";
export const depend = ["database", "dashboard", "file", "model"];
export const provide = ["knowledge"];
export interface KnowledgeService {
  list(userId: number): Promise<any[]>;
  create(userId: number, input: Record<string, unknown>): Promise<any>;
  documents(userId: number, baseId: string): Promise<any[]>;
}
export const config: Schema<{ enabled: boolean }> = Schema.object({
  enabled: Schema.boolean("Enable knowledge bases").default(true),
});
function embedding(text: string) {
  const vector = new Array(32).fill(0);
  for (let index = 0; index < text.length; index += 1)
    vector[text.charCodeAt(index) % vector.length] += 1;
  const norm =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}
function similarity(left: number[], right: number[]) {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}
async function embedTexts(
  db: Database,
  userId: number,
  modelName: string,
  channelId: number,
  texts: string[],
) {
  if (!modelName || !channelId) return texts.map(embedding);
  const channel: any = await db.selectOne("channels", { id: channelId });
  if (!channel || (channel.user_id && Number(channel.user_id) !== userId))
    return texts.map(embedding);
  const response = await fetch(
    `${String(channel.base_url).replace(/\/$/, "")}/v1/embeddings`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(channel.api_key
          ? { authorization: `Bearer ${channel.api_key}` }
          : {}),
      },
      body: JSON.stringify({ model: modelName, input: texts }),
    },
  );
  if (!response.ok) return texts.map(embedding);
  const payload: any = await response.json().catch(() => ({}));
  if (!Array.isArray(payload.data) || !payload.data.length)
    return texts.map(embedding);
  const vectors = texts.map(() => [] as number[]);
  for (const item of payload.data)
    if (
      Number.isInteger(item.index) &&
      item.index < vectors.length &&
      Array.isArray(item.embedding)
    )
      vectors[item.index] = item.embedding.map(Number);
  return vectors.every((vector) => vector.length)
    ? vectors
    : texts.map(embedding);
}
declare module "yumeri" {
  interface Components {
    knowledge: KnowledgeService;
  }
}
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/knowledge.js", import.meta.url).pathname,
    plugin: "knowledge",
  });
  const db = ctx.component.database as Database;
  const files = ctx.component.file;
  const service: KnowledgeService = {
    list: (userId) =>
      db.select("advanced_chat_knowledge_bases", { user_id: userId }),
    create: (userId, input) =>
      db.create("advanced_chat_knowledge_bases", {
        id: randomUUID(),
        user_id: userId,
        name: String(input.name ?? "Untitled"),
        description: String(input.description ?? ""),
        embedding_model_name: String(input.embedding_model_name ?? ""),
        embedding_user_channel_id: Number(input.embedding_user_channel_id ?? 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any),
    documents: (userId, baseId) =>
      db.select("advanced_chat_knowledge_documents", {
        user_id: userId,
        knowledge_base_id: baseId,
      }),
  };
  ctx.registerComponent("knowledge", service);
  const user = (s: Session) =>
    (s.properties.user as any)?.id as number | undefined;
  ctx
    .route("/api/user/advanced-chat/knowledge-bases")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      s.status = 201;
      s.respond(
        await service.create(id, (await s.parseRequestBody()) as any),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/documents")
    .methods("GET")
    .action(async (s, _p, baseId) => {
      const id = user(s);
      if (id) s.respond(await service.documents(id, baseId), "json");
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id")
    .methods("PUT")
    .action(async (s, _p, baseId) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      await db.update(
        "advanced_chat_knowledge_bases",
        { id: baseId, user_id: id },
        {
          name: String(input.name ?? ""),
          description: String(input.description ?? ""),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_knowledge_bases", {
          id: baseId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id")
    .methods("DELETE")
    .action(async (s, _p, baseId) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_knowledge_bases", {
          id: baseId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/search")
    .methods("POST")
    .action(async (s, _p, baseId) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const query = String(input.query ?? "").toLowerCase();
      const rows = await service.documents(id, baseId);
      const results: any[] = [];
      for (const row of rows as any[]) {
        const chunks = await db.select("advanced_chat_knowledge_chunks", {
          document_id: row.id,
          user_id: id,
        });
        const base = await db.selectOne("advanced_chat_knowledge_bases", {
          id: baseId,
          user_id: id,
        });
        const queryVector = (
          await embedTexts(
            db,
            id,
            String(base?.embedding_model_name ?? ""),
            Number(base?.embedding_user_channel_id ?? 0),
            [query],
          )
        )[0];
        const matches = chunks
          .map((chunk: any) => {
            let vector: number[] = [];
            try {
              vector = JSON.parse(String(chunk.embedding ?? "[]"));
            } catch {}
            return {
              ...chunk,
              score: vector.length
                ? similarity(queryVector, vector)
                : String(chunk.content ?? "")
                      .toLowerCase()
                      .includes(query)
                  ? 1
                  : 0,
            };
          })
          .filter((chunk: any) => chunk.score > 0)
          .sort((left: any, right: any) => right.score - left.score);
        if (
          matches.length ||
          String(row.name ?? "")
            .toLowerCase()
            .includes(query)
        ) {
          results.push({
            ...row,
            matches: matches.slice(0, 20).map((chunk: any) => ({
              id: chunk.id,
              ordinal: chunk.ordinal,
              content: String(chunk.content ?? "").slice(0, 1000),
              score: chunk.score,
            })),
          });
        }
      }
      s.respond(results, "json");
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/vectorize")
    .methods("POST")
    .action(async (s, _p, baseId) => {
      const id = user(s);
      if (!id) return;
      const documents: any[] = await service.documents(id, baseId);
      const base: any = await db.selectOne("advanced_chat_knowledge_bases", {
        id: baseId,
        user_id: id,
      });
      const modelName = String(base?.embedding_model_name ?? "");
      const channelId = Number(base?.embedding_user_channel_id ?? 0);
      let chunks = 0;
      for (const document of documents) {
        const content = document.storage_path
          ? (await files.read(String(document.storage_path))).toString("utf8")
          : "";
        const parts = content.match(/[\s\S]{1,1200}/g) ?? [];
        await db.remove("advanced_chat_knowledge_chunks", {
          document_id: document.id,
          user_id: id,
        });
        const vectors = await embedTexts(db, id, modelName, channelId, parts);
        for (let index = 0; index < parts.length; index += 1)
          await db.create("advanced_chat_knowledge_chunks", {
            id: randomUUID(),
            document_id: document.id,
            user_id: id,
            ordinal: index,
            content: parts[index],
            content_hash: createHash("sha256")
              .update(parts[index])
              .digest("hex"),
            embedding: JSON.stringify(vectors[index]),
            embedding_model: modelName || "local-hash-v1",
            embedding_dim: vectors[index].length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);
        await db.update(
          "advanced_chat_knowledge_documents",
          { id: document.id, user_id: id },
          {
            embedding_status: "completed",
            embedding_model: modelName || "local-hash-v1",
            embedding_dim: vectors[0]?.length ?? 0,
            chunk_count: parts.length,
            updated_at: new Date().toISOString(),
          },
        );
        chunks += parts.length;
      }
      s.respond({ success: true, documents: documents.length, chunks }, "json");
    });
  const createDocument = async (s: Session, baseId: string) => {
    const userId = user(s);
    if (!userId) return;
    const base = await db.selectOne("advanced_chat_knowledge_bases", {
      id: baseId,
      user_id: userId,
    });
    if (!base) {
      s.status = 404;
      s.respond({ error: "Knowledge base not found" }, "json");
      return;
    }
    const input = (await s.parseRequestBody()) as any;
    const content = String(input.content ?? input.data ?? "");
    const documentId = randomUUID();
    const fileId = randomUUID();
    const storage = `knowledge/${userId}/${baseId}/${documentId}.txt`;
    await files.write(storage, content);
    const now = new Date().toISOString();
    const row = await db.create("advanced_chat_knowledge_documents", {
      id: documentId,
      knowledge_base_id: baseId,
      user_id: userId,
      file_id: fileId,
      name: String(input.name ?? "Document"),
      mime_type: String(input.mime_type ?? "text/plain"),
      size: Buffer.byteLength(content),
      text_available: true,
      embedding_status: "pending",
      embedding_error: "",
      embedding_model: "",
      embedding_dim: 0,
      chunk_count: 0,
      storage_path: storage,
      hash: createHash("sha256").update(content).digest("hex"),
      created_at: now,
      updated_at: now,
    } as any);
    s.status = 201;
    s.respond(row, "json");
  };
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/documents")
    .methods("POST")
    .action((s, _p, baseId) => createDocument(s, baseId));
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/documents/text")
    .methods("POST")
    .action((s, _p, baseId) => createDocument(s, baseId));
  ctx
    .route(
      "/api/user/advanced-chat/knowledge-bases/:id/documents/:documentId/content",
    )
    .methods("GET")
    .action(async (s, _p, baseId, documentId) => {
      const userId = user(s);
      const row = userId
        ? await db.selectOne("advanced_chat_knowledge_documents", {
            id: documentId,
            knowledge_base_id: baseId,
            user_id: userId,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Document not found" }, "json");
        return;
      }
      const content = row.storage_path
        ? (await files.read(String(row.storage_path))).toString("utf8")
        : "";
      s.respond({ ...row, content }, "json");
    });
  ctx
    .route(
      "/api/user/advanced-chat/knowledge-bases/:id/documents/:documentId/content",
    )
    .methods("PUT")
    .action(async (s, _p, baseId, documentId) => {
      const userId = user(s);
      const row = userId
        ? await db.selectOne("advanced_chat_knowledge_documents", {
            id: documentId,
            knowledge_base_id: baseId,
            user_id: userId,
          })
        : undefined;
      if (!row || !userId) {
        s.status = 404;
        s.respond({ error: "Document not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const content = String(input.content ?? "");
      if (row.storage_path)
        await files.write(String(row.storage_path), content);
      await db.update(
        "advanced_chat_knowledge_documents",
        { id: documentId, user_id: userId },
        {
          size: Buffer.byteLength(content),
          hash: createHash("sha256").update(content).digest("hex"),
          embedding_status: "pending",
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_knowledge_documents", {
          id: documentId,
          user_id: userId,
        }),
        "json",
      );
    });
  ctx
    .route(
      "/api/user/advanced-chat/knowledge-bases/:id/documents/:documentId/vectorize",
    )
    .methods("POST")
    .action(async (s, _p, baseId, documentId) => {
      const userId = user(s);
      const row = userId
        ? await db.selectOne("advanced_chat_knowledge_documents", {
            id: documentId,
            knowledge_base_id: baseId,
            user_id: userId,
          })
        : undefined;
      if (!row || !userId) {
        s.status = 404;
        s.respond({ error: "Document not found" }, "json");
        return;
      }
      const content = row.storage_path
        ? (await files.read(String(row.storage_path))).toString("utf8")
        : "";
      const chunks = content.match(/[\\s\\S]{1,1200}/g) ?? [];
      const base: any = await db.selectOne("advanced_chat_knowledge_bases", {
        id: baseId,
        user_id: userId,
      });
      const vectors = await embedTexts(
        db,
        userId,
        String(base?.embedding_model_name ?? ""),
        Number(base?.embedding_user_channel_id ?? 0),
        chunks,
      );
      await db.remove("advanced_chat_knowledge_chunks", {
        document_id: documentId,
        user_id: userId,
      });
      for (let i = 0; i < chunks.length; i++)
        await db.create("advanced_chat_knowledge_chunks", {
          id: randomUUID(),
          document_id: documentId,
          user_id: userId,
          ordinal: i,
          content: chunks[i],
          content_hash: createHash("sha256").update(chunks[i]).digest("hex"),
          embedding: JSON.stringify(vectors[i]),
          embedding_model: String(
            base?.embedding_model_name ?? "local-hash-v1",
          ),
          embedding_dim: vectors[i].length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any);
      await db.update(
        "advanced_chat_knowledge_documents",
        { id: documentId, user_id: userId },
        {
          embedding_status: "completed",
          embedding_model: String(
            base?.embedding_model_name ?? "local-hash-v1",
          ),
          embedding_dim: vectors[0]?.length ?? 0,
          chunk_count: chunks.length,
          updated_at: new Date().toISOString(),
        },
      );
      s.respond({ success: true, chunk_count: chunks.length }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/knowledge-bases/:id/documents/:documentId")
    .methods("DELETE")
    .action(async (s, _p, baseId, documentId) => {
      const userId = user(s);
      const row = userId
        ? await db.selectOne("advanced_chat_knowledge_documents", {
            id: documentId,
            knowledge_base_id: baseId,
            user_id: userId,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Document not found" }, "json");
        return;
      }
      if (row.storage_path) await files.remove(String(row.storage_path));
      await db.remove("advanced_chat_knowledge_chunks", {
        document_id: documentId,
        user_id: userId,
      });
      await db.remove("advanced_chat_knowledge_documents", {
        id: documentId,
        user_id: userId,
      });
      s.respond({ success: true }, "json");
    });
}
