/** POST + Server-Sent-Events reader (fetch + ReadableStream, not EventSource). */
import { buildHeaders, API_BASE } from "./api";
import { errorFromResponse, toApiError } from "./errors";
import { isRecord } from "./utils";

export interface StreamOptions<E> {
  body: unknown;
  onEvent: (ev: E) => void;
  signal?: AbortSignal;
}

/**
 * Streams `data: {json}\n\n` events. Comment lines (`: keep-alive`) are ignored.
 * Resolves when the server closes the stream; rejects with ApiError for HTTP errors
 * (e.g. 429 AI_DAILY_LIMIT_REACHED) or network failure.
 */
export async function streamSSE<E extends { type: string }>(path: string, opts: StreamOptions<E>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { ...buildHeaders(false, true), Accept: "text/event-stream" },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    throw toApiError(e);
  }
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw toApiError(new Error("no body"));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk: string) => {
    const dataLines: string[] = [];
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (!dataLines.length) return;
    try {
      const parsed: unknown = JSON.parse(dataLines.join("\n"));
      if (isRecord(parsed) && typeof parsed.type === "string") opts.onEvent(parsed as unknown as E);
    } catch {
      /* ignore malformed event */
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const chunk = buffer.slice(0, idx);
        const m = buffer.slice(idx).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(idx + (m ? m[0].length : 2));
        flush(chunk);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) flush(buffer);
  } catch (e) {
    throw toApiError(e);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
