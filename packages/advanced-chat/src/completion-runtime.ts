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

/**
 * Statuses worth another attempt.
 *
 * Only 5xx used to qualify, so a 429 — by far the most common transient failure,
 * since it is how a provider says "slow down" — was returned to the caller on the
 * first try and ended the run. 408 and 425 are the same kind of answer.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429]);
const retryableStatus = (status: number) => status >= 500 || RETRYABLE_STATUS.has(status);

/** A provider that tells us how long to wait knows better than our backoff does. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
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
  let retryAfter: number | undefined;
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
      if (response.ok || !retryableStatus(response.status) || attempt === maxAttempts - 1)
        return response;
      lastError = new Error(`upstream request failed (${response.status})`);
      // Release the body of an attempt we are about to repeat, so a provider that
      // streams an error page does not leave the connection open behind us.
      await response.body?.cancel().catch(() => undefined);
      retryAfter = retryAfterMs(response);
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
    // Exponential backoff, never shorter than the provider asked for and never
    // longer than the cap the operator set.
    const backoff = Math.min(options.retryMaxDelayMs, options.retryDelayMs * 2 ** attempt);
    const delay = Math.min(options.retryMaxDelayMs, Math.max(backoff, retryAfter ?? 0));
    retryAfter = undefined;
    await new Promise((resolve) => ctx.setTimeout(resolve, delay));
  }
  throw lastError instanceof Error
    ? lastError
    : Error("upstream request failed");
}
