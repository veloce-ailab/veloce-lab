import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import { createHash } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/advanced-chat";
import "@velocelab/file";
import { ensureTables } from "./tables.js";
import { parseSkillArchive } from "./archive.js";
export const depend = [
  "dashboard",
  "advanced-chat",
  "database",
  "file",
];
export const provide = ["skill"];
const communityAPI = "https://veloce-community.flweb.cn/api/v1";
const maxSkillArchive = 64 << 20;
const communityNotFound = Symbol("community-skill-not-found");

function skillContent(row: any): string {
  try {
    const metadata = JSON.parse(String(row.metadata_json ?? "{}"));
    return String(metadata.content ?? "");
  } catch {
    return String(row.metadata_json ?? "");
  }
}

function skillFrontmatter(content: string, fallbackName: string) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  const metadata: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field) metadata[field[1]] = field[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
  }
  const body = match ? content.slice(match[0].length) : content;
  return {
    name: metadata.name || fallbackName,
    description: metadata.description || body.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "") || "",
    body,
  };
}

function skillRoot(skillPath: string): string {
  return skillPath.includes("/") ? skillPath.slice(0, skillPath.lastIndexOf("/")) : "";
}

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
export async function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/skill.js", import.meta.url).pathname,
    plugin: "skill",
  });
  const skills: SkillDefinition[] = [];
  const db = ctx.component.database as Database;
  await ensureTables(db);
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
              content: skillContent(row),
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
    provide: async ({ userId, skillIds }) => {
      const enabled = await service.list(userId);
      // A selection narrows the prompt to the skills the session actually
      // chose; without one every enabled skill is advertised.
      const selected = skillIds?.length
        ? enabled.filter((skill) => skillIds.includes(String(skill.id)))
        : enabled;
      if (!selected.length) return undefined;
      return `Enabled skills:\n${selected
        .map((skill) =>
          skillIds?.length
            ? `- ${skill.name}\n${String(skill.content ?? "").trim()}`
            : `- ${skill.name}: ${skill.description}`,
        )
        .join("\n")}`;
    },
  });
  chat.registerTool({
    name: "skill_list",
    description: "List the skills available to this session",
    parameters: { type: "object", properties: {} },
    // Scoped the same way as the prompt above. Handing back every enabled skill
    // made the session's selection meaningless: the model could enumerate and
    // then read the skills that were deliberately left out.
    execute: async (_input, context) => {
      const enabled = await service.list(context.userId);
      const skillIds = context.skillIds;
      return skillIds?.length
        ? enabled.filter((skill) => skillIds.includes(String(skill.id)))
        : enabled;
    },
  });
  const user = (s: Session) => (s.properties.user as { id?: number } | undefined)?.id;
  ctx
    .route("/api/user/advanced-chat/community/skills/:id/import")
    .methods("POST")
    .action(async (s, _p, communityId) => {
      const userId = user(s);
      if (userId === undefined) return;
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
      if (id !== undefined) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/skills")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
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
      if (id === undefined) return;
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
      const row: any = id !== undefined
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
      s.respond(
        { id: row.id, name: row.name, content: skillContent(row) },
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id")
    .methods("GET")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      const row: any = id !== undefined
        ? await db.selectOne("advanced_chat_packaged_skills", { id: skillId, user_id: id })
        : undefined;
      if (!row) {
        s.status = 404;
        s.respond({ error: "Skill not found" }, "json");
        return;
      }
      const content = skillContent(row);
      const skillPackage: any = row.package_id
        ? await db.selectOne("advanced_chat_skill_packages", { id: row.package_id, user_id: id })
        : undefined;
      const rootPath = String(row.root_path ?? "");
      const packageFiles = row.package_id
        ? await db.select("advanced_chat_skill_package_files", { package_id: row.package_id, user_id: id })
        : [];
      const filesList = packageFiles
        .filter((file: any) => rootPath ? String(file.path).startsWith(`${rootPath}/`) : true)
        .map((file: any) => {
          const path = rootPath ? String(file.path).slice(rootPath.length + 1) : String(file.path);
          return { path, size: Number(file.size) || 0, skill: String(file.path) === String(row.skill_path) };
        });
      s.respond({
        ...row,
        package_name: String(skillPackage?.name ?? ""),
        package_source_name: String(skillPackage?.source_name ?? ""),
        files: filesList.length ? filesList : (content ? [{ path: row.skill_path || "SKILL.md", size: Buffer.byteLength(content), skill: true }] : []),
      }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id/files")
    .methods("GET")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      const row: any = id !== undefined
        ? await db.selectOne("advanced_chat_packaged_skills", { id: skillId, user_id: id })
        : undefined;
      const path = String(s.request.query?.path ?? "");
      if (!row || !path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
        s.status = 404;
        s.respond({ error: "Skill file not found" }, "json");
        return;
      }
      try {
        const packageRow: any = row.package_id
          ? await db.selectOne("advanced_chat_skill_packages", { id: row.package_id, user_id: id })
          : undefined;
        let content: string;
        if (packageRow?.storage_path && row.source === "upload") {
          const relativePath = path.split("/").filter(Boolean).join("/");
          const archivePath = [String(row.root_path ?? ""), relativePath].filter(Boolean).join("/");
          const allowed = await db.selectOne("advanced_chat_skill_package_files", { package_id: row.package_id, user_id: id, path: archivePath });
          if (!allowed) throw new Error("not found");
          const storagePath = `skills/${id}/files/${row.package_id}/${archivePath}`;
          content = (await files.read(storagePath)).toString("utf8");
        } else {
          if (path !== (row.skill_path || "SKILL.md")) throw new Error("not found");
          content = skillContent(row);
        }
        const maxBytes = 256 * 1024;
        const bytes = Buffer.from(content);
        s.respond({ path, content: bytes.subarray(0, maxBytes).toString("utf8"), size: bytes.length, truncated: bytes.length > maxBytes }, "json");
      } catch {
        s.status = 404;
        s.respond({ error: "Skill file not found" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skills/:id")
    .methods("DELETE")
    .action(async (s, _p, skillId) => {
      const id = user(s);
      if (id !== undefined) {
        await db.remove("advanced_chat_packaged_skills", {
          id: skillId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages")
    .methods("POST")
    .action(async (s) => {
      const userId = user(s);
      if (userId === undefined) return;
      try {
        const input = (await s.parseRequestBody()) as any;
        const sourceName = String(input?.name ?? "skill.zip").trim();
        const lowerName = sourceName.toLowerCase();
        if (!/\.(zip|tar\.gz|tgz)$/.test(lowerName) || /[\\/\0]/.test(sourceName)) {
          s.status = 400;
          s.respond({ error: "Skill package must be a zip, tar.gz, or tgz file" }, "json");
          return;
        }
        const raw = String(input?.data ?? input?.base64 ?? "").trim();
        if (!raw) {
          s.status = 400;
          s.respond({ error: "Skill package data is required" }, "json");
          return;
        }
        const encoded = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
          s.status = 400;
          s.respond({ error: "Invalid base64 package data" }, "json");
          return;
        }
        const archive = Buffer.from(encoded, "base64");
        if (!archive.length || archive.length > maxSkillArchive) {
          s.status = 413;
          s.respond({ error: "Skill package is empty or too large" }, "json");
          return;
        }
        let extracted: ReturnType<typeof parseSkillArchive>;
        try {
          extracted = parseSkillArchive(archive, sourceName);
        } catch (error) {
          s.status = 400;
          s.respond({ error: error instanceof Error ? error.message : "Invalid skill package" }, "json");
          return;
        }
        const skillFiles = extracted.filter((file) => file.path.toLowerCase().endsWith("skill.md"));
        const packageId = randomUUID();
        const storagePath = `skills/${userId}/packages/${packageId}.archive`;
        const now = new Date().toISOString();
        await files.write(storagePath, archive);
        const writtenFiles: string[] = [];
        try {
          for (const file of extracted) {
            const filePath = `skills/${userId}/files/${packageId}/${file.path}`;
            await files.write(filePath, file.data);
            writtenFiles.push(filePath);
          }
          const packageRow = await db.create("advanced_chat_skill_packages", {
            id: packageId,
            user_id: userId,
            name: sourceName,
            source_name: sourceName,
            storage_path: storagePath,
            size: archive.byteLength,
            file_count: extracted.length,
            hash: createHash("sha256").update(archive).digest("hex"),
            status: "stored",
            error_text: "",
            created_at: now,
            updated_at: now,
          } as any);
          for (const file of extracted) {
            await db.create("advanced_chat_skill_package_files", {
              id: randomUUID(), package_id: packageId, user_id: userId, path: file.path,
              size: file.data.byteLength, hash: createHash("sha256").update(file.data).digest("hex"),
            } as any);
          }
          const createdSkills = [];
          for (const skillFile of skillFiles) {
            const content = skillFile.data.toString("utf8");
            const fallbackName = skillRoot(skillFile.path).split("/").filter(Boolean).at(-1) || sourceName.replace(/\.(tar\.gz|tgz|zip)$/i, "");
            const metadata = skillFrontmatter(content, fallbackName);
            createdSkills.push(await db.create("advanced_chat_packaged_skills", {
              id: randomUUID(), user_id: userId, package_id: packageId,
              name: metadata.name, description: metadata.description, source: "upload",
              skill_path: skillFile.path, root_path: skillRoot(skillFile.path),
              metadata_json: JSON.stringify({ content }), allowed_tools: "[]", compatibility: "{}",
              enabled: true, size: skillFile.data.byteLength,
              hash: createHash("sha256").update(skillFile.data).digest("hex"),
              created_at: now, updated_at: now,
            } as any));
          }
          s.status = 201;
          s.respond({ package: packageRow, skills: createdSkills }, "json");
        } catch {
          for (const filePath of writtenFiles) await files.remove(filePath).catch(() => undefined);
          await files.remove(storagePath).catch(() => undefined);
          await db.remove("advanced_chat_packaged_skills", { package_id: packageId, user_id: userId }).catch(() => undefined);
          await db.remove("advanced_chat_skill_package_files", { package_id: packageId, user_id: userId }).catch(() => undefined);
          await db.remove("advanced_chat_skill_packages", { id: packageId, user_id: userId }).catch(() => undefined);
          s.status = 500;
          s.respond({ error: "Failed to save skill package" }, "json");
        }
      } catch {
        s.status = 500;
        s.respond({ error: "Failed to upload skill package" }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/skill-packages")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id !== undefined)
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
      const row = id !== undefined
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
      const row: any = id !== undefined
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
      if (id !== undefined) {
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
        const packageFiles = await db.select("advanced_chat_skill_package_files", { package_id: packageId, user_id: id });
        for (const file of packageFiles) await files.remove(`skills/${id}/files/${packageId}/${file.path}`).catch(() => undefined);
        await db.remove("advanced_chat_skill_package_files", { package_id: packageId, user_id: id });
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
      if (id !== undefined)
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
