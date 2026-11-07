import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
import { imageGenerationParams, openAIChatMessages, openAIChatTools } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
async function stream(response: Response, onDelta: (delta: string) => void) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") continue;
      try {
        const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) onDelta(delta);
      } catch { /* Ignore malformed SSE frames. */ }
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
    build: (input: AdapterInput) => {
      // Image requests go to their own endpoint with their own body: the chat
      // payload below would be rejected outright.
      if (input.operation === "image_generate" || input.operation === "image_edit") {
        const params = imageGenerationParams(input.media);
        return {
          urlPath: "/v1/images/generations",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
          },
          body: {
            model: input.model,
            prompt: params.prompt,
            ...(params.n ? { n: params.n } : {}),
            ...(params.size ? { size: params.size } : {}),
            ...(params.quality ? { quality: params.quality } : {}),
            ...(params.style ? { style: params.style } : {}),
            // Asking for the bytes avoids a second download from a URL that may
            // already have expired by the time the file library stores it.
            response_format: "b64_json",
            // A reference image is sent as the `image` field several
            // OpenAI-compatible services accept; the null ones ignore it and
            // generate from the prompt alone.
            ...(params.referenceImage ? { image: params.referenceImage } : {}),
          },
        };
      }
      const tools = openAIChatTools(input.tools);
      return {
        urlPath: "/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Accept: input.stream ? "text/event-stream" : "application/json",
          ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: {
          model: input.model,
          messages: openAIChatMessages(input.messages, input.system),
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
          ...(tools ? { tools, tool_choice: "auto" } : {}),
        },
      };
    },
    parse,
    stream,
  };
  registry.register(adapter);
}
