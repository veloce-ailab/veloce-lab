import { Context, Schema } from "yumeri";
import type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask, ModelPrice } from "./types.js";
import "@velocelab/database-core";
export type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask, ModelPrice } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    payment_orders: PaymentOrder;
    wallet_transactions: WalletTransaction;
    wallet_limit_usages: WalletLimitUsage;
    referral_commission_logs: ReferralCommissionLog;
    token_logs: TokenLog;    video_tasks: VideoTask;
    model_prices: ModelPrice;
  }
}

export const depend = ["database", "dashboard"];
export const provide = ["billing"];
export interface TokenUsageRecord {
  userId?: number | null;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}
export interface BillingService {
  countTokens(model: string, text: string): number;
  calculateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number, groupMultiplier?: number, channelMultiplier?: number): number;
  recordUsage(usage: TokenUsageRecord): Promise<TokenLog>;
  listModelPrices(): Promise<ModelPrice[]>;
  setModelPrice(channelId: number, modelConfigId: number, prices: Partial<Omit<ModelPrice, "id" | "channel_id" | "model_config_id" | "model_name" | "channel_name" | "created_at" | "updated_at">>): Promise<ModelPrice>;
  charge(userId: number, amount: number, metadata?: Record<string, unknown>): Promise<boolean>;
  balance(userId: number): Promise<number>;
}
export interface BillingConfig { currency: string }
export const config: Schema<BillingConfig> = Schema.object({
  currency: Schema.string("Currency used for recorded costs").key("billing.config.currency").default("USD"),
});
declare module "yumeri" { interface Components { billing: BillingService; } }

function estimate(text: string) { return text ? Math.max(1, Math.ceil(Array.from(text).length / 4)) : 0; }
export async function apply(ctx: Context, cfg: BillingConfig) {
  const db = ctx.component.database;
  await db.extend("payment_orders", {
    id: { type: "integer", autoIncrement: true }, order_no: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false }, amount: { type: "decimal", nullable: false }, rmb_amount: { type: "decimal", nullable: false }, exchange_rate: { type: "decimal", nullable: false }, payment_currency: "string", gateway_amount: "decimal", method: { type: "string", nullable: false }, status: { type: "string", nullable: false }, gateway_provider: "string", gateway_channel: "string", gateway_trade_no: "string", notify_payload: "text", paid_at: "timestamp", created_at: "timestamp", updated_at: "timestamp",
  }, { unique: ["order_no"] });
  await db.extend("wallet_transactions", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, source: { type: "string", nullable: false }, idempotency_key: { type: "string", nullable: false }, plugin_id: "string", debit_amount: { type: "decimal", nullable: false, initial: 0 }, credit_amount: { type: "decimal", nullable: false, initial: 0 }, balance_before: { type: "decimal", nullable: false }, balance_after: { type: "decimal", nullable: false }, reference_type: "string", reference_id: "string", description: "string", request_hash: { type: "string", nullable: false }, metadata_json: "text", created_at: "timestamp",
  }, { unique: [["user_id", "source", "idempotency_key"]] });
  await db.extend("wallet_limit_usages", {
    id: { type: "integer", autoIncrement: true }, wallet_transaction_id: { type: "integer", nullable: false }, user_id: { type: "integer", nullable: false }, source: { type: "string", nullable: false }, limit_key: { type: "string", nullable: false }, created_at: "timestamp",
  }, { unique: [["wallet_transaction_id", "limit_key"]] });
  await db.extend("referral_commission_logs", {
    id: { type: "integer", autoIncrement: true }, referrer_id: { type: "integer", nullable: false }, referred_user_id: { type: "integer", nullable: false }, token_log_id: { type: "integer", nullable: false }, base_cost: { type: "decimal", nullable: false }, rate: { type: "decimal", nullable: false }, amount: { type: "decimal", nullable: false }, created_at: "timestamp",
  }, { unique: ["token_log_id"] });
  await db.extend("token_logs", {
    id: { type: "integer", autoIncrement: true }, user_id: "integer", api_key_id: "integer", user_channel_id: "integer", channel_id: "integer", model_config_id: "integer", model_name: "string", input_tokens: "integer", output_tokens: "integer", cached_input_tokens: { type: "integer", initial: 0 }, cache_write_input_tokens: { type: "integer", initial: 0 }, cache_write_1h_input_tokens: { type: "integer", initial: 0 }, image_input_tokens: { type: "integer", initial: 0 }, image_output_tokens: { type: "integer", initial: 0 }, audio_input_tokens: { type: "integer", initial: 0 }, audio_output_tokens: { type: "integer", initial: 0 }, response_time_ms: { type: "bigint", initial: 0 }, first_response_time_ms: { type: "bigint", initial: 0 }, base_cost: { type: "decimal", initial: 0 }, group_multiplier: { type: "decimal", initial: 1 }, user_channel_multiplier: { type: "decimal", initial: 1 }, input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, cached_input_price: { type: "decimal", initial: 0 }, output_price_tiers: "text", pricing_formula: "text", cost: "decimal", status: { type: "integer", initial: 0 }, error_message: "string", ip: "string", user_agent: "text", created_at: "timestamp",
  });
  await db.extend("video_tasks", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    stable_id: "string",
    api_key_id: "integer",
    user_channel_id: "integer",
    channel_id: { type: "integer", nullable: false },
    model_config_id: { type: "integer", nullable: false },
    model_name: { type: "string", nullable: false }, quota_type: { type: "integer", initial: 0 },
    billing_model_name: "string",
    upstream_task_id: "string",
    status: { type: "string", nullable: false },
    cost: { type: "decimal", initial: 0 },
    request_payload: "text",
    response_payload: "text",
    last_status_payload: "text",
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["id"] });
  await db.extend("model_prices", {
    id: { type: "integer", autoIncrement: true }, channel_id: { type: "integer", nullable: false }, model_config_id: { type: "integer", nullable: false }, model_name: { type: "string", nullable: false },
    input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, cached_input_price: { type: "decimal", initial: 0 }, cache_write_input_price: { type: "decimal", initial: 0 }, cache_write_1h_input_price: { type: "decimal", initial: 0 }, image_input_price: { type: "decimal", initial: 0 }, image_output_price: { type: "decimal", initial: 0 }, audio_input_price: { type: "decimal", initial: 0 }, audio_output_price: { type: "decimal", initial: 0 },
    input_price_tiers: "text", output_price_tiers: "text", cached_input_price_tiers: "text", cache_write_input_price_tiers: "text", cache_write_1h_input_price_tiers: "text", image_input_price_tiers: "text", image_output_price_tiers: "text", audio_input_price_tiers: "text", audio_output_price_tiers: "text", time_pricing: "text", video_billing_config: "text", created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["channel_id", "model_config_id"]] });
  const now = () => new Date().toISOString();
  const user = (session: any) => session.properties.user as { id?: number; is_admin?: boolean } | undefined;
  const body = async (session: any) => await session.parseRequestBody() as Record<string, unknown>;
  const priceFields = ["input_price", "output_price", "cached_input_price", "cache_write_input_price", "cache_write_1h_input_price", "image_input_price", "image_output_price", "audio_input_price", "audio_output_price", "input_price_tiers", "output_price_tiers", "cached_input_price_tiers", "cache_write_input_price_tiers", "cache_write_1h_input_price_tiers", "image_input_price_tiers", "image_output_price_tiers", "audio_input_price_tiers", "audio_output_price_tiers", "time_pricing", "video_billing_config"] as const;
  const defaultPrice = (channelId: number, modelConfigId: number, modelName: string, quotaType = 0) => ({ channel_id: channelId, model_config_id: modelConfigId, model_name: modelName, quota_type: quotaType, ...Object.fromEntries(priceFields.map((field) => [field, field.endsWith("_price") ? "0" : "[]"])) }) as ModelPrice;
  const prices = async () => await db.select("model_prices", {}) as ModelPrice[];
  const availablePrices = async () => { try { const data = db as any; const [configs, channels, models, configured] = await Promise.all([data.select("model_configs", {}), data.select("channels", {}), data.select("models", {}), prices()]); const channelById = new Map<number, any>(channels.map((item: any) => [Number(item.id), item])); const modelById = new Map<number, any>(models.map((item: any) => [Number(item.id), item])); const configuredByBinding = new Map(configured.map((item) => [`${item.channel_id}:${item.model_config_id}`, item])); return configs.map((item: any) => { const channel = channelById.get(Number(item.channel_id)); const model = modelById.get(Number(item.model_id)); const modelName = String(model?.model_name ?? item.upstream_model_name ?? ""); return { ...(configuredByBinding.get(`${item.channel_id}:${item.id}`) ?? defaultPrice(Number(item.channel_id), Number(item.id), modelName, Number(model?.quota_type ?? 0))), channel_name: String(channel?.name ?? "") }; }); } catch { return []; } };
  const findPrice = async (modelName: string, metadata: Record<string, unknown>) => { const channelId = Number(metadata.channelId ?? 0); const modelConfigId = Number(metadata.modelConfigId ?? 0); return channelId && modelConfigId ? ((await db.selectOne("model_prices", { channel_id: channelId, model_config_id: modelConfigId }) as ModelPrice | undefined) ?? defaultPrice(channelId, modelConfigId, modelName)) : defaultPrice(0, 0, modelName); };
  const recordUsage = async (usage: TokenUsageRecord): Promise<TokenLog> => { const modelName = String(usage.modelName ?? "").trim(); const metadata = usage.metadata ?? {}; const price = await findPrice(modelName, metadata); const inputTokens = Math.max(0, Number(usage.inputTokens) || 0); const outputTokens = Math.max(0, Number(usage.outputTokens) || 0); const cachedInputTokens = Math.max(0, Math.min(inputTokens, Number(usage.cachedInputTokens) || 0)); const cost = usage.cost ?? (((inputTokens - cachedInputTokens) * Number(price.input_price || 0) + cachedInputTokens * Number(price.cached_input_price || price.input_price || 0) + outputTokens * Number(price.output_price || 0)) / 1_000_000); return await db.create("token_logs", { user_id: usage.userId ?? null, model_name: modelName, input_tokens: inputTokens, output_tokens: outputTokens, cached_input_tokens: cachedInputTokens, input_price: price.input_price, output_price: price.output_price, cached_input_price: price.cached_input_price, cache_write_input_price: price.cache_write_input_price, cache_write_1h_input_price: price.cache_write_1h_input_price, cost: String(cost), base_cost: String(cost), status: 0, pricing_formula: JSON.stringify({ unit: "per_million_tokens", currency: cfg.currency, channel_id: price.channel_id, model_config_id: price.model_config_id }), channel_id: Number(metadata.channelId ?? 0) || null, model_config_id: Number(metadata.modelConfigId ?? 0) || null, created_at: now() } as any) as TokenLog; };
  const balances = new Map<number, number>();
  const service: BillingService = {
    countTokens: (_model, text) => estimate(text),
    calculateCost: (input, output, inputPrice, outputPrice, group = 1, channel = 1) => ((input * inputPrice + output * outputPrice) / 1_000_000) * group * channel,
    recordUsage,
    listModelPrices: prices,
    setModelPrice: async (channelId, modelConfigId, updates) => {
      const data = db as any; const binding = await data.selectOne("model_configs", { id: modelConfigId, channel_id: channelId }); if (!binding) throw Error("channel model binding not found");
      const model = await data.selectOne("models", { id: Number(binding.model_id) }); const modelName = String(model?.model_name ?? binding.upstream_model_name ?? ""); const existing = await db.selectOne("model_prices", { channel_id: channelId, model_config_id: modelConfigId }) as ModelPrice | undefined; const base = existing ?? defaultPrice(channelId, modelConfigId, modelName, Number(model?.quota_type ?? 0));
      const values = Object.fromEntries(priceFields.map((field) => [field, String(updates[field] ?? base[field] ?? "")])) as Record<string, string>; const record = { ...values, quota_type: Number(updates.quota_type ?? base.quota_type ?? 0), channel_id: channelId, model_config_id: modelConfigId, model_name: modelName, updated_at: now() };
      if (existing?.id) await db.update("model_prices", { id: existing.id }, record as any); else await db.create("model_prices", { ...record, created_at: now() } as any); return await db.selectOne("model_prices", { channel_id: channelId, model_config_id: modelConfigId }) as ModelPrice;
    },
    balance: async (userId) => balances.get(userId) ?? 0,
    charge: async (userId, amount) => { if (amount <= 0) return true; const current = balances.get(userId) ?? 0; if (current < amount) return false; balances.set(userId, current - amount); return true; },
  };
  ctx.on("advanced-chat.usage", async (usage: TokenUsageRecord) => {
    await recordUsage(usage).catch(() => undefined);
  });
  ctx.i18n("billing.config.currency", { zh: "计费货币", en: "Billing currency", ja: "請求通貨" });
  ctx.i18n("billing.modelPrices", { zh: "模型价格", en: "Model prices", ja: "モデル価格" });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/billing.js", import.meta.url).pathname, plugin: "billing" });
  ctx.route("/api/billing/model-prices").methods("GET").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    session.respond({ prices: await availablePrices(), currency: cfg.currency }, "json");
  });
  ctx.route("/api/billing/model-prices").methods("POST").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    try { const input = await body(session); session.respond(await service.setModelPrice(Number(input.channel_id), Number(input.model_config_id), input as any), "json"); }
    catch (error) { session.status = 400; session.respond({ error: error instanceof Error ? error.message : "invalid" }, "json"); }
  });
  const statisticsProvider = {
    id: "billing",
    async get(userId: number, from: string, to: string) {
      const rows = (await db.select("token_logs", {}) as TokenLog[]).filter((row) => row.user_id === userId && (!from || String(row.created_at).slice(0, 10) >= from) && (!to || String(row.created_at).slice(0, 10) <= to));
      const input = rows.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0);
      const output = rows.reduce((sum, row) => sum + Number(row.output_tokens || 0), 0);
      const daily = new Map<string, { date: string; request_count: number; input_tokens: number; output_tokens: number; total_tokens: number; total_cost: number }>();
      for (const row of rows) { const date = String(row.created_at).slice(0, 10); const point = daily.get(date) ?? { date, request_count: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, total_cost: 0 }; point.request_count += 1; point.input_tokens += Number(row.input_tokens || 0); point.output_tokens += Number(row.output_tokens || 0); point.total_tokens += Number(row.input_tokens || 0) + Number(row.output_tokens || 0); point.total_cost += Number(row.cost || 0); daily.set(date, point); }
      return { summary: { request_count: rows.length, input_tokens: input, output_tokens: output, total_tokens: input + output, total_cost: rows.reduce((sum, row) => sum + Number(row.cost || 0), 0) }, series: [...daily.values()] };
    },
  };
  const statistics = (ctx.component as any).statistics;
  if (statistics?.register) statistics.register(statisticsProvider);
  else await ctx.emit("statistics.register", statisticsProvider);
  ctx.registerComponent("billing", service);
}
