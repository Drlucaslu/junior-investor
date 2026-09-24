/**
 * Keeps research SSE streams alive across page navigation within the SPA.
 * The Research page starts a stream here; the report page subscribes by id.
 * (If the page is reloaded the stream is gone, and the report page polls instead —
 * the backend keeps working and saves the result either way.)
 */
import { streamSSE } from "./sse";
import { toApiError } from "./errors";
import type { Language, ResearchEvent, ResearchStep, ResearchStructured, Source } from "./types";

export interface LiveResearch {
  reportId: string;
  step: ResearchStep | "done";
  symbols: string[] | null;
  structured: ResearchStructured | null;
  sources: Source[];
  text: string;
  finalMarkdown: string | null;
  errorCode: string | null;
  finished: boolean;
}

type Listener = (s: LiveResearch) => void;
const live = new Map<string, LiveResearch>();
const listeners = new Map<string, Set<Listener>>();

function emit(id: string) {
  const s = live.get(id);
  if (!s) return;
  listeners.get(id)?.forEach((l) => l({ ...s }));
}

export function getLive(id: string): LiveResearch | null {
  const s = live.get(id);
  return s ? { ...s } : null;
}

export function subscribe(id: string, l: Listener): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(l);
  return () => set?.delete(l);
}

/** Starts a research stream. Resolves with the report id as soon as the server creates it. */
export function startResearch(body: { profile_id: string; query: string; mode: "quick" | "deep"; language: Language }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let id: string | null = null;
    const apply = (fn: (s: LiveResearch) => void) => {
      if (!id) return;
      const s = live.get(id);
      if (!s) return;
      fn(s);
      emit(id);
    };
    streamSSE<ResearchEvent>("/research/stream", {
      body,
      onEvent: (ev) => {
        switch (ev.type) {
          case "started":
            id = ev.report_id;
            live.set(id, {
              reportId: id, step: "resolving", symbols: null, structured: null, sources: [], text: "",
              finalMarkdown: null, errorCode: null, finished: false,
            });
            resolve(id);
            break;
          case "status":
            apply((s) => { s.step = ev.step; });
            break;
          case "resolved":
            apply((s) => { s.symbols = ev.symbols; });
            break;
          case "data":
            apply((s) => { s.structured = ev.structured; s.sources = ev.sources; });
            break;
          case "token":
            apply((s) => { s.text += ev.text; });
            break;
          case "final":
            apply((s) => {
              s.finalMarkdown = ev.content_markdown;
              s.structured = ev.structured;
              s.sources = ev.sources;
              s.step = "done";
              s.finished = true;
            });
            break;
          case "error":
            apply((s) => {
              s.errorCode = ev.code;
              if (ev.structured) s.structured = ev.structured;
              if (ev.sources) s.sources = ev.sources;
              s.finished = true;
            });
            break;
        }
      },
    })
      .then(() => {
        apply((s) => { s.finished = true; });
      })
      .catch((e: unknown) => {
        if (!id) reject(toApiError(e));
        else apply((s) => { s.finished = true; }); // connection dropped: report page falls back to polling
      });
  });
}
