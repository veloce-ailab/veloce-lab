import type { Context } from "yumeri";

export async function fetchCompletionWithRetry(
  ctx: Context,
  url: string,
  init: RequestInit,
  mode: string,
  options: {
    retryAttempts: number;
    assistantRetryAttempts: number;
    retryDelayMs: number;
    retryMaxDelayMs: number;
    requestTimeoutMs: number;
  },
) {
  const maxAttempts = Math.max(
    1,
    mode === "assistant" || mode === "agent_group"
      ? options.assistantRetryAttempts
      : options.retryAttempts,
  );
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      if (response.ok || response.status < 500 || attempt === maxAttempts - 1)
        return response;
      lastError = new Error(`upstream request failed (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
    }
    // The wait between attempts belongs to the plugin's context, so unloading
    // the plugin takes it with it instead of leaving a stray timer behind.
    await new Promise((resolve) =>
      ctx.setTimeout(
        resolve,
        Math.min(options.retryMaxDelayMs, options.retryDelayMs * 2 ** attempt),
      ),
    );
  }
  throw lastError instanceof Error
    ? lastError
    : Error("upstream request failed");
}
