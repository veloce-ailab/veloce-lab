import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTokenUsage } from "../dist/index.js";

test("OpenAI counts the cached tokens inside the prompt tokens", () => {
  const usage = extractTokenUsage({
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 500,
      prompt_tokens_details: { cached_tokens: 400 },
    },
  });
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.cachedInputTokens, 400);
  assert.equal(usage.inputIncludesCache, true);
});

test("Anthropic reports the cache buckets beside the input", () => {
  const usage = extractTokenUsage({
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 200,
    },
  });
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.cachedInputTokens, 400);
  assert.equal(usage.cacheWriteInputTokens, 200);
  assert.equal(usage.inputIncludesCache, false);
});

test("an OpenAI-shaped relay that excludes the cache from prompt_tokens is detected", () => {
  // The shape says inclusive, but a cache read larger than the input cannot be a
  // subset of it. This is the case that billed almost nothing on a cached relay.
  const usage = extractTokenUsage({
    usage: {
      prompt_tokens: 217,
      completion_tokens: 13,
      prompt_tokens_details: { cached_tokens: 2048 },
    },
  });
  assert.equal(usage.cachedInputTokens, 2048);
  assert.equal(usage.inputIncludesCache, false, "the numbers must override the field names");
});

test("a fully cached request is still inclusive", () => {
  const usage = extractTokenUsage({
    usage: { prompt_tokens: 900, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 900 } },
  });
  assert.equal(usage.inputIncludesCache, true, "equal counts are possible when everything is cached");
});

test("a one-hour cache write is split out", () => {
  const usage = extractTokenUsage({
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
    },
  });
  assert.equal(usage.cacheWrite1hInputTokens, 200);
  assert.equal(usage.cacheWriteInputTokens, 300, "the total write count covers both TTLs");
});

test("usage absent from the body yields zeroes rather than NaN", () => {
  const usage = extractTokenUsage({});
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
  assert.equal(usage.cachedInputTokens, 0);
});
