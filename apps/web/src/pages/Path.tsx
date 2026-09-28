import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, CheckCircle2, Circle, GraduationCap, History, Hourglass, Landmark, Layers, Lock, LockOpen, NotebookPen, PiggyBank,
  ScrollText, Sparkles, Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import type { LearningPath, PathLevel, Requirement } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Skeleton } from "@/components/ui/misc";
import { ErrorState, PageHeader } from "@/components/States";
import { ProfileAvatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

const BADGE_ICONS: Record<string, LucideIcon> = {
  "piggy-bank": PiggyBank, landmark: Landmark, layers: Layers, hourglass: Hourglass, history: History, scroll: ScrollText,
  "notebook-pen": NotebookPen, "graduation-cap": GraduationCap,
};

export function reqLink(r: Requirement): string {
  return r.type === "card" ? `/learn?card=${encodeURIComponent(r.id)}` : `/scenarios/${encodeURIComponent(r.id)}`;
}

export default function PathPage() {
  const { t } = useTranslation();
  const profile = useProfile();
  const { language, path, refreshPath } = useApp();
  const zh = language === "zh-CN";
  useDocumentTitle(t("path.title"));
  const board = useAsync(() => api.leaderboard(), [profile.id]);
  useEffect(() => { void refreshPath(); }, [refreshPath]);

  if (!path) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("path.title")} subtitle={t("path.subtitle")} />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t("path.title")} subtitle={t("path.subtitle")} />
      <PathHero path={path} zh={zh} />

      <section aria-labelledby="ladder-h">
        <h2 id="ladder-h" className="sr-only">{t("path.title")}</h2>
        <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[1.35rem] before:top-4 before:w-px before:bg-border sm:before:left-[1.6rem]">
          {path.levels.map((lv) => <LevelCard key={lv.level} lv={lv} current={path.level} zh={zh} />)}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden />{t("path.badges")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {path.badges.map((b) => {
                const Icon = BADGE_ICONS[b.icon] ?? Trophy;
                return (
                  <li key={b.id} title={zh ? b.desc_zh : b.desc_en}
                    className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center", b.earned ? "border-accent/40 bg-accent-soft/50" : "opacity-55")}>
                    <span className={cn("flex size-10 items-center justify-center rounded-full", b.earned ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold leading-tight">{zh ? b.title_zh : b.title_en}</span>
                    <span className="text-[0.68rem] leading-tight text-muted-foreground">{zh ? b.desc_zh : b.desc_en}</span>
                    <span className="sr-only">{b.earned ? t("path.badgeEarned") : t("path.badgeLocked")}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-primary" aria-hidden />{t("leaderboard.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("leaderboard.subtitle")}</p>
          </CardHeader>
          <CardContent>
            {board.loading ? <Skeleton className="h-32" /> : board.error ? <ErrorState error={board.error} onRetry={board.reload} compact /> : (
              <>
                <table className="w-full text-sm tabular">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 text-left font-medium">{t("leaderboard.rank")}</th>
                      <th scope="col" className="pb-2 text-left font-medium">{t("leaderboard.learner")}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t("leaderboard.level")}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t("leaderboard.week")}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t("leaderboard.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.data?.rows.map((r) => (
                      <tr key={r.profile_id} className={cn("border-t", r.profile_id === profile.id && "bg-primary-soft/50")}>
                        <td className="py-2.5 pl-1 font-semibold">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-2">
                            <ProfileAvatar avatar={r.avatar} size={26} />
                            <span className="truncate font-medium">{r.nickname}</span>
                            {r.profile_id === profile.id && <Badge variant="muted">{t("leaderboard.you")}</Badge>}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">Lv{r.level}</td>
                        <td className="py-2.5 text-right font-semibold">{r.xp_week}</td>
                        <td className="py-2.5 text-right text-muted-foreground">{r.xp_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(board.data?.rows.length ?? 0) < 2 && <p className="mt-3 text-xs text-muted-foreground">{t("leaderboard.empty")}</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function PathHero({ path, zh, compact }: { path: LearningPath; zh: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const cur = path.levels[path.level - 1];
  const next = path.levels[path.level] ?? null;
  const step = path.next_step;
  const pct = next ? (next.progress.done / Math.max(next.progress.total, 1)) * 100 : 100;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-5 bg-gradient-to-br from-primary-soft/70 to-card p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div className="flex size-16 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
          <span className="text-[0.62rem] font-semibold uppercase tracking-wider opacity-80">Level</span>
          <span className="text-2xl font-bold leading-none">{path.level}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("path.currentLevel")}</p>
          <p className="text-xl font-semibold">{zh ? cur.title_zh : cur.title_en}</p>
          {path.level_override && path.level_override > path.earned_level && (
            <p className="text-xs text-muted-foreground">{t("path.parentSet", { n: path.level_override })}</p>
          )}
          {next && (
            <div className="mt-2 max-w-md">
              <p className="mb-1 text-xs text-muted-foreground">
                {t("path.levelN", { n: next.level })} · {zh ? next.title_zh : next.title_en} — {t("path.progress", next.progress)}
              </p>
              <Progress value={pct} label={t("path.progress", next.progress)} />
            </div>
          )}
          {!compact && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("path.allowedNow")}:</span>
              {path.allowed.learning.map((a) => <Badge key={a} variant="default">{t(`assets.${a}`)}</Badge>)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex gap-4 text-right">
            <div><p className="text-xl font-semibold tabular">{path.xp.week}</p><p className="text-xs text-muted-foreground">{t("path.xp")} · {t("path.xpWeek")}</p></div>
            <div><p className="text-xl font-semibold tabular">{path.xp.total}</p><p className="text-xs text-muted-foreground">{t("path.xpTotal")}</p></div>
          </div>
          {step ? (
            <Link to={reqLink(step)} className={buttonVariants({ size: compact ? "sm" : "md" })}>
              {t("path.nextStep")}: {zh ? step.title_zh : step.title_en} <ArrowRight />
            </Link>
          ) : <p className="max-w-xs text-sm text-muted-foreground">{t("path.allDone")}</p>}
        </div>
      </div>
      {!compact && <p className="border-t px-5 py-2.5 text-xs text-muted-foreground sm:px-6">{t("path.xpHint")}</p>}
    </Card>
  );
}

function LevelCard({ lv, current, zh }: { lv: PathLevel; current: number; zh: boolean }) {
  const { t } = useTranslation();
  const isCurrent = lv.level === current;
  const bonus = Number(lv.bonus);
  return (
    <li className="relative pl-12 sm:pl-14">
      <span className={cn("absolute left-0 top-4 flex size-11 items-center justify-center rounded-full border-2 bg-card text-sm font-bold sm:size-[3.2rem]",
        lv.unlocked ? "border-primary text-primary" : "border-border text-muted-foreground", isCurrent && "bg-primary text-primary-foreground")}>
        {lv.unlocked ? lv.level : <Lock className="size-4" aria-hidden />}
      </span>
      <Card className={cn(isCurrent && "border-primary/50 shadow-pop")}>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{t("path.levelN", { n: lv.level })} · {zh ? lv.title_zh : lv.title_en}</h3>
            {lv.unlocked
              ? <Badge variant="success"><LockOpen aria-hidden />{t("path.unlocked")}</Badge>
              : <Badge variant="muted"><Lock aria-hidden />{t("path.locked")}</Badge>}
            {bonus > 0 && <Badge variant="accent">{t("path.bonus", { amount: fmtMoney(bonus, { decimals: 0 }) })}</Badge>}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground/85">{zh ? lv.desc_zh : lv.desc_en}</p>
          {lv.requirements.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("path.requirements")} · {t("path.progress", lv.progress)}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {lv.requirements.map((r) => (
                  <li key={`${r.type}:${r.id}`}>
                    <Link to={reqLink(r)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-muted",
                      r.done && "border-success/30 bg-success-soft/40")}>
                      {r.done ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{zh ? r.title_zh : r.title_en}</span>
                      <Badge variant={r.type === "scenario" ? "accent" : "muted"}>{t(r.type === "scenario" ? "path.scenario" : "path.lesson")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}
