import { isRecord } from "./utils";

/** Error raised for any non-2xx API response. `code` comes from `{"detail": {"code": ...}}`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(status: number, code: string, detail: Record<string, unknown> = {}) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (isRecord(body)) {
    const d = body.detail;
    if (isRecord(d) && typeof d.code === "string") return new ApiError(res.status, d.code, d);
    if (Array.isArray(d)) return new ApiError(res.status, "VALIDATION_ERROR", { errors: d });
  }
  if (res.status === 404) return new ApiError(404, "NOT_FOUND");
  if (res.status === 429) return new ApiError(429, "AI_DAILY_LIMIT_REACHED");
  if (res.status >= 500) return new ApiError(res.status, "INTERNAL_ERROR");
  return new ApiError(res.status, "UNKNOWN_ERROR");
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof DOMException && e.name === "AbortError") return new ApiError(0, "ABORTED");
  return new ApiError(0, "NETWORK_ERROR");
}
