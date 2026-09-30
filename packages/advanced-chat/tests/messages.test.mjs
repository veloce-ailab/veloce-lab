import assert from "node:assert/strict";
import { test } from "node:test";
import { apply as applyChat } from "../dist/index.js";
import { apply as applyConnector } from "../../connector/dist/index.js";

async function setup(t, responses = [{ content: "Finished" }], { visible = true, messageFailure = false } = {}) {
  const tables = new Map(Object.entries({
    advanced_chat_sessions: [{ id: "session-1", user_id: 7, title: "Test task", visible }],
    advanced_chat_connector_devices: [{ id: "device-1", user_id: 7, status: "online" }],
    channels: [{ id: 1, enabled: true, type: "test", base_url: "https://example.com" }],
    models: [{ id: 1, enabled: true, model_name: "test" }],
    model_configs: [{ id: 1, enabled: true, channel_id: 1, model_id: 1 }],
  }));
  const rows = table => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };
  const matches = (row, query) => Object.entries(query).every(([key, value]) => row[key] === value);
  const db = {
    extend: async () => {},
    select: async (table, query = {}) => rows(table).filter(row => matches(row, query)),
    selectOne: async (table, query) => rows(table).find(row => matches(row, query)),
    create: async (table, value) => { rows(table).push(value); return value; },
    update: async (table, query, value) => {
      const matched = rows(table).filter(row => matches(row, query));
      for (const row of matched) Object.assign(row, value);
      return matched.length;
    },
  };
  const sent = [], registered = [], translations = new Map(), listeners = new Map();
  const route = { methods() { return this; }, action() { return this; } };
  const ctx = {
    component: {
      database: db,
      dashboard: { addEntry() {} },
      file: {},
      message: {
        registerType(_owner, type) { registered.push(type); },
        async send(message) { if (messageFailure) throw Error("Notification unavailable"); sent.push(message); },
      },
      adapters: { build: () => ({ urlPath: "/chat", headers: {}, body: {} }), parse: (_type, data) => data },
    },
    i18n(key, value) { if (typeof key === "string") translations.set(key, value); },
    route: () => route,
    on(name, listener) { listeners.set(name, listener); },
    async emit(name, value) { await listeners.get(name)?.(value); },
    registerComponent(name, service) { this.component[name] = service; },
  };
  t.mock.method(globalThis, "fetch", async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, "unexpected upstream call");
    return Response.json(next);
  });
  await applyChat(ctx, { retryAttempts: 1, assistantRetryAttempts: 1, requestTimeoutMs: 1000 });
  await applyConnector(ctx, {});
  const complete = hooks => ctx.component["advanced-chat"].complete(7, {
    sessionId: "session-1", model: "test", messages: [{ role: "user", content: "Do the task" }],
  }, hooks);
  return { ctx, db, sent, registered, translations, complete };
}

test("registers four message types with all three languages and sends completion", async t => {
  const f = await setup(t);
  assert.deepEqual(f.registered.map(type => type.id), ["completed", "failed", "approval", "question"].map(name => `advanced-chat:${name}`));
  for (const type of f.registered) assert.deepEqual(Object.keys(f.translations.get(type.labelKey)).sort(), ["en", "ja", "zh"]);
  const result = await f.complete();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].type, "advanced-chat:completed");
  assert.equal(f.sent[0].dedupeKey, result.runId);
  assert.equal(f.sent[0].userId, 7);
  assert.equal(f.sent[0].action.href, "/chat/session/session-1");
});

test("sends failure and persists failed run state", async t => {
  const f = await setup(t, [Error("Upstream unavailable")]);
  await assert.rejects(f.complete(), /Upstream unavailable/);
  assert.equal(f.sent[0].type, "advanced-chat:failed");
  assert.equal((await f.db.select("advanced_chat_runs"))[0].status, "failed");
});

test("sends approval immediately when a connector task is created", async t => {
  const f = await setup(t);
  await f.db.create("advanced_chat_runs", { id: "run-1", session_id: "session-1", user_id: 7 });
  const task = await f.ctx.component.connector.createTask(7, { device_id: "device-1", action: "run_command", run_id: "run-1", requiresApproval: true });
  assert.equal(task.status, "pending_approval");
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].type, "advanced-chat:approval");
  assert.equal(f.sent[0].dedupeKey, task.id);
  assert.equal(f.sent[0].action.href, "/settings/devices/device-1");
  await f.ctx.component.connector.createTask(7, { device_id: "device-1", action: "read_file", requiresApproval: false });
  assert.equal(f.sent.length, 1);
});

test("question requests send a message without a completion notification", async t => {
  const f = await setup(t, [{ content: "", toolCalls: [{ id: "call-1", function: { name: "ask_user", arguments: JSON.stringify({ question: "Which file?" }) } }] }, { content: "Waiting for your answer" }]);
  await f.complete();
  assert.deepEqual(f.sent.map(item => item.type), ["advanced-chat:question"]);
  assert.equal(f.sent[0].subtitle, "Which file?");
});

test("pending approval tool results suppress completion messages", async t => {
  const f = await setup(t, [{ content: "", toolCalls: [{ id: "call-1", function: { name: "pending_tool", arguments: "{}" } }] }, { content: "Waiting for approval" }]);
  f.ctx.component["advanced-chat"].registerTool({ name: "pending_tool", execute: async () => ({ status: "pending_approval" }) });
  await f.complete();
  assert.equal(f.sent.length, 0);
});

test("cancelled runs and hidden sessions do not send completion", async t => {
  const f = await setup(t);
  const controller = new AbortController();
  controller.abort();
  const result = await f.complete({ signal: controller.signal });
  assert.equal(result.cancelled, true);
  assert.equal(f.sent.length, 0);
});

test("hidden sessions do not send completion messages", async t => {
  const f = await setup(t, undefined, { visible: false });
  await f.complete();
  assert.equal(f.sent.length, 0);
});

test("message service failures do not fail successful runs", async t => {
  const f = await setup(t, undefined, { messageFailure: true });
  const result = await f.complete();
  assert.equal(result.message.content, "Finished");
  assert.equal((await f.db.select("advanced_chat_runs"))[0].status, "completed");
});
