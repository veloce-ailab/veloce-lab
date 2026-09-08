export async function fetchCompletionWithRetry(
  url: string,
  init: RequestInit,
  mode: string,
) {
  const maxAttempts = mode === "assistant" || mode === "agent_group" ? 10 : 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok || response.status < 500 || attempt === maxAttempts - 1)
        return response;
      lastError = new Error(`upstream request failed (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) throw error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(30_000, 500 * 2 ** attempt)),
    );
  }
  throw lastError instanceof Error
    ? lastError
    : Error("upstream request failed");
}
