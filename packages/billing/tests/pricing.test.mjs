import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMultipliers, priceUsage } from "../dist/pricing.js";

const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-12,
  `expected ${expected}, got ${actual}`,
);

function price(overrides = {}) {
  return {
    id: 1,
    channel_id: 7,
    model_config_id: 9,
    model_name: "test-model",
    quota_type: 0,
    input_price: "3",
    output_price: "15",
    cached_input_price: "0.3",
    cache_write_input_price: "3.75",
    cache_write_1h_input_price: "6",
    image_input_price: "0",
    image_output_price: "0",
    audio_input_price: "0",
    audio_output_price: "0",
    input_price_tiers: "[]",
    output_price_tiers: "[]",
    cached_input_price_tiers: "[]",
    cache_write_input_price_tiers: "[]",
    cache_write_1h_input_price_tiers: "[]",
    image_input_price_tiers: "[]",
    image_output_price_tiers: "[]",
    audio_input_price_tiers: "[]",
    audio_output_price_tiers: "[]",
    time_pricing: "[]",
    video_billing_config: "[]",
    updated_at: "",
    created_at: "",
    ...overrides,
  };
}

test("OpenAI-style usage counts the cached share inside the prompt tokens", () => {
  const result = priceUsage(price(), {
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 400,
    inputIncludesCache: true,
  });
  assert.equal(result.nonCachedInput, 600);
  assert.equal(result.cacheReadTokens, 400);
  assert.equal(result.cacheWriteTokens, 0);
  assert.equal(result.inputTokens, 1000, "the total must not double count the cache");
  // 600*3 + 400*0.3 + 500*15, per million
  close(result.baseCost, 0.00942);
});

test("Anthropic-style usage reports cache buckets beside the input", () => {
  const result = priceUsage(price(), {
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 400,
    cacheWriteInputTokens: 200,
    inputIncludesCache: false,
  });
  assert.equal(result.nonCachedInput, 1000, "cache reads must not be subtracted from an input that never held them");
  assert.equal(result.cacheReadTokens, 400);
  assert.equal(result.cacheWriteTokens, 200);
  assert.equal(result.inputTokens, 1600, "the stored total covers every bucket");
  // 1000*3 + 400*0.3 + 200*3.75 + 500*15
  close(result.baseCost, 0.01137);
});

test("one-hour cache writes are split out and charged their own rate", () => {
  const result = priceUsage(price(), {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteInputTokens: 200,
    cacheWrite1hInputTokens: 50,
    inputIncludesCache: false,
  });
  assert.equal(result.cacheWrite1hTokens, 50);
  assert.equal(result.cacheWriteTokens, 150, "the 1h TTL is a subset, not an addition");
  // 150*3.75 + 50*6
  close(result.baseCost, (150 * 3.75 + 50 * 6) / 1_000_000);
});

test("a provider that folds the cache into the input is not billed for writes twice", () => {
  const result = priceUsage(price(), {
    inputTokens: 1000,
    outputTokens: 0,
    cachedInputTokens: 100,
    cacheWriteInputTokens: 100,
    inputIncludesCache: true,
  });
  assert.equal(result.cacheWriteTokens, 0);
  assert.equal(result.nonCachedInput, 900);
  // No write charge on top: 900*3 + 100*0.3
  close(result.baseCost, (900 * 3 + 100 * 0.3) / 1_000_000);
});

test("an unpriced cache rate falls back to the input rate instead of billing nothing", () => {
  const result = priceUsage(price({ cached_input_price: "0", cache_write_input_price: "0", cache_write_1h_input_price: "0" }), {
    inputTokens: 1000,
    outputTokens: 0,
    cachedInputTokens: 400,
    inputIncludesCache: true,
  });
  close(result.baseCost, (1000 * 3) / 1_000_000);
});

test("a negative or non-finite count is treated as zero", () => {
  const result = priceUsage(price(), { inputTokens: -5, outputTokens: Number.NaN, cachedInputTokens: -1 });
  assert.equal(result.inputTokens, 0);
  assert.equal(result.outputTokens, 0);
  close(result.baseCost, 0);
});

test("group and channel multipliers compose, and bad values do not zero the bill", () => {
  close(applyMultipliers(2, 1.5, 2), 6);
  close(applyMultipliers(2, undefined, undefined), 2);
  close(applyMultipliers(2, Number.NaN, -3), 2, "invalid multipliers fall back to 1");
});

test("a synthesised default price is flagged as unconfigured", () => {
  assert.equal(priceUsage(price(), { inputTokens: 1, outputTokens: 1 }).formula.configured, true);
  assert.equal(priceUsage(price({ id: undefined }), { inputTokens: 1, outputTokens: 1 }).formula.configured, false);
});

test("the recorded formula carries the prices it applied", () => {
  const { formula } = priceUsage(price(), { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 400, inputIncludesCache: true });
  assert.equal(formula.input_price, 3);
  assert.equal(formula.cached_input_price, 0.3);
  assert.equal(formula.output_price, 15);
  assert.equal(formula.channel_id, 7);
  assert.equal(formula.model_config_id, 9);
});

test("a relay whose prompt tokens exclude the cache is billed on the full input", () => {
  // The caller declares inclusive semantics, but the numbers contradict it: a cache
  // read of 238,336 cannot sit inside an input of 15,422.
  const result = priceUsage(price(), {
    inputTokens: 15422,
    outputTokens: 4895,
    cachedInputTokens: 238336,
    inputIncludesCache: true,
  });
  assert.equal(result.nonCachedInput, 15422);
  assert.equal(result.cacheReadTokens, 238336);
  assert.equal(result.inputTokens, 253758);
  close(result.baseCost, (15422 * 3 + 238336 * 0.3 + 4895 * 15) / 1_000_000);
});
