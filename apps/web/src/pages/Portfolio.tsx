import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Briefcase, Scale, Search } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type { Position } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Tabs } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { Change } from "@/components/Change";
import { Term } from "@/components/Term";
import { AllocationDonut, SERIES, type Slice } from "@/components/charts";
import { cn } from "@/lib/utils";

export default function Portfolio() {
  const { t } = useTranslation();
  const profile = useProfile();
  const navigate = useNavigate();
  const { portfolio, portfolioError, refreshPortfolio } = useApp();
  const [tab, setTab] = useState<"positions" | "history">("positions");
  useDocumentTitle(t("portfolio.title"));
  const trades = useAsync(() => api.trades(profile.id), [profile.id], { enabled: tab === "history" });

  useEffect(() => { void refreshPortfolio(); }, [refreshPortfolio]);

  const positions = useMemo(() => [...(portfolio?.positions ?? [])].sort((a, b) => b.market_value - a.market_value), [portfolio]);
  const slices: Slice[] = useMemo(() => {
    if (!portfolio) return [];
    const top = positions.slice(0, 7).map((p, i) => ({ name: p.ticker, value: p.market_value, colorVar: SERIES[i] }));
    const rest = positions.slice(7).reduce((s, p) => s + p.market_value, 0);
    const out: Slice[] = [...top];
    if (rest > 0) out.push({ name: t("portfolio.other"), value: rest, colorVar: "--series-8" });
    if (portfolio.cash > 0) out.push({ name: t("portfolio.cash"), value: portfolio.cash, colorVar: "--series-other" });
    return out;
  }, [portfolio, positions, t]);

  const largest = positions[0];
  const concentrated = largest && largest.allocation_pct > 30;

  return (
    <div className="space-y-6">
      <PageHeader title={t("portfolio.title")} subtitle={t("portfolio.subtitle")} />
      {portfolioError && !portfolio ? <Card><ErrorState error={portfolioError} onRetry={() => void refreshPortfolio()} /></Card> : (
        <PortfolioSummary portfolio={portfolio} loading />
      )}

      {concentrated && (
        <Alert variant="info" icon={<Scale className="size-4 text-primary" aria-hidden />}>
          {t("portfolio.concentration", { symbol: largest.ticker, pct: fmtPct(largest.allocation_pct, { decimals: 0 }) })}{" "}
          <Term id="diversification" icon />
        </Alert>
      )}
      {portfolio && portfolio.stale_prices.length > 0 && (
        <Alert variant="warning">{t("portfolio.stalePrice")}: {portfolio.stale_prices.join(", ")}</Alert>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: "positions", label: t("portfolio.positions") }, { value: "history", label: t("portfolio.history") }]} />

      {tab === "positions" ? (
        !portfolio ? <LoadingRows rows={3} /> : positions.length === 0 ? (
          <EmptyState icon={<Briefcase />} title={t("portfolio.empty")}
            action={<Link to="/research" className={buttonVariants({ size: "sm" })}><Search /> {t("portfolio.startTrading")}</Link>} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {/* Desktop table */}
              <Card className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 text-left font-medium">{t("portfolio.ticker")}</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.quantity")}</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium"><Term id="average_cost" icon={false} /></th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.lastPrice")}</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.marketValue")}</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium"><Term id="unrealized_pnl" icon={false} /></th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("portfolio.allocationPct")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.ticker} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => navigate(`/stocks/${p.ticker}`)}>
                          <td className="px-4 py-3">
                            <Link to={`/stocks/${p.ticker}`} className="font-semibold hover:text-primary" onClick={(e) => e.stopPropagation()}>{p.ticker}</Link>
                          </td>
                          <td className="px-3 py-3 text-right">{fmtQty(p.quantity)}</td>
                          <td className="px-3 py-3 text-right">{fmtMoney(p.average_cost)}</td>
                          <td className="px-3 py-3 text-right"><LastPrice p={p} /></td>
                          <td className="px-3 py-3 text-right font-medium">{fmtMoney(p.market_value)}</td>
                          <td className="px-3 py-3 text-right"><Change value={p.unrealized_pnl} pct={p.unrealized_pnl_pct} size="xs" className="justify-end" /></td>
                          <td className="px-4 py-3 text-right">{fmtPct(p.allocation_pct, { decimals: 1 })}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/30">
                        <td className="px-4 py-3 font-medium">{t("portfolio.cash")}</td>
                        <td colSpan={3} />
                        <td className="px-3 py-3 text-right font-medium">{fmtMoney(portfolio.cash)}</td>
                        <td />
                        <td className="px-4 py-3 text-right">{fmtPct(portfolio.total_equity ? (portfolio.cash / portfolio.total_equity) * 100 : 0, { decimals: 1 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              {/* Mobile cards */}
              <ul className="space-y-2 md:hidden">
                {positions.map((p) => (
                  <li key={p.ticker}>
                    <Link to={`/stocks/${p.ticker}`} className="block rounded-xl border bg-card p-4 shadow-card">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{p.ticker}</span>
                        <span className="font-semibold tabular">{fmtMoney(p.market_value)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="tabular">{fmtQty(p.quantity)} × <LastPrice p={p} /></span>
                        <Change value={p.unrealized_pnl} pct={p.unrealized_pnl_pct} size="xs" />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("terms.average_cost")} {fmtMoney(p.average_cost)}</span>
                        <span>{fmtPct(p.allocation_pct, { decimals: 1 })}</span>
                      </div>
                    </Link>
                  </li>
                ))}
                <li className="flex items-center justify-between rounded-xl border bg-muted/40 p-4 text-sm">
                  <span className="font-medium">{t("portfolio.cash")}</span>
                  <span className="font-semibold tabular">{fmtMoney(portfolio.cash)}</span>
                </li>
              </ul>
            </div>
            <Card>
              <CardHeader><CardTitle>{t("portfolio.allocation")}</CardTitle></CardHeader>
              <CardContent>
                <AllocationDonut slices={slices} total={portfolio.total_equity} />
                <ul className="mt-3 space-y-1.5 text-sm">
                  {slices.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(${s.colorVar ?? SERIES[i]})` }} aria-hidden />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tabular text-muted-foreground">{fmtPct(portfolio.total_equity ? (s.value / portfolio.total_equity) * 100 : 0, { decimals: 1 })}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )
      ) : trades.loading ? <LoadingRows rows={4} /> : trades.error ? <ErrorState error={trades.error} onRetry={trades.reload} /> : !trades.data?.length ? (
        <EmptyState icon={<Briefcase />} title={t("portfolio.noTrades")} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm tabular">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t("portfolio.date")}</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">{t("portfolio.side")}</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">{t("portfolio.ticker")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.quantity")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.price")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("portfolio.value")}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium"><Term id="realized_pnl" icon={false} /></th>
                </tr>
              </thead>
              <tbody>
                {trades.data.map((tr) => (
                  <tr key={tr.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(tr.executed_at ?? tr.requested_at, true)}</td>
                    <td className="px-3 py-3"><Badge variant={tr.side === "BUY" ? "default" : "accent"}>{t(`portfolio.${tr.side}`)}</Badge></td>
                    <td className="px-3 py-3"><Link to={`/stocks/${tr.symbol}`} className="font-semibold hover:text-primary">{tr.symbol}</Link></td>
                    <td className="px-3 py-3 text-right">{fmtQty(tr.quantity)}</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(tr.execution_price)}</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(tr.gross_value)}</td>
                    <td className="px-4 py-3 text-right">{tr.realized_pnl != null ? <Change value={tr.realized_pnl} size="xs" className="justify-end" /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-center text-xs text-muted-foreground">{t("disclaimer.app")}</p>
    </div>
  );
}

function LastPrice({ p }: { p: Position }) {
  const { t } = useTranslation();
  if (!p.price_available || p.last_price === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-warning")} title={t("portfolio.stalePrice")}>
        <AlertTriangle className="size-3.5" aria-hidden />—<span className="sr-only">{t("portfolio.stalePrice")}</span>
      </span>
    );
  }
  return <span>{fmtMoney(p.last_price)}</span>;
}
