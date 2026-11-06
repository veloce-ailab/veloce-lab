import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { Sandbox } from "@velocelab/sandbox";
import { apply } from "../dist/index.js";

async function localConnector(sandbox = new Sandbox()) {
  const cleanup = [];
  const tasks = [];
  let type;
  await apply(
    {
      i18n() {},
      affect(fn) {
        cleanup.push(fn);
      },
      setInterval() {},
      registerComponent() {},
      component: {
        database: {
          async select() {
            return [];
          },
          async selectOne() {
            return { id: "task-1", status: "completed", result: "ok", error_message: "" };
          },
        },
        // The real plugin service: what "confined" means is the sandbox's
        // business, and this test is about whether the connector asks for it.
        sandbox,
        connector: {
          registerType(value) {
            type = value;
          },
          async createTask(_userId, input) {
            tasks.push(input);
            return { id: "task-1", ...input };
          },
          async executeTask() {
            return true;
          },
        },
      },
    },
    {
      commandWaitMs: "2000",
      allowCommandExecution: true,
      allowFileWrite: true,
      allowMcpProcesses: true,
      allowUnsandboxedCommands: false,
      sandboxWritablePaths: "",
    },
  );
  return {
    type,
    tasks,
    dispose() {
      cleanup.forEach((fn) => fn());
    },
  };
}

test("sandbox mode runs a command without asking anyone", async () => {
  const connector = await localConnector();
  try {
    const result = await connector.type.actions.run_command(
      1,
      { command: "echo hi", approval_mode: "sandbox", connector_workspace_path: "/tmp/ws" },
      { id: "local" },
    );
    assert.equal(connector.tasks.length, 1);
    assert.equal(connector.tasks[0].action, "run_command");
    assert.equal(connector.tasks[0].requiresApproval, false);
    assert.equal(result.status, "completed");
  } finally {
    connector.dispose();
  }
});

test("only the approving assistant leaves a task waiting", async () => {
  const connector = await localConnector();
  try {
    await connector.type.actions.run_command(1, { command: "echo hi", approval_mode: "assistant" }, { id: "local" });
    await connector.type.actions.run_command(1, { command: "echo hi", approval_mode: "full_access" }, { id: "local" });
    await connector.type.actions.git_action(1, { approval_mode: "sandbox", action: "commit" }, { id: "local" });
    await connector.type.actions.git_action(1, { approval_mode: "assistant", action: "commit" }, { id: "local" });
    assert.deepEqual(
      connector.tasks.map((task) => [task.action, task.requiresApproval]),
      [
        ["run_command", true],
        ["run_command", false],
        ["git_action", false],
        ["git_action", true],
      ],
    );
  } finally {
    connector.dispose();
  }
});

test("a sandboxed task keeps its command inside the workspace", async (t) => {
  const sandbox = new Sandbox();
  const backends = await sandbox.backends();
  if (backends.length === 0) {
    t.skip("this host provides no kernel sandbox");
    return;
  }
  const connector = await localConnector(sandbox);
  const workspace = await mkdtemp(path.join(tmpdir(), "vl-local-sandbox-"));
  const escape = path.join(homedir(), `vl-local-escape-${process.pid}.txt`);
  try {
    const inside = await connector.type.runTask(
      {
        id: "task-inside",
        user_id: 1,
        device_id: "local",
        action: "run_command",
        workspace_path: workspace,
        payload: JSON.stringify({ command: "printf hi > inside.txt", approval_mode: "sandbox" }),
      },
      { id: "local" },
    );
    assert.equal(inside.success, true, inside.error_message);
    assert.equal(await readFile(path.join(workspace, "inside.txt"), "utf8"), "hi");

    const outside = await connector.type.runTask(
      {
        id: "task-outside",
        user_id: 1,
        device_id: "local",
        action: "run_command",
        workspace_path: workspace,
        payload: JSON.stringify({ command: `printf nope > ${JSON.stringify(escape)}`, approval_mode: "sandbox" }),
      },
      { id: "local" },
    );
    assert.equal(outside.success, false);
    assert.match(outside.result, /Sandbox:/);
    await assert.rejects(readFile(escape, "utf8"), /ENOENT/);
  } finally {
    await rm(escape, { force: true });
    await rm(workspace, { recursive: true, force: true });
    connector.dispose();
  }
});
