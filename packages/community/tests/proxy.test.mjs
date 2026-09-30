import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../dist/index.js";

function setup() {
  const handlers = new Map();
  apply({
    component: { dashboard: { addEntry() {} } },
    route(path) { return { methods() { return this; }, action(handler) { handlers.set(path, handler); } }; },
  }, { apiBaseUrl: "https://community.example/api/v1", requestTimeoutMs: "1000", maxResponseBytes: "2048" });
  return async (path = "/api/community/characters", id) => {
    const responses = [];
    const session = { status: 200, respond(body, type) { responses.push({ body, type }); } };
    await handlers.get(path)(session, new URLSearchParams("page=2"), id);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, "json");
    return { status: session.status, body: responses[0].body };
  };
}

for (const [name, upstream] of [
  ["connection reset", () => { throw new TypeError("fetch failed", { cause: Object.assign(Error("reset"), { code: "ECONNRESET" }) }); }],
  ["timeout", () => { throw new DOMException("timed out", "TimeoutError"); }],
  ["body read failure", () => ({ ok: true, arrayBuffer: async () => { throw Error("connection reset while reading"); } })],
  ["invalid JSON", () => new Response("invalid")],
  ["oversized body", () => new Response("x".repeat(2049))],
  ["upstream server error", () => new Response("error", { status: 500 })],
]) {
  test(`${name} returns 502 without leaking an exception`, async t => {
    const request = setup();
    t.mock.method(globalThis, "fetch", async () => upstream());
    const result = await request();
    assert.equal(result.status, 502);
    assert.ok(result.body.error);
  });
}

test("successful response preserves query and normalizes image URLs", async t => {
  const request = setup();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://community.example/api/v1/characters?page=2");
    assert.deepEqual(options.headers, { accept: "application/json" });
    return Response.json({ items: [{ image_url: "/covers/example.png" }] });
  });
  assert.deepEqual(await request(), { status: 200, body: { items: [{ image_url: "https://community.example/covers/example.png" }] } });
});

test("missing resources return 404", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  assert.equal((await setup()()).status, 404);
});

test("invalid resource IDs return 400 before fetching", async t => {
  t.mock.method(globalThis, "fetch", async () => { assert.fail("must not fetch invalid IDs"); });
  assert.equal((await setup()("/api/community/characters/:id", "bad/id")).status, 400);
});
