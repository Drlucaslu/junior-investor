import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtMoneyCompact, fmtRelative } from "@/lib/format";
import type { SymbolMatch, WatchlistItem } from "@/lib/types";
import { useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Change } from "@/components/Change";
import { Term } from "@/components/Term";

export default function Watchlist() {
  const { t } = useTranslation();
  const profile = useProfile();
  const toast = useToast();
  const navigate = useNavigate();
  useDocumentTitle(t("watchlist.title"));
  const list = useAsync(() => api.watchlist(profile.id), [profile.id]);

  const add = async (m: SymbolMatch) => {
    try {
      const r = await api.addWatch(profile.id, m.symbol);
      toast.push("success", t("watchlist.added", { symbol: r.symbol }));
      void list.reload();
    } catch (e) {
      toast.push("error", errorText(t, e));
    }
  };

  const remove = async (w: WatchlistItem) => {
    const prev = list.data;
    list.setData((rows) => (rows ?? []).filter((x) => x.symbol !== w.symbol));
    try {
      await api.removeWatch(profile.id, w.symbol);
    } catch (e) {
      if (prev) list.setData(prev);
      toast.push("error", errorText(t, e));
    }
  };

  const research = (w: WatchlistItem) => w.latest_research_id ? (
    <Link to={`/research/${w.latest_research_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{fmtRelative(w.latest_research_at)}</Link>
  ) : <span className="text-muted-foreground">{t("watchlist.never")}</span>;

  return (
    <div>
      <PageHeader title={t("watchlist.title")} subtitle={t("watchlist.subtitle")} />
      <SymbolSearch className="mb-5 max-w-md" placeholder={t("watchlist.addPlaceholder")} label={t("watchlist.addPlaceholder")} onSelect={(m) => void add(m)} />
      {list.loading && !list.data ? <LoadingRows rows={4} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.length ? (
        <EmptyState icon={<Eye />} title={t("watchlist.empty")} />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm tabular">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">{t("watchlist.symbol")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("watchlist.price")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("watchlist.daily")}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium"><Term id="market_cap" icon={false} /></th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("watchlist.latestResearch")}</th>
                  <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">{t("common.remove")}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((w) => (
                  <tr key={w.symbol} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => navigate(`/stocks/${w.symbol}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/stocks/${w.symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-primary">{w.symbol}</Link>
                      <span className="ml-2 text-muted-foreground">{w.quote?.name}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">{w.quote ? fmtMoney(w.quote.price) : <span className="text-muted-foreground">{t("common.dataUnavailable")}</span>}</td>
                    <td className="px-3 py-3 text-right"><Change pct={w.quote?.change_pct} size="xs" className="justify-end" /></td>
                    <td className="px-3 py-3 text-right">{fmtMoneyCompact(w.market_cap)}</td>
                    <td className="px-3 py-3 text-right">{research(w)}</td>
                    <td className="px-2 py-3 text-right">
                      <Button variant="ghost" size="iconSm" onClick={(e) => { e.stopPropagation(); void remove(w); }} aria-label={t("watchlist.remove", { symbol: w.symbol })}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-2 md:hidden">
            {list.data.map((w) => (
              <li key={w.symbol} className="flex items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
                <Link to={`/stocks/${w.symbol}`} className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{w.symbol}</span>
                    <span className="font-medium tabular">{w.quote ? fmtMoney(w.quote.price) : "—"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{w.quote?.name} · {fmtMoneyCompact(w.market_cap)}</span>
                    <Change pct={w.quote?.change_pct} size="xs" />
                  </div>
                  <div className="mt-0.5 text-xs">{t("watchlist.latestResearch")}: {research(w)}</div>
                </Link>
                <Button variant="ghost" size="iconSm" onClick={() => void remove(w)} aria-label={t("watchlist.remove", { symbol: w.symbol })}>
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
