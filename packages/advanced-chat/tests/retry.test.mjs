import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchCompletionWithRetry } from "../dist/completion-runtime.js";

/** Records the delays instead of waiting them, so the tests stay instant. */
function harness() {
  const delays = [];
  return {
    delays,
    ctx: { setTimeout: (fn, ms) => { delays.push(ms); fn(); } },
  };
}

const options = (overrides = {}) => ({
  retryAttempts: 5,
  assistantRetryAttempts: 10,
  retryDelayMs: 100,
  retryMaxDelayMs: 10_000,
  requestTimeoutMs: 5_000,
  ...overrides,
});

function stubFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return typeof next === "function" ? next() : next;
  };
  return calls;
}

const response = (status, headers = {}) => new Response(null, { status, headers });

test("a rate limit is retried instead of ending the run", async () => {
  const { ctx, delays } = harness();
  const calls = stubFetch([response(429), response(429), response(200)]);
  const result = await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options());
  assert.equal(result.status, 200);
  assert.equal(calls.length, 3, "only 5xx used to be retried, so 429 returned immediately");
  assert.equal(delays.length, 2);
});

test("the backoff doubles until the cap", async () => {
  const { ctx, delays } = harness();
  stubFetch([response(500)]);
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryAttempts: 4 }));
  assert.deepEqual(delays, [100, 200, 400]);
});

test("the backoff never exceeds the configured cap", async () => {
  const { ctx, delays } = harness();
  stubFetch([response(500)]);
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryMaxDelayMs: 150 }));
  assert.deepEqual(delays, [100, 150, 150, 150]);
});

test("a provider asking to wait longer is honoured", async () => {
  const { ctx, delays } = harness();
  stubFetch([response(429, { "retry-after": "3" }), response(200)]);
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options());
  assert.equal(delays[0], 3000, "the request would have been retried too early otherwise");
});

test("a wait longer than the cap is still capped", async () => {
  const { ctx, delays } = harness();
  stubFetch([response(429, { "retry-after": "600" })]);
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryMaxDelayMs: 5000 }));
  assert.equal(delays[0], 5000);
});

test("attempts stop at the configured count and the last response is returned", async () => {
  const { ctx } = harness();
  const calls = stubFetch([response(503)]);
  const result = await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryAttempts: 5 }));
  assert.equal(calls.length, 5);
  assert.equal(result.status, 503);
  assert.equal(result.ok, false, "the caller decides what a spent budget means");
});

test("assistant runs use their own attempt budget", async () => {
  const { ctx } = harness();
  const calls = stubFetch([response(500)]);
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "assistant", options({ assistantRetryAttempts: 7 }));
  assert.equal(calls.length, 7);
});

test("a rejected request is not retried", async () => {
  const { ctx } = harness();
  const calls = stubFetch([response(400)]);
  const result = await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options());
  assert.equal(calls.length, 1, "a 400 will fail the same way five times");
  assert.equal(result.status, 400);
});

test("an already cancelled run makes no request at all", async () => {
  const { ctx } = harness();
  const calls = stubFetch([response(200)]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ signal: controller.signal })),
    /aborted/,
  );
  assert.equal(calls.length, 0);
});

test("a network error is retried and can still succeed", async () => {
  const { ctx } = harness();
  let attempt = 0;
  globalThis.fetch = async () => {
    attempt += 1;
    if (attempt < 3) throw new TypeError("fetch failed");
    return response(200);
  };
  const result = await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options());
  assert.equal(attempt, 3);
  assert.equal(result.status, 200);
});

test("a persistent network error surfaces the last failure", async () => {
  const { ctx } = harness();
  let attempt = 0;
  globalThis.fetch = async () => { attempt += 1; throw new TypeError("fetch failed"); };
  await assert.rejects(
    fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryAttempts: 5 })),
    /fetch failed/,
  );
  assert.equal(attempt, 5);
});

test("progress is reported before each retry, not after the last attempt", async () => {
  const { ctx } = harness();
  stubFetch([response(500)]);
  const seen = [];
  await fetchCompletionWithRetry(ctx, "https://example.test", {}, "chat", options({ retryAttempts: 3, onRetry: (attempt, total) => seen.push(`${attempt}/${total}`) }));
  assert.deepEqual(seen, ["1/3", "2/3"]);
});
