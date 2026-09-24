import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { CompanyData, FinancialPeriod, ValuationMetrics } from "@/lib/types";
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtMultiple, fmtNumber, fmtRatioPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Change } from "./Change";
import { Term } from "./Term";
import { FinancialBarChart, MarginsChart } from "./charts";

/** Deterministic rendering of research data — numbers come from providers, never from the model. */

function NA() {
  const { t } = useTranslation();
  return <span className="text-muted-foreground">{t("common.dataUnavailable")}</span>;
}

function val(v: string, raw: number | null | undefined): ReactNode {
  return raw === null || raw === undefined || !Number.isFinite(raw) ? <NA /> : v;
}

function RefBadge({ refId, onCite }: { refId?: string; onCite?: (r: string) => void }) {
  const { t } = useTranslation();
  if (!refId) return null;
  return (
    <button type="button" onClick={() => onCite?.(refId)} aria-label={t("report.citation", { ref: refId })}
      className="rounded-md bg-primary-soft px-1.5 text-[0.7rem] font-semibold leading-5 text-primary hover:bg-primary hover:text-primary-foreground">
      {refId}
    </button>
  );
}

export function CompanyHeader({ c, onCite }: { c: CompanyData; onCite?: (r: string) => void }) {
  const { t } = useTranslation();
  const q = c.quote;
  const p = c.profile;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{c.name}</h2>
          <Link to={`/stocks/${c.ticker}`} className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold hover:bg-primary-soft hover:text-primary">{c.ticker}</Link>
          {p?.quote_type === "ETF" && <Badge variant="muted">ETF</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[p?.exchange, p?.sector, p?.industry].filter(Boolean).join(" · ") || null}
        </p>
      </div>
      {q ? (
        <div className="sm:text-right">
          <p className="text-2xl font-semibold tabular">{fmtMoney(q.price)}</p>
          <div className="flex items-center gap-2 sm:justify-end">
            <Change value={q.change} pct={q.change_pct} />
            <RefBadge refId={q.ref} onCite={onCite} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("common.asOf", { time: fmtDate(q.timestamp, true) })} · {t(`market.session.${q.session}`)}</p>
        </div>
      ) : (
        <p className="text-sm"><NA /></p>
      )}
    </div>
  );
}

const FIN_ROWS: { key: keyof FinancialPeriod; term: string; kind: "money" | "pct" | "eps" }[] = [
  { key: "revenue", term: "revenue", kind: "money" },
  { key: "revenue_growth", term: "revenue_growth", kind: "pct" },
  { key: "net_income", term: "net_income", kind: "money" },
  { key: "eps_diluted", term: "eps", kind: "eps" },
  { key: "free_cash_flow", term: "fcf", kind: "money" },
  { key: "gross_margin", term: "gross_margin", kind: "pct" },
  { key: "operating_margin", term: "operating_margin", kind: "pct" },
  { key: "net_margin", term: "net_margin", kind: "pct" },
];
const TERM_IDS = new Set(["revenue", "net_income", "eps", "fcf", "gross_margin", "operating_margin"]);

export function FinancialSnapshot({ c, onCite }: { c: CompanyData; onCite?: (r: string) => void }) {
  const { t } = useTranslation();
  const periods = c.financials?.periods ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{t("report.financialSnapshot")}</CardTitle>
        <RefBadge refId={c.financials?.ref} onCite={onCite} />
      </CardHeader>
      <CardContent>
        {!periods.length ? <p className="text-sm"><NA /></p> : (
          <>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[480px] text-sm tabular">
                <caption className="sr-only">{t("report.financialSnapshot")}</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">{t("report.fiscalYear")}</th>
                    {periods.map((p) => <th key={p.period_end} scope="col" className="px-2 py-2 text-right font-medium">{p.fiscal_year ?? p.period_end.slice(0, 4)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FIN_ROWS.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground/85">
                        {TERM_IDS.has(r.term) ? <Term id={r.term} context={`${c.ticker} ${t(`terms.${r.term}`)}`} /> : t(`terms.${r.term}`)}
                      </th>
                      {periods.map((p) => {
                        const raw = p[r.key] as number | null;
                        const s = r.kind === "money" ? fmtMoneyCompact(raw) : r.kind === "pct" ? fmtRatioPct(raw) : fmtMoney(raw);
                        return <td key={p.period_end} className="px-2 py-2 text-right">{raw === null ? <span className="text-muted-foreground">—</span> : s}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {periods.some((p) => p.revenue === null || p.free_cash_flow === null) && (
              <p className="mt-2 text-xs text-muted-foreground">— = {t("common.dataUnavailable")}</p>
            )}
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <figure>
                <figcaption className="mb-2 text-xs font-medium text-muted-foreground">{t("report.chartRevenue")}</figcaption>
                <FinancialBarChart periods={periods} />
              </figure>
              <figure>
                <figcaption className="mb-2 text-xs font-medium text-muted-foreground">{t("report.chartMargins")}</figcaption>
                <MarginsChart periods={periods} />
              </figure>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("common.source", { source: c.financials?.source ?? "" })}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function valuationRows(v: ValuationMetrics | undefined): { id: string; label: ReactNode; value: ReactNode }[] {
  return [
    { id: "market_cap", label: <Term id="market_cap" />, value: val(fmtMoneyCompact(v?.market_cap), v?.market_cap) },
    { id: "pe", label: <Term id="pe" />, value: val(fmtNumber(v?.pe_ttm, 1), v?.pe_ttm) },
    { id: "forward_pe", label: <Term id="forward_pe" />, value: val(fmtNumber(v?.pe_forward, 1), v?.pe_forward) },
    { id: "ps", label: <Term id="ps" />, value: val(fmtMultiple(v?.ps_ttm), v?.ps_ttm) },
    { id: "fcf_yield", label: <Term id="fcf_yield" />, value: val(fmtRatioPct(v?.fcf_yield), v?.fcf_yield) },
    {
      id: "week52", label: <Term id="week52" />,
      value: v?.week52_low != null && v?.week52_high != null ? `${fmtMoney(v.week52_low)} – ${fmtMoney(v.week52_high)}` : <NA />,
    },
  ];
}

export function ValuationTable({ c, onCite }: { c: CompanyData; onCite?: (r: string) => void }) {
  const { t } = useTranslation();
  const v = c.valuation;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{t("report.valuation")}</CardTitle>
        <RefBadge refId={v?.ref} onCite={onCite} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {valuationRows(v).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="text-foreground/85">{r.label}</dt>
              <dd className="text-right font-medium tabular">{r.value}</dd>
            </div>
          ))}
        </dl>
        {v && <p className="mt-3 text-xs text-muted-foreground">{t("common.source", { source: v.source })}{v.as_of ? ` · ${t("common.asOf", { time: fmtDate(v.as_of) })}` : ""}</p>}
      </CardContent>
    </Card>
  );
}

export function ComparisonTable({ companies }: { companies: CompanyData[] }) {
  const { t } = useTranslation();
  const rows = companies.map((c) => ({ c, rows: valuationRows(c.valuation) }));
  const labels = valuationRows(undefined);
  return (
    <Card>
      <CardHeader><CardTitle>{t("report.comparison")}</CardTitle></CardHeader>
      <CardContent>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[520px] text-sm tabular">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 pr-3 text-left font-medium">{t("report.metric")}</th>
                {companies.map((c) => <th key={c.ticker} scope="col" className="px-2 py-2 text-right font-semibold text-foreground">{c.ticker}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <th scope="row" className="py-2 pr-3 text-left font-normal">{t("report.priceNow")}</th>
                {companies.map((c) => <td key={c.ticker} className="px-2 py-2 text-right">{c.quote ? fmtMoney(c.quote.price) : <NA />}</td>)}
              </tr>
              {labels.map((l, i) => (
                <tr key={l.id} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{l.label}</th>
                  {rows.map((r) => <td key={r.c.ticker} className={cn("px-2 py-2 text-right")}>{r.rows[i].value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanyBlock({ c, onCite }: { c: CompanyData; onCite?: (r: string) => void }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4" aria-label={c.name}>
      <Card className="p-4 sm:p-5">
        <CompanyHeader c={c} onCite={onCite} />
        {c.profile?.summary && <p className="mt-3 text-sm leading-6 text-foreground/85">{c.profile.summary}</p>}
        {c.profile?.website && (
          <a href={c.profile.website} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {c.profile.website} <ExternalLink className="size-3" aria-hidden /><span className="sr-only">{t("report.openSource")}</span>
          </a>
        )}
      </Card>
      {c.profile?.quote_type !== "ETF" || c.financials ? <FinancialSnapshot c={c} onCite={onCite} /> : null}
      <ValuationTable c={c} onCite={onCite} />
    </section>
  );
}
