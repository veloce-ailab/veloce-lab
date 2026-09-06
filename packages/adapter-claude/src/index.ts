import { Context } from "yumeri";
import type { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["claude", "anthropic"],
    build: (input: AdapterInput) => ({
      urlPath: "/v1/messages",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": input.apiKey,
        Authorization: `Bearer ${input.apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: input.model,
        max_tokens: input.maxTokens || 1024,
        messages: input.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })),
        ...(input.system ? { system: input.system } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.stream ? { stream: true } : {}),
      },
    }),
    parse: (body) => {
      const value = (body ?? {}) as any;
      return {
        content: Array.isArray(value.content)
          ? value.content.map((part: any) => part.text ?? "").join("")
          : "",
        toolCalls: Array.isArray(value.content)
          ? value.content.filter((part: any) => part.type === "tool_use")
          : [],
        inputTokens: Number(value.usage?.input_tokens ?? 0),
        outputTokens: Number(value.usage?.output_tokens ?? 0),
      };
    },
  });
}
