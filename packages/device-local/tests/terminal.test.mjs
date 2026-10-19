import assert from "node:assert/strict";
import test from "node:test";
import { LocalTerminalManager } from "../src/terminal.ts";

test("local PTY keeps shell state, resizes, isolates owners and closes", { timeout: 15000 }, async () => {
  const manager = new LocalTerminalManager();
  const owner = "1:local-device";
  try {
    const opened = await manager.execute(owner, "terminal_open", { workspace_path: process.cwd(), shell: process.platform === "win32" ? "cmd" : "sh", cols: 80, rows: 24 });
    const id = opened.terminal_id;
    let offset = 0;
    const readUntil = async (expected) => {
      let text = "";
      const deadline = Date.now() + 5000;
      while (!text.includes(expected) && Date.now() < deadline) {
        const chunk = await manager.execute(owner, "terminal_read", { terminal_id: id, offset });
        offset = chunk.offset;
        text += Buffer.from(chunk.data, "base64").toString();
      }
      assert.ok(text.includes(expected), JSON.stringify(text));
    };
    const input = (command) => manager.execute(owner, "terminal_input", { terminal_id: id, data: Buffer.from(command).toString("base64") });
    await input(process.platform === "win32" ? "set VELOCE_PTY_TEST=state-kept\r" : "export VELOCE_PTY_TEST=state-kept\r");
    await input(process.platform === "win32" ? "echo %VELOCE_PTY_TEST%\r" : "printf 'result:%s' \"$VELOCE_PTY_TEST\"\r");
    await readUntil(process.platform === "win32" ? "state-kept" : "result:state-kept");
    const resized = await manager.execute(owner, "terminal_resize", { terminal_id: id, cols: 100, rows: 40 });
    assert.equal(resized.cols, 100);
    if (process.platform !== "win32") {
      await input("stty size\r");
      await readUntil("40 100");
    }
    await assert.rejects(manager.execute("2:other-device", "terminal_input", { terminal_id: id, data: "" }), /not open/);
    await manager.execute(owner, "terminal_close", { terminal_id: id });
    await assert.rejects(manager.execute(owner, "terminal_read", { terminal_id: id }), /not open/);
  } finally { manager.dispose(); }
});

test("local PTY rejects invalid dimensions and non-directory workspaces", async () => {
  const manager = new LocalTerminalManager();
  try {
    await assert.rejects(manager.execute("1:local", "terminal_open", { cols: 501 }), /dimensions/);
    await assert.rejects(manager.execute("1:local", "terminal_open", { workspace_path: import.meta.filename }), /directory/);
  } finally { manager.dispose(); }
});
