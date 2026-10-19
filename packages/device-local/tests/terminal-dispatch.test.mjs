import assert from "node:assert/strict";
import test from "node:test";
import { apply } from "../dist/index.js";
import { registerAdvancedChatRoutes } from "../../advanced-chat/dist/routes.js";

async function localConnector(allowCommandExecution = true) {
  const cleanup = [];
  let type;
  await apply({
    i18n() {}, affect(fn) { cleanup.push(fn); }, setInterval() {}, registerComponent() {},
    component: { database: { async select() { return []; } }, connector: { registerType(value) { type = value; } } },
  }, { allowCommandExecution });
  return { type, dispose() { cleanup.forEach((fn) => fn()); } };
}

test("built-in connector dispatches terminal actions inline and through queued tasks", async () => {
  const connector = await localConnector();
  const device = { id: "local-test" };
  try {
    for (const action of ["terminal_open", "terminal_input", "terminal_read", "terminal_resize", "terminal_close"]) {
      assert.ok(connector.type.capabilities.includes(action));
      assert.equal(typeof connector.type.actions[action], "function");
    }
    const opened = await connector.type.actions.terminal_open(1, {}, device);
    const result = await connector.type.runTask({ id: "test-task", user_id: 1, device_id: device.id, action: "terminal_resize", payload: JSON.stringify({ terminal_id: opened.terminal_id, cols: 90, rows: 25 }) }, device);
    assert.equal(result.success, true);
    assert.equal(JSON.parse(result.result).cols, 90);
    await assert.rejects(connector.type.actions.terminal_close(2, { terminal_id: opened.terminal_id }, device), /not open/);
    await connector.type.actions.terminal_close(1, { terminal_id: opened.terminal_id }, device);
  } finally { connector.dispose(); }
});

test("built-in terminal respects disabled command execution", async () => {
  const connector = await localConnector(false);
  try {
    assert.throws(() => connector.type.actions.terminal_open(1, {}, { id: "local" }), /disabled/);
    const result = await connector.type.runTask({ user_id: 1, device_id: "local", action: "terminal_open", payload: "{}" }, {});
    assert.equal(result.success, false);
    assert.match(result.error_message, /disabled/);
  } finally { connector.dispose(); }
});

test("terminal HTTP routes reach the built-in PTY without creating polling tasks", async () => {
  const connector = await localConnector();
  const routes = new Map();
  const device = { id: "local-route-test", user_id: 1, status: "online" };
  const ctx = {
    component: { database: { async selectOne() { return device; } } },
    getComponent(name) {
      assert.equal(name, "connector");
      return { execute(userId, action, input) { return connector.type.actions[action](userId, input, device); } };
    },
    route(url) { return { methods() { return this; }, action(fn) { routes.set(url, fn); return this; } }; },
  };
  registerAdvancedChatRoutes(ctx, { createConnectorTask() { throw Error("Local PTY must not use the task queue"); } });
  const call = async (action, payload) => {
    let result;
    const input = { connector_device_id: device.id, ...payload };
    const session = { properties: { user: { id: 1 } }, query: input, async parseRequestBody() { return input; }, respond(value) { result = value; } };
    await routes.get(`/api/user/advanced-chat/terminal/${action}`)(session);
    assert.equal(session.status, undefined, JSON.stringify(result));
    return result;
  };
  try {
    const opened = await call("open", { connector_workspace_path: process.cwd() });
    const terminal_id = opened.terminal_id;
    assert.ok(terminal_id);
    await call("input", { terminal_id, data: Buffer.from("echo route-pty-ok\r").toString("base64") });
    let output = "", offset = 0;
    const deadline = Date.now() + 5000;
    while (!output.includes("route-pty-ok") && Date.now() < deadline) {
      const chunk = await call("output", { terminal_id, offset });
      offset = chunk.offset;
      output += Buffer.from(chunk.data, "base64").toString();
    }
    assert.match(output, /route-pty-ok/);
    assert.equal((await call("resize", { terminal_id, cols: 80, rows: 24 })).cols, 80);
    await call("close", { terminal_id });
  } finally { connector.dispose(); }
});
