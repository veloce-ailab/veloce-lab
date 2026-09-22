import { Context, Schema, Session } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["community"];

export interface CommunityConfig {
  apiBaseUrl: string;
  requestTimeoutMs: string;
  maxResponseBytes: string;
}

export const config: Schema<CommunityConfig> = Schema.object({
  apiBaseUrl: Schema.string("Community public API base URL").key("community.config.apiBaseUrl").default("https://veloce-community.flweb.cn/api/v1"),
  requestTimeoutMs: Schema.string("Community API request timeout milliseconds").key("community.config.requestTimeoutMs").default("12000"),
  maxResponseBytes: Schema.string("Maximum proxied community response bytes").key("community.config.maxResponseBytes").default("10485760"),
});

const publicRoutes = [
  "/categories",
  "/characters",
  "/characters/:id",
  "/knowledge-bases",
  "/knowledge-bases/:id",
  "/knowledge-bases/:id/content",
  "/skills",
  "/skills/:id",
] as const;

function apiBase(raw: string) {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw Error("Community API must use HTTP(S)");
  return url.toString().replace(/\/$/, "");
}

function safeID(value: unknown) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 120 || /[\\/\0]/.test(id)) throw Error("Invalid community resource id");
  return encodeURIComponent(id);
}

async function proxy(session: Session, cfg: CommunityConfig, route: string, query: URLSearchParams, id?: unknown) {
  const suffix = route.includes(":id") ? route.replace(":id", safeID(id)) : route;
  const target = new URL(`${apiBase(cfg.apiBaseUrl)}${suffix}`);
  // These resources are public and read-only. Preserve only query parameters,
  // never cookies or authorization headers from the current Veloce session.
  target.search = query.toString();
  const response = await fetch(target, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(Math.max(1000, Number(cfg.requestTimeoutMs) || 12000)),
  });
  if (!response.ok) {
    session.status = response.status === 404 ? 404 : 502;
    session.respond({ error: response.status === 404 ? "Community resource not found" : "Community API is temporarily unavailable" }, "json");
    return;
  }
  const maxBytes = Math.max(1024, Number(cfg.maxResponseBytes) || 10 << 20);
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    session.status = 502;
    session.respond({ error: "Community response is too large" }, "json");
    return;
  }
  try {
    session.respond(JSON.parse(new TextDecoder().decode(body)), "json");
  } catch {
    session.status = 502;
    session.respond({ error: "Community API returned invalid JSON" }, "json");
  }
}

export function apply(ctx: Context, cfg: CommunityConfig) {
  apiBase(cfg.apiBaseUrl);
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/community.js", import.meta.url).pathname,
    plugin: "community",
  });
  ctx.route("/api/community/categories").methods("GET").action((session: Session, query: URLSearchParams) => proxy(session, cfg, "/categories", query));
  ctx.route("/api/community/characters").methods("GET").action((session: Session, query: URLSearchParams) => proxy(session, cfg, "/characters", query));
  ctx.route("/api/community/characters/:id").methods("GET").action((session: Session, query: URLSearchParams, id: string) => proxy(session, cfg, "/characters/:id", query, id));
  ctx.route("/api/community/knowledge-bases").methods("GET").action((session: Session, query: URLSearchParams) => proxy(session, cfg, "/knowledge-bases", query));
  ctx.route("/api/community/knowledge-bases/:id").methods("GET").action((session: Session, query: URLSearchParams, id: string) => proxy(session, cfg, "/knowledge-bases/:id", query, id));
  ctx.route("/api/community/knowledge-bases/:id/content").methods("GET").action((session: Session, query: URLSearchParams, id: string) => proxy(session, cfg, "/knowledge-bases/:id/content", query, id));
  ctx.route("/api/community/skills").methods("GET").action((session: Session, query: URLSearchParams) => proxy(session, cfg, "/skills", query));
  ctx.route("/api/community/skills/:id").methods("GET").action((session: Session, query: URLSearchParams, id: string) => proxy(session, cfg, "/skills/:id", query, id));
}
