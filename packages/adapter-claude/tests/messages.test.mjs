import assert from "node:assert/strict";
import { test } from "node:test";
import { anthropicMessages } from "../dist/index.js";

test("groups every tool result immediately after an assistant tool_use message", () => {
  const messages = anthropicMessages([
    { role: "user", content: "inspect" },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "call-a", name: "read", arguments: '{"path":"a"}' },
        { id: "call-b", name: "read", arguments: '{"path":"b"}' },
      ],
    },
    { role: "tool", content: "A", toolCallId: "call-a" },
    { role: "tool", content: "B", toolCallId: "call-b" },
    { role: "assistant", content: "done" },
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "inspect" },
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "call-a", name: "read", input: { path: "a" } },
        { type: "tool_use", id: "call-b", name: "read", input: { path: "b" } },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call-a", content: "A" },
        { type: "tool_result", tool_use_id: "call-b", content: "B" },
      ],
    },
    { role: "assistant", content: "done" },
  ]);
});

test("drops dangling historical tool calls and orphan results", () => {
  const messages = anthropicMessages([
    { role: "assistant", content: "old", toolCalls: [{ id: "missing", name: "read", arguments: "{}" }] },
    { role: "tool", content: "orphan", toolCallId: "other" },
    { role: "user", content: "continue" },
  ]);
  assert.deepEqual(messages, [
    { role: "assistant", content: "old" },
    { role: "user", content: "continue" },
  ]);
});
