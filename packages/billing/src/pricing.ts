import type { ModelPrice } from "./types.js";

/** The usage fields the price calculation reads. Kept structural so a caller can pass a subset. */
export interface PriceableUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  cacheWrite1hInputTokens?: number;
  /**
   * Whether `inputTokens` already counts the cached portion.
   *
   * OpenAI reports `prompt_tokens` inclusive of `prompt_tokens_details.cached_tokens`,
   * while Anthropic reports `input_tokens` with the cache buckets counted beside it.
   * Pricing has to know which one it is looking at, or it subtracts a cached share
   * the reported input never contained.
   */
  inputIncludesCache?: boolean;
}

export interface PricedUsage {
  /** Total input tokens, with every cache bucket included exactly once. */
  inputTokens: number;
  outputTokens: number;
  /** The portion charged at the plain input rate. */
  nonCachedInput: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  /** Price-list amount, before any group or channel multiplier. */
  baseCost: number;
  formula: Record<string, string | number | boolean>;
}

const perMillion = (tokens: number, price: number) => (tokens * price) / 1_000_000;
const amount = (value: unknown) => Math.max(0, Number(value) || 0);

/**
 * Splits a request into the portions a provider charges differently and prices each
 * one at its own rate.
 *
 * The previous calculation read only `input_price`, `cached_input_price` and
 * `output_price`. Cache writes, the one-hour cache writes and the configured image
 * and audio rates were stored on the row and never charged, whatever the admin page
 * allowed you to configure.
 */
export function priceUsage(price: ModelPrice, usage: PriceableUsage): PricedUsage {
  const reportedInput = amount(usage.inputTokens);
  const outputTokens = amount(usage.outputTokens);
  const cacheReadReported = amount(usage.cachedInputTokens);
  const cacheWrite1hReported = amount(usage.cacheWrite1hInputTokens);
  const cacheWriteReported = Math.max(cacheWrite1hReported, amount(usage.cacheWriteInputTokens));
  // Never trust the flag alone: a cache read larger than the reported input can only
  // mean the input excludes the cache, whatever the caller declared.
  const inputIncludesCache = usage.inputIncludesCache !== false && cacheReadReported <= reportedInput;

  const cacheReadTokens = inputIncludesCache ? Math.min(cacheReadReported, reportedInput) : cacheReadReported;
  const nonCachedInput = inputIncludesCache ? reportedInput - cacheReadTokens : reportedInput;
  // A provider that folds the cache into the input bills the write as ordinary input,
  // so charging the explicit write rate on top of it would double-bill.
  const cacheWriteTokens = inputIncludesCache ? 0 : cacheWriteReported - cacheWrite1hReported;
  const cacheWrite1hTokens = inputIncludesCache ? 0 : cacheWrite1hReported;

  const inputPrice = amount(price.input_price);
  const cachedPrice = amount(price.cached_input_price) || inputPrice;
  const cacheWritePrice = amount(price.cache_write_input_price) || inputPrice;
  const cacheWrite1hPrice = amount(price.cache_write_1h_input_price) || cacheWritePrice;
  const outputPrice = amount(price.output_price);

  const baseCost = perMillion(nonCachedInput, inputPrice)
    + perMillion(cacheReadTokens, cachedPrice)
    + perMillion(cacheWriteTokens, cacheWritePrice)
    + perMillion(cacheWrite1hTokens, cacheWrite1hPrice)
    + perMillion(outputTokens, outputPrice);

  return {
    inputTokens: nonCachedInput + cacheReadTokens + cacheWriteTokens + cacheWrite1hTokens,
    outputTokens,
    nonCachedInput,
    cacheReadTokens,
    cacheWriteTokens,
    cacheWrite1hTokens,
    baseCost,
    formula: {
      unit: "per_million_tokens",
      channel_id: Number(price.channel_id) || 0,
      model_config_id: Number(price.model_config_id) || 0,
      non_cached_input: nonCachedInput,
      cached_input: cacheReadTokens,
      cache_write_input: cacheWriteTokens,
      cache_write_1h_input: cacheWrite1hTokens,
      output: outputTokens,
      input_price: inputPrice,
      cached_input_price: cachedPrice,
      cache_write_input_price: cacheWritePrice,
      cache_write_1h_input_price: cacheWrite1hPrice,
      output_price: outputPrice,
      // A row without an id is a synthesised default: no admin ever priced this
      // binding, so a zero cost here is a configuration gap, not a free request.
      configured: Boolean(price.id),
    },
  };
}

/** Applies the multipliers. Non-finite or negative values fall back to 1 rather than zero the bill. */
export function applyMultipliers(baseCost: number, groupMultiplier?: unknown, channelMultiplier?: unknown): number {
  const factor = (value: unknown) => {
    const parsed = Number(value ?? 1);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
  };
  return baseCost * factor(groupMultiplier) * factor(channelMultiplier);
}
