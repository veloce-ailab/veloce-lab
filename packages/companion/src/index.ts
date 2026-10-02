import { randomUUID, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/file";
import "@velocelab/memory";
import { ensureCompanionTables } from "./tables.js";
import { OneBotV11Adapter, parseOneBotEvent, type OneBotEvent } from "./onebot.js";
import { parseQQOfficialEvent, QQOfficialAdapter, QQOfficialGateway } from "./qq-official.js";

export const depend = ["database", "dashboard", "advanced-chat", "file", "memory"];
export const provide = ["companion"];

type Row = Record<string, any>;
const activeRuns = new Map<string, AbortController>();
const pendingRuns = new Map<string, Promise<void>>();
const now = () => new Date().toISOString();
const QQ_API_BASE_URL = "https://api.bot.qq.com";
const object = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const parseList = (value: unknown): string[] => {
  try { const result = Array.isArray(value) ? value : JSON.parse(String(value ?? "[]")); return Array.isArray(result) ? result.map(String).map((item) => item.trim()).filter(Boolean) : []; }
  catch { return []; }
};
const parseObject = (value: unknown): Row => {
  try { const result = typeof value === "string" ? JSON.parse(value || "{}") : value; return result && typeof result === "object" && !Array.isArray(result) ? result as Row : {}; }
  catch { return {}; }
};
const idFor = (integrationID: number, personaID: string, scope: string) => `companion-${integrationID}-${personaID}-${createHash("sha1").update(scope).digest("hex").slice(0, 28)}`;

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  const normalized = address.toLowerCase();
  return !normalized.startsWith("::1") && !normalized.startsWith("fc") && !normalized.startsWith("fd") && !normalized.startsWith("fe80:") && !normalized.startsWith("::ffff:127.") && !normalized.startsWith("::ffff:10.") && !normalized.startsWith("::ffff:192.168.");
}
async function publicURL(value: string, trustedOrigin = "") {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (trustedOrigin) {
    try { if (url.origin === new URL(trustedOrigin).origin) return true; } catch {}
  }
  if (["localhost", "localhost.localdomain"].includes(host) || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return isPublicAddress(host);
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => isPublicAddress(record.address));
  } catch { return false; }
}

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  const chat = ctx.component["advanced-chat"] as any;
  const files = ctx.component.file as { write(name: string, data: string | Uint8Array): Promise<void>; remove(name: string): Promise<void> };
  await ensureCompanionTables(db);
  const gateways = new Map<number, QQOfficialGateway>();
  let handleEvent: (integration: Row, raw: unknown) => Promise<void> = async () => undefined;
  const stopGateway = (id: number) => { gateways.get(id)?.stop(); gateways.delete(id); };
  const startGateway = (integration: Row) => {
    const id = Number(integration.id); stopGateway(id);
    if (integration.provider !== "qq_official" || !integration.enabled || !integration.app_id || !integration.app_secret) return;
    const adapter = new QQOfficialAdapter(String(integration.app_id), String(integration.app_secret), QQ_API_BASE_URL);
    const gateway = new QQOfficialGateway(adapter, async (eventName, eventData) => {
      const current = await db.selectOne("companion_integrations", { id, user_id: Number(integration.user_id) }) as Row | undefined;
      if (current) await handleEvent(current, { provider: "qq_official", eventName, eventData });
    }, `${integration.id}/${integration.name}`);
    gateways.set(id, gateway); gateway.start();
  };
  ctx.i18n({ companion: { title: { zh: "聊天陪伴", en: "Chat companions", ja: "チャットコンパニオン" } } });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/companion.js", import.meta.url).pathname, plugin: "companion" });
  ctx.registerComponent("companion", { provider: "onebot_v11", sessionID: idFor });
  const currentUser = (session: Session) => (session.properties.user as { id?: number } | undefined)?.id;
  const body = async (session: Session) => object(await session.parseRequestBody());
  const ownedIntegration = (userID: number, id: string | number) => db.selectOne("companion_integrations", { id: Number(id), user_id: userID });
  const safeIntegration = (row: Row) => {
    const { access_token: _token, app_secret: _secret, webhook_secret: _webhookSecret, ...rest } = row;
    return { ...rest, has_access_token: Boolean(row.access_token), has_app_secret: Boolean(row.app_secret), webhook_url: row.provider === "onebot_v11" ? `/api/companion/onebot/${row.id}/${row.webhook_secret}` : "" };
  };
  const safePersona = (row: Row) => ({ id: row.id, integration_id: row.integration_id, name: row.name, assistant_agent_id: row.assistant_agent_id, base_agent_id: row.base_agent_id, enabled: row.enabled, created_at: row.created_at, updated_at: row.updated_at });
  const removeSticker = async (sticker: Row) => {
    const fileID = String(sticker.file_id ?? "");
    if (fileID) {
      const file: any = await db.selectOne("advanced_chat_files", { id: fileID, user_id: Number(sticker.user_id) });
      if (file?.storage_path) await files.remove(String(file.storage_path)).catch(() => undefined);
      await db.remove("advanced_chat_files", { id: fileID, user_id: Number(sticker.user_id) });
    }
    await db.remove("companion_stickers", { id: sticker.id, user_id: Number(sticker.user_id) });
  };

  ctx.route("/api/user/companions").methods("GET").action(async (session) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const [integrations, personas] = await Promise.all([db.select("companion_integrations", { user_id: userID }), db.select("companion_personas", { user_id: userID })]);
    session.respond({ integrations: integrations.map(safeIntegration), personas: personas.map(safePersona) }, "json");
  });
  ctx.route("/api/user/companions").methods("POST").action(async (session) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const input = await body(session);
    const provider = input.provider === "qq_official" ? "qq_official" : "onebot_v11";
    const name = String(input.name ?? (provider === "qq_official" ? "QQ 官方机器人" : "OneBot 机器人")).trim().slice(0, 100);
    const baseURL = provider === "qq_official" ? QQ_API_BASE_URL : String(input.base_url ?? "").trim().replace(/\/+$/, "");
    if (!name || !/^https?:\/\//i.test(baseURL) || (provider === "onebot_v11" && !baseURL)) { session.status = 400; session.respond({ error: "名称和有效的接入 API 地址为必填项" }, "json"); return; }
    const row = await db.create("companion_integrations", {
      user_id: userID, name, provider, base_url: baseURL, access_token: String(input.access_token ?? ""),
      app_id: String(input.app_id ?? ""), app_secret: String(input.app_secret ?? ""),
      webhook_secret: randomUUID().replaceAll("-", ""), enabled: true,
      default_persona_id: "", session_mode: "per_chat", allow_image_input: true, allow_image_output: true,
      typing_delay_ms: 500, multiple_messages: true, max_messages: 3, interrupt_mode: "stop",
      allowed_user_ids: "[]", blocked_user_ids: "[]", allowed_group_ids: "[]", blocked_group_ids: "[]", group_personas: "{}", created_at: now(), updated_at: now(),
    } as any);
    if (provider === "qq_official") startGateway(row as Row);
    session.status = 201; session.respond(safeIntegration(row), "json");
  });
  ctx.route("/api/user/companions/:id").methods("PUT").action(async (session, _params, id) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const existing: any = await ownedIntegration(userID, id); if (!existing) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    const input = await body(session); const updates: Row = { updated_at: now() };
    if (input.session_mode !== undefined && !["unified", "per_chat"].includes(String(input.session_mode))) { session.status = 400; session.respond({ error: "Invalid session mode" }, "json"); return; }
    if (input.interrupt_mode !== undefined && !["stop", "queue", "ignore"].includes(String(input.interrupt_mode))) { session.status = 400; session.respond({ error: "Invalid interruption mode" }, "json"); return; }
    for (const key of ["name", "session_mode", "interrupt_mode"]) if (input[key] !== undefined) updates[key] = String(input[key]).trim();
    if (existing.provider === "onebot_v11" && input.base_url !== undefined) updates.base_url = String(input.base_url).trim();
    if (input.access_token !== undefined) updates.access_token = String(input.access_token);
    if (input.app_id !== undefined) updates.app_id = String(input.app_id).trim();
    if (input.app_secret !== undefined && String(input.app_secret)) updates.app_secret = String(input.app_secret);
    for (const key of ["enabled", "allow_image_input", "allow_image_output", "multiple_messages"]) if (typeof input[key] === "boolean") updates[key] = input[key];
    if (input.default_persona_id !== undefined) updates.default_persona_id = String(input.default_persona_id ?? "");
    if (input.typing_delay_ms !== undefined) updates.typing_delay_ms = Math.max(0, Math.min(10000, Number(input.typing_delay_ms) || 0));
    if (input.max_messages !== undefined) updates.max_messages = Math.max(1, Math.min(10, Number(input.max_messages) || 1));
    for (const key of ["allowed_user_ids", "blocked_user_ids", "allowed_group_ids", "blocked_group_ids"]) if (input[key] !== undefined) updates[key] = JSON.stringify(parseList(input[key]));
    if (updates.default_persona_id) {
      const defaultPersona: any = await db.selectOne("companion_personas", { id: updates.default_persona_id, integration_id: Number(id), user_id: userID });
      if (!defaultPersona) { session.status = 400; session.respond({ error: "默认人格必须属于当前陪伴接入" }, "json"); return; }
    }
    if (input.group_personas !== undefined) {
      const mapping = parseObject(input.group_personas);
      const validPersonas = await db.select("companion_personas", { integration_id: Number(id), user_id: userID });
      const validIDs = new Set((validPersonas as Row[]).map((persona) => String(persona.id)));
      if (Object.values(mapping).some((personaID) => !validIDs.has(String(personaID)))) { session.status = 400; session.respond({ error: "群人格映射包含未知人格" }, "json"); return; }
      updates.group_personas = JSON.stringify(mapping);
    }
    if (updates.base_url && !/^https?:\/\//i.test(updates.base_url)) { session.status = 400; session.respond({ error: "接入 API 地址必须使用 http(s)" }, "json"); return; }
    await db.update("companion_integrations", { id: Number(id), user_id: userID }, updates);
    const updated = await ownedIntegration(userID, id); startGateway(updated as Row); session.respond(safeIntegration(updated as Row), "json");
  });
  ctx.route("/api/user/companions/:id").methods("DELETE").action(async (session, _params, id) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const integration: any = await ownedIntegration(userID, id); if (!integration) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    stopGateway(Number(id));
    const personas = await db.select("companion_personas", { integration_id: Number(id), user_id: userID });
    for (const persona of personas as Row[]) {
      await db.remove("companion_personas", { id: persona.id, user_id: userID });
      if (persona.assistant_agent_id) await chat.deleteAgent(userID, String(persona.assistant_agent_id)).catch(() => undefined);
    }
    await db.remove("companion_messages", { integration_id: Number(id), user_id: userID });
    for (const sticker of await db.select("companion_stickers", { integration_id: Number(id), user_id: userID }) as Row[]) await removeSticker(sticker);
    await db.remove("companion_integrations", { id: Number(id), user_id: userID });
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/user/companions/:id/test").methods("POST").action(async (session, _params, id) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const integration: any = await ownedIntegration(userID, id); if (!integration) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    try {
      const result = integration.provider === "qq_official"
        ? await new QQOfficialAdapter(String(integration.app_id ?? ""), String(integration.app_secret ?? ""), QQ_API_BASE_URL).ping()
        : await new OneBotV11Adapter(String(integration.base_url), String(integration.access_token ?? "")).ping();
      session.respond({ success: true, bot: result.data ?? result }, "json");
    }
    catch (error) { session.status = 502; session.respond({ success: false, error: error instanceof Error ? error.message : String(error) }, "json"); }
  });

  ctx.route("/api/user/companions/:id/personas").methods("POST").action(async (session, _params, integrationID) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const integration: any = await ownedIntegration(userID, integrationID); if (!integration) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    const input = await body(session); const baseAgentID = String(input.base_agent_id ?? ""); const name = String(input.name ?? "").trim().slice(0, 100);
    const agents = await chat.listAgents(userID) as Row[]; const base: any = agents.find((item) => String(item.stable_id ?? item.id) === baseAgentID || String(item.id) === baseAgentID);
    if (!name || !base?.default_model) { session.status = 400; session.respond({ error: "名称和一个已配置模型的现有助理为必填项" }, "json"); return; }
    const agent = await chat.createAgent(userID, {
      name: `[陪伴] ${name}`, prompt: String(input.prompt ?? base.prompt ?? "").trim() || String(base.prompt ?? ""),
      defaultModel: String(base.default_model), userChannelId: Number(base.user_channel_id) || undefined,
      stream: false, skillIds: parseList(base.skill_ids), mcpServerIds: parseList(base.mcp_server_ids),
    });
    const personaID = randomUUID(); const timestamp = now();
    const row = await db.create("companion_personas", { id: personaID, user_id: userID, integration_id: Number(integrationID), name, assistant_agent_id: String(agent.stable_id ?? agent.id), base_agent_id: baseAgentID, enabled: true, created_at: timestamp, updated_at: timestamp } as any);
    if (!integration.default_persona_id) await db.update("companion_integrations", { id: Number(integrationID), user_id: userID }, { default_persona_id: personaID, updated_at: timestamp });
    session.status = 201; session.respond(safePersona(row), "json");
  });
  ctx.route("/api/user/companions/:id/personas/:persona_id").methods("PUT").action(async (session, _params, integrationID, personaID) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const integration: any = await ownedIntegration(userID, integrationID); const persona: any = await db.selectOne("companion_personas", { id: personaID, integration_id: Number(integrationID), user_id: userID });
    if (!integration || !persona) { session.status = 404; session.respond({ error: "人格不存在" }, "json"); return; }
    const input = await body(session); const agentRows = await chat.listAgents(userID) as Row[]; const agent: any = agentRows.find((item) => String(item.stable_id ?? item.id) === String(persona.assistant_agent_id));
    if (!agent) { session.status = 409; session.respond({ error: "关联助理已不存在" }, "json"); return; }
    const name = String(input.name ?? persona.name).trim().slice(0, 100); const prompt = String(input.prompt ?? agent.prompt ?? "").trim();
    await chat.updateAgent(userID, String(persona.assistant_agent_id), { name: `[陪伴] ${name}`, prompt, defaultModel: String(agent.default_model), userChannelId: Number(agent.user_channel_id) || undefined, stream: false, skillIds: parseList(agent.skill_ids), mcpServerIds: parseList(agent.mcp_server_ids) });
    await db.update("companion_personas", { id: personaID, integration_id: Number(integrationID), user_id: userID }, { name, updated_at: now() });
    session.respond(safePersona(await db.selectOne("companion_personas", { id: personaID, user_id: userID }) as Row), "json");
  });
  ctx.route("/api/user/companions/:id/personas/:persona_id").methods("DELETE").action(async (session, _params, integrationID, personaID) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const persona: any = await db.selectOne("companion_personas", { id: personaID, integration_id: Number(integrationID), user_id: userID });
    if (!persona) { session.status = 404; session.respond({ error: "人格不存在" }, "json"); return; }
    await db.remove("companion_personas", { id: personaID, user_id: userID });
    await chat.deleteAgent(userID, String(persona.assistant_agent_id)).catch(() => undefined);
    const integration: any = await ownedIntegration(userID, integrationID);
    if (integration?.default_persona_id === personaID) {
      const next: any = (await db.select("companion_personas", { integration_id: Number(integrationID), user_id: userID })).find((item: any) => item.enabled);
      await db.update("companion_integrations", { id: Number(integrationID), user_id: userID }, { default_persona_id: next?.id ?? "", updated_at: now() });
    }
    session.respond({ success: true }, "json");
  });

  ctx.route("/api/user/companions/:id/stickers").methods("GET").action(async (session, params, id) => {
    const userID = currentUser(session); if (userID === undefined) return;
    if (!await ownedIntegration(userID, id)) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    const rows = await db.select("companion_stickers", { integration_id: Number(id), user_id: userID });
    session.respond(rows.slice(-500).reverse(), "json");
  });
  ctx.route("/api/user/companions/:id/stickers/:sticker_id").methods("DELETE").action(async (session, _params, id, stickerID) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const sticker: any = await db.selectOne("companion_stickers", { id: stickerID, integration_id: Number(id), user_id: userID });
    if (!sticker) { session.status = 404; session.respond({ success: false }, "json"); return; }
    await removeSticker(sticker);
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/user/companions/:id/stickers/:sticker_id").methods("PUT").action(async (session, _params, id, stickerID) => {
    const userID = currentUser(session); if (userID === undefined) return;
    const sticker: any = await db.selectOne("companion_stickers", { id: stickerID, integration_id: Number(id), user_id: userID });
    if (!sticker) { session.status = 404; session.respond({ error: "表情包不存在" }, "json"); return; }
    const input = await body(session);
    const category = String(input.category ?? sticker.category).trim().slice(0, 80) || "misc";
    const name = String(input.name ?? sticker.name ?? "").trim().slice(0, 80);
    if (category.includes("/") || name.includes("/")) { session.status = 400; session.respond({ error: "分类和名称不能包含 / 字符" }, "json"); return; }
    if (category !== "inbox" && !name) { session.status = 400; session.respond({ error: "已保存的表情包必须填写名称" }, "json"); return; }
    const siblings = await db.select("companion_stickers", { integration_id: Number(id), user_id: userID }) as Row[];
    if (name && siblings.some((item) => String(item.id) !== String(stickerID) && String(item.category).toLocaleLowerCase() === category.toLocaleLowerCase() && String(item.name ?? "").toLocaleLowerCase() === name.toLocaleLowerCase())) { session.status = 409; session.respond({ error: "同一分类下已存在这个表情包名称" }, "json"); return; }
    await db.update("companion_stickers", { id: stickerID, user_id: userID }, { category, name, description: String(input.description ?? sticker.description).trim().slice(0, 300), updated_at: now() });
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/user/companions/:id/logs").methods("GET").action(async (session, params, id) => {
    const userID = currentUser(session); if (userID === undefined) return;
    if (!await ownedIntegration(userID, id)) { session.status = 404; session.respond({ error: "陪伴通道不存在" }, "json"); return; }
    const rows = await db.select("companion_messages", { integration_id: Number(id), user_id: userID });
    session.respond(rows.slice(-Math.min(200, Math.max(1, Number(params.get("limit") ?? 50) || 50))).reverse(), "json");
  });

  chat.registerTool({
    name: "companion_sticker_save",
    description: "Save an interesting received image as a reusable sticker. Always assign both a short category and a distinct human-readable name within that category, plus a brief description.",
    parameters: { type: "object", properties: { sticker_id: { type: "string", description: "The candidate sticker id included in the incoming message" }, category: { type: "string", description: "Short group such as reaction, cute, celebration, or meme" }, name: { type: "string", description: "A distinct, descriptive sticker name within this category" }, description: { type: "string" } }, required: ["sticker_id", "category", "name"] },
    execute: async (input, context) => {
      const value = input as Row; const stickerID = String(value.sticker_id ?? "");
      const persona = await db.selectOne("companion_personas", { user_id: context.userId, assistant_agent_id: String(context.agentId ?? "") });
      if (!persona) throw Error("This tool is available only to companion personas");
      const sticker: any = await db.selectOne("companion_stickers", { id: stickerID, user_id: context.userId, integration_id: Number((persona as Row).integration_id) });
      if (!sticker) throw Error("Sticker candidate was not found");
      const category = String(value.category ?? "misc").trim().slice(0, 80) || "misc";
      const name = String(value.name ?? "").trim().slice(0, 80);
      if (!name || category === "inbox" || category.includes("/") || name.includes("/")) throw Error("Provide a non-inbox category and a sticker name; neither may contain /");
      const siblings = await db.select("companion_stickers", { integration_id: Number((persona as Row).integration_id), user_id: Number(context.userId) }) as Row[];
      if (siblings.some((item) => item.id !== stickerID && String(item.category).toLocaleLowerCase() === category.toLocaleLowerCase() && String(item.name ?? "").toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error("That sticker name already exists in this category; choose a unique name");
      await db.update("companion_stickers", { id: stickerID, user_id: context.userId }, { category, name, description: String(value.description ?? "").trim().slice(0, 300), updated_at: now() });
      return { saved: true, category, name };
    },
  });
  chat.registerTool({
    name: "companion_sticker_list",
    description: "List saved reusable stickers with their categories and names. Use companion_sticker_find to resolve the exact item before outputting [[sticker:category/name]].",
    parameters: { type: "object", properties: {} },
    execute: async (_input, context) => {
      const persona = await db.selectOne("companion_personas", { user_id: context.userId, assistant_agent_id: String(context.agentId ?? "") });
      if (!persona) throw Error("This tool is available only to companion personas");
      return (await db.select("companion_stickers", { user_id: context.userId, integration_id: Number((persona as Row).integration_id) })).filter((item: any) => String(item.category) !== "inbox" && String(item.name ?? "").trim()).map((item: any) => ({ id: item.id, category: item.category, name: item.name, description: item.description }));
    },
  });
  chat.registerTool({
    name: "companion_sticker_find",
    description: "Find one saved sticker by exact category and exact name. Always call this before emitting the sticker marker.",
    parameters: { type: "object", properties: { category: { type: "string" }, name: { type: "string" } }, required: ["category", "name"] },
    execute: async (input, context) => {
      const value = input as Row;
      const persona = await db.selectOne("companion_personas", { user_id: context.userId, assistant_agent_id: String(context.agentId ?? "") });
      if (!persona) throw Error("This tool is available only to companion personas");
      const rows = await db.select("companion_stickers", { user_id: context.userId, integration_id: Number((persona as Row).integration_id) }) as Row[];
      const sticker = rows.find((item) => String(item.category).toLocaleLowerCase() === String(value.category ?? "").trim().toLocaleLowerCase() && String(item.name ?? "").toLocaleLowerCase() === String(value.name ?? "").trim().toLocaleLowerCase());
      if (!sticker || String(sticker.category) === "inbox") throw Error("No sticker matches that category and name");
      return { sticker_id: sticker.id, category: sticker.category, name: sticker.name, description: sticker.description, send_marker: `[[sticker:${sticker.category}/${sticker.name}]]` };
    },
  });

  const log = async (integration: Row, personaID: string, event: Row, direction: string, status: string, content: string, error = "") => {
    await db.create("companion_messages", { user_id: Number(integration.user_id), integration_id: Number(integration.id), persona_id: personaID, external_chat_id: event.groupId || event.userId || "", external_user_id: event.userId || "", external_message_id: event.messageId || "", direction, status, content: content.slice(0, 20000), error: error.slice(0, 3000), created_at: now() } as any);
  };
  const putImageFile = async (userID: number, integration: Row, event: Row, urlValue: string, fileName: string) => {
    const trustedOrigin = String(integration.base_url);
    if (!urlValue || !await publicURL(urlValue, trustedOrigin)) return undefined;
    const response = await fetch(urlValue, { signal: AbortSignal.timeout(9000), redirect: "error", headers: { Accept: "image/*" } });
    if (!response.ok || !String(response.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) return undefined;
    const reader = response.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 10 * 1024 * 1024) { await reader.cancel(); return undefined; }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    if (!data.length) return undefined;
    const mime = String(response.headers.get("content-type") ?? "image/jpeg").split(";", 1)[0].toLowerCase();
    const fileID = `acf-${randomUUID()}`; const storage = `advanced-chat/files/${userID}/${fileID}/${fileName.replace(/[^\w.-]/g, "_").slice(0, 120) || "onebot-image"}`;
    await files.write(storage, data);
    await db.create("advanced_chat_files", { id: fileID, user_id: userID, name: fileName.slice(0, 200) || "onebot-image", mime_type: mime, size: data.length, storage_path: storage, text_extract: "", hash: createHash("sha256").update(data).digest("hex"), source: "companion", source_key: `companion:${integration.id}:${event.messageId}:${fileID}`, created_at: now(), updated_at: now() } as any);
    return fileID;
  };
  type ReplyPart = { type: "text"; text: string } | { type: "sticker"; sticker: Row };
  const resolveReply = async (text: string, integration: Row, allowImages: boolean): Promise<ReplyPart[]> => {
    const cleanText = text.replace(/\[CQ:image,[^\]]*\]/gi, "");
    const saved = await db.select("companion_stickers", { integration_id: Number(integration.id), user_id: Number(integration.user_id) }) as Row[];
    const parts: ReplyPart[] = [];
    const marker = /\[\[sticker:([^/\]]+)\/([^\]]+)\]\]/gi;
    let cursor = 0;
    for (const match of cleanText.matchAll(marker)) {
      const start = match.index ?? 0;
      if (start > cursor) parts.push({ type: "text", text: cleanText.slice(cursor, start) });
      if (allowImages) {
        const category = String(match[1] ?? "").trim(); const name = String(match[2] ?? "").trim();
        const sticker = saved.find((item) => String(item.category).toLocaleLowerCase() === category.toLocaleLowerCase() && String(item.name ?? "").toLocaleLowerCase() === name.toLocaleLowerCase() && String(item.category) !== "inbox");
        if (sticker) parts.push({ type: "sticker", sticker });
      }
      cursor = start + match[0].length;
    }
    if (cursor < cleanText.length) parts.push({ type: "text", text: cleanText.slice(cursor) });
    for (const part of parts) if (part.type === "text") part.text = part.text.replace(/\[\[sticker:[^\]]+\]\]/gi, "");
    return parts;
  };
  const sendReply = async (event: OneBotEvent, integration: Row, parts: ReplyPart[], startSequence = 1) => {
    if (event.provider === "onebot_v11") {
      const message = parts.map((part) => part.type === "text" ? part.text : `[CQ:image,file=${String(part.sticker.image_url).replace(/[,\[\]]/g, encodeURIComponent)}]`).join("").trim();
      if (message) await new OneBotV11Adapter(String(integration.base_url), String(integration.access_token ?? "")).send(event, message);
      return { content: message, nextSequence: startSequence };
    }
    const adapter = new QQOfficialAdapter(String(integration.app_id ?? ""), String(integration.app_secret ?? ""), QQ_API_BASE_URL);
    let msgSeq = startSequence; let sent = 0;
    const emitted: string[] = [];
    const replyLimit = event.messageType === "group" ? 5 : 4;
    for (const part of parts) {
      if (sent >= replyLimit || msgSeq > replyLimit) break;
      if (part.type === "text") {
        const text = part.text.trim(); if (!text) continue;
        await adapter.sendText(event, text, msgSeq++); sent++; emitted.push(text);
      } else if (part.sticker.image_url) {
        await adapter.sendImage(event, String(part.sticker.image_url), msgSeq++, `${String(part.sticker.name || "sticker")}.jpg`); sent++; emitted.push(`[[sticker:${part.sticker.category}/${part.sticker.name}]]`);
      }
    }
    return { content: emitted.join(" ").trim(), nextSequence: msgSeq };
  };
  const allowed = (integration: Row, event: Row) => {
    const allowsUsers = parseList(integration.allowed_user_ids); const blocksUsers = parseList(integration.blocked_user_ids);
    const allowsGroups = parseList(integration.allowed_group_ids); const blocksGroups = parseList(integration.blocked_group_ids);
    if (blocksUsers.includes(String(event.userId))) return false;
    if (allowsUsers.length && !allowsUsers.includes(String(event.userId))) return false;
    if (event.groupId) {
      if (blocksGroups.includes(String(event.groupId))) return false;
      if (allowsGroups.length && !allowsGroups.includes(String(event.groupId))) return false;
    }
    return true;
  };
  const runEvent = async (integration: Row, event: OneBotEvent, sessionID: string, persona: Row, signal: AbortSignal) => {
    const personaAgent: any = (await chat.listAgents(Number(integration.user_id)) as Row[]).find((item) => String(item.stable_id ?? item.id) === String(persona.assistant_agent_id));
    if (!personaAgent?.default_model) throw Error("陪伴人格关联的助理没有可用模型");
    const contentParts = [String(event.text ?? "")];
    if (integration.allow_image_input) {
      for (const [index, image] of (event.images as Array<{ url: string; file: string }>).entries()) {
        let imageURL = image.url;
        if (!imageURL && image.file) {
          try { const result = await fetch(`${String(integration.base_url).replace(/\/+$/, "")}/get_image`, { method: "POST", headers: { "Content-Type": "application/json", ...(integration.access_token ? { Authorization: `Bearer ${integration.access_token}` } : {}) }, body: JSON.stringify({ file: image.file }), signal: AbortSignal.timeout(7000) }); const body = await result.json() as Row; imageURL = String(body.data?.url ?? ""); } catch { imageURL = ""; }
        }
        const stickerID = randomUUID();
        if (!imageURL || !await publicURL(imageURL, String(integration.base_url))) continue;
        const fileID = await putImageFile(Number(integration.user_id), integration, event, imageURL, `${event.provider}-${event.messageId}-${index}.image`).catch(() => undefined);
        const stamp = now();
        await db.create("companion_stickers", { id: stickerID, user_id: Number(integration.user_id), integration_id: Number(integration.id), external_chat_id: String(event.groupId || event.userId), image_url: imageURL, file_id: fileID ?? "", category: "inbox", name: "", description: "", created_at: stamp, updated_at: stamp } as any);
        contentParts.push(`[收到一张图片候选表情包 sticker_id=${stickerID}${fileID ? ` file_id=${fileID}` : ""}。如果它具有可重复使用的情绪表达或梗图价值，可调用 companion_sticker_save 自行分类保存。]`);
      }
    }
    if (event.images?.length && !integration.allow_image_input) contentParts.push("[已忽略图片内容：此陪伴已关闭图片输入]");
    const saved = await db.select("companion_stickers", { integration_id: Number(integration.id), user_id: Number(integration.user_id) });
    const stickers = saved.filter((item: any) => String(item.category) !== "inbox" && String(item.name ?? "").trim());
    const stickerLabels = stickers.map((item: any) => `${item.category}/${item.name}${item.description ? `（${item.description}）` : ""}`);
    const stickerGuide = `\n\n陪伴通道输出约定：可调用 companion_sticker_save 对有复用价值的收到图片进行分类保存；保存时必须填写分类和该分类内唯一的表情包名称。调用 companion_sticker_list 查看完整目录，发送前必须用 companion_sticker_find 按分类和名称精确检索；只在回复中写它返回的 [[sticker:分类/名称]] 标记，系统会按两者精确发送，不可只写分类或猜测名称。当前目录：${stickerLabels.join("、") || "暂无"}。如果适合拆成多条消息，请用单独一行 --- 分隔；只在合适时使用，不要向用户暴露内部工具或候选 ID。`;
    const answer = await chat.complete(Number(integration.user_id), {
      sessionId: sessionID, visible: false, title: `陪伴 · ${String(persona.name)}`,
      model: String(personaAgent.default_model), userChannelId: Number(personaAgent.user_channel_id) || undefined,
      agentId: String(persona.assistant_agent_id), mode: "assistant", stream: false,
      messages: [{ role: "system", content: stickerGuide }, { role: "user", content: contentParts.filter(Boolean).join("\n") || "（收到空消息）" }],
    }, { signal });
    const result = String(answer.message?.content ?? "").trim();
    if (!result) return;
    const split = integration.multiple_messages ? result.split(/\n\s*---\s*\n/g).map((value) => value.trim()).filter(Boolean).slice(0, Math.max(1, Number(integration.max_messages) || 3)) : [result];
    const chunks = split.length ? split : [result]; let nextMessageSequence = 1;
    for (let index = 0; index < chunks.length; index++) {
      if (signal.aborted) break;
      const parts = await resolveReply(chunks[index], integration, Boolean(integration.allow_image_output));
      if (!parts.length || !parts.some((part) => part.type === "sticker" || part.text.trim())) continue;
      if (Number(integration.typing_delay_ms) > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(10000, Number(integration.typing_delay_ms))));
      const sent = await sendReply(event, integration, parts, nextMessageSequence);
      nextMessageSequence = sent.nextSequence;
      if (sent.content) await log(integration, String(persona.id), event, "outbound", "sent", sent.content);
    }
  };
  handleEvent = async (integration: Row, raw: unknown) => {
    const payload = object(raw);
    const event = payload.provider === "qq_official"
      ? parseQQOfficialEvent(String(payload.eventName ?? ""), payload.eventData)
      : parseOneBotEvent(raw);
    if (!event || event.provider !== integration.provider || (event.selfId && String(payload.self_id) === event.userId) || !allowed(integration, event)) return;
    if (event.messageId) {
      const duplicate: any = await db.selectOne("companion_messages", { integration_id: Number(integration.id), external_message_id: event.messageId, direction: "inbound" });
      if (duplicate) return;
    }
    const personaRows = await db.select("companion_personas", { integration_id: Number(integration.id), user_id: Number(integration.user_id) }) as Row[];
    const groupOverrides = parseObject(integration.group_personas);
    const personaID = String((event.groupId && groupOverrides[event.groupId]) || integration.default_persona_id || "");
    const persona: any = personaRows.find((item) => item.id === personaID && item.enabled) ?? personaRows.find((item) => item.enabled);
    if (!persona || !integration.enabled) return;
    const scope = integration.session_mode === "unified" ? "unified" : event.groupId ? `group:${event.groupId}` : `private:${event.userId}`;
    const sessionID = idFor(Number(integration.id), String(persona.id), scope);
    await log(integration, String(persona.id), event, "inbound", "received", event.text);
    const previous = activeRuns.get(sessionID); const mode = String(integration.interrupt_mode ?? "stop");
    if (previous && mode === "ignore") return;
    if (previous && mode === "stop") previous.abort();
    const execute = async () => {
      const controller = new AbortController(); activeRuns.set(sessionID, controller);
      try { await runEvent(integration, event, sessionID, persona, controller.signal); }
      catch (error) { const text = error instanceof Error ? error.message : String(error); await log(integration, String(persona.id), event, "system", "error", "", text); }
      finally { if (activeRuns.get(sessionID) === controller) activeRuns.delete(sessionID); }
    };
    if (mode === "queue") {
      const prior = pendingRuns.get(sessionID) ?? Promise.resolve();
      const next = prior.then(execute, execute); pendingRuns.set(sessionID, next);
      void next.finally(() => { if (pendingRuns.get(sessionID) === next) pendingRuns.delete(sessionID); });
    } else await execute();
  };
  ctx.route("/api/companion/onebot/:id/:secret").methods("POST").action(async (session, _params, id, secret) => {
    const integration: any = await db.selectOne("companion_integrations", { id: Number(id), webhook_secret: String(secret) });
    if (!integration || !integration.enabled) { session.status = 404; session.respond({ error: "Not found" }, "json"); return; }
    const input = await body(session);
    session.respond({ status: "ok", retcode: 0, data: {} }, "json");
    void handleEvent(integration, input).catch((error) => console.error("OneBot companion event failed", error));
  });
  const integrations = await db.select("companion_integrations", {}) as Row[];
  for (const integration of integrations) startGateway(integration);
  ctx.affect(() => { for (const gateway of gateways.values()) gateway.stop(); gateways.clear(); });
}
