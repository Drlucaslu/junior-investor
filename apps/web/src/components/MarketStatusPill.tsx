import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { MarketStatus } from "@/lib/types";
import { useInterval } from "@/hooks/useAsync";
import { cn } from "@/lib/utils";

let cached: MarketStatus | null = null;
const subs = new Set<(s: MarketStatus | null) => void>();
let inflight: Promise<void> | null = null;

function refresh(): Promise<void> {
  if (!inflight) {
    inflight = api.marketStatus()
      .then((s) => { cached = s; subs.forEach((f) => f(s)); })
      .catch(() => { /* keep last known */ })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useMarketStatus(): MarketStatus | null {
  const [s, setS] = useState<MarketStatus | null>(cached);
  useEffect(() => {
    subs.add(setS);
    if (!cached) void refresh();
    return () => { subs.delete(setS); };
  }, []);
  useInterval(() => void refresh(), 60_000);
  return s;
}

export function MarketStatusPill({ className, dotOnly }: { className?: string; dotOnly?: boolean }) {
  const { t } = useTranslation();
  const s = useMarketStatus();
  const status = s?.status ?? "UNKNOWN";
  const color = status === "OPEN" ? "bg-success" : status === "CLOSED" || status === "UNKNOWN" ? "bg-muted-foreground" : "bg-warning";
  const label = `${t("market.label")}: ${t(`market.${status}`)}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium", className)} title={label} aria-label={label} role="status">
      <span className={cn("size-2 rounded-full", color, status === "OPEN" && "animate-pulse2")} aria-hidden />
      {!dotOnly && <span className="text-muted-foreground">{t(`market.${status}`)}</span>}
    </span>
  );
}
