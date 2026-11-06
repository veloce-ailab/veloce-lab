import assert from "node:assert/strict";
import test from "node:test";
import { apply } from "../dist/index.js";

/**
 * A connector plugin wired to a fake database and one external device: a kind
 * nobody registered a type for, which is what a separate connector program looks
 * like from this side.
 */
async function harness({
  devicestatus = "online",
  answer = { status: "completed", result: JSON.stringify({ path: "/work/a.txt", content: "hi" }) },
} = {}) {
  const tasks = [];
  const created = [];
  const routes = [];
  const devices = [
    { id: "dev-1", user_id: 1, name: "desk", kind: "cli", status: devicestatus },
  ];
  let service;
  await apply(
    {
      i18n() {},
      on() {},
      emit: async () => undefined,
      setTimeout: (fn) => setTimeout(fn, 0),
      registerComponent(_name, value) {
        service = value;
      },
      component: {
        dashboard: { addEntry() {} },
        database: {
          async extend() {},
          async select() {
            return [];
          },
          async create(table, values) {
            const row = { ...values };
            // Keep the status it was created with: the answer below overwrites
            // the live row, and the test is about what the host asked for.
            created.push({ table, values: { ...values } });
            if (table === "advanced_chat_connector_tasks") tasks.push(row);
            if (table === "advanced_chat_connector_devices") devices.push(row);
            return row;
          },
          async selectOne(table, where) {
            if (table === "advanced_chat_connector_devices") {
              if (where.id)
                return devices.find(
                  (device) =>
                    device.id === where.id &&
                    (where.user_id === undefined || device.user_id === where.user_id),
                );
              // An installation asks for its own row by kind and instance id.
              return devices.find(
                (device) =>
                  device.user_id === where.user_id &&
                  device.kind === where.kind &&
                  device.desktop_instance_id === where.desktop_instance_id,
              );
            }
            if (table === "advanced_chat_connector_tasks") {
              const row = tasks.find(
                (task) =>
                  task.id === where.id &&
                  (where.user_id === undefined || task.user_id === where.user_id),
              );
              if (!row) return undefined;
              // The agent answers between polls, which is the point being tested.
              if (!row.answered) {
                row.answered = true;
                Object.assign(row, answer);
              }
              return { ...row };
            }
            return undefined;
          },
          async update(table, where, values) {
            if (table !== "advanced_chat_connector_devices") return 1;
            const device = devices.find((entry) => entry.id === where.id && entry.user_id === where.user_id);
            if (!device) return 0;
            Object.assign(device, values);
            return 1;
          },
        },
      },
      route(path) {
        // Routes are recorded so a test can call one the way the server would.
        const route = {
          methods: () => route,
          action(handler) {
            routes.push({ path, handler });
            return route;
          },
        };
        return route;
      },
    },
    { maxTaskResultChars: "1000000", maxTaskErrorChars: "100000", taskWaitMs: "1000" },
  );
  const call = async (path, body = {}, userId = 1) => {
    const route = routes.find((entry) => entry.path === path);
    if (!route) throw new Error(`no route registered for ${path}`);
    let responded;
    let status = 200;
    await route.handler({
      properties: { user: { id: userId } },
      status,
      async parseRequestBody() {
        return body;
      },
      respond(value) {
        responded = value;
      },
    });
    return responded;
  };
  return { service, tasks, created, routes, call };
}

test("an action a device serves itself is asked through its queue", async () => {
  const { service, created } = await harness();
  const result = await service.execute(1, "read_file", {
    device_id: "dev-1",
    path: "a.txt",
    workspace_path: "/work",
    approval_mode: "sandbox",
  });
  assert.deepEqual(result, { path: "/work/a.txt", content: "hi" });
  assert.equal(created.length, 1);
  const task = created[0].values;
  assert.equal(task.action, "read_file");
  assert.equal(task.device_id, "dev-1");
  assert.equal(task.workspace_path, "/work");
  // Workspace-scoped work never waits for a decision, however the session is set.
  assert.equal(task.status, "queued");
  assert.equal(JSON.parse(task.payload).path, "a.txt");
});

test("a plain-text answer comes back as text, not as a parse failure", async () => {
  const { service } = await harness({ answer: { status: "completed", result: "done" } });
  assert.equal(await service.execute(1, "list_directory", { device_id: "dev-1" }), "done");
});

test("a command only waits when the session says the assistant decides", async () => {
  const { service, created } = await harness({ answer: { status: "completed", result: "ok" } });
  await service.execute(1, "run_command", {
    device_id: "dev-1",
    command: "ls",
    approval_mode: "sandbox",
    workspace_path: "/work",
  });
  await service.execute(1, "run_command", {
    device_id: "dev-1",
    command: "ls",
    approval_mode: "assistant",
    workspace_path: "/work",
  });
  assert.deepEqual(
    created.map((entry) => entry.values.status),
    ["queued", "pending_approval"],
  );
});

test("a rejected task surfaces the device's reason", async () => {
  const { service } = await harness({
    answer: { status: "rejected", error_message: "denied by the approval assistant" },
  });
  await assert.rejects(
    service.execute(1, "run_command", { device_id: "dev-1", command: "ls", approval_mode: "assistant" }),
    /denied by the approval assistant/,
  );
});

test("an offline device fails at once instead of hanging the call", async () => {
  const { service, created } = await harness({ devicestatus: "offline" });
  await assert.rejects(
    service.execute(1, "read_file", { device_id: "dev-1", path: "a.txt", workspace_path: "/work" }),
    /offline/,
  );
  assert.equal(created.length, 0);
});

test("a desktop installation keeps one device row and gets a fresh token", async () => {
  const { call, created } = await harness();
  const input = {
    name: "workstation",
    kind: "desktop",
    desktop_instance_id: "install-1",
    hostname: "workstation",
    os: "linux",
    arch: "x64",
    version: "0.1.0",
  };
  const first = await call("/api/user/advanced-chat/devices/token", input);
  assert.equal(first.kind, "desktop");
  assert.equal(first.desktop_instance_id, "install-1");
  assert.ok(first.token);
  const devices = created.filter((entry) => entry.table === "advanced_chat_connector_devices");
  assert.equal(devices.length, 1);

  // The same installation asks again: the row is reused and only its token
  // changes, so restarting the app does not pile up devices in the list.
  const second = await call("/api/user/advanced-chat/devices/token", input);
  assert.notEqual(second.token, first.token);
  assert.equal(created.filter((entry) => entry.table === "advanced_chat_connector_devices").length, 1);
});

test("with no device to ask the seam still reports what it cannot serve", async () => {
  const { service } = await harness();
  await assert.rejects(
    service.execute(1, "read_file", { path: "a.txt" }),
    /No connector runtime serves the action "read_file"/,
  );
});
