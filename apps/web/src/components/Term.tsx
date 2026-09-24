import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { HelpCircle, Sparkles, X } from "lucide-react";
import { ApiError, loadGlossary } from "@/lib/api";
import { streamSSE } from "@/lib/sse";
import { errorText } from "@/lib/errorText";
import type { ExplainEvent, GlossaryEntry } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Markdown } from "./Markdown";

/**
 * "Explain This": wraps a financial label. Click → popover with the instant glossary
 * definition, plus "Explain more simply", which streams an age-adapted explanation.
 */
export function Term({ id, children, context, className, icon = true }: {
  id: string; children?: ReactNode; context?: string; className?: string; icon?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { activeProfile, language } = useApp();
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<GlossaryEntry | null | undefined>(undefined);
  const [simple, setSimple] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const popId = useId();
  const zh = language === "zh-CN";

  useEffect(() => {
    let alive = true;
    loadGlossary().then((m) => alive && setEntry(m.get(id) ?? null)).catch(() => alive && setEntry(null));
    return () => { alive = false; };
  }, [id]);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - 24);
    const left = Math.max(12, Math.min(b.left + b.width / 2 - width / 2, vw - width - 12));
    const above = b.bottom + 260 > vh && b.top > 280;
    setPos({ top: above ? b.top - 8 : b.bottom + 8, left, width, above });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const explain = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSimple("");
    setErr(null);
    setStreaming(true);
    try {
      await streamSSE<ExplainEvent>("/explain/stream", {
        body: { term: entry ? (zh ? entry.term_zh : entry.term_en) : id, context: context ?? null, profile_id: activeProfile?.id ?? null, language },
        signal: ctrl.signal,
        onEvent: (ev) => {
          if (ev.type === "token") setSimple((s) => s + ev.text);
          else if (ev.type === "final") setSimple(ev.content);
          else if (ev.type === "error") setErr(errorText(t, new ApiError(0, ev.code)));
        },
      });
    } catch (e) {
      if (!ctrl.signal.aborted) setErr(errorText(t, e));
    } finally {
      setStreaming(false);
    }
  };

  const fullName = entry ? (zh ? entry.term_zh : entry.term_en) : undefined;
  const definition = entry ? (zh ? entry.zh : entry.en) : undefined;
  const label = children ?? (i18n.exists(`terms.${id}`) ? t(`terms.${id}`) : fullName ?? id);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={fullName}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn(
          "inline-flex items-center gap-1 rounded text-left decoration-dotted decoration-muted-foreground/60 underline-offset-4 hover:underline hover:text-primary focus-visible:underline",
          className,
        )}
      >
        <span>{label}</span>
        {icon && <HelpCircle className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />}
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label={fullName ?? String(id)}
          className="fixed z-[70] rounded-xl border bg-card p-4 text-left text-sm font-normal normal-case tracking-normal text-card-foreground shadow-pop animate-fade-in"
          style={{ left: pos.left, width: pos.width, ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        >
          <div className="mb-2 flex items-start gap-2">
            <p className="flex-1 font-semibold leading-snug">{fullName ?? label}</p>
            <button type="button" onClick={() => setOpen(false)} className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
          {entry === undefined ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : definition ? (
            <p className="leading-6 text-foreground/90">{definition}</p>
          ) : (
            <p className="text-muted-foreground">{t("explain.notInGlossary")}</p>
          )}
          {(simple || streaming || err) && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg bg-primary-soft/60 p-3">
              {simple ? <Markdown className="prose-chat text-sm leading-6">{simple}</Markdown> : !err && <p className="text-muted-foreground">{t("explain.explaining")}</p>}
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}
          <Button variant="secondary" size="sm" className="mt-3" onClick={explain} loading={streaming}>
            {!streaming && <Sparkles />} {t("explain.explainSimpler")}
          </Button>
        </div>,
        document.body,
      )}
    </>
  );
}
