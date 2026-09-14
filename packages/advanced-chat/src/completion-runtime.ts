import type { Context } from "yumeri";

export interface CompletionRuntimeOptions {
  retryAttempts: number;
  assistantRetryAttempts: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  requestTimeoutMs: number;
  /** Aborting this must stop the attempt instead of retrying it. */
  signal?: AbortSignal;
  /** Called before each retry so the caller can report progress. */
  onRetry?: (attempt: number, total: number) => void;
}

/**
 * A timeout that also honours an external abort.
 *
 * `AbortSignal.timeout` cannot be combined with the caller's signal without
 * `AbortSignal.any`, and the timeout has to be cleared between attempts, so the
 * two are merged into one controller that is disposed with the attempt.
 */
function attemptSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("upstream request timed out")),
    timeoutMs,
  );
  const forward = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forward, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

export async function fetchCompletionWithRetry(
  ctx: Context,
  url: string,
  init: RequestInit,
  mode: string,
  options: CompletionRuntimeOptions,
) {
  const maxAttempts = Math.max(
    1,
    mode === "assistant" || mode === "agent_group"
      ? options.assistantRetryAttempts
      : options.retryAttempts,
  );
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted)
      throw lastError instanceof Error
        ? lastError
        : Error("upstream request aborted");
    const attemptAbort = attemptSignal(
      options.signal,
      options.requestTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        ...init,
        signal: attemptAbort.signal,
      });
      if (response.ok || response.status < 500 || attempt === maxAttempts - 1)
        return response;
      lastError = new Error(`upstream request failed (${response.status})`);
    } catch (error) {
      lastError = error;
      // A cancelled request must not be retried, and neither must the caller's
      // own timeout if it is the last attempt.
      if (options.signal?.aborted || attempt === maxAttempts - 1) throw error;
    } finally {
      attemptAbort.dispose();
    }
    options.onRetry?.(attempt + 1, maxAttempts);
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
