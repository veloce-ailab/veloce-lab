import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import { createHash } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/model";
import "@velocelab/file";
export const depend = [
  "dashboard",
  "advanced-chat",
  "database",
  "model",
  "file",
];
export const provide = ["skill"];
const communityAPI = "https://veloce-community.flweb.cn/api/v1";
const maxSkillArchive = 64 << 20;
const communityNotFound = Symbol("community-skill-not-found");

async function fetchCommunitySkill<T>(route: string): Promise<T> {
  const response = await fetch(`${communityAPI}${route}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) throw communityNotFound;
  if (!response.ok)
    throw new Error(`community service returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxSkillArchive)
    throw new Error("community response is too large");
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}
export interface SkillService {
  list(userId: number): Promise<SkillDefinition[]>;
  register(skill: SkillDefinition): () => void;
}
declare module "yumeri" {
  interface Components {
    skill: SkillService;
  }
}
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/skill.js", import.meta.url).pathname,
    plugin: "skill",
  });
  const skills: SkillDefinition[] = [];
  const db = ctx.component.database as Database;
  const files = ctx.component.file;
  const service: SkillService = {
    list: async (userId) =>
      userId
        ? [
            ...skills.filter((skill) => skill.enabled),
            ...(
              await db.select("advanced_chat_packaged_skills", {
                user_id: userId,
                enabled: true,
              })
            ).map((row: any) => ({
              id: String(row.id),
              name: String(row.name),
              description: String(row.description ?? ""),
              content: String(row.metadata_json ?? ""),
              enabled: true,
            })),
          ]
        : [],
    register(skill) {
      skills.push(skill);
      return () => {
        const index = skills.indexOf(skill);
        if (index >= 0) skills.splice(index, 1);
      };
    },
  };
  ctx.registerComponent("skill", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({
    id: "skill",
    provide: async ({ userId }) => {
      const enabled = await service.list(userId);
      return enabled.length
        ? `Enabled skills:\n${enabled.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")}`
        : undefined;
    },
  });
  chat.registerTool({
    name: "skill_list",
    description: "List enabled skills",
    parameters: { type: "object", properties: {} },
    execute: (_input, context) => service.list(context.userId),
  });
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  ctx
    .route("/api/user/advanced-chat/community/skills/:id/import")
    .methods("POST")
    .action(async (s, _p, communityId) => {
      const userId = user(s);
      if (!userId) return;
      const id = String(communityId ?? "").trim();
      if (!id || id.length > 120) {
        s.status = 400;
        s.respond({ error: "Invalid community skill id" }, "json");
        return;
      }
      let metadata: { name?: string; source_name?: string };
      let archive: Uint8Array;
      try {
        const encoded = encodeURIComponent(id);
        metadata = await fetchCommunitySkill(`/skills/${encoded}`);
        const response = await fetch(
          `${communityAPI}/skills/${encoded}/archive`,
          {
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (response.status === 404) throw communityNotFound;
        if (!response.ok) throw new Error("community archive unavailable");
        archive = new Uint8Array(await response.arrayBuffer());
        if (!archive.byteLength || archive.byteLength > maxSkillArchive)
          throw new Error("invalid community skill package");
      } catch (error) {
        s.status = error === communityNotFound ? 404 : 502;
        s.respond(
          {
            error:
              error === communityNotFound
                ? "Community skill not found"
                : "Community skill package is temporarily unavailable",
          },
          "json",
        );
        return;
      }
      const sourceName = String(
        metadata.source_name ?? metadata.name ?? `${id}.zip`,
      ).trim();
      const packageId = randomUUID();
      const storagePath = `skills/${userId}/packages/${packageId}.zip`;
      const now = new Date().toISOString();
      try {
        await files.write(storagePath, archive);
        const row = await db.create("advanced_chat_skill_packages", {
          id: packageId,
          user_id: userId,
          name: String(metadata.name ?? id),
          source_name: sourceName,
          storage_path: storagePath,
          size: archive.byteLength,
          file_count: 0,
          hash: createHash("sha256").update(archive).digest("hex"),
          status: "stored",
          error_text: "",
          created_at: now,
          updated_at: now,
        } as any);
        s.respond({ package: row }, "json");
      } catch {
        await files.remove(storagePath).catch(() => undefined);
        s.status = 500;
        s.respond({ error: "Failed to import community skill" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skills")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/skills")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_packaged_skills", {
        id: randomUUID(),
        user_id: id,
        package_id: "",
        name: String(input.name ?? "Skill"),
        description: String(input.description ?? ""),
        source: "user",
        skill_path: "",
        root_path: "",
        metadata_json: JSON.stringify({ content: input.content ?? "" }),
        allowed_tools: "[]",
        compatibility: "{}",
        enabled: input.enabled !== false,
        size: Buffer.byteLength(String(input.content ?? "")),
        hash: "",
        created_at: now,
        updated_at: now,
      } as any);
      s.status = 201;
      s.respond(row, "json");
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id")
    .methods("PUT")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      if (!id) return;
      const existing = await db.selectOne("advanced_chat_packaged_skills", {
        id: skillId,
        user_id: id,
      });
      if (!existing) {
        s.status = 404;
        s.respond({ error: "Skill not found" }, "json");
        return;
      }
      const input = (await s.parseRequestBody()) as any;
      const content = String(input.content ?? "");
      await db.update(
        "advanced_chat_packaged_skills",
        { id: skillId, user_id: id },
        {
          name: String(input.name ?? existing.name),
          description: String(input.description ?? existing.description),
          metadata_json: JSON.stringify({ content }),
          enabled: input.enabled !== false,
          size: Buffer.byteLength(content),
          updated_at: new Date().toISOString(),
        },
      );
      s.respond(
        await db.selectOne("advanced_chat_packaged_skills", {
          id: skillId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id/content")
    .methods("GET")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      const row: any = id
        ? await db.selectOne("advanced_chat_packaged_skills", {
            id: skillId,
            user_id: id,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Skill not found" }, "json");
        return;
      }
      let metadata: any = {};
      try {
        metadata = JSON.parse(String(row.metadata_json ?? "{}"));
      } catch {}
      s.respond(
        { id: row.id, name: row.name, content: String(metadata.content ?? "") },
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id")
    .methods("DELETE")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_packaged_skills", {
          id: skillId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          await Promise.all(
            (
              await db.select("advanced_chat_skill_packages", { user_id: id })
            ).map(async (row: any) => ({
              ...row,
              skills: await db.select("advanced_chat_packaged_skills", {
                package_id: row.id,
                user_id: id,
              }),
            })),
          ),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages/:id")
    .methods("GET")
    .action(async (s, _p, packageId) => {
      const id = user(s);
      const row = id
        ? await db.selectOne("advanced_chat_skill_packages", {
            id: packageId,
            user_id: id,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Skill package not found" }, "json");
        return;
      }
      const skills = await db.select("advanced_chat_packaged_skills", {
        package_id: packageId,
        user_id: id,
      });
      s.respond({ ...row, skills }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages/:id/archive")
    .methods("GET")
    .action(async (s, _p, packageId) => {
      const id = user(s);
      const row: any = id
        ? await db.selectOne("advanced_chat_skill_packages", {
            id: packageId,
            user_id: id,
          })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Skill package not found" }, "json");
        return;
      }
      try {
        const archive = await files.read(String(row.storage_path));
        s.respond(
          {
            id: row.id,
            source_name: row.source_name,
            content: archive.toString("base64"),
          },
          "json",
        );
      } catch {
        s.status = 404;
        s.respond({ error: "Skill package archive not found" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages/:id")
    .methods("DELETE")
    .action(async (s, _p, packageId) => {
      const id = user(s);
      if (id) {
        const row: any = await db.selectOne("advanced_chat_skill_packages", {
          id: packageId,
          user_id: id,
        });
        if (!row) {
          s.status = 404;
          s.respond({ error: "Skill package not found" }, "json");
          return;
        }
        await files.remove(String(row.storage_path)).catch(() => undefined);
        await db.remove("advanced_chat_packaged_skills", {
          package_id: packageId,
          user_id: id,
        });
        await db.remove("advanced_chat_skill_packages", {
          id: packageId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/workspace-skills/refresh")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          {
            success: true,
            refreshed: (
              await db.select("advanced_chat_packaged_skills", { user_id: id })
            ).length,
          },
          "json",
        );
    });
}
