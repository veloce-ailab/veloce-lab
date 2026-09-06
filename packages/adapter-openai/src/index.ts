import { Context } from "yumeri";
import type { AdapterDefinition, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
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

export function apply(ctx: Context) {
  const registry = ctx.component.adapters as AdapterRegistry;
  const adapter: AdapterDefinition = {
    types: ["completion", "completions", "chat_completion", "chat_completions"],
    request: (input) => ({
      path: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: input.stream ? "text/event-stream" : "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      payload: {
        model: input.model,
        messages: input.messages,
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
    stream,
  };
  registry.register(adapter);
}
