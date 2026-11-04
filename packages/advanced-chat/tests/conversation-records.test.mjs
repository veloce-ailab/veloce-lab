import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationRecords, mergeConversationTools, readConversationRecords } from "../dist/conversation-records.js";

test("one ordered record list projects text and tool calls by round", () => {
  const records = conversationRecords(
    [{ round: 1, content: "Plan" }, { round: 2, content: "Done" }],
    [{ id: "call-1", name: "read_file", status: "running", round: 1 }],
  );
  assert.deepEqual(records.map(record => [record.kind, record.round]), [["text", 1], ["tool_call", 1], ["text", 2]]);
  assert.deepEqual(readConversationRecords(JSON.stringify(records)), records);
});

test("tool progress upserts a stable id while retaining arguments and result", () => {
  const running = { id: "call-1", name: "read_file", status: "running", arguments: { path: "index.ts" } };
  const approved = mergeConversationTools([running], [{ ...running, status: "approval_required", arguments: { connector_task_id: "task-1" } }]);
  const finished = mergeConversationTools(approved, [{ ...running, status: "ok", result: "file contents" }]);
  assert.deepEqual(finished[0], {
    id: "call-1", name: "read_file", status: "ok", arguments: { path: "index.ts", connector_task_id: "task-1" }, result: "file contents",
  });
});

test("malformed record snapshots fall back to compatibility projections", () => {
  assert.deepEqual(readConversationRecords("{"), []);
  assert.deepEqual(readConversationRecords({ items: [] }), []);
});
