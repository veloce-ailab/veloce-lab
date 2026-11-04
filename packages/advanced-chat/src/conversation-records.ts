/** Shared wire model for a message's ordered text and tool lifecycle records. */
export interface ConversationToolCall {
  id: string;
  round?: number;
  name: string;
  server?: string;
  tool?: string;
  status: string;
  arguments?: Record<string, unknown>;
  result?: string;
}

export type ConversationRecord =
  | { id: string; kind: "text"; round: number; content: string }
  | { id: string; kind: "composer_block"; round: number; block: ConversationComposerBlock }
  | { id: string; kind: "tool_call"; round: number; tool_call: ConversationToolCall };

export interface ConversationComposerBlock {
  id: string;
  commandId: string;
  kind: string;
  label: string;
  value: Record<string, unknown>;
  context?: string;
}

export function mergeConversationTools(current: ConversationToolCall[], incoming: ConversationToolCall[]) {
  const result = [...current];
  for (const call of incoming) {
    const index = result.findIndex((item) => item.id === call.id);
    if (index < 0) result.push(call);
    else {
      const previous = result[index];
      result[index] = {
        ...previous, ...call,
        arguments: call.arguments ? { ...previous.arguments, ...call.arguments } : previous.arguments,
        result: call.result === undefined ? previous.result : call.result,
      };
    }
  }
  return result;
}

/** Legacy fields remain projections for older clients, plugins and transcripts. */
export function conversationRecords(parts: Array<{ round?: number; content: string }>, calls: ConversationToolCall[], blocks: ConversationComposerBlock[] = []): ConversationRecord[] {
  const roundOf = (round?: number) => typeof round === "number" && Number.isFinite(round) && round > 0 ? round : 1;
  const rounds = [...new Set([...parts.map((part) => roundOf(part.round)), ...calls.map((call) => roundOf(call.round)), ...(blocks.length ? [1] : [])])].sort((a, b) => a - b);
  return rounds.flatMap((round): ConversationRecord[] => [
    ...parts.filter((part) => roundOf(part.round) === round).map((part, index): ConversationRecord => ({ id: `text-${round}-${index}`, kind: "text", round, content: part.content })),
    ...(round === 1 ? blocks.map((block): ConversationRecord => ({ id: `block-${block.id}`, kind: "composer_block", round, block })) : []),
    ...calls.filter((call) => roundOf(call.round) === round).map((call): ConversationRecord => ({ id: `tool-${call.id}`, kind: "tool_call", round, tool_call: call })),
  ]);
}

export function readConversationRecords(value: unknown): ConversationRecord[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ConversationRecord => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !Number.isFinite(item.round)) return false;
    if (item.kind === "text") return typeof item.content === "string";
    if (item.kind === "composer_block") return item.block && typeof item.block.id === "string" && typeof item.block.commandId === "string" && typeof item.block.kind === "string" && typeof item.block.label === "string" && item.block.value && typeof item.block.value === "object";
    return item.kind === "tool_call" && item.tool_call && typeof item.tool_call.id === "string" && typeof item.tool_call.name === "string" && typeof item.tool_call.status === "string";
  });
}
