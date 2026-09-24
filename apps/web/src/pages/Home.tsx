import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowRightLeft, Lightbulb, MessagesSquare, RefreshCw, Sparkles, Star, Telescope, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCashWords, fmtMoney, fmtRelative } from "@/lib/format";
import { KEYS, local } from "@/lib/storage";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Change } from "@/components/Change";
import { EmptyState, ErrorState, LoadingRows } from "@/components/States";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { TradeLauncher } from "@/components/TradeLauncher";
import { cn } from "@/lib/utils";

const PROMPTS = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;

export default function Home() {
  const { t } = useTranslation();
  const profile = useProfile();
  const { portfolio, portfolioError, refreshPortfolio } = useApp();
  useDocumentTitle(t("nav.home"));
  const [welcomed, setWelcomed] = useState(() => local.get(KEYS.welcomed(profile.id)) === "1");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [promptIdx, setPromptIdx] = useState(() => {
    const stored = Number(local.get(KEYS.promptIndex));
    const day = Math.floor(Date.now() / 86_400_000);
    return Number.isFinite(stored) && local.get(KEYS.promptIndex) !== null ? stored % PROMPTS.length : day % PROMPTS.length;
  });

  const watch = useAsync(() => api.watchlist(profile.id), [profile.id]);
  const research = useAsync(() => api.researchList(profile.id, { limit: 5 }), [profile.id]);

  const movers = useMemo(
    () => [...(watch.data ?? [])].sort((a, b) => Math.abs(b.quote?.change_pct ?? 0) - Math.abs(a.quote?.change_pct ?? 0)).slice(0, 5),
    [watch.data],
  );

  const dismissWelcome = () => {
    local.set(KEYS.welcomed(profile.id), "1");
    setWelcomed(true);
  };
  const nextPrompt = () => {
    const n = (promptIdx + 1) % PROMPTS.length;
    setPromptIdx(n);
    local.set(KEYS.promptIndex, String(n));
  };
  const promptText = t(`home.prompts.${PROMPTS[promptIdx]}`);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{t("home.greeting", { name: profile.nickname })}</h1>
        <p className="mt-1 text-muted-foreground">{t("home.subtitle")}</p>
      </div>

      {!welcomed && (
        <div className="relative flex gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft to-card p-4 pr-10 sm:p-5 sm:pr-12 animate-fade-in">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="leading-7">{t("home.welcome", { cash: fmtCashWords(profile.starting_cash) })}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={dismissWelcome}>{t("home.welcomeDismiss")}</Button>
          </div>
          <button type="button" onClick={dismissWelcome} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("common.close")}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <section aria-labelledby="snap-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="snap-h" className="text-base font-semibold">{t("home.snapshot")}</h2>
          <Link to="/portfolio" className="text-sm font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
        </div>
        {portfolioError && !portfolio ? (
          <Card><ErrorState error={portfolioError} onRetry={() => void refreshPortfolio()} compact /></Card>
        ) : (
          <PortfolioSummary portfolio={portfolio} loading />
        )}
      </section>

      <section aria-labelledby="qa-h">
        <h2 id="qa-h" className="mb-3 text-base font-semibold">{t("home.quickActions")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction to="/masters" icon={<MessagesSquare />} title={t("home.askMaster")} desc={t("home.askMasterDesc")} tone="primary" />
          <QuickAction to="/research" icon={<Telescope />} title={t("home.researchStock")} desc={t("home.researchStockDesc")} tone="accent" />
          <QuickAction onClick={() => setTradeOpen(true)} icon={<ArrowRightLeft />} title={t("home.makeTrade")} desc={t("home.makeTradeDesc")} tone="muted" />
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-foreground dark:text-accent">
            <Lightbulb className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("home.learningPrompt")}</p>
            <p className="mt-1 text-[1.05rem] font-medium leading-7" aria-live="polite">{promptText}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="icon" onClick={nextPrompt} aria-label={t("home.anotherPrompt")} title={t("home.anotherPrompt")}>
              <RefreshCw />
            </Button>
            <Link to={`/masters/buffett?q=${encodeURIComponent(promptText)}`} className={buttonVariants({ variant: "default" })}>
              {t("home.discuss")} <ArrowRight />
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("home.movers")}</CardTitle>
            <Link to="/watchlist" className="text-sm font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
          </CardHeader>
          <CardContent>
            {watch.loading ? <LoadingRows rows={3} /> : watch.error ? <ErrorState error={watch.error} onRetry={watch.reload} compact /> : movers.length === 0 ? (
              <EmptyState icon={<Star />} title={t("home.moversEmpty")} action={<Link to="/watchlist" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("home.addToWatchlist")}</Link>} />
            ) : (
              <ul className="divide-y">
                {movers.map((w) => (
                  <li key={w.symbol}>
                    <Link to={`/stocks/${w.symbol}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <span className="w-14 font-semibold">{w.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{w.quote?.name ?? ""}</span>
                      <span className="text-sm font-medium tabular">{fmtMoney(w.quote?.price)}</span>
                      <Change pct={w.quote?.change_pct} size="xs" className="w-20 justify-end" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("home.recentResearch")}</CardTitle>
            <Link to="/research" className="text-sm font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
          </CardHeader>
          <CardContent>
            {research.loading ? <LoadingRows rows={3} /> : research.error ? <ErrorState error={research.error} onRetry={research.reload} compact /> : !research.data?.length ? (
              <EmptyState icon={<Telescope />} title={t("home.recentResearchEmpty")} action={<Link to="/research" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("home.startResearch")}</Link>} />
            ) : (
              <ul className="divide-y">
                {research.data.map((r) => (
                  <li key={r.id}>
                    <Link to={`/research/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.query}</span>
                        <span className="text-xs text-muted-foreground">{fmtRelative(r.created_at)}</span>
                      </span>
                      {r.symbol && <Badge variant="muted">{r.symbol}</Badge>}
                      <Badge variant={r.status === "done" ? "default" : r.status === "failed" ? "danger" : "warning"}>
                        {r.status === "done" ? t(`research.mode.${r.mode}`) : t(`research.status.${r.status}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("disclaimer.app")}</p>
      <TradeLauncher open={tradeOpen} onClose={() => setTradeOpen(false)} />
    </div>
  );
}

function QuickAction({ to, onClick, icon, title, desc, tone }: {
  to?: string; onClick?: () => void; icon: React.ReactNode; title: string; desc: string; tone: "primary" | "accent" | "muted";
}) {
  const cls = "group flex h-full items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop focus-visible:shadow-pop";
  const inner = (
    <>
      <span className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "accent" && "bg-accent text-accent-foreground",
        tone === "muted" && "bg-primary-soft text-primary",
      )} aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold">{title}<ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" aria-hidden /></span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span>
      </span>
    </>
  );
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
