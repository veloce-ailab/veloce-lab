import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SqlDatabase } from "@velocelab/database-core";
import { apply } from "../dist/index.js";

async function setup(t) {
  const raw = new DatabaseSync(":memory:");
  t.after(() => raw.close());
  const db = new SqlDatabase({
    dialect: "sqlite",
    async execute(sql, params = []) {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes), insertId: result.lastInsertRowid };
    },
    async one(sql, params = []) { return raw.prepare(sql).get(...params); },
    async many(sql, params = []) { return raw.prepare(sql).all(...params); },
    async close() {},
  });
  const handlers = new Map();
  await apply({
    component: { database: db, dashboard: { addEntry() {} }, file: {} },
    registerComponent() {},
    route(path) {
      let method;
      return { methods(value) { method = value; return this; }, action(handler) { handlers.set(`${method} ${path}`, handler); } };
    },
  }, {});
  const request = async (method, body, userId = 7, path = "/api/user/advanced-chat/knowledge-bases", ...params) => {
    const session = {
      status: 200, properties: { user: { id: userId } },
      async parseRequestBody() { return body; },
      respond(value, type) { assert.equal(type, "json"); this.body = value; },
    };
    await handlers.get(`${method} ${path}`)(session, new URLSearchParams(), ...params);
    return session;
  };
  return { db, request };
}

test("created knowledge base appears in the frontend list contract", async t => {
  const { request } = await setup(t);
  const created = await request("POST", { name: "  产品文档  ", description: "Reference" });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, "产品文档");
  assert.ok(created.body.id);
  const listed = await request("GET");
  assert.equal(listed.body.knowledge_bases.length, 1);
  assert.equal(listed.body.knowledge_bases[0].id, created.body.id);
  assert.equal(listed.body.knowledge_bases[0].document_count, 0);
  assert.equal(listed.body.knowledge_bases[0].vectorized, false);
  assert.deepEqual((await request("GET", undefined, 8)).body, { knowledge_bases: [] });
  const docs = await request("GET", undefined, 7, "/api/user/advanced-chat/knowledge-bases/:id/documents", created.body.id);
  assert.deepEqual(docs.body, { documents: [] });
});

test("duplicate names return 409 and remain available to other accounts", async t => {
  const { request } = await setup(t);
  await request("POST", { name: "Docs" });
  assert.equal((await request("POST", { name: " Docs " })).status, 409);
  assert.equal((await request("POST", { name: "Docs" }, 8)).status, 201);
});

test("invalid names return 400 without creating records", async t => {
  const { request } = await setup(t);
  for (const body of [null, {}, { name: " " }, { name: "x".repeat(121) }])
    assert.equal((await request("POST", body)).status, 400);
  assert.deepEqual((await request("GET")).body.knowledge_bases, []);
});

test("database failures return JSON instead of escaping the route", async t => {
  const { db, request } = await setup(t);
  t.mock.method(db, "create", async () => { throw Error("Database unavailable"); });
  const result = await request("POST", { name: "Docs" });
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "Failed to create knowledge base");
});
