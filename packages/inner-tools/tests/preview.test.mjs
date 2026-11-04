import assert from "node:assert/strict"
import { test } from "node:test"
import { executeFileMutation } from "../dist/index.js"

const context = { userId: 7, connectorDeviceId: "device-1", connectorWorkspacePath: "/project", runId: "run-1" }

test("file writes preserve the observed before/after snapshot outside connector arguments", async () => {
  const calls = []
  const connector = { execute: async (user, action, input) => { calls.push({ user, action, input }); return action === "read_file" ? { path: "/project/a.ts", content: "before" } : { path: "/project/a.ts", size: 5 } } }
  const input = { path: "a.ts", content: "after", workspace_path: "/wrong" }
  await executeFileMutation(connector, "write_file", input, context)
  assert.equal(input.preview_old_content, "before")
  assert.equal(input.preview_new_content, "after")
  assert.equal(input.preview_old_content_available, true)
  assert.deepEqual(calls.map(call => call.action), ["read_file", "write_file"])
  assert.equal(calls[1].input.workspace_path, "/project")
  assert.equal("preview_old_content" in calls[1].input, false)
})

test("replacement previews use the whole observed file and replace all occurrences", async () => {
  const connector = { execute: async (_user, action) => action === "read_file" ? { content: "header\nold old\nfooter" } : { replacements: 2 } }
  const input = { path: "a.ts", old_text: "old", new_text: "new" }
  await executeFileMutation(connector, "replace_text", input, context)
  assert.equal(input.preview_old_content, "header\nold old\nfooter")
  assert.equal(input.preview_new_content, "header\nnew new\nfooter")
})

test("failure to capture the previous file never prevents the original mutation", async () => {
  const actions = []
  const connector = { execute: async (_user, action) => { actions.push(action); if (action === "read_file") throw Error("File not found"); return { path: "new.ts" } } }
  const input = { path: "new.ts", content: "new", preview_old_content: "invented" }
  assert.deepEqual(await executeFileMutation(connector, "write_file", input, context), { path: "new.ts" })
  assert.deepEqual(actions, ["read_file", "write_file"])
  assert.equal(input.preview_old_content_available, false)
  assert.equal("preview_old_content" in input, false)
})
