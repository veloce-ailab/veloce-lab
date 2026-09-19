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
  setModelPrice(modelName: string, prices: Partial<Omit<ModelPrice, "id" | "model_name" | "created_at" | "updated_at">>): Promise<ModelPrice>;
  charge(userId: number, amount: number, metadata?: Record<string, unknown>): Promise<boolean>;
  balance(userId: number): Promise<number>;
}
export interface BillingConfig { }
export const config: Schema<BillingConfig> = Schema.object({});
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
    model_name: { type: "string", nullable: false },
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
    id: { type: "integer", autoIncrement: true },
    model_name: { type: "string", nullable: false },
    input_price: { type: "decimal", initial: 0 },
    output_price: { type: "decimal", initial: 0 },
    cached_input_price: { type: "decimal", initial: 0 },
    image_input_price: { type: "decimal", initial: 0 },
    image_output_price: { type: "decimal", initial: 0 },
    audio_input_price: { type: "decimal", initial: 0 },
    audio_output_price: { type: "decimal", initial: 0 },
    currency: { type: "string", initial: "USD" },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["model_name"] });
  const now = () => new Date().toISOString();
  const user = (session: any) => session.properties.user as { id?: number; is_admin?: boolean } | undefined;
  const body = async (session: any) => await session.parseRequestBody() as Record<string, unknown>;
  const prices = async () => await db.select("model_prices", {}) as ModelPrice[];
  const findPrice = async (modelName: string) => (await db.selectOne("model_prices", { model_name: modelName }) as ModelPrice | undefined) ?? {
    model_name: modelName, input_price: "0", output_price: "0", cached_input_price: "0", image_input_price: "0", image_output_price: "0", audio_input_price: "0", audio_output_price: "0", currency: "USD",
  } as ModelPrice;
  const recordUsage = async (usage: TokenUsageRecord): Promise<TokenLog> => {
    const modelName = String(usage.modelName ?? "").trim();
    const price = await findPrice(modelName);
    const inputTokens = Math.max(0, Number(usage.inputTokens) || 0);
    const outputTokens = Math.max(0, Number(usage.outputTokens) || 0);
    const cachedInputTokens = Math.max(0, Math.min(inputTokens, Number(usage.cachedInputTokens) || 0));
    const cost = usage.cost ?? (((inputTokens - cachedInputTokens) * Number(price.input_price || 0) + cachedInputTokens * Number(price.cached_input_price || price.input_price || 0) + outputTokens * Number(price.output_price || 0)) / 1_000_000);
    const metadata = usage.metadata ?? {};
    return await db.create("token_logs", {
      user_id: usage.userId ?? null,
      model_name: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_input_tokens: cachedInputTokens,
      input_price: price.input_price,
      output_price: price.output_price,
      cached_input_price: price.cached_input_price,
      cost: String(cost),
      base_cost: String(cost),
      status: 0,
      pricing_formula: JSON.stringify({ unit: "per_million_tokens", currency: price.currency }),
      channel_id: metadata.channelId ?? null,
      model_config_id: metadata.modelConfigId ?? null,
      created_at: now(),
    } as any) as TokenLog;
  };
  const service: BillingService = {
    countTokens: (_model, text) => estimate(text),
    calculateCost: (input, output, inputPrice, outputPrice, group = 1, channel = 1) => ((input * inputPrice + output * outputPrice) / 1_000_000) * group * channel,
    recordUsage,
    listModelPrices: prices,
    setModelPrice: async (modelName, updates) => {
      const name = String(modelName ?? "").trim();
      if (!name) throw Error("model name is required");
      const existing = await db.selectOne("model_prices", { model_name: name }) as ModelPrice | undefined;
      const data = { model_name: name, input_price: String(updates.input_price ?? existing?.input_price ?? "0"), output_price: String(updates.output_price ?? existing?.output_price ?? "0"), cached_input_price: String(updates.cached_input_price ?? existing?.cached_input_price ?? "0"), image_input_price: String(updates.image_input_price ?? existing?.image_input_price ?? "0"), image_output_price: String(updates.image_output_price ?? existing?.image_output_price ?? "0"), audio_input_price: String(updates.audio_input_price ?? existing?.audio_input_price ?? "0"), audio_output_price: String(updates.audio_output_price ?? existing?.audio_output_price ?? "0"), currency: String(updates.currency ?? existing?.currency ?? "USD"), updated_at: now() };
      if (existing?.id) await db.update("model_prices", { id: existing.id }, data as any);
      else await db.create("model_prices", { ...data, created_at: now() } as any);
      return await db.selectOne("model_prices", { model_name: name }) as ModelPrice;
    },
    balance: async (userId) => balances.get(userId) ?? 0,
    charge: async (userId, amount) => { if (amount <= 0) return true; const current = balances.get(userId) ?? 0; if (current < amount) return false; balances.set(userId, current - amount); return true; },
  };
  const balances = new Map<number, number>();
  ctx.on("advanced-chat.usage", async (usage: TokenUsageRecord) => {
    await recordUsage(usage).catch(() => undefined);
  });
  ctx.i18n("billing.modelPrices", { zh: "模型价格", en: "Model prices", ja: "モデル価格" });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/billing.js", import.meta.url).pathname, plugin: "billing" });
  ctx.route("/api/billing/model-prices").methods("GET").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    session.respond({ prices: await prices() }, "json");
  });
  ctx.route("/api/billing/model-prices").methods("POST").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    try { const input = await body(session); session.respond(await service.setModelPrice(String(input.model_name ?? ""), input as any), "json"); }
    catch (error) { session.status = 400; session.respond({ error: error instanceof Error ? error.message : "invalid" }, "json"); }
  });
  ctx.route("/api/user/usage/statistics").methods("GET").action(async (session, query) => {
    const current = user(session);
    if (!current?.id) { session.status = 401; session.respond({ error: "unauthorized" }, "json"); return; }
    const from = String(query.get("from") ?? "").slice(0, 10);
    const to = String(query.get("to") ?? "").slice(0, 10);
    const rows = (await db.select("token_logs", {}) as TokenLog[]).filter((row) => row.user_id === current.id && (!from || String(row.created_at).slice(0, 10) >= from) && (!to || String(row.created_at).slice(0, 10) <= to));
    const seriesMap = new Map<string, { date: string; request_count: number; total_tokens: number; total_cost: number }>();
    for (const row of rows) { const date = String(row.created_at).slice(0, 10); const point = seriesMap.get(date) ?? { date, request_count: 0, total_tokens: 0, total_cost: 0 }; point.request_count += 1; point.total_tokens += Number(row.input_tokens || 0) + Number(row.output_tokens || 0); point.total_cost += Number(row.cost || 0); seriesMap.set(date, point); }
    const input = rows.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0);
    const output = rows.reduce((sum, row) => sum + Number(row.output_tokens || 0), 0);
    session.respond({ from, to, summary: { request_count: rows.length, input_tokens: input, output_tokens: output, total_tokens: input + output, total_cost: rows.reduce((sum, row) => sum + Number(row.cost || 0), 0) }, series: [...seriesMap.values()].sort((a, b) => a.date.localeCompare(b.date)) }, "json");
  });
  ctx.registerComponent("billing", service);
}
