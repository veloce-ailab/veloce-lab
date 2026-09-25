import type { ChatTool } from "@velocelab/adapters";

export const DEFAULT_MAX_CONTEXT_TOKENS = 1_000_000;

export interface ContextBudgetResult {
  messages: Array<Record<string, unknown>>;
  estimatedTokens: number;
  compressed: boolean;
}

function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.max(1, Math.ceil(text.length / 4));
}

function messageTokens(message: Record<string, unknown>): number {
  return 4 + estimateTokens(message.content) + estimateTokens(message.toolCalls);
}

function trimMessage(message: Record<string, unknown>, tokenBudget: number) {
  const next = { ...message };
  const content = String(next.content ?? "");
  const availableCharacters = Math.max(0, (tokenBudget - 4) * 4);
  if (content.length > availableCharacters) {
    next.content = `${content.slice(0, Math.max(0, availableCharacters - 32))}\n[message truncated]`;
  }
  return next;
}

function groupMessages(messages: Array<Record<string, unknown>>) {
  const groups: Array<Array<Record<string, unknown>>> = [];
  for (const message of messages) {
    if (message.role === "user" || groups.length === 0) groups.push([]);
    groups.at(-1)!.push(message);
  }
  return groups;
}

export function compactContextMessages(
  messages: Array<Record<string, unknown>>,
  maxContextTokens: number,
  systemPrompt = "",
  tools: ChatTool[] = [],
  maxOutputTokens = 0,
  enabled = true,
): ContextBudgetResult {
  const contextLimit = Math.max(1, Math.floor(Number(maxContextTokens) || DEFAULT_MAX_CONTEXT_TOKENS));
  const outputReserve = Math.max(0, Math.floor(Number(maxOutputTokens) || 0));
  const fixedTokens = estimateTokens(systemPrompt) + estimateTokens(tools);
  const systemMessages = messages.filter((message) => message.role === "system");
  const conversationMessages = messages.filter((message) => message.role !== "system");
  const systemMessageTokens = systemMessages.reduce((sum, message) => sum + messageTokens(message), 0);
  const messageBudget = Math.max(1, contextLimit - outputReserve - fixedTokens - systemMessageTokens);
  const totalTokens = systemMessageTokens + conversationMessages.reduce((sum, message) => sum + messageTokens(message), 0);
  if (!enabled) {
    return { messages, estimatedTokens: fixedTokens + totalTokens, compressed: false };
  }
  if (totalTokens <= messageBudget) {
    return { messages, estimatedTokens: fixedTokens + totalTokens, compressed: false };
  }

  const groups = groupMessages(conversationMessages);
  const retained: Array<Record<string, unknown>> = [];
  let retainedTokens = 0;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    const groupTokens = group.reduce((sum, message) => sum + messageTokens(message), 0);
    if (retained.length > 0 && retainedTokens + groupTokens > messageBudget) break;
    retained.unshift(...group);
    retainedTokens += groupTokens;
  }

  const omitted = conversationMessages.slice(0, conversationMessages.length - retained.length);
  const summaryPrefix = `[Earlier conversation compressed: ${omitted.length} messages]\n`;
  const summarySource = omitted
    .map((message) => `${String(message.role)}: ${String(message.content ?? "")}`)
    .join("\n");
  const summaryBudget = Math.max(0, messageBudget - retainedTokens - 4);
  const summary = summaryBudget > 0
    ? {
        role: "system",
        content: `${summaryPrefix}${summarySource.slice(0, Math.max(0, summaryBudget * 4 - summaryPrefix.length))}`,
      }
    : undefined;
  const resultMessages = [...systemMessages, ...(summary ? [summary] : []), ...retained];
  let estimatedTokens = fixedTokens + resultMessages.reduce((sum, message) => sum + messageTokens(message), 0);
  if (estimatedTokens > contextLimit - outputReserve) {
    const available = Math.max(1, contextLimit - outputReserve - fixedTokens);
    const fitted = resultMessages.map((message) => trimMessage(message, Math.max(1, Math.floor(available / resultMessages.length))));
    estimatedTokens = fixedTokens + fitted.reduce((sum, message) => sum + messageTokens(message), 0);
    return { messages: fitted, estimatedTokens, compressed: true };
  }
  return { messages: resultMessages, estimatedTokens, compressed: true };
}