import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { Context } from "yumeri";
import { MessageService } from "@velocelab/message";
import { apply } from "../dist/index.js";

const configuration = {
  registryBaseUrl: "https://registry.example.test",
  requestTimeoutMs: "1000",
  maxVersionsPerPlugin: "100",
  checkIntervalMinutes: "360",
};
const metadata = () => ({ ok: true, status: 200, json: async () => ({ "dist-tags": { latest: "999.0.0" } }) });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Background check did not settle")), 2000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function setup(t, { onError = () => {}, selectUsers } = {}) {
  const messages = [];
  const errors = [];
  let userQueries = 0;
  const delivered = deferred();
  const db = {
    async extend() {},
    async select(table) {
      if (table !== "users") return [];
      userQueries += 1;
      return selectUsers ? await selectUsers() : [{ id: 7 }];
    },
    async selectOne() { return undefined; },
    async create(_table, value) {
      const row = { ...value, id: messages.length + 1 };
      messages.push(row);
      delivered.resolve(row);
      return row;
    },
  };
  const core = {
    routes: {},
    loader: { config: { plugins: { "@velocelab/update-checker": {} } } },
    getService() { return undefined; },
    logger: {
      warn() {},
      error(...args) { errors.push(args); onError(errors); },
    },
    route(path) {
      const route = { methods() { return this; }, action() { return this; } };
      this.routes[path] = route;
      return route;
    },
  };
  const ctx = new Context(core, "update-checker", undefined, { database: db, dashboard: { addEntry() {} } });
  const message = new MessageService(ctx);
  ctx.inject("message", message);
  t.after(() => ctx.dispose());
  return { ctx, message, db, messages, errors, delivered, get userQueries() { return userQueries; } };
}

test("automatic check delivers a registered plugin update message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => metadata());
  const f = setup(t);
  await apply(f.ctx, configuration);
  const result = await bounded(f.delivered.promise);
  assert.equal(result.user_id, 7);
  assert.equal(result.type, "update-checker:plugin-update");
  assert.equal(result.source, "update-checker");
  assert.match(result.title, /999\.0\.0 is available$/);
  assert.deepEqual(JSON.parse(result.action), { href: "/settings/plugin-updates" });
  assert.equal(f.errors.length, 0);
});

test("unload during registry lookup discards the in-flight update after type cleanup", async (t) => {
  const started = deferred();
  const response = deferred();
  t.mock.method(globalThis, "fetch", async () => { started.resolve(); return await response.promise; });
  const f = setup(t);
  await apply(f.ctx, configuration);
  await bounded(started.promise);
  await f.ctx.dispose();
  assert.equal(f.message.types().length, 0);
  response.resolve(metadata());
  await nextTurn();
  assert.equal(f.userQueries, 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.errors.length, 0);
});

test("unload during user lookup prevents sending through the removed message type", async (t) => {
  const started = deferred();
  const users = deferred();
  t.mock.method(globalThis, "fetch", async () => metadata());
  const f = setup(t, { selectUsers: async () => { started.resolve(); return await users.promise; } });
  await apply(f.ctx, configuration);
  await bounded(started.promise);
  await f.ctx.dispose();
  users.resolve([{ id: 7 }]);
  await nextTurn();
  assert.equal(f.messages.length, 0);
  assert.equal(f.errors.length, 0);
});

test("initial and periodic send failures are caught by Context timers", async (t) => {
  const caught = deferred();
  t.mock.method(globalThis, "fetch", async () => metadata());
  const f = setup(t, { onError: (errors) => { if (errors.length === 2) caught.resolve(); } });
  const failure = new Error("Notification delivery unavailable");
  t.mock.method(f.message, "send", async () => { throw failure; });
  await apply(f.ctx, { ...configuration, checkIntervalMinutes: "0.001" });
  await bounded(caught.promise);
  await f.ctx.dispose();
  assert.equal(f.errors.length, 2);
  for (const entry of f.errors) {
    assert.match(entry[0], /timer callback of plugin "update-checker"/);
    assert.equal(entry[1], failure);
  }
  const count = f.userQueries;
  // Exercise an already-disposed Context's timer guard as well as real cleanup.
  assert.equal(f.ctx.setTimeout(() => { throw new Error("Disposed callback ran"); }, 0), undefined);
  await nextTurn();
  assert.equal(f.userQueries, count);
});

test("zero interval disables initial and periodic checks", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => metadata());
  const f = setup(t);
  const timeout = t.mock.method(f.ctx, "setTimeout");
  const interval = t.mock.method(f.ctx, "setInterval");
  await apply(f.ctx, { ...configuration, checkIntervalMinutes: "0" });
  await nextTurn();
  assert.equal(timeout.mock.callCount(), 0);
  assert.equal(interval.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(f.messages.length, 0);
});
