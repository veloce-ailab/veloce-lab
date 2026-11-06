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
            return row;
          },
          async selectOne(table, where) {
            if (table === "advanced_chat_connector_devices")
              return devices.find((device) => device.id === where.id && device.user_id === where.user_id);
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
          async update() {
            return 1;
          },
        },
      },
      route() {
        const route = { methods: () => route, action: () => route };
        return route;
      },
    },
    { maxTaskResultChars: "1000000", maxTaskErrorChars: "100000", taskWaitMs: "1000" },
  );
  return { service, tasks, created };
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

test("with no device to ask the seam still reports what it cannot serve", async () => {
  const { service } = await harness();
  await assert.rejects(
    service.execute(1, "read_file", { path: "a.txt" }),
    /No connector runtime serves the action "read_file"/,
  );
});
