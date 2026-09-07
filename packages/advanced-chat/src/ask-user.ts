import type { ChatToolDefinition } from "./index.js";

const limit = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

export function registerAskUserTool(
  register: (tool: ChatToolDefinition) => () => void,
) {
  return register({
    name: "ask_user",
    description:
      "Present the user a question with preset options and optional free-form input. End the turn after calling this tool.",
    parameters: {
      type: "object",
      required: ["question"],
      properties: {
        question: { type: "string", description: "The complete question." },
        options: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string" },
              description: { type: "string" },
            },
          },
        },
        allow_custom: { type: "boolean" },
        multi_select: { type: "boolean" },
      },
    },
    execute: async (input) => {
      const value = (input ?? {}) as any;
      const question = limit(value.question, 1000);
      if (!question) throw Error("question is required");
      const options = Array.isArray(value.options) ? value.options : [];
      if (options.length > 10) throw Error("too many options");
      const normalized = options.map((item: any) => {
        const label = limit(item?.label, 120);
        if (!label) throw Error("each option needs a non-empty label");
        return {
          label,
          ...(limit(item?.description, 300)
            ? { description: limit(item.description, 300) }
            : {}),
        };
      });
      const allowCustom = value.allow_custom !== false;
      if (!normalized.length && !allowCustom)
        throw Error("provide options or allow custom input");
      return {
        question,
        options: normalized,
        allow_custom: allowCustom,
        multi_select: value.multi_select === true,
        note: "The question has been presented to the user. End your reply now; the answer will arrive as the user's next message.",
      };
    },
  });
}
