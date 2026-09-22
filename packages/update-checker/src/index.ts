import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["database", "dashboard"];
export const provide = ["update-checker"];
export interface UpdateCheckerConfig { apiBaseUrl: string; requestTimeoutMs: string }
export const config: Schema<UpdateCheckerConfig> = Schema.object({
  apiBaseUrl: Schema.string("Plugin market API base URL").key("update-checker.config.apiBaseUrl").default("https://veloce-community.flweb.cn/api/v1"),
  requestTimeoutMs: Schema.string("Update check timeout milliseconds").key("update-checker.config.requestTimeoutMs").default("20000"),
});
type Pin = { id?: number; user_id: number; plugin_name: string; version: string; updated_at: string };
declare module "@yumerijs/types" { interface Tables { user_plugin_version_pins: Pin } }
const resolve = createRequire(import.meta.url).resolve;
function user(session: Session) { return (session.properties.user as { id?: number } | undefined)?.id }
function base(raw: string) { const value = new URL(raw); if (!/^https?:$/.test(value.protocol)) throw Error("Plugin market API must use HTTP(S)"); return value.toString().replace(/\/$/, "") }
function allowedPackage(name: string) { return /^@velocelab\/[a-z0-9-]+$/.test(name) }
async function installedVersion(name: string) { if (!allowedPackage(name)) return ""; try { const file = resolve(`${name}/package.json`); const parsed = JSON.parse(await readFile(file, "utf8")); return String(parsed.version ?? ""); } catch { return "" } }
async function market(cfg: UpdateCheckerConfig) { const response = await fetch(`${base(cfg.apiBaseUrl)}/plugins?limit=200`, { signal: AbortSignal.timeout(Math.max(1000, Number(cfg.requestTimeoutMs) || 20000)), headers: { accept: "application/json" } }); if (!response.ok) throw Error(`Plugin market returned HTTP ${response.status}`); return await response.json() as any }
function versions(item: any) { const values = item.versions ?? item.releases ?? item.available_versions ?? []; const list = Array.isArray(values) ? values.map((value: any) => typeof value === "string" ? value : value.version ?? value.tag_name).filter(Boolean) : []; const latest = item.latest_version ?? item.version; if (latest && !list.includes(latest)) list.unshift(String(latest)); return [...new Set(list.map(String))] }
export async function apply(ctx: Context, cfg: UpdateCheckerConfig) {
  const db = ctx.component.database as Database;
  await db.extend("user_plugin_version_pins", { id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, plugin_name: { type: "string", nullable: false }, version: { type: "string", nullable: false }, updated_at: "timestamp" }, { unique: [["user_id", "plugin_name"]] });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/update-checker.js", import.meta.url).pathname, plugin: "update-checker" });
  ctx.route("/api/user/update-checker/check").methods("POST").action(async (session: Session) => { const userId = user(session); if (userId === undefined) return; const body = await session.parseRequestBody() as any; const names: string[] = (Array.isArray(body?.names) ? body.names : []).map((value: unknown) => String(value)).filter(allowedPackage).slice(0, 200); const pins: any[] = await db.select("user_plugin_version_pins", { user_id: userId }); const pinMap = new Map(pins.map((pin) => [pin.plugin_name, pin.version])); let remote: any = { items: [] }; let marketAvailable = true; try { remote = await market(cfg); } catch { marketAvailable = false; } const items = Array.isArray(remote.items) ? remote.items : []; const byPackage = new Map(items.map((item: any) => [String(item.package_name ?? item.packageName ?? ""), item])); const plugins = await Promise.all(names.map(async (name) => { const currentVersion = await installedVersion(name); const item: any = byPackage.get(name); const availableVersion = item ? String(item.latest_version ?? item.version ?? "") : ""; return { name, currentVersion, availableVersion, versions: item ? versions(item) : [], fixedVersion: pinMap.get(name) || null, marketAvailable, marketMetadataAvailable: Boolean(item) }; })); session.respond({ plugins }, "json"); });
  ctx.route("/api/user/update-checker/pins").methods("POST").action(async (session: Session) => { const userId = user(session); if (userId === undefined) return; const body = await session.parseRequestBody() as any; const pins = body?.pins && typeof body.pins === "object" ? body.pins : {}; for (const [pluginName, version] of Object.entries(pins)) { const name = String(pluginName); const selected = String(version).slice(0, 100); if (!allowedPackage(name) || !selected) continue; const existing = await db.selectOne("user_plugin_version_pins", { user_id: userId, plugin_name: name }); if (existing) await db.update("user_plugin_version_pins", { user_id: userId, plugin_name: name }, { version: selected, updated_at: new Date().toISOString() }); else await db.create("user_plugin_version_pins", { user_id: userId, plugin_name: name, version: selected, updated_at: new Date().toISOString() } as any); } session.respond({ ok: true }, "json"); });
}
