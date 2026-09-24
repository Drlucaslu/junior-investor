import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRightLeft, Check, Eye, Loader2, MessagesSquare, Send, Star } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { getLive, subscribe, type LiveResearch } from "@/lib/researchStore";
import { streamSSE } from "@/lib/sse";
import { errorText } from "@/lib/errorText";
import { fmtDate } from "@/lib/format";
import type { ChatEvent, ResearchReport as Report, Source, ToolCallLog } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle, useInterval } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/States";
import { Markdown } from "@/components/Markdown";
import { CompanyBlock, ComparisonTable } from "@/components/ResearchData";
import { SourcesList, ToolChips, sourceAnchor } from "@/components/Sources";
import { MasterAvatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

const STEPS = ["resolving", "gathering", "writing"] as const;

/** The report markdown ends with a Sources section; we render sources as a proper list instead. */
export function stripSourcesSection(md: string): string {
  const head = md.search(/\n#{2,3}\s*(?:\d+\.\s*)?(?:Sources|来源（Sources）)\s*\n/);
  if (head === -1) return md;
  const rest = md.slice(head);
  const disc = rest.search(/\n_(?:This report|本报告)[^\n]*_\s*$/);
  return md.slice(0, head) + (disc === -1 ? "" : "\n\n" + rest.slice(disc).trim());
}

interface PendingFollowup {
  question: string;
  text: string;
  tools: ToolCallLog[];
  sources: Source[];
  error: string | null;
}

export default function ResearchReport() {
  const { researchId = "" } = useParams();
  const { t } = useTranslation();
  const profile = useProfile();
  const { language } = useApp();
  const toast = useToast();
  const report = useAsync(() => api.research(researchId), [researchId]);
  const [live, setLive] = useState<LiveResearch | null>(() => getLive(researchId));
  const [highlight, setHighlight] = useState<{ ref: string; scope: string; n: number } | null>(null);
  const [onWatch, setOnWatch] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<PendingFollowup | null>(null);
  const [asking, setAsking] = useState(false);
  const celebrated = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const r = report.data;
  useDocumentTitle(r?.query ?? t("research.title"));

  // Live stream (if this tab started it)
  useEffect(() => {
    setLive(getLive(researchId));
    return subscribe(researchId, setLive);
  }, [researchId]);

  const liveFinished = live?.finished ?? false;
  const reload = report.reload;
  useEffect(() => {
    if (liveFinished) void reload();
  }, [liveFinished, reload]);

  useEffect(() => {
    if (live?.step === "done" && live.finalMarkdown && !celebrated.current) {
      celebrated.current = true;
      toast.push("achievement", t("achievement.research"));
    }
  }, [live?.step, live?.finalMarkdown, toast, t]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const streaming = !!live && !live.finished;
  const status = streaming ? "running" : r?.status;
  const hasRunningFollowup = !!r?.followups?.some((f) => f.status === "running") && !asking;
  // Poll while the server is still working and we are not attached to the stream.
  useInterval(() => void report.reload(), !streaming && (status === "running" || hasRunningFollowup) ? 3000 : null);

  const symbols = useMemo(() => live?.structured?.symbols ?? r?.structured_json?.symbols ?? live?.symbols ?? [], [live, r]);
  const primary = r?.symbol ?? (symbols.length === 1 ? symbols[0] : symbols[0]) ?? null;

  useEffect(() => {
    if (!primary) return;
    api.watchlist(profile.id).then((w) => setOnWatch(w.some((x) => x.symbol === primary))).catch(() => undefined);
  }, [primary, profile.id]);

  const cite = useCallback((scope: string) => (ref: string) => {
    setHighlight((h) => ({ ref, scope, n: (h?.n ?? 0) + 1 }));
    requestAnimationFrame(() => document.getElementById(sourceAnchor(scope, ref))?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);

  if (report.loading && !r && !live) return <ReportSkeleton />;
  if (report.error && !r) {
    return report.error.code === "NOT_FOUND"
      ? <ErrorState error={new ApiError(404, "NOT_FOUND")} />
      : <ErrorState error={report.error} onRetry={report.reload} />;
  }

  const structured = live?.structured ?? r?.structured_json ?? null;
  const companies = structured?.companies ?? [];
  const sources = (r?.status === "done" ? r.sources : null) ?? (live?.sources.length ? live.sources : r?.sources ?? []);
  const rawMd = r?.status === "done" && r.content_markdown ? r.content_markdown : live?.finalMarkdown ?? live?.text ?? r?.content_markdown ?? "";
  const md = stripSourcesSection(rawMd);
  const errorCode = streaming ? null : live?.errorCode ?? r?.error ?? null;
  const step: string = live?.step ?? (status === "running" ? (companies.length ? "writing" : "gathering") : "done");
  const mode = structured?.mode;

  const toggleFav = async () => {
    if (!r) return;
    report.setData({ ...r, favorite: !r.favorite });
    try { await api.patchResearch(r.id, !r.favorite); } catch { report.setData({ ...r }); }
  };

  const addWatch = async () => {
    if (!primary) return;
    try {
      await api.addWatch(profile.id, primary);
      setOnWatch(true);
      toast.push("success", t("watchlist.added", { symbol: primary }));
    } catch (e) {
      toast.push("error", errorText(t, e));
    }
  };

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsking(true);
    setQuestion("");
    setPending({ question: q, text: "", tools: [], sources: [], error: null });
    try {
      await streamSSE<ChatEvent>(`/research/${encodeURIComponent(researchId)}/followup/stream`, {
        body: { question: q, language },
        signal: ctrl.signal,
        onEvent: (ev) => setPending((p) => {
          if (!p) return p;
          switch (ev.type) {
            case "tool": return { ...p, tools: [...p.tools, { name: ev.name, args: ev.args, ok: ev.ok }] };
            case "token": return { ...p, text: p.text + ev.text };
            case "sources": return { ...p, sources: ev.sources };
            case "final": return { ...p, text: ev.content, sources: ev.sources };
            case "error": return { ...p, error: errorText(t, new ApiError(0, ev.code)) };
            default: return p;
          }
        }),
      });
      await report.reload();
      setPending((p) => (p?.error ? p : null));
    } catch (e2) {
      setPending((p) => (p ? { ...p, error: errorText(t, e2) } : p));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/research" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("report.backToResearch")}
      </Link>

      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{r?.query}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {r && <Badge variant="outline">{t(`research.mode.${mode === "topic" ? "topic" : r.mode}`)}</Badge>}
              {symbols.map((s) => <Badge key={s} variant="muted">{s}</Badge>)}
              {r && <span>{fmtDate(r.created_at, true)}</span>}
              {status && status !== "done" && (
                <Badge variant={status === "failed" ? "danger" : "warning"}>{t(`research.status.${status}`)}</Badge>
              )}
            </div>
          </div>
          {r && (
            <Button variant="ghost" size="icon" onClick={() => void toggleFav()} aria-pressed={r.favorite} aria-label={r.favorite ? t("report.unfavorite") : t("report.favorite")}>
              <Star className={cn("!size-5", r.favorite ? "fill-accent text-accent" : "text-muted-foreground")} />
            </Button>
          )}
        </div>

        {status === "running" && (
          <div className="mt-5 rounded-xl bg-muted/60 p-4" aria-live="polite">
            <ol className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              {STEPS.map((s, i) => {
                const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
                const state = step === "done" || i < idx ? "done" : i === idx ? "current" : "todo";
                return (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    {state === "done" ? <Check className="size-4 text-success" aria-hidden /> : state === "current" ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : <span className="size-4 rounded-full border-2 border-muted-foreground/30" aria-hidden />}
                    <span className={cn(state === "todo" && "text-muted-foreground", state === "current" && "font-medium")}>{t(`report.steps.${s}`)}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">{t("report.runningHint")}</p>
          </div>
        )}

        {primary && (
          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => void addWatch()} disabled={onWatch}>
              {onWatch ? <Check /> : <Eye />} {onWatch ? t("report.addedWatchlist") : t("report.addWatchlist")}
            </Button>
            <Link to={`/masters?symbol=${encodeURIComponent(primary)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <MessagesSquare /> {t("report.askMaster")}
            </Link>
            <Link to={`/trade/${encodeURIComponent(primary)}?research=${encodeURIComponent(researchId)}`} className={buttonVariants({ variant: "default", size: "sm" })}>
              <ArrowRightLeft /> {t("report.simulateBuy")}
            </Link>
          </div>
        )}
      </Card>

      {errorCode && (
        <Alert variant="danger" title={t("report.failed")}>
          {errorText(t, new ApiError(0, errorCode))}
          {companies.length > 0 && <span className="mt-1 block">{t("report.partial")}</span>}
        </Alert>
      )}
      {mode === "topic" && <Alert variant="info">{t("report.topicNote")}</Alert>}

      {companies.length > 1 && <ComparisonTable companies={companies} />}
      {companies.map((c) => <CompanyBlock key={c.ticker} c={c} onCite={cite("main")} />)}
      {status === "running" && !companies.length && step !== "writing" && (
        <div className="grid gap-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>
      )}

      {(md || status === "running") && !(errorCode && !md) && (
        <Card>
          <CardHeader><CardTitle>{t("report.narrative")}</CardTitle></CardHeader>
          <CardContent>
            {md ? (
              <Markdown citations onCite={cite("main")}>{md + (streaming && step === "writing" ? " ▍" : "")}</Markdown>
            ) : (
              <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
            )}
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("report.sources")}</CardTitle></CardHeader>
          <CardContent>
            <SourcesList sources={sources} scope="main" highlight={highlight?.scope === "main" ? highlight : null} />
          </CardContent>
        </Card>
      )}

      {r && r.status === "done" && (
        <section aria-labelledby="fu-h" className="space-y-4">
          <h2 id="fu-h" className="text-base font-semibold">{t("report.followups")}</h2>
          {r.followups?.map((f) => <FollowupItem key={f.id} f={f} onCite={cite(f.id)} highlight={highlight?.scope === f.id ? highlight : null} />)}
          {pending && (
            <FollowupView question={pending.question} text={pending.text} tools={pending.tools} sources={pending.sources}
              error={pending.error} streaming={asking} scope="pending" onCite={cite("pending")} highlight={highlight?.scope === "pending" ? highlight : null} />
          )}
          <form onSubmit={ask} className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-card">
            <label htmlFor="fu-input" className="sr-only">{t("report.followupPlaceholder")}</label>
            <Textarea
              id="fu-input"
              rows={1}
              value={question}
              maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              placeholder={t("report.followupPlaceholder")}
              className="min-h-[44px] resize-none border-0 focus-visible:ring-0"
            />
            <Button type="submit" size="icon" disabled={!question.trim() || asking} aria-label={t("report.ask")}>
              {asking ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">{t("disclaimer.education")}</p>
    </div>
  );
}

function FollowupItem({ f, onCite, highlight }: { f: Report; onCite: (r: string) => void; highlight: { ref: string; n: number } | null }) {
  const { t } = useTranslation();
  const tools = f.structured_json?.tool_calls ?? [];
  return (
    <FollowupView question={f.query} text={f.content_markdown ?? ""} tools={tools} sources={f.sources} scope={f.id}
      streaming={f.status === "running"} error={f.status === "failed" ? errorText(t, new ApiError(0, f.error ?? "AI_UNAVAILABLE")) : null}
      onCite={onCite} highlight={highlight} />
  );
}

function FollowupView({ question, text, tools, sources, error, streaming, scope, onCite, highlight }: {
  question: string; text: string; tools: ToolCallLog[]; sources: Source[]; error: string | null; streaming: boolean; scope: string;
  onCite: (r: string) => void; highlight: { ref: string; n: number } | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">{question}</div>
      <div className="flex gap-3">
        <MasterAvatar id="tutor" size={32} className="mt-1 hidden sm:block" />
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card p-4 shadow-card">
          <ToolChips tools={tools} className="mb-3" />
          {text ? <Markdown citations onCite={onCite} className="prose-chat">{text + (streaming ? " ▍" : "")}</Markdown>
            : streaming ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("chat.thinking")}</p> : null}
          {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
          {sources.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chat.sources")}</p>
              <SourcesList sources={sources} scope={scope} highlight={highlight} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-72" />
      <Skeleton className="h-96" />
    </div>
  );
}
