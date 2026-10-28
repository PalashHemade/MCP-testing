// The Node/Express backend (backend-node/) - the only backend this
// frontend talks to.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'

// The backend bounds its own slow paths (Gemini planning/answer calls,
// per-tool DB timeouts) well under this, including their retries - see
// backend-node/docs/security.md "Timeouts and retries". This is a pure
// safety net against a *lower-level* hang (dropped connection, backend
// process stuck) that the backend's own timeouts can't catch, so the UI
// never spins "Thinking..." forever with no way out.
const REQUEST_TIMEOUT_MS = 60_000

export class ApiError extends Error {
  status: number
  requestId?: string
  /** True for conditions the user can reasonably just retry (timeouts,
   * 503/504, network failures) vs. a request that will never succeed
   * unchanged (4xx). Drives whether the UI leads with "try again". */
  retryable: boolean

  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.status = status
    this.requestId = requestId
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; demoUser: string },
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-User': options.demoUser,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('The request took too long and was cancelled. Please try again.', 408)
    }
    throw new ApiError('Could not reach the backend. Check your connection and try again.', 0)
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    // 503 (service temporarily unavailable, e.g. the database is down)
    // and 504 (upstream gateway timeout) both mean "not your fault, try
    // again shortly" - give that framing even if the backend's own
    // `detail` text doesn't spell it out.
    let detail =
      response.status === 503
        ? 'The service is temporarily unavailable. Please try again shortly.'
        : response.status === 504
          ? 'The server took too long to respond. Please try again shortly.'
          : `Request failed with status ${response.status}`
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // response body wasn't JSON - keep the status-based message above
    }
    throw new ApiError(detail, response.status, response.headers.get('X-Request-ID') ?? undefined)
  }

  return response.json() as Promise<T>
}
