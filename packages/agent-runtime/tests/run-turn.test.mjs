import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../dist/index.js";

function runtime() {
  const ctx = { registerComponent(name, service) { this[name] = service; } };
  apply(ctx);
  return ctx["agent-runtime"];
}

const step = (content, toolCalls = []) => ({
  content,
  toolCalls,
  finishReason: toolCalls.length ? "tool_calls" : "stop",
  inputTokens: 2,
  outputTokens: 3,
  cachedInputTokens: 1,
});

test("runs sequential tool calls and feeds their results into the next model request", async () => {
  const service = runtime();
  const seen = [];
  const events = [];
  const result = await service.runTurn({
    initial: step("", [
      { id: "a", function: { name: "echo", arguments: '{"value":1}' } },
      { id: "b", function: { name: "echo", arguments: "invalid" } },
    ]),
    messages: [{ role: "user", content: "go" }],
    tools: [{ name: "echo", execute: async value => value }],
    maxToolRounds: 4,
    executeTool: (tool, value) => tool.execute(value),
    onToolCall: (call, phase) => events.push([call.id, phase]),
    requestNext: async messages => {
      seen.push(messages);
      return step("done");
    },
  });

  assert.deepEqual(result.toolCallDetails.map(call => call.status), ["ok", "ok"]);
  assert.deepEqual(JSON.parse(result.toolCallDetails[0].result), { value: 1 });
  assert.deepEqual(JSON.parse(result.toolCallDetails[1].result), {});
  assert.deepEqual(seen[0].slice(-2).map(message => message.role), ["tool", "tool"]);
  assert.deepEqual(events, [["a", "running"], ["a", "settled"], ["b", "running"], ["b", "settled"]]);
  assert.equal(result.content, "done");
  assert.equal(result.inputTokens, 4);
  assert.equal(result.rounds, 2);
});

test("records unknown and failed tools and stops at the configured round limit", async () => {
  const service = runtime();
  let requests = 0;
  const result = await service.runTurn({
    initial: step("first", [
      { id: "a", function: { name: "missing", arguments: "{}" } },
      { id: "b", function: { name: "failure", arguments: "{}" } },
    ]),
    messages: [],
    tools: [{ name: "failure", execute: () => { throw Error("failed"); } }],
    maxToolRounds: 1,
    executeTool: tool => tool.execute(),
    requestNext: async () => { requests += 1; return step("unexpected"); },
  });

  assert.equal(requests, 1);
  assert.equal(result.toolCallDetails[0].error, "unknown tool: missing");
  assert.equal(result.toolCallDetails[1].error, "failed");
  assert.equal(result.content, "unexpected");
  assert.equal(result.rounds, 2);
});

test("does not begin tool execution after cancellation", async () => {
  const service = runtime();
  const controller = new AbortController();
  controller.abort();
  let executed = false;
  await assert.rejects(service.runTurn({
    initial: step("", [{ id: "a", function: { name: "tool", arguments: "{}" } }]),
    messages: [],
    tools: [{ name: "tool", execute: () => { executed = true; } }],
    maxToolRounds: 1,
    signal: controller.signal,
    executeTool: tool => tool.execute(),
    requestNext: async () => step(""),
  }), /aborted/);
  assert.equal(executed, false);
});

test("accepts Anthropic tool_use input objects", async () => {
  const service = runtime();
  let received;
  await service.runTurn({
    initial: {
      ...step(""),
      toolCalls: [{ id: "call-a", name: "inspect", input: { path: "src" } }],
    },
    messages: [],
    tools: [{ name: "inspect", execute: async input => { received = input; return "ok"; } }],
    maxToolRounds: 1,
    executeTool: (tool, input) => tool.execute(input),
    requestNext: async () => step("done"),
  });
  assert.deepEqual(received, { path: "src" });
});
