// Model list sync: pull a channel's upstream model list and import it.
//
// The channel page's "同步模型" dialog previews the upstream list and then
// applies the names the operator selected, so both steps live here. Ported from
// the Go implementation (`old/internal/service/sync.go` and `providers.go`),
// keeping the request/response shapes the React dialog already expects:
//
//   POST /api/models/sync/preview          { channel_id, format, path }
//   POST /api/models/sync/preview/browser  { channel_id, source, payload }
//   POST /api/models/sync/apply            { channel_id, models }
//
// Only the *model list* is synced here; prices are a separate concern.
import type { Database } from "yumeri";
import type { Model, ModelConfig } from "./types.js";

/** The fields of a channel row this module needs. */
export interface SyncChannel {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
}

export interface SyncPreviewItem {
  model_name: string;
  provider: string;
  provider_name: string;
  provider_icon_url: string;
  exists: boolean;
}

export interface SyncPreview {
  channel_id: number;
  channel_name: string;
  source: string;
  models: SyncPreviewItem[];
}

export interface SyncResult {
  channel_id: number;
  channel_name: string;
  source: string;
  created: number;
  updated: number;
  error?: string;
}

interface ModelProvider {
  id: string;
  name: string;
  iconURL: string;
}

/** Narrows a channel row to what syncing needs; a stored row always has an id. */
export function toSyncChannel(channel: { id?: number; name: string; base_url: string; api_key: string } | undefined): SyncChannel | undefined {
  if (!channel || channel.id === undefined) return undefined;
  return { id: channel.id, name: channel.name, base_url: channel.base_url, api_key: channel.api_key };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * A square monogram rendered as a data URI, for providers without a public
 * icon. Kept short: `provider_icon_url` is a VARCHAR(255) column.
 */
function monogramIcon(label: string, color: string): string {
  const fill = color.replace(/^#/, "");
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="%23${fill}" d="M0 0h1v1H0z"/><text x=".5" y=".65" fill="white" font-size=".4" text-anchor="middle">${label}</text></svg>`;
}

const ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons";

/** Kept in sync with the provider list the channel page renders. */
const modelProviderPresets: ModelProvider[] = [
  { id: "openai", name: "OpenAI", iconURL: `${ICONS}/openai.svg` },
  { id: "deepseek", name: "DeepSeek", iconURL: `${ICONS}/deepseek.svg` },
  { id: "anthropic", name: "Anthropic", iconURL: `${ICONS}/anthropic.svg` },
  { id: "google", name: "Google", iconURL: `${ICONS}/google.svg` },
  { id: "meta", name: "Meta", iconURL: `${ICONS}/meta.svg` },
  { id: "mistral", name: "Mistral AI", iconURL: `${ICONS}/mistralai.svg` },
  { id: "qwen", name: "Qwen", iconURL: `${ICONS}/alibabacloud.svg` },
  { id: "moonshot", name: "Moonshot AI", iconURL: "https://www.moonshot.cn/favicon.ico" },
  { id: "zhipu", name: "Zhipu AI", iconURL: "https://open.bigmodel.cn/favicon.ico" },
  { id: "xai", name: "xAI", iconURL: `${ICONS}/x.svg` },
  { id: "groq", name: "Groq", iconURL: `${ICONS}/groq.svg` },
  { id: "cohere", name: "Cohere", iconURL: `${ICONS}/cohere.svg` },
  { id: "perplexity", name: "Perplexity", iconURL: `${ICONS}/perplexity.svg` },
  { id: "minimax", name: "MiniMax", iconURL: "https://www.minimaxi.com/favicon.ico" },
  { id: "baichuan", name: "Baichuan AI", iconURL: "https://www.baichuan-ai.com/favicon.ico" },
  { id: "stepfun", name: "StepFun", iconURL: monogramIcon("SF", "#1D4ED8") },
  { id: "yi", name: "01.AI", iconURL: "https://www.01.ai/favicon.ico" },
  { id: "baidu", name: "Baidu", iconURL: `${ICONS}/baidu.svg` },
  { id: "tencent", name: "Tencent", iconURL: "https://cloud.tencent.com/favicon.ico" },
  { id: "doubao", name: "Doubao", iconURL: "https://www.volcengine.com/favicon.ico" },
  { id: "siliconflow", name: "SiliconFlow", iconURL: "https://siliconflow.cn/favicon.ico" },
  { id: "openrouter", name: "OpenRouter", iconURL: "https://openrouter.ai/favicon.ico" },
  { id: "huggingface", name: "Hugging Face", iconURL: `${ICONS}/huggingface.svg` },
  { id: "together", name: "Together AI", iconURL: monogramIcon("TA", "#6D28D9") },
  { id: "fireworks", name: "Fireworks AI", iconURL: "https://fireworks.ai/favicon.ico" },
  { id: "cloudflare", name: "Cloudflare", iconURL: `${ICONS}/cloudflare.svg` },
  { id: "ollama", name: "Ollama", iconURL: `${ICONS}/ollama.svg` },
  { id: "jina", name: "Jina AI", iconURL: monogramIcon("JI", "#DC2626") },
  { id: "ai21", name: "Ai21Labs", iconURL: "https://www.ai21.com/favicon.ico" },
  { id: "alibaba", name: "AlibabaCloud", iconURL: `${ICONS}/alibabacloud.svg` },
  { id: "antgroup", name: "AntGroup", iconURL: monogramIcon("AG", "#1677FF") },
  { id: "flux", name: "Flux", iconURL: `${ICONS}/flux.svg` },
  { id: "happyhorse", name: "HappyHorse", iconURL: monogramIcon("HH", "#B45309") },
  { id: "inception", name: "Inception Labs", iconURL: monogramIcon("IL", "#0F766E") },
  { id: "kwaikat", name: "KwaiKAT", iconURL: "https://www.kwai.com/favicon.ico" },
  { id: "longcat", name: "Longcat", iconURL: "https://longcat.chat/favicon.ico" },
  { id: "midjourney", name: "Midjourney", iconURL: monogramIcon("MJ", "#111827") },
  { id: "suno", name: "Suno", iconURL: `${ICONS}/suno.svg` },
  { id: "xiaomi", name: "Xiaomi Mimo", iconURL: `${ICONS}/xiaomi.svg` },
  { id: "custom", name: "Custom", iconURL: "" },
];

function normalizeProvider(value: string): string {
  return String(value ?? "").trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "").replaceAll("_", "");
}

function providerPreset(provider: string): ModelProvider | undefined {
  const wanted = normalizeProvider(provider);
  if (!wanted) return undefined;
  return modelProviderPresets.find((preset) => preset.id === wanted || normalizeProvider(preset.name) === wanted);
}

/**
 * Guesses the provider from the model name. Order matters: the first matching
 * rule wins, so the specific families come before the generic ones.
 */
const providerRules: Array<[string, (name: string) => boolean]> = [
  ["ai21", (name) => name.includes("jamba") || name.includes("ai21")],
  ["alibaba", (name) => name.includes("wan")],
  ["antgroup", (name) => name.includes("inclusionai") || name.startsWith("ling-") || name.startsWith("ring-")],
  ["deepseek", (name) => name.includes("deepseek")],
  ["anthropic", (name) => name.includes("claude")],
  ["google", (name) => ["gemini", "gemma", "veo", "lyria", "palm", "bison"].some((token) => name.includes(token))],
  ["meta", (name) => name.includes("llama") || name.includes("muse-spark")],
  ["mistral", (name) => ["mistral", "mixtral", "codestral"].some((token) => name.includes(token))],
  ["qwen", (name) => name.includes("qwen") || name.includes("qwq")],
  ["moonshot", (name) => name.includes("kimi") || name.includes("moonshot")],
  ["zhipu", (name) => name.includes("glm") || name.includes("zhipu")],
  ["xai", (name) => name.includes("grok") || name.includes("xai") || name.includes("x-ai")],
  ["groq", (name) => name.includes("groq")],
  ["cohere", (name) => name.includes("command") || name.includes("cohere")],
  ["perplexity", (name) => name.includes("sonar") || name.includes("perplexity")],
  ["flux", (name) => name.includes("flux") || name.includes("black-forest") || name.startsWith("bfl-")],
  ["happyhorse", (name) => name.includes("happyhorse")],
  ["inception", (name) => name.includes("mercury")],
  ["kwaikat", (name) => name.includes("kat-coder") || name.includes("kwaikat")],
  ["longcat", (name) => name.includes("longcat")],
  ["midjourney", (name) => name.startsWith("mj_") || name.includes("midjourney")],
  ["minimax", (name) => name.includes("abab") || name.includes("minimax")],
  ["baichuan", (name) => name.includes("baichuan")],
  ["stepfun", (name) => name.includes("stepfun") || name.startsWith("step-") || name.startsWith("step_")],
  ["yi", (name) => name.startsWith("yi-") || name.startsWith("yi_") || name.includes("01-ai") || name.includes("lingyi")],
  ["baidu", (name) => ["ernie", "wenxin", "baidu"].some((token) => name.includes(token))],
  ["tencent", (name) => name === "hy3" || name.includes("hunyuan") || name.includes("tencent")],
  ["doubao", (name) => name.includes("doubao") || name.includes("volcengine") || name.includes("volc-")],
  ["siliconflow", (name) => name.includes("siliconflow")],
  ["openrouter", (name) => name.includes("openrouter")],
  ["huggingface", (name) => name.includes("huggingface") || name.includes("hf-")],
  ["together", (name) => name.includes("together")],
  ["fireworks", (name) => name.includes("fireworks")],
  ["cloudflare", (name) => name.includes("cloudflare")],
  ["ollama", (name) => name.includes("ollama")],
  ["jina", (name) => name.includes("jina")],
  ["suno", (name) => name.startsWith("suno_") || name.startsWith("suno-")],
  ["xiaomi", (name) => name.includes("mimo")],
  [
    "openai",
    (name) =>
      name === "embedding-v1" ||
      ["gpt", "dall-e", "dalle", "o1", "o3", "o4", "text-embedding", "whisper"].some((token) => name.includes(token)) ||
      name.startsWith("tts-"),
  ],
];

export function inferProvider(modelName: string): string {
  const name = String(modelName ?? "").trim().toLowerCase();
  for (const [provider, matches] of providerRules) {
    if (matches(name)) return provider;
  }
  return "custom";
}

/**
 * Resolves the provider of a model: an explicit provider wins, otherwise it is
 * inferred from the name. An unknown provider keeps its own name so custom
 * setups survive a round trip.
 */
export function resolveProvider(modelName: string, provider?: string, customIconURL?: string): ModelProvider {
  const explicit = String(provider ?? "").trim();
  const iconURL = String(customIconURL ?? "").trim();
  const id = explicit || inferProvider(modelName);
  const preset = providerPreset(id);
  if (preset) return { id: preset.id, name: preset.name, iconURL: iconURL || preset.iconURL };
  return { id, name: id, iconURL };
}

// ---------------------------------------------------------------------------
// Upstream requests
// ---------------------------------------------------------------------------

/** `/v1/models` against a base URL that may already end in `/v1`. */
export function upstreamURLForPath(baseURL: string, path: string): string {
  const base = String(baseURL ?? "").trim().replace(/\/+$/, "");
  const wanted = path.startsWith("/") ? path : `/${path}`;
  if (!base) return "";
  if (base.toLowerCase().endsWith("/v1")) {
    if (wanted === "/v1") return base;
    if (wanted.startsWith("/v1/")) return `${base}${wanted.slice(3)}`;
    return `${base.slice(0, -3)}${wanted}`;
  }
  return `${base}${wanted}`;
}

/** Keeps a custom sync path a path: an absolute URL is reduced to its path. */
export function normalizeSyncPath(path: string): string {
  let value = String(path ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    const rest = value.slice(value.indexOf("://") + 3);
    const slash = rest.indexOf("/");
    if (slash < 0) return "";
    value = rest.slice(slash);
  }
  return value.startsWith("/") ? value : `/${value}`;
}

/**
 * Loopback and link-local targets are refused: the address is operator-supplied
 * and the server fetches it, so it must not become a way to read cloud metadata
 * or probe the host. A relay running next to this deployment is a real setup
 * though, so `VELOCELAB_ALLOW_PRIVATE_UPSTREAM=1` opens private and loopback
 * addresses back up.
 */
function assertSafeUpstreamURL(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Error(`upstream URL is invalid: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw Error("upstream URL must use http or https");
  if (process.env.VELOCELAB_ALLOW_PRIVATE_UPSTREAM === "1") return;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.startsWith("127.") ||
    host.startsWith("169.254.") ||
    host === "metadata.google.internal";
  if (blocked) throw Error(`upstream URL is blocked: ${host} is a local or link-local address`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Upstream failures are shown to the operator, so keep the body readable. */
function bodyPreview(body: string): string {
  const collapsed = String(body ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > 500 ? `${collapsed.slice(0, 500)}...` : collapsed;
}

function looksLikeHTML(body: string): boolean {
  const trimmed = String(body ?? "").trim().toLowerCase();
  if (!trimmed) return false;
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || trimmed.startsWith("<script");
}

async function getUpstreamJSON(channel: SyncChannel, path: string): Promise<unknown> {
  const url = upstreamURLForPath(channel.base_url, path);
  if (!url) throw Error("channel base URL is required");
  assertSafeUpstreamURL(url);
  const apiKey = String(channel.api_key ?? "").trim();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json, text/plain, */*", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw Error(`GET ${url} failed: ${message(error)}`);
  }
  const body = await response.text();
  if (!response.ok) throw Error(`GET ${url} returned status ${response.status}: ${bodyPreview(body)}`);
  if (/text\/html/i.test(response.headers.get("content-type") ?? "") || looksLikeHTML(body)) {
    throw Error(`GET ${url} returned HTML instead of JSON: ${bodyPreview(body)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Error(`GET ${url} returned invalid JSON: ${bodyPreview(body)}`);
  }
}

// ---------------------------------------------------------------------------
// Reading the model list out of an upstream payload
// ---------------------------------------------------------------------------

const NAME_KEYS = ["model_name", "modelName", "model", "name", "id"];
const MODEL_MAP_KEYS = [
  "model_ratio",
  "modelRatio",
  "model_ratios",
  "modelRatios",
  "model_price",
  "modelPrice",
  "model_prices",
  "modelPrices",
  "price",
  "prices",
  "ratio",
  "ratios",
  "quota_type",
  "quotaType",
  "quota_types",
  "quotaTypes",
  "input_price",
  "inputPrice",
  "output_price",
  "outputPrice",
  "prompt_price",
  "promptPrice",
  "completion_price",
  "completionPrice",
];
const CONTAINER_KEYS = ["data", "models", "model_prices", "modelPrices", "prices", "list", "items"];

/** Keys that describe a payload rather than name a model. */
const METADATA_KEYS = new Set([
  ...NAME_KEYS,
  ...MODEL_MAP_KEYS,
  ...CONTAINER_KEYS,
  "success",
  "object",
  "message",
  "count",
  "total",
  "page",
  "page_size",
  "pageSize",
  "owned_by",
  "created",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A bare number is a row id, not a model name. */
function looksLikeModelName(value: string): boolean {
  const name = String(value ?? "").trim();
  return Boolean(name) && !/^\d+$/.test(name);
}

/**
 * Recognises a map keyed by model name (`{"gpt-4o": {...}}`), which is how
 * new-api returns `/api/pricing`. Payload objects such as `{model_ratio: {...}}`
 * and `{count: 3}` are rejected so only real names are collected.
 */
function nameKeyedMap(value: Record<string, unknown>): string[] | undefined {
  const keys = Object.keys(value);
  if (!keys.length) return undefined;
  if (keys.some((key) => METADATA_KEYS.has(key))) return undefined;
  if (!keys.every((key) => looksLikeModelName(key))) return undefined;
  return keys;
}

/**
 * Collects model names from any of the shapes upstreams actually return:
 * OpenAI `{data: [{id}]}`, new-api `/api/models` `{data: [...]}`, new-api
 * `/api/pricing` `{data: [{model_name}]}` or `{data: {"<name>": {...}}}`,
 * one-api price maps `{model_ratio: {"<name>": 1}}`, and plain arrays.
 */
export function parseModelNames(payload: unknown): string[] {
  const names = new Set<string>();
  collectModelNames(payload, names, 0);
  return [...names];
}

function collectModelNames(value: unknown, names: Set<string>, depth: number): void {
  if (depth > 8 || names.size > 20_000) return;
  if (Array.isArray(value)) {
    for (const item of value) collectModelNames(item, names, depth + 1);
    return;
  }
  if (typeof value === "string") {
    if (looksLikeModelName(value)) names.add(value.trim());
    return;
  }
  if (!isRecord(value)) return;

  for (const key of NAME_KEYS) {
    const raw = value[key];
    if (typeof raw === "string" && looksLikeModelName(raw)) {
      names.add(raw.trim());
      return;
    }
  }

  for (const key of MODEL_MAP_KEYS) {
    const raw = value[key];
    if (!isRecord(raw)) continue;
    const mapped = nameKeyedMap(raw);
    if (!mapped) continue;
    for (const name of mapped) names.add(name.trim());
    return;
  }

  for (const key of CONTAINER_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    // `data` also arrives as a map keyed by model name, without a wrapper key.
    if (isRecord(raw)) {
      const mapped = nameKeyedMap(raw);
      if (mapped) {
        for (const name of mapped) names.add(name.trim());
        return;
      }
    }
    const before = names.size;
    collectModelNames(raw, names, depth + 1);
    if (names.size > before) return;
  }
}

// ---------------------------------------------------------------------------
// Sync targets
// ---------------------------------------------------------------------------

export interface SyncTargets {
  paths: string[];
  /** Auto detection tries every path; an explicit format uses exactly one. */
  auto: boolean;
}

const LIST_FORMATS: Record<string, string> = {
  openai_models: "/v1/models",
  openai: "/v1/models",
  generic_models: "/models",
  models: "/models",
  api_models: "/api/models",
  oneapi_models: "/api/models",
};

export function resolveSyncTargets(format: string, customPath: string): SyncTargets | { error: string } {
  const value = String(format ?? "").trim().toLowerCase() || "auto";
  if (value === "auto") return { paths: ["/v1/models", "/models", "/api/models"], auto: true };
  if (value === "custom") {
    const path = normalizeSyncPath(customPath);
    if (!path) return { error: "custom sync path is required" };
    return { paths: [path], auto: false };
  }
  const path = LIST_FORMATS[value];
  if (!path) return { error: `unsupported model list sync format: ${format}` };
  return { paths: [path], auto: false };
}

export interface SyncFetchResult {
  names: string[];
  source: string;
}

export async function fetchUpstreamModelNames(channel: SyncChannel, targets: SyncTargets): Promise<SyncFetchResult> {
  const failures: string[] = [];
  for (const path of targets.paths) {
    try {
      const payload = await getUpstreamJSON(channel, path);
      const names = parseModelNames(payload);
      if (names.length || !targets.auto) return { names, source: path };
      failures.push(`${path}: upstream returned no models`);
    } catch (error) {
      if (!targets.auto) throw error;
      failures.push(`${path}: ${message(error)}`);
    }
  }
  throw Error(`all model list sources failed: ${failures.join("; ")}`);
}

// ---------------------------------------------------------------------------
// Preview and apply
// ---------------------------------------------------------------------------

export async function buildPreview(db: Database, channel: SyncChannel, source: string, names: string[]): Promise<SyncPreview> {
  const [configs, catalog] = await Promise.all([
    db.select("model_configs", { channel_id: channel.id }),
    db.select("models", {}),
  ]);
  const nameByID = new Map<number, string>();
  for (const row of catalog) if (row.id !== undefined) nameByID.set(Number(row.id), row.model_name);

  // A model counts as present when this channel already binds it, whether the
  // binding is known through the catalog or only through the upstream name.
  const existing = new Set<string>();
  for (const config of configs as ModelConfig[]) {
    const resolved = nameByID.get(Number(config.model_id)) ?? String(config.upstream_model_name ?? "");
    if (resolved.trim()) existing.add(resolved.trim());
  }

  const unique = [...new Set(names.map((name) => String(name ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const models: SyncPreviewItem[] = unique.map((modelName) => {
    const provider = resolveProvider(modelName);
    return { model_name: modelName, provider: provider.id, provider_name: provider.name, provider_icon_url: provider.iconURL, exists: existing.has(modelName) };
  });

  return { channel_id: channel.id, channel_name: channel.name, source, models };
}

/** Finds or creates the global catalog row a channel binding points at. */
async function ensureGlobalModel(db: Database, modelName: string, provider: ModelProvider): Promise<Model> {
  const now = new Date().toISOString();
  const existing = await db.selectOne("models", { model_name: modelName });
  if (existing) {
    // Only fill gaps: a provider set by hand in the catalog is not overwritten.
    const updates: Record<string, unknown> = {};
    if (!String(existing.provider ?? "").trim() && provider.id) updates.provider = provider.id;
    if (!String(existing.provider_icon_url ?? "").trim() && provider.iconURL) updates.provider_icon_url = provider.iconURL;
    if (Object.keys(updates).length) {
      await db.update("models", { id: existing.id }, { ...updates, updated_at: now } as never);
      return { ...existing, ...updates } as Model;
    }
    return existing;
  }
  return db.create("models", {
    model_name: modelName,
    provider: provider.id,
    provider_icon_url: provider.iconURL,
    quota_type: 0,
    input_price: "0",
    output_price: "0",
    enabled: true,
    created_at: now,
    updated_at: now,
  } as never);
}

/**
 * Binds the selected models to the channel: each name gets a catalog row and a
 * channel binding, so re-syncing only refreshes the upstream name.
 */
export async function applyChannelModels(
  db: Database,
  channel: SyncChannel,
  items: Array<Record<string, unknown>>,
): Promise<SyncResult> {
  const result: SyncResult = { channel_id: channel.id, channel_name: channel.name, source: "selected", created: 0, updated: 0 };
  const now = new Date().toISOString();
  for (const item of items) {
    const modelName = String(item?.model_name ?? "").trim();
    if (!modelName) continue;
    const provider = resolveProvider(modelName, String(item?.provider ?? ""), String(item?.provider_icon_url ?? ""));
    const globalModel = await ensureGlobalModel(db, modelName, provider);
    if (globalModel?.id === undefined) {
      result.error = `failed to resolve the catalog entry for ${modelName}`;
      return result;
    }
    const binding = await db.selectOne("model_configs", { channel_id: channel.id, model_id: globalModel.id });
    if (binding) {
      await db.update("model_configs", { id: binding.id }, { upstream_model_name: modelName, enabled: true, updated_at: now } as never);
      result.updated += 1;
    } else {
      await db.create("model_configs", {
        channel_id: channel.id,
        model_id: globalModel.id,
        upstream_model_name: modelName,
        max_context_tokens: 1000000,
        input_price: "0",
        output_price: "0",
        enabled: true,
        created_at: now,
        updated_at: now,
      } as never);
      result.created += 1;
    }
  }
  return result;
}
