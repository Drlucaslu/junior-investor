import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, History, Info, Loader2, MessageSquarePlus, Send, Square, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { streamSSE } from "@/lib/sse";
import { errorText } from "@/lib/errorText";
import { fmtRelative } from "@/lib/format";
import type { ChatEvent, ChatSession, Source, ToolCallLog } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/States";
import { Markdown } from "@/components/Markdown";
import { MasterAvatar } from "@/components/Avatar";
import { SourcesList, ToolChips } from "@/components/Sources";
import { cn } from "@/lib/utils";
import { loadMasters } from "./Masters";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolCallLog[];
  sources: Source[];
  streaming?: boolean;
  error?: string | null;
  notice?: string | null;
}

export default function MasterChat() {
  const { masterId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const profile = useProfile();
  const { language } = useApp();
  const zh = language === "zh-CN";
  const masters = useAsync(loadMasters, []);
  const master = masters.data?.find((m) => m.id === masterId);
  const sessions = useAsync(() => api.chatSessions(profile.id, masterId), [profile.id, masterId]);
  const [sessionId, setSessionId] = useState<string | null>(params.get("session"));
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [symbol, setSymbol] = useState<string | null>(params.get("symbol")?.toUpperCase() ?? null);
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipLoad = useRef(false);
  useDocumentTitle(master ? (zh ? master.name_zh : master.name_en) : t("masters.title"));

  // Load a past session's messages.
  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    if (skipLoad.current) { skipLoad.current = false; return; }
    let alive = true;
    setLoadingMsgs(true);
    setLoadErr(null);
    api.chatMessages(sessionId)
      .then((rows) => alive && setMessages(rows.map((m) => ({ id: m.id, role: m.role, content: m.content, tools: m.tool_calls ?? [], sources: m.sources ?? [] }))))
      .catch((e: unknown) => alive && setLoadErr(e))
      .finally(() => alive && setLoadingMsgs(false));
    return () => { alive = false; };
  }, [sessionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const lastLen = messages.length ? messages[messages.length - 1].content.length : 0;
  useLayoutEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ block: "end", behavior: sending ? "auto" : "smooth" });
  }, [messages.length, lastLen, sending]);

  const openSession = (s: ChatSession | null) => {
    abortRef.current?.abort();
    setSessionId(s?.id ?? null);
    setHistoryOpen(false);
    const next = new URLSearchParams(params);
    next.delete("q");
    if (s) next.set("session", s.id); else next.delete("session");
    setParams(next, { replace: true });
  };

  const patchLast = (fn: (m: UIMessage) => UIMessage) =>
    setMessages((ms) => (ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms));

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    const withContext = symbol && !msg.toUpperCase().includes(symbol) ? t("chat.aboutPrefix", { symbol }) + msg : msg;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let sid: string | null = sessionId;
    const before = messages.length;
    setSending(true);
    setInput("");
    setMessages((ms) => [
      ...ms,
      { id: `u-${Date.now()}`, role: "user", content: withContext, tools: [], sources: [] },
      { id: `a-${Date.now()}`, role: "assistant", content: "", tools: [], sources: [], streaming: true },
    ]);
    try {
      await streamSSE<ChatEvent>(`/masters/${encodeURIComponent(masterId)}/chat/stream`, {
        body: { profile_id: profile.id, message: withContext, session_id: sessionId, language },
        signal: ctrl.signal,
        onEvent: (ev) => {
          switch (ev.type) {
            case "started":
              if (ev.session_id) sid = ev.session_id;
              if (ev.session_id && ev.session_id !== sessionId) {
                skipLoad.current = true;
                setSessionId(ev.session_id);
                const next = new URLSearchParams(params);
                next.delete("q");
                next.set("session", ev.session_id);
                setParams(next, { replace: true });
              }
              break;
            case "tool": patchLast((m) => ({ ...m, tools: [...m.tools, { name: ev.name, args: ev.args, ok: ev.ok }] })); break;
            case "notice": patchLast((m) => ({ ...m, notice: t("chat.modelLoading") })); break;
            case "token": patchLast((m) => ({ ...m, notice: null, content: m.content + ev.text })); break;
            case "sources": patchLast((m) => ({ ...m, sources: ev.sources })); break;
            case "final": patchLast((m) => ({ ...m, content: ev.content, sources: ev.sources, tools: ev.tool_calls ?? m.tools })); break;
            case "error": patchLast((m) => ({ ...m, error: errorText(t, new ApiError(0, ev.code)) })); break;
          }
        },
      });
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const code = e instanceof ApiError ? e.code : "";
        // The server keeps generating and saves the answer even if the connection drops
        // (flaky mobile networks / tunnels). Recover it by polling the saved messages.
        let recovered = false;
        if (sid && (code === "NETWORK_ERROR" || code === "")) {
          patchLast((m) => ({ ...m, notice: t("chat.reconnecting") }));
          const deadline = Date.now() + 5 * 60_000;
          while (!recovered && Date.now() < deadline && !ctrl.signal.aborted) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const rows = await api.chatMessages(sid);
              const last = rows[rows.length - 1];
              if (rows.length >= before + 2 && last?.role === "assistant" && last.content) {
                patchLast((m) => ({ ...m, content: last.content, sources: last.sources ?? [], tools: last.tool_calls ?? m.tools, notice: null, error: null }));
                recovered = true;
              }
            } catch {
              /* still offline — keep waiting */
            }
          }
        }
        if (!recovered) patchLast((m) => ({ ...m, notice: null, error: errorText(t, e) }));
      }
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      setSending(false);
      void sessions.reload();
      inputRef.current?.focus();
    }
  }, [sending, symbol, t, masterId, profile.id, sessionId, language, params, setParams, sessions, messages.length]);

  const submit = (e: FormEvent) => { e.preventDefault(); void send(input); };

  if (masters.error) return <ErrorState error={masters.error} onRetry={masters.reload} />;
  if (masters.data && !master) return <ErrorState error={new ApiError(404, "MASTER_NOT_FOUND")} />;

  const starters = symbol
    ? ["q1", "q2", "q3"].map((k) => t(`masters.starters.symbol.${k}`, { symbol }))
    : ["q1", "q2", "q3"].map((k) => t(`masters.starters.${masterId}.${k}`, { defaultValue: t("masters.starters.generic") }));

  const sessionList = (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" className="mb-2 justify-start" onClick={() => openSession(null)}>
        <MessageSquarePlus /> {t("chat.newChat")}
      </Button>
      {sessions.loading && !sessions.data ? <Skeleton className="h-24" /> : !sessions.data?.length ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">{t("chat.noHistory")}</p>
      ) : sessions.data.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => openSession(s)}
          aria-current={s.id === sessionId ? "true" : undefined}
          className={cn("rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", s.id === sessionId && "bg-primary-soft text-primary")}
        >
          <span className="line-clamp-2 font-medium">{s.title || t("chat.newChat")}</span>
          <span className="text-xs text-muted-foreground">{fmtRelative(s.updated_at)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex gap-6">
      <aside className="hidden w-60 shrink-0 lg:block" aria-label={t("chat.history")}>
        <div className="sticky top-24">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chat.history")}</p>
          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">{sessionList}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-3">
          <Link to="/masters" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={t("common.back")}>
            <ArrowLeft className="size-5" />
          </Link>
          {master ? <MasterAvatar id={master.id} size={40} /> : <Skeleton className="size-10" />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{master ? (zh ? master.name_zh : master.name_en) : "…"}</h1>
            {master && <p className="truncate text-xs text-muted-foreground">{zh ? master.name_en : master.name_zh}</p>}
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setHistoryOpen(true)} aria-label={t("chat.showHistory")}>
            <History /> <span className="hidden sm:inline">{t("chat.history")}</span>
          </Button>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex lg:hidden" onClick={() => openSession(null)}>
            <MessageSquarePlus />
          </Button>
        </div>

        <div className="mb-4 flex gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-5 text-foreground/85" role="note">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>{t("masters.disclaimer")}</span>
        </div>

        <div className="flex-1 space-y-5 pb-4" aria-live="polite">
          {loadingMsgs ? (
            <div className="space-y-3"><Skeleton className="ml-auto h-10 w-2/3" /><Skeleton className="h-32" /></div>
          ) : loadErr ? (
            <ErrorState error={loadErr} compact />
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
              <div className="flex gap-3">
                {master && <MasterAvatar id={master.id} size={36} />}
                <p className="text-[0.95rem] leading-7">{t("chat.welcome")}</p>
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chat.suggested")}</p>
              <div className="mt-2 flex flex-col gap-2">
                {starters.map((q) => (
                  <button key={q} type="button" onClick={() => void send(q)} disabled={sending}
                    className="rounded-xl border bg-background px-3.5 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-primary-soft">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => m.role === "user" ? (
              <div key={m.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] text-primary-foreground">
                <span className="sr-only">{t("chat.you")}: </span>{m.content}
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <MasterAvatar id={masterId} size={32} className="mt-1 hidden sm:block" />
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card p-4 shadow-card">
                  <ToolChips tools={m.tools} className={m.content || m.streaming ? "mb-3" : ""} />
                  {m.content ? (
                    <Markdown className="prose-chat">{m.content + (m.streaming ? " ▍" : "")}</Markdown>
                  ) : m.streaming && !m.error && !m.notice ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("chat.thinking")}</p>
                  ) : null}
                  {m.notice && !m.error && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{m.notice}</p>
                  )}
                  {m.error && <p className="mt-1 text-sm text-danger" role="alert">{m.error}</p>}
                  {m.sources.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chat.sources")}</p>
                      <SourcesList sources={m.sources} scope={m.id} compact />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
          {symbol && (
            <div className="mb-2 flex">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-card">
                {t("chat.context", { symbol })}
                <button type="button" onClick={() => setSymbol(null)} aria-label={t("chat.clearContext")} className="rounded-full p-0.5 hover:bg-muted">
                  <X className="size-3" />
                </button>
              </span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-pop">
            <label htmlFor="chat-input" className="sr-only">{t("chat.placeholder")}</label>
            <Textarea
              ref={inputRef}
              id="chat-input"
              rows={1}
              value={input}
              maxLength={4000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }}
              placeholder={t("chat.placeholder")}
              className="max-h-40 min-h-[44px] resize-none border-0 focus-visible:ring-0"
            />
            {sending ? (
              <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label={t("chat.stop")}>
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label={t("chat.send")}>
                <Send />
              </Button>
            )}
          </div>
        </form>
      </div>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title={t("chat.history")}>
        {sessionList}
      </Dialog>
    </div>
  );
}
