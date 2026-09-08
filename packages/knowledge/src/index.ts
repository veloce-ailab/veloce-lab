import { createHash, randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/file";
import "@velocelab/model-catalog";
import "@velocelab/database-core";

const communityKnowledgeAPIBaseURL = "https://veloce-community.flweb.cn/api/v1";
const maxCommunityKnowledgeImport = 32 << 20;
const communityKnowledgeNotFound = Symbol("community-knowledge-not-found");
export const depend = ["database", "dashboard", "file", "model"];
export const provide = ["knowledge"];
export interface KnowledgeService {
  list(userId: number): Promise<any[]>;
  create(userId: number, input: Record<string, unknown>): Promise<any>;
  documents(userId: number, baseId: string): Promise<any[]>;
}
export const config: Schema<Record<string, never>> = Schema.object({});
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
function normalizeDocumentName(raw: unknown) {
  let name = String(raw ?? "").trim();
  if (!name) throw Error("document name is required");
  if (
    /[\\/\0]/.test(name) ||
    name === "." ||
    name === ".." ||
    [...name].length > 255
  )
    throw Error("invalid document name");
  if (!name.includes(".")) name += ".md";
  if (!/\.(md|markdown|txt|json|csv|yaml|yml)$/i.test(name))
    throw Error("only text documents can be created online");
  return name;
}

async function fetchCommunityJSON<T>(route: string): Promise<T> {
  const response = await fetch(`${communityKnowledgeAPIBaseURL}${route}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) throw communityKnowledgeNotFound;
  if (!response.ok)
    throw new Error(`community service returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxCommunityKnowledgeImport)
    throw new Error("community response is too large");
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error("invalid community response");
  }
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
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/knowledge.js", import.meta.url).pathname,
    plugin: "knowledge",
  });
  const db = ctx.component.database;
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
  ctx
    .route("/api/user/advanced-chat/community/knowledge-bases/:id/import")
    .methods("POST")
    .action(async (s, _p, communityId) => {
      const userId = user(s);
      if (!userId) return;
      const id = String(communityId ?? "").trim();
      if (!id || id.length > 120) {
        s.status = 400;
        s.respond({ error: "Invalid community knowledge base id" }, "json");
        return;
      }
      let metadata: { id?: string; name?: string; description?: string };
      let content: {
        files?: Array<{ id?: string; name?: string; content?: string }>;
      };
      try {
        const encoded = encodeURIComponent(id);
        metadata = await fetchCommunityJSON(`/knowledge-bases/${encoded}`);
        content = await fetchCommunityJSON(
          `/knowledge-bases/${encoded}/content`,
        );
      } catch (error) {
        s.status = error === communityKnowledgeNotFound ? 404 : 502;
        s.respond(
          {
            error:
              error === communityKnowledgeNotFound
                ? "Community knowledge base not found"
                : "Community knowledge base is temporarily unavailable",
          },
          "json",
        );
        return;
      }
      const filesToImport = (content.files ?? []).filter((item) =>
        String(item.content ?? "").trim(),
      );
      if (!filesToImport.length) {
        s.status = 422;
        s.respond(
          { error: "Community knowledge base has no importable files" },
          "json",
        );
        return;
      }
      const baseId = randomUUID();
      const now = new Date().toISOString();
      const base = await db.create("advanced_chat_knowledge_bases", {
        id: baseId,
        user_id: userId,
        name: String(metadata.name ?? "Untitled"),
        description: String(metadata.description ?? ""),
        embedding_model_name: "",
        embedding_user_channel_id: 0,
        created_at: now,
        updated_at: now,
      } as any);
      const createdPaths: string[] = [];
      const createdDocuments: any[] = [];
      const cleanup = async () => {
        await Promise.all(createdPaths.map((file) => files.remove(file)));
        await db.remove("advanced_chat_knowledge_documents", {
          knowledge_base_id: baseId,
          user_id: userId,
        });
        await db.remove("advanced_chat_knowledge_bases", {
          id: baseId,
          user_id: userId,
        });
      };
      try {
        for (let index = 0; index < (content.files ?? []).length; index += 1) {
          const item = content.files?.[index];
          const text = String(item?.content ?? "").trim();
          if (!text) continue;
          let name = String(item?.name ?? "").trim();
          if (!name) name = `community-document-${index + 1}.md`;
          if (!name.includes(".")) name += ".md";
          name = normalizeDocumentName(name);
          const documentId = randomUUID();
          const storagePath = `knowledge/${userId}/${baseId}/${documentId}.md`;
          await files.write(storagePath, text);
          createdPaths.push(storagePath);
          const row = await db.create("advanced_chat_knowledge_documents", {
            id: documentId,
            knowledge_base_id: baseId,
            user_id: userId,
            file_id: randomUUID(),
            name,
            mime_type: "text/markdown; charset=utf-8",
            size: Buffer.byteLength(text),
            text_available: true,
            embedding_status: "pending",
            embedding_error: "",
            embedding_model: "",
            embedding_dim: 0,
            chunk_count: 0,
            storage_path: storagePath,
            hash: createHash("sha256").update(text).digest("hex"),
            source: "community-knowledge",
            source_key: `community-knowledge:${baseId}:${String(item?.id ?? "")}:${index}`,
            created_at: now,
            updated_at: now,
          } as any);
          createdDocuments.push(row);
        }
      } catch (error) {
        await cleanup();
        s.status = 500;
        s.respond(
          { error: "Failed to import community knowledge base" },
          "json",
        );
        return;
      }
      if (!createdDocuments.length) {
        await cleanup();
        s.status = 422;
        s.respond(
          { error: "Community knowledge base has no importable text" },
          "json",
        );
        return;
      }
      s.respond(
        {
          knowledge_base: {
            ...base,
            document_count: createdDocuments.length,
            documents: createdDocuments,
          },
        },
        "json",
      );
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
    let name: string;
    try {
      name = normalizeDocumentName(input.name ?? "Document.md");
    } catch (error) {
      s.status = 400;
      s.respond(
        { error: error instanceof Error ? error.message : String(error) },
        "json",
      );
      return;
    }
    const content = String(input.content ?? input.data ?? "") || "\n";
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
      name,
      mime_type: "text/markdown",
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
      let name = String(row.name);
      if (String(input.name ?? "").trim()) {
        try {
          name = normalizeDocumentName(input.name);
        } catch (error) {
          s.status = 400;
          s.respond(
            { error: error instanceof Error ? error.message : String(error) },
            "json",
          );
          return;
        }
      }
      if (row.storage_path)
        await files.write(String(row.storage_path), content);
      await db.update(
        "advanced_chat_knowledge_documents",
        { id: documentId, user_id: userId },
        {
          name,
          mime_type: "text/markdown",
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
