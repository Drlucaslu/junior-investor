import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, History, PlayCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPct } from "@/lib/format";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, PageHeader } from "@/components/States";
import { cn } from "@/lib/utils";

export default function Scenarios() {
  const { t } = useTranslation();
  const profile = useProfile();
  const { language } = useApp();
  const zh = language === "zh-CN";
  useDocumentTitle(t("scenarios.title"));
  const data = useAsync(() => api.scenarios(profile.id), [profile.id]);

  return (
    <div>
      <PageHeader title={t("scenarios.title")} subtitle={t("scenarios.subtitle")} />
      {data.loading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.data!.scenarios.map((s) => {
            const run = data.data!.runs.find((r) => r.scenario_id === s.id);
            const done = (run?.completed ?? 0) > 0;
            const active = run?.active_run_id;
            return (
              <li key={s.id}>
                <Card className={cn("flex h-full flex-col overflow-hidden", done && "border-success/40")}>
                  <div className="flex items-center gap-3 border-b bg-gradient-to-r from-accent-soft/70 to-card px-5 py-3">
                    <span className="text-3xl font-bold tabular text-accent-foreground/80 dark:text-accent">{s.year}</span>
                    <History className="ml-auto size-5 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-base font-semibold leading-snug">{zh ? s.title_zh : s.title_en}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{zh ? s.tagline_zh : s.tagline_en}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="muted">{t("scenarios.years", { n: s.years })}</Badge>
                      <Badge variant="muted">{t("scenarios.companies", { n: s.companies })}</Badge>
                      {s.unlocks_for ? <Badge variant="accent">{t("scenarios.requiredFor", { n: s.unlocks_for })}</Badge>
                        : <Badge variant="outline">{t("scenarios.bonusScenario")}</Badge>}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                      <span className="text-xs text-muted-foreground">
                        {active ? t("scenarios.inProgress", { step: (run?.active_step ?? 0) + 1, total: 3 })
                          : done ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" aria-hidden />
                            {t("scenarios.completed")}{run?.best_return_pct != null && ` · ${t("scenarios.best", { pct: fmtPct(run.best_return_pct, { sign: true, decimals: 0 }) })}`}</span>
                            : t("scenarios.notStarted")}
                      </span>
                      <Link to={`/scenarios/${s.id}`} className={buttonVariants({ size: "sm", variant: done && !active ? "outline" : "default" })}>
                        <PlayCircle /> {active ? t("scenarios.continue") : done ? t("scenarios.playAgain") : t("scenarios.start")}
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
