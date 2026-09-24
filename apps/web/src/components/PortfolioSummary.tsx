import { useTranslation } from "react-i18next";
import type { Portfolio } from "@/lib/types";
import { fmtMoney, fmtPct, signOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Change } from "./Change";
import { Skeleton } from "./ui/misc";

function Stat({ label, children, big, className }: { label: React.ReactNode; children: React.ReactNode; big?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3.5 shadow-card sm:p-4", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn("mt-1 font-semibold tabular tracking-tight", big ? "text-2xl sm:text-[1.7rem]" : "text-lg")}>{children}</div>
    </div>
  );
}

export function PortfolioSummary({ portfolio, loading }: { portfolio: Portfolio | null; loading?: boolean }) {
  const { t } = useTranslation();
  if (!portfolio) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-busy={loading}>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={cn("h-[84px]", i === 0 && "col-span-2")} />)}
      </div>
    );
  }
  const ret = portfolio.total_return_pct;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Stat label={t("snapshot.totalValue")} big className="col-span-2 bg-primary-soft/50">{fmtMoney(portfolio.total_equity)}</Stat>
      <Stat label={t("snapshot.cash")}>{fmtMoney(portfolio.cash, { decimals: 0 })}</Stat>
      <Stat label={t("snapshot.invested")}>{fmtMoney(portfolio.market_value, { decimals: 0 })}</Stat>
      <Stat label={<span title={t("snapshot.pnlFull")}>{t("snapshot.todayPnl")}</span>}>
        <Change value={portfolio.today_pnl} size="md" />
      </Stat>
      <Stat label={<span title={t("snapshot.pnlFull")}>{t("snapshot.totalPnl")}</span>}>
        <Change value={portfolio.total_pnl} size="md" />
        <span className={cn("block text-xs font-medium", signOf(ret) === "up" ? "text-gain" : signOf(ret) === "down" ? "text-loss" : "text-muted-foreground")}>
          {t("snapshot.totalReturn")} {fmtPct(ret, { sign: true })}
        </span>
      </Stat>
    </div>
  );
}
