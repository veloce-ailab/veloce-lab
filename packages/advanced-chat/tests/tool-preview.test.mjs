import assert from "node:assert/strict"
import { test } from "node:test"
import { toolCommandTranscript, toolFileContent, toolFileDiffs } from "../frontend/lib/tool-preview.ts"

const call = (value = {}) => ({ id: "call-1", name: "run_command", status: "ok", ...value })

test("command preview unwraps completed connector task output and keeps stdout and stderr", () => {
  assert.deepEqual(toolCommandTranscript(call({ arguments: { command: "npm test" }, result: JSON.stringify({ task_id: "task-1", status: "failed", output: JSON.stringify({ stdout: "test output\n", stderr: "failed\n", exit_code: 1 }) }) })), { command: "npm test", cwd: "", output: "test output\nfailed\n", exitCode: 1 })
})

test("legacy terminal headers appear once and retain the command working directory", () => {
  assert.deepEqual(toolCommandTranscript(call({ arguments: { command: "pwd" }, result: JSON.stringify({ task_id: "task-1", status: "completed", output: "$ pwd\ncwd: /project\nexit code: 0\n/project\n" }) })), { command: "pwd", cwd: "/project", output: "/project\n", exitCode: 0 })
})

test("command output that merely resembles metadata is preserved", () => {
  assert.equal(toolCommandTranscript(call({ arguments: { command: "cat log.txt" }, result: "$ echo other\ncwd: /unrelated\nexit code: 0\ntext" })).output, "$ echo other\ncwd: /unrelated\nexit code: 0\ntext")
})

test("empty file snapshots remain empty, and file contents retain whitespace", () => {
  assert.equal(toolFileContent(call({ result: JSON.stringify({ path: "file", content: "" }) })), "")
  assert.equal(toolFileContent(call({ result: JSON.stringify({ path: "file", content: "\n  text\n" }) })), "\n  text\n")
  assert.equal(toolFileContent(call({ result: JSON.stringify({ task_id: "t", output: JSON.stringify({ path: "file", content: "data" }) }) })), "data")
  assert.equal(toolFileContent(call({ result: JSON.stringify({ error: "File not found" }) })), null)
})

test("replacement snapshots retain context and replace every occurrence", () => {
  assert.deepEqual(toolFileDiffs(call({ arguments: { path: "index.ts", old_text: "before", new_text: "after", preview_old_content: "top\nbefore before\nend", preview_old_content_available: true } }), "replace"), [{ path: "index.ts", original: "top\nbefore before\nend", modified: "top\nafter after\nend", scope: "file" }])
})

test("historical replacement fragments are labeled as snippets and allow deletions", () => {
  assert.deepEqual(toolFileDiffs(call({ arguments: { path: "index.ts", old_text: "remove", new_text: "" } }), "replace"), [{ path: "index.ts", original: "remove", modified: "", scope: "snippet" }])
})

test("missing previous file content is not represented as an empty-file diff", () => {
  assert.deepEqual(toolFileDiffs(call({ arguments: { path: "index.ts", content: "new", preview_old_content_available: false, preview_old_content: "untrusted" } }), "write"), [{ path: "index.ts", original: null, modified: "new", scope: "unknown" }])
})
