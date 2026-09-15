import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
async function stream(response: Response, onDelta: (delta: string) => void) {
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const value = JSON.parse(line.slice(5));
      if (value.type === "response.output_text.delta" && typeof value.delta === "string") onDelta(value.delta);
    } catch {}
  }
}
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["responses", "response", "openai_responses"],
    build: (input: AdapterInput) => ({
      urlPath: "/v1/responses",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: {
        model: input.model,
        input: input.messages,
        ...(input.maxTokens ? { max_output_tokens: input.maxTokens } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.stream ? { stream: true } : {}),
      },
    }),
    parse: (body) => {
      const value = (body ?? {}) as any;
      let content = typeof value.output_text === "string" ? value.output_text : "";
      if (!content && Array.isArray(value.output)) {
        content = value.output
          .flatMap((item: any) => item.content ?? [])
          .map((part: any) => part.text ?? part.output_text ?? "")
          .join("");
      }
      return {
        content,
        toolCalls: Array.isArray(value.output)
          ? value.output.filter((item: any) => item.type === "function_call")
          : [],
        inputTokens: Number(value.usage?.input_tokens ?? 0),
        outputTokens: Number(value.usage?.output_tokens ?? 0),
      };
    },
    stream,
  });
}
