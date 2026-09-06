import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
function mapMessages(input: AdapterInput) {
  return input.messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.name ? { name: message.name } : {}),
  }));
}
async function stream(response: Response, onDelta: (delta: string) => void) {
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]")
      continue;
    try {
      const value = JSON.parse(line.slice(5));
      const delta = value.choices?.[0]?.delta?.content;
      if (typeof delta === "string") onDelta(delta);
    } catch {
      // Ignore malformed SSE frames and let the caller keep the partial result.
    }
  }
}

function parse(body: unknown) {
  const value = (body ?? {}) as any;
  const choice = value.choices?.[0] ?? {};
  const message = choice.message ?? {};
  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    inputTokens: Number(value.usage?.prompt_tokens ?? 0),
    outputTokens: Number(value.usage?.completion_tokens ?? 0),
    finishReason:
      typeof choice.finish_reason === "string"
        ? choice.finish_reason
        : "stop",
  };
}

export function apply(ctx: Context) {
  const registry = ctx.component.adapters as AdapterRegistry;
  const adapter: AdapterDefinition = {
    types: [
      "openai",
      "completion",
      "completions",
      "chat_completion",
      "chat_completions",
    ],
    build: (input: AdapterInput) => ({
      urlPath: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: input.stream ? "text/event-stream" : "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: {
        model: input.model,
        messages: mapMessages(input),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.reasoningEffort
          ? { reasoning_effort: input.reasoningEffort }
          : {}),
        ...(input.stream
          ? { stream: true, stream_options: { include_usage: true } }
          : {}),
        ...(input.tools ? { tools: input.tools, tool_choice: "auto" } : {}),
      },
    }),
    parse,
    stream,
  };
  registry.register(adapter);
}
