import { Context, Schema } from "yumeri";
import type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask } from "./types.js";
import "@velocelab/database-core";
export type { PaymentOrder, WalletTransaction, WalletLimitUsage, ReferralCommissionLog, TokenLog, VideoTask } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    payment_orders: PaymentOrder;
    wallet_transactions: WalletTransaction;
    wallet_limit_usages: WalletLimitUsage;
    referral_commission_logs: ReferralCommissionLog;
    token_logs: TokenLog;
    video_tasks: VideoTask;
  }
}

export const depend = ["database"];
export const provide = ["billing"];
export interface BillingService {
  countTokens(model: string, text: string): number;
  calculateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number, groupMultiplier?: number, channelMultiplier?: number): number;
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
  const balances = new Map<number, number>();
  const service: BillingService = {
    countTokens: (_model, text) => estimate(text),
    calculateCost: (input, output, inputPrice, outputPrice, group = 1, channel = 1) => ((input * inputPrice + output * outputPrice) / 1_000_000) * group * channel,
    balance: async (userId) => balances.get(userId) ?? 0,
    charge: async (userId, amount) => { if (amount <= 0) return true; const current = balances.get(userId) ?? 0; if (current < amount) return false; balances.set(userId, current - amount); return true; },
  };
  ctx.registerComponent("billing", service);
}
