import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, FileText, Globe, LineChart, Newspaper, Wrench, XCircle, BarChart3 } from "lucide-react";
import type { Source, ToolCallLog } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, typeof Globe> = {
  market: LineChart, fundamentals: BarChart3, filing: FileText, news: Newspaper, web: Globe,
};

export function sourceAnchor(scope: string, ref: string): string {
  return `src-${scope}-${ref}`;
}

export function SourcesList({ sources, scope, highlight, className, compact }: {
  sources: Source[]; scope: string; highlight?: { ref: string; n: number } | null; className?: string; compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (!sources.length) return null;
  return (
    <ol className={cn("space-y-1.5", className)}>
      {sources.map((s, i) => {
        const ref = s.ref ?? `S${i + 1}`;
        const Icon = KIND_ICON[s.kind] ?? Globe;
        const hl = highlight?.ref === ref;
        const kindLabel = i18n.exists(`report.sourceKind.${s.kind}`) ? t(`report.sourceKind.${s.kind}`) : s.kind;
        return (
          <li
            key={`${ref}-${hl ? highlight?.n : 0}`}
            id={sourceAnchor(scope, ref)}
            className={cn("flex scroll-mt-24 gap-2.5 rounded-lg px-2 py-1.5 text-sm", hl && "animate-highlight")}
          >
            <span className="mt-0.5 shrink-0 rounded-md bg-muted px-1.5 text-[0.7rem] font-semibold leading-5 text-muted-foreground">{ref}</span>
            <div className="min-w-0 flex-1">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 font-medium text-foreground hover:text-primary hover:underline">
                  <span className="break-words">{s.title}</span>
                  <ExternalLink className="mt-1 size-3 shrink-0 opacity-60" aria-hidden />
                </a>
              ) : (
                <span className="font-medium break-words">{s.title}</span>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Icon className="size-3" aria-hidden />{kindLabel}</span>
                {s.publisher && <span>{s.publisher}</span>}
                {s.published_at && <span>{fmtDate(s.published_at)}</span>}
              </p>
              {!compact && s.snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.snippet}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function argStr(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function toolLabel(t: (k: string, o?: Record<string, string>) => string, exists: (k: string) => boolean, tool: ToolCallLog): string {
  const ticker = argStr(tool.args.ticker).toUpperCase();
  const query = argStr(tool.args.query);
  return exists(`tools.${tool.name}`) ? t(`tools.${tool.name}`, { ticker, query }) : t("tools.unknown", { name: tool.name });
}

export function ToolChips({ tools, className }: { tools: ToolCallLog[]; className?: string }) {
  const { t, i18n } = useTranslation();
  if (!tools.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tools.map((tool, i) => (
        <li key={i} className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
          tool.ok ? "border-primary/20 bg-primary-soft/60 text-primary" : "border-border bg-muted text-muted-foreground",
        )}>
          <Wrench className="size-3" aria-hidden />
          <span>{toolLabel((k, o) => t(k, o), (k) => i18n.exists(k), tool)}</span>
          {tool.ok ? <CheckCircle2 className="size-3" aria-hidden /> : (
            <span className="inline-flex items-center gap-0.5"><XCircle className="size-3" aria-hidden />{t("tools.failed")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
