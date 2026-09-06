import { Context, Schema } from "yumeri";

export const depend = ["model"];
export const provide = ["billing"];
export interface BillingService {
  countTokens(model: string, text: string): number;
  calculateCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number, groupMultiplier?: number, channelMultiplier?: number): number;
  charge(userId: number, amount: number, metadata?: Record<string, unknown>): Promise<boolean>;
  balance(userId: number): Promise<number>;
}
export interface BillingConfig { enabled: boolean; }
export const config: Schema<BillingConfig> = Schema.object({ enabled: Schema.boolean("Enable billing").default(true) });
declare module "yumeri" { interface Components { billing: BillingService; } }

function estimate(text: string) { return text ? Math.max(1, Math.ceil(Array.from(text).length / 4)) : 0; }
export function apply(ctx: Context, cfg: BillingConfig) {
  const balances = new Map<number, number>();
  const service: BillingService = {
    countTokens: (_model, text) => estimate(text),
    calculateCost: (input, output, inputPrice, outputPrice, group = 1, channel = 1) => ((input * inputPrice + output * outputPrice) / 1_000_000) * group * channel,
    balance: async (userId) => balances.get(userId) ?? 0,
    charge: async (userId, amount) => { if (!cfg.enabled || amount <= 0) return true; const current = balances.get(userId) ?? 0; if (current < amount) return false; balances.set(userId, current - amount); return true; },
  };
  ctx.registerComponent("billing", service);
}
