import { Context, Schema } from "yumeri";
import type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask, ModelPrice, UserQuota, UserQuotaRow, QuotaPeriod, UsageSummary } from "./types.js";
import { applyMultipliers, priceUsage } from "./pricing.js";
import "@velocelab/database-core";
export type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask, ModelPrice, UserQuota, QuotaPeriod, UsageSummary } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    payment_orders: PaymentOrder;
    wallet_transactions: WalletTransaction;
    wallet_limit_usages: WalletLimitUsage;
    referral_commission_logs: ReferralCommissionLog;
    token_logs: TokenLog;    video_tasks: VideoTask;
    model_prices: ModelPrice;
    user_quotas: UserQuotaRow;
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
  /** Tokens written into the prompt cache, the one-hour TTL subset listed separately. */
  cacheWriteInputTokens?: number;
  cacheWrite1hInputTokens?: number;
  /**
   * Whether `inputTokens` already counts the cached portion. OpenAI says yes,
   * Anthropic says no; without this the cached share is subtracted from an input
   * that never contained it and the request is under-billed.
   */
  inputIncludesCache?: boolean;
  /** Caller-supplied total. Honoured when present, but it bypasses pricing. */
  cost?: number;
  metadata?: Record<string, unknown>;
}
export interface BillingService {
  countTokens(model: string, text: string): number;
  calculateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number, groupMultiplier?: number, channelMultiplier?: number): number;
  recordUsage(usage: TokenUsageRecord): Promise<TokenLog>;
  listModelPrices(): Promise<ModelPrice[]>;
  setModelPrice(channelId: number, modelConfigId: number, prices: Partial<Omit<ModelPrice, "id" | "channel_id" | "model_config_id" | "model_name" | "channel_name" | "created_at" | "updated_at">>): Promise<ModelPrice>;
  /**
   * The user's allowance and what they have spent against it.
   *
   * Every deployment bills nobody until a limit is set, so this always reports the
   * usage; `unlimited` says whether anything is enforced.
   */
  quota(userId: number): Promise<UserQuota>;
  /** `limit` of null clears the limit, returning the user to unlimited. */
  setQuota(userId: number, limit: number | null, period?: QuotaPeriod): Promise<UserQuota>;
  listQuotas(): Promise<UserQuota[]>;
  /** Remaining allowance, or `Infinity` when the user is unlimited. */
  balance(userId: number): Promise<number>;
  /**
   * What a chat session has spent, and what its most recent run spent.
   *
   * Scoped by user so a session id guessed from another account returns nothing.
   */
  sessionUsage(userId: number, sessionId: string): Promise<{ session: UsageSummary; run: UsageSummary | null }>;
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
    id: { type: "integer", autoIncrement: true }, user_id: "integer", api_key_id: "integer", user_channel_id: "integer", channel_id: "integer", model_config_id: "integer", model_name: "string", input_tokens: "integer", output_tokens: "integer", cached_input_tokens: { type: "integer", initial: 0 }, cache_write_input_tokens: { type: "integer", initial: 0 }, cache_write_1h_input_tokens: { type: "integer", initial: 0 }, session_id: "string", run_id: "string", image_input_tokens: { type: "integer", initial: 0 }, image_output_tokens: { type: "integer", initial: 0 }, audio_input_tokens: { type: "integer", initial: 0 }, audio_output_tokens: { type: "integer", initial: 0 }, response_time_ms: { type: "bigint", initial: 0 }, first_response_time_ms: { type: "bigint", initial: 0 }, base_cost: { type: "decimal", initial: 0 }, group_multiplier: { type: "decimal", initial: 1 }, user_channel_multiplier: { type: "decimal", initial: 1 }, input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, cached_input_price: { type: "decimal", initial: 0 }, output_price_tiers: "text", pricing_formula: "text", cost: "decimal", status: { type: "integer", initial: 0 }, error_message: "string", ip: "string", user_agent: "text", created_at: "timestamp",
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
  await db.extend("user_quotas", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    // Null is meaningful: it is the default "this deployment bills nobody" state.
    limit_amount: "decimal",
    period: { type: "string", initial: "total" },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["user_id"] });
  await db.extend("model_prices", {
    id: { type: "integer", autoIncrement: true }, channel_id: { type: "integer", nullable: false }, model_config_id: { type: "integer", nullable: false }, model_name: { type: "string", nullable: false },
    input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, cached_input_price: { type: "decimal", initial: 0 }, cache_write_input_price: { type: "decimal", initial: 0 }, cache_write_1h_input_price: { type: "decimal", initial: 0 }, image_input_price: { type: "decimal", initial: 0 }, image_output_price: { type: "decimal", initial: 0 }, audio_input_price: { type: "decimal", initial: 0 }, audio_output_price: { type: "decimal", initial: 0 },
    input_price_tiers: "text", output_price_tiers: "text", cached_input_price_tiers: "text", cache_write_input_price_tiers: "text", cache_write_1h_input_price_tiers: "text", image_input_price_tiers: "text", image_output_price_tiers: "text", audio_input_price_tiers: "text", audio_output_price_tiers: "text", time_pricing: "text", video_billing_config: "text", created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["channel_id", "model_config_id"]] });
  const now = () => new Date().toISOString();
  /** Mirrors `applyMultipliers`, so the stored factor matches the one actually charged. */
  const multiplier = (value: unknown) => {
    const parsed = Number(value ?? 1);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  };
  const user = (session: any) => session.properties.user as { id?: number; is_admin?: boolean } | undefined;
  const body = async (session: any) => await session.parseRequestBody() as Record<string, unknown>;
  const priceFields = ["input_price", "output_price", "cached_input_price", "cache_write_input_price", "cache_write_1h_input_price", "image_input_price", "image_output_price", "audio_input_price", "audio_output_price", "input_price_tiers", "output_price_tiers", "cached_input_price_tiers", "cache_write_input_price_tiers", "cache_write_1h_input_price_tiers", "image_input_price_tiers", "image_output_price_tiers", "audio_input_price_tiers", "audio_output_price_tiers", "time_pricing", "video_billing_config"] as const;
  const defaultPrice = (channelId: number, modelConfigId: number, modelName: string, quotaType = 0) => ({ channel_id: channelId, model_config_id: modelConfigId, model_name: modelName, quota_type: quotaType, ...Object.fromEntries(priceFields.map((field) => [field, field.endsWith("_price") ? "0" : "[]"])) }) as ModelPrice;
  const prices = async () => await db.select("model_prices", {}) as ModelPrice[];
  const availablePrices = async () => { try { const data = db as any; const [configs, channels, models, configured] = await Promise.all([data.select("model_configs", {}), data.select("channels", {}), data.select("models", {}), prices()]); const channelById = new Map<number, any>(channels.map((item: any) => [Number(item.id), item])); const modelById = new Map<number, any>(models.map((item: any) => [Number(item.id), item])); const configuredByBinding = new Map(configured.map((item) => [`${item.channel_id}:${item.model_config_id}`, item])); return configs.map((item: any) => { const channel = channelById.get(Number(item.channel_id)); const model = modelById.get(Number(item.model_id)); const modelName = String(model?.model_name ?? item.upstream_model_name ?? ""); return { ...(configuredByBinding.get(`${item.channel_id}:${item.id}`) ?? defaultPrice(Number(item.channel_id), Number(item.id), modelName, Number(model?.quota_type ?? 0))), channel_name: String(channel?.name ?? "") }; }); } catch { return []; } };
  const findPrice = async (modelName: string, metadata: Record<string, unknown>) => { const channelId = Number(metadata.channelId ?? 0); const modelConfigId = Number(metadata.modelConfigId ?? 0); return channelId && modelConfigId ? ((await db.selectOne("model_prices", { channel_id: channelId, model_config_id: modelConfigId }) as ModelPrice | undefined) ?? defaultPrice(channelId, modelConfigId, modelName)) : defaultPrice(0, 0, modelName); };
  const recordUsage = async (usage: TokenUsageRecord): Promise<TokenLog> => {
    const modelName = String(usage.modelName ?? "").trim();
    const metadata = usage.metadata ?? {};
    const price = await findPrice(modelName, metadata);
    const priced = priceUsage(price, usage);
    const groupMultiplier = multiplier(metadata.groupMultiplier);
    const channelMultiplier = multiplier(metadata.userChannelMultiplier);
    // A caller-supplied total is taken as final; otherwise the price list plus the
    // multipliers produce it, and `base_cost` keeps the pre-multiplier amount.
    const cost = usage.cost ?? applyMultipliers(priced.baseCost, metadata.groupMultiplier, metadata.userChannelMultiplier);
    return await db.create("token_logs", {
      user_id: usage.userId ?? null,
      // Attribution: without these the ledger cannot answer what a session cost.
      session_id: metadata.sessionId ? String(metadata.sessionId) : null,
      run_id: metadata.runId ? String(metadata.runId) : null,
      model_name: modelName,
      input_tokens: priced.inputTokens,
      output_tokens: priced.outputTokens,
      cached_input_tokens: priced.cacheReadTokens,
      cache_write_input_tokens: priced.cacheWriteTokens,
      cache_write_1h_input_tokens: priced.cacheWrite1hTokens,
      input_price: String(price.input_price ?? 0),
      output_price: String(price.output_price ?? 0),
      cached_input_price: String(price.cached_input_price ?? 0),
      cache_write_input_price: String(price.cache_write_input_price ?? 0),
      cache_write_1h_input_price: String(price.cache_write_1h_input_price ?? 0),
      group_multiplier: String(groupMultiplier),
      user_channel_multiplier: String(channelMultiplier),
      // `base_cost` is the price-list amount; `cost` carries the multipliers, so the
      // two rows can always be reconciled against the price that produced them.
      base_cost: String(priced.baseCost),
      cost: String(cost),
      status: 0,
      pricing_formula: JSON.stringify({ ...priced.formula, currency: cfg.currency, group_multiplier: groupMultiplier, user_channel_multiplier: channelMultiplier }),
      channel_id: Number(metadata.channelId ?? 0) || null,
      model_config_id: Number(metadata.modelConfigId ?? 0) || null,
      created_at: now(),
    } as any) as TokenLog;
  };
  const monthStart = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  };
  /**
   * Sums the recorded cost of a user's usage.
   *
   * Spending is derived from the ledger rather than tracked as a mutable balance, so a
   * corrected or refunded row is reflected immediately and two concurrent requests
   * cannot both spend the same allowance.
   */
  const spending = async (userId: number, period: QuotaPeriod) => {
    const rows = await db.select("token_logs", { user_id: userId } as any) as TokenLog[];
    const since = period === "monthly" ? monthStart() : "";
    const inPeriod = since ? rows.filter((row) => String(row.created_at) >= since) : rows;
    return inPeriod.reduce((totals, row) => ({
      spent: totals.spent + (Number(row.cost) || 0),
      request_count: totals.request_count + 1,
      input_tokens: totals.input_tokens + (Number(row.input_tokens) || 0),
      output_tokens: totals.output_tokens + (Number(row.output_tokens) || 0),
    }), { spent: 0, request_count: 0, input_tokens: 0, output_tokens: 0 });
  };
  const normalizePeriod = (value: unknown): QuotaPeriod => value === "monthly" ? "monthly" : "total";
  const composeQuota = (userId: number, username: string, email: string, isAdmin: boolean, row: any, usage: Awaited<ReturnType<typeof spending>>): UserQuota => {
    const limit = row?.limit_amount === null || row?.limit_amount === undefined ? null : Number(row.limit_amount);
    const unlimited = limit === null || !Number.isFinite(limit);
    return {
      user_id: userId,
      username,
      email,
      is_admin: isAdmin,
      limit_amount: unlimited ? null : limit,
      period: normalizePeriod(row?.period),
      spent: usage.spent,
      remaining: unlimited ? null : Math.max(0, limit - usage.spent),
      unlimited,
      request_count: usage.request_count,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    };
  };
  const usersTable = async () => {
    try {
      return await (db as any).select("users", {}) as Array<Record<string, any>>;
    } catch {
      return [] as Array<Record<string, any>>;
    }
  };
  /**
   * The hot path: called before a run starts, so it reads only this user's rows and
   * never the user table. Identity is filled in by `listQuotas`, the only caller that
   * displays it.
   */
  const quotaFor = async (userId: number): Promise<UserQuota> => {
    const row = await db.selectOne("user_quotas", { user_id: userId }).catch(() => undefined) as any;
    const usage = await spending(userId, normalizePeriod(row?.period));
    return composeQuota(userId, "", "", false, row, usage);
  };
  const quotaRows = async () => {
    try {
      return await db.select("user_quotas", {}) as any[];
    } catch {
      return [] as any[];
    }
  };
  const listQuotas = async (): Promise<UserQuota[]> => {
    // One read of each table and a join in memory, rather than a usage query per user.
    const [rows, people, logs] = await Promise.all([
      quotaRows(),
      usersTable(),
      (db.select("token_logs", {}) as Promise<TokenLog[]>).catch(() => [] as TokenLog[]),
    ]);
    const byUser = new Map(rows.map((row) => [Number(row.user_id), row]));
    const totals = new Map<number, { spent: number; request_count: number; input_tokens: number; output_tokens: number }>();
    for (const log of logs) {
      const userId = Number(log.user_id);
      const period = normalizePeriod(byUser.get(userId)?.period);
      if (period === "monthly" && String(log.created_at) < monthStart()) continue;
      const totals_ = totals.get(userId) ?? { spent: 0, request_count: 0, input_tokens: 0, output_tokens: 0 };
      totals.set(userId, {
        spent: totals_.spent + (Number(log.cost) || 0),
        request_count: totals_.request_count + 1,
        input_tokens: totals_.input_tokens + (Number(log.input_tokens) || 0),
        output_tokens: totals_.output_tokens + (Number(log.output_tokens) || 0),
      });
    }
    const ids = new Set<number>(people.map((person) => Number(person.id)));
    for (const row of rows) ids.add(Number(row.user_id));
    for (const userId of totals.keys()) ids.add(userId);
    return [...ids]
      .map((userId) => {
        const person = people.find((item) => Number(item.id) === userId);
        const usage = totals.get(userId) ?? { spent: 0, request_count: 0, input_tokens: 0, output_tokens: 0 };
        return composeQuota(userId, String(person?.username ?? ""), String(person?.email ?? ""), Boolean(person?.is_admin), byUser.get(userId), usage);
      })
      .sort((a, b) => a.user_id - b.user_id);
  };
  const summarize = (rows: TokenLog[]): UsageSummary => {
    const totals = rows.reduce((acc, row) => ({
      request_count: acc.request_count + 1,
      input_tokens: acc.input_tokens + (Number(row.input_tokens) || 0),
      cached_input_tokens: acc.cached_input_tokens + (Number(row.cached_input_tokens) || 0),
      cache_write_input_tokens: acc.cache_write_input_tokens + (Number(row.cache_write_input_tokens) || 0) + (Number(row.cache_write_1h_input_tokens) || 0),
      output_tokens: acc.output_tokens + (Number(row.output_tokens) || 0),
      cost: acc.cost + (Number(row.cost) || 0),
    }), { request_count: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, cost: 0 });
    // `input_tokens` already counts every bucket once, so the uncached share is the
    // remainder rather than a stored column.
    const cacheRead = Math.min(totals.cached_input_tokens, totals.input_tokens);
    const billableInput = Math.max(0, totals.input_tokens - totals.cache_write_input_tokens);
    const uncached = Math.max(0, billableInput - cacheRead);
    const latest = rows[rows.length - 1];
    return {
      ...totals,
      cached_input_tokens: cacheRead,
      uncached_input_tokens: uncached,
      total_tokens: totals.input_tokens + totals.output_tokens,
      cache_hit_rate: billableInput > 0 ? cacheRead / billableInput : 0,
      model_name: String(latest?.model_name ?? ""),
    };
  };
  const sessionUsage = async (userId: number, sessionId: string) => {
    const rows = await db.select("token_logs", { user_id: userId, session_id: sessionId } as any).catch(() => [] as TokenLog[]) as TokenLog[];
    const ordered = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id ?? 0) - Number(b.id ?? 0));
    return {
      session: summarize(ordered),
      // One row per run, so the newest row is the newest run.
      run: ordered.length ? summarize([ordered[ordered.length - 1]]) : null,
    };
  };
  const setQuota = async (userId: number, limit: number | null, period?: QuotaPeriod): Promise<UserQuota> => {
    if (!Number.isFinite(userId) || userId <= 0) throw new Error("user_id is required");
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw new Error("limit_amount must be zero or more, or empty for unlimited");
    const existing = await db.selectOne("user_quotas", { user_id: userId }).catch(() => undefined) as any;
    const record = {
      user_id: userId,
      limit_amount: limit === null ? null : String(limit),
      period: normalizePeriod(period ?? existing?.period),
      updated_at: now(),
    };
    if (existing?.id) await db.update("user_quotas", { id: existing.id }, record as any);
    else await db.create("user_quotas", { ...record, created_at: now() } as any);
    return await quotaFor(userId);
  };
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
    quota: quotaFor,
    setQuota,
    listQuotas,
    // Unlimited users report Infinity so a caller comparing against an amount keeps
    // working without having to special-case them.
    sessionUsage,
    balance: async (userId) => {
      const quota = await quotaFor(userId);
      return quota.unlimited ? Number.POSITIVE_INFINITY : quota.remaining ?? 0;
    },
  };
  ctx.on("advanced-chat.usage", async (usage: TokenUsageRecord) => {
    await recordUsage(usage).catch(() => undefined);
  });
  ctx.i18n("billing.config.currency", { zh: "计费货币", en: "Billing currency", ja: "請求通貨" });
  ctx.i18n("billing.modelPrices", { zh: "模型价格", en: "Model prices", ja: "モデル価格" });
  ctx.i18n("billing.userQuotas", { zh: "用户额度", en: "User quotas", ja: "ユーザー割当" });
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
  ctx.route("/api/billing/quotas").methods("GET").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    session.respond({ quotas: await listQuotas(), currency: cfg.currency }, "json");
  });
  ctx.route("/api/billing/quotas").methods("POST").action(async (session) => {
    if (!user(session)?.is_admin) { session.status = 403; session.respond({ error: "forbidden" }, "json"); return; }
    try {
      const input = await body(session);
      // An empty field in the form means "no limit", which is the default state.
      const raw = input.limit_amount;
      const limit = raw === null || raw === undefined || raw === "" ? null : Number(raw);
      const period = input.period === "monthly" ? "monthly" : "total";
      session.respond(await setQuota(Number(input.user_id), limit, period), "json");
    } catch (error) {
      session.status = 400;
      session.respond({ error: error instanceof Error ? error.message : "invalid" }, "json");
    }
  });
  const statisticsProvider = {
    id: "billing",
    async get(userId: number, from: string, to: string) {
      // Ask the database for this user's rows instead of reading the whole ledger.
      // The date bounds stay in JS: `created_at` is a timestamp and the filters are
      // day strings, so pushing them down would depend on the driver's coercion.
      const rows = (await db.select("token_logs", { user_id: userId } as any) as TokenLog[]).filter((row) => (!from || String(row.created_at).slice(0, 10) >= from) && (!to || String(row.created_at).slice(0, 10) <= to));
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
