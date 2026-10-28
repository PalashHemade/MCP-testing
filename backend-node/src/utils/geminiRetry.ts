/** Bounded retry with backoff for transient Gemini API failures -
 * mirrors app.utils.gemini_retry in the Python sibling backend,
 * including the same lesson learned there: each attempt must have its
 * own client-side timeout (see planner/geminiClient.ts
 * GEMINI_HTTP_TIMEOUT_MS), since a slow/queued response during a
 * Google-side "high demand" incident can otherwise hang indefinitely.
 * Only retries 429/5xx; a 400/404 is permanent and must fail immediately
 * rather than burn quota retrying something that will never succeed.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_BACKOFF_MS = 1500;

export function extractStatusCode(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const maybeStatus = (err as { status?: unknown; code?: unknown }).status ?? (err as { code?: unknown }).code;
    if (typeof maybeStatus === "number") return maybeStatus;
  }
  return undefined;
}

/** Turns a Gemini call failure into a short, user-safe sentence - never
 * the raw error (which can contain request internals, stack traces, or
 * verbose provider text). Callers must still log the raw `err`
 * server-side themselves; this is only for text shown to the end user. */
export function describeGeminiFailure(err: unknown): string {
  const status = extractStatusCode(err);
  if (status === 429) {
    return "the AI service is rate-limited right now";
  }
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return "the AI service is temporarily unavailable (high demand) - please try again shortly";
  }
  if (err instanceof Error && /timed?\s*out|timeout/i.test(err.message)) {
    return "the AI service did not respond in time";
  }
  return "the AI service failed unexpectedly";
}

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; backoffMs?: number } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const statusCode = extractStatusCode(err);
      if (statusCode === undefined || !RETRYABLE_STATUS_CODES.has(statusCode) || attempt >= maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr; // unreachable - loop always returns or throws
}
