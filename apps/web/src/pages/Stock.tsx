import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, Check, Eye, MessagesSquare, Telescope, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtNumber, fmtPct, fmtQty, fmtRelative } from "@/lib/format";
import type { HistoryRange } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/States";
import { Change } from "@/components/Change";
import { Term } from "@/components/Term";
import { PriceChart } from "@/components/charts";
import { useMarketStatus } from "@/components/MarketStatusPill";

const RANGES: HistoryRange[] = ["1D", "1W", "1M", "6M", "1Y", "5Y"];

export default function Stock() {
  const { symbol: raw = "" } = useParams();
  const symbol = raw.toUpperCase();
  const { t } = useTranslation();
  const profile = useProfile();
  const { portfolio } = useApp();
  const toast = useToast();
  const market = useMarketStatus();
  const [range, setRange] = useState<HistoryRange>("1Y");
  const [onWatch, setOnWatch] = useState(false);
  useDocumentTitle(symbol);

  const quote = useAsync(() => api.quote(symbol), [symbol]);
  const company = useAsync(() => api.company(symbol), [symbol]);
  const metrics = useAsync(() => api.metrics(symbol), [symbol]);
  const fin = useAsync(() => api.financials(symbol, 4), [symbol]);
  const history = useAsync(() => api.history(symbol, range), [symbol, range]);
  const research = useAsync(() => api.researchList(profile.id, { symbol, limit: 3 }), [profile.id, symbol]);

  useEffect(() => {
    api.watchlist(profile.id).then((w) => setOnWatch(w.some((x) => x.symbol === symbol))).catch(() => undefined);
  }, [profile.id, symbol]);

  const position = portfolio?.positions.find((p) => p.ticker === symbol) ?? null;
  const q = quote.data;
  const m = metrics.data;
  const latest = fin.data?.periods[fin.data.periods.length - 1];

  if (quote.error && !q && company.error) {
    return <ErrorState error={quote.error} onRetry={() => { void quote.reload(); void company.reload(); }} />;
  }

  const addWatch = async () => {
    try {
      await api.addWatch(profile.id, symbol);
      setOnWatch(true);
      toast.push("success", t("watchlist.added", { symbol }));
    } catch (e) {
      toast.push("error", errorText(t, e));
    }
  };

  const na = t("common.dataUnavailable");
  const metricsList: { id: string; label: React.ReactNode; value: string | null }[] = [
    { id: "mc", label: <Term id="market_cap" />, value: m?.market_cap != null ? fmtMoneyCompact(m.market_cap) : null },
    { id: "pe", label: <Term id="pe" />, value: m?.pe_ttm != null ? fmtNumber(m.pe_ttm, 1) : null },
    { id: "rev", label: <Term id="revenue" />, value: (m?.revenue_ttm ?? latest?.revenue) != null ? fmtMoneyCompact(m?.revenue_ttm ?? latest?.revenue) : null },
    { id: "ni", label: <Term id="net_income" />, value: (m?.net_income_ttm ?? latest?.net_income) != null ? fmtMoneyCompact(m?.net_income_ttm ?? latest?.net_income) : null },
    { id: "eps", label: <Term id="eps" />, value: (m?.eps_ttm ?? latest?.eps_diluted) != null ? fmtMoney(m?.eps_ttm ?? latest?.eps_diluted) : null },
    { id: "fcf", label: <Term id="fcf" />, value: (m?.fcf_ttm ?? latest?.free_cash_flow) != null ? fmtMoneyCompact(m?.fcf_ttm ?? latest?.free_cash_flow) : null },
    { id: "hi", label: <Term id="week52">{t("terms.week52_high")}</Term>, value: m?.week52_high != null ? fmtMoney(m.week52_high) : null },
    { id: "lo", label: <Term id="week52">{t("terms.week52_low")}</Term>, value: m?.week52_low != null ? fmtMoney(m.week52_low) : null },
  ];

  const name = company.data?.name ?? q?.name ?? symbol;
  const isEtf = company.data?.quote_type === "ETF";

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {company.loading && !company.data && !q ? <Skeleton className="h-8 w-56" /> : (
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="default" className="text-sm">{symbol}</Badge>
              {company.data?.exchange && <span>{company.data.exchange}</span>}
              {isEtf && <Badge variant="muted">{t("stock.etf")}</Badge>}
              {company.data?.sector && <span>· {company.data.sector}</span>}
            </div>
          </div>
          <div className="sm:text-right">
            {quote.loading && !q ? <Skeleton className="h-9 w-32" /> : q ? (
              <>
                <p className="text-3xl font-semibold tabular tracking-tight">{fmtMoney(q.price)}</p>
                <Change value={q.change} pct={q.change_pct} size="md" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`market.session.${q.session}`)}{market ? ` · ${t(`market.${market.status}`)}` : ""} · {t("common.asOf", { time: fmtDate(q.timestamp, true) })}
                </p>
              </>
            ) : <p className="text-sm text-muted-foreground">{na}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
          <Link to={`/research?q=${encodeURIComponent(symbol)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Telescope /> {t("stock.research")}</Link>
          <Link to={`/masters?symbol=${encodeURIComponent(symbol)}`} className={buttonVariants({ variant: "outline", size: "sm" })}><MessagesSquare /> {t("stock.askMaster")}</Link>
          <Button variant="outline" size="sm" onClick={() => void addWatch()} disabled={onWatch}>
            {onWatch ? <Check /> : <Eye />} {onWatch ? t("stock.onWatchlist") : t("stock.addWatchlist")}
          </Button>
          <Link to={`/trade/${encodeURIComponent(symbol)}`} className={buttonVariants({ size: "sm" })}><ArrowRightLeft /> {t("stock.buy")}</Link>
          {position && (
            <Link to={`/trade/${encodeURIComponent(symbol)}?side=sell`} className={buttonVariants({ variant: "secondary", size: "sm" })}><TrendingDown /> {t("stock.sell")}</Link>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("stock.priceChart")}</CardTitle>
          <Segmented size="sm" label={t("stock.priceChart")} value={range} onChange={setRange}
            options={RANGES.map((r) => ({ value: r, label: t(`stock.range.${r}`) }))} className="w-full sm:w-auto" />
        </CardHeader>
        <CardContent>
          {history.loading && !history.data ? <Skeleton className="h-[260px]" /> : history.error || !history.data?.candles.length ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">{t("stock.chartUnavailable")}</div>
          ) : (
            <div className={history.loading ? "opacity-60 transition-opacity" : undefined}><PriceChart candles={history.data.candles} range={range} /></div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("stock.keyMetrics")}</CardTitle></CardHeader>
          <CardContent>
            {metrics.loading && !m ? <Skeleton className="h-40" /> : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {metricsList.map((x) => (
                  <div key={x.id}>
                    <dt className="text-xs text-muted-foreground">{x.label}</dt>
                    <dd className={x.value ? "mt-1 font-semibold tabular" : "mt-1 text-sm text-muted-foreground"}>{x.value ?? na}</dd>
                  </div>
                ))}
              </dl>
            )}
            {m && <p className="mt-4 text-xs text-muted-foreground">{t("common.source", { source: m.source })}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("stock.yourPosition")}</CardTitle></CardHeader>
          <CardContent>
            {!position ? <p className="text-sm text-muted-foreground">{t("stock.noPosition")}</p> : (
              <dl className="space-y-2 text-sm">
                <Row label={t("portfolio.quantity")} value={fmtQty(position.quantity)} />
                <Row label={<Term id="average_cost" />} value={fmtMoney(position.average_cost)} />
                <Row label={t("portfolio.marketValue")} value={fmtMoney(position.market_value)} />
                <Row label={<Term id="unrealized_pnl" />} value={<Change value={position.unrealized_pnl} pct={position.unrealized_pnl_pct} />} />
                <Row label={t("portfolio.allocationPct")} value={fmtPct(position.allocation_pct, { decimals: 1 })} />
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("stock.about")}</CardTitle></CardHeader>
          <CardContent>
            {company.loading && !company.data ? <Skeleton className="h-16" /> : (
              <p className="text-sm leading-6 text-foreground/85">{company.data?.summary || na}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("stock.latestResearch")}</CardTitle></CardHeader>
          <CardContent>
            {research.loading ? <Skeleton className="h-12" /> : !research.data?.length ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("stock.noResearch")}</p>
                <Link to={`/research?q=${encodeURIComponent(symbol)}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Telescope /> {t("stock.research")}</Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {research.data.map((r) => (
                  <li key={r.id}>
                    <Link to={`/research/${r.id}`} className="-mx-2 block rounded-lg px-2 py-1.5 hover:bg-muted">
                      <span className="block truncate text-sm font-medium">{r.query}</span>
                      <span className="text-xs text-muted-foreground">{fmtRelative(r.created_at)} · {t(`research.mode.${r.mode}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("disclaimer.app")}</p>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value}</dd>
    </div>
  );
}
