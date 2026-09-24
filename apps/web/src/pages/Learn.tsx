import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, GraduationCap, Lightbulb, MessagesSquare, Search } from "lucide-react";
import { api, loadGlossary } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import type { LearningCard } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Skeleton, Tabs } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, PageHeader } from "@/components/States";
import { Term } from "@/components/Term";
import { cn } from "@/lib/utils";

export default function Learn() {
  const { t } = useTranslation();
  const profile = useProfile();
  const { language } = useApp();
  const toast = useToast();
  const zh = language === "zh-CN";
  useDocumentTitle(t("learn.title"));
  const [tab, setTab] = useState<"cards" | "glossary">("cards");
  const [openCard, setOpenCard] = useState<LearningCard | null>(null);
  const [marking, setMarking] = useState(false);
  const [q, setQ] = useState("");
  const cards = useAsync(() => api.cards(), []);
  const progress = useAsync(() => api.learnProgress(profile.id), [profile.id]);
  const glossary = useAsync(async () => Array.from((await loadGlossary()).values()), [], { enabled: tab === "glossary" });

  const done = useMemo(() => new Set((progress.data ?? []).map((p) => p.card_id)), [progress.data]);
  const total = cards.data?.length ?? 0;
  const pct = total ? (done.size / total) * 100 : 0;

  const markLearned = async (c: LearningCard) => {
    setMarking(true);
    try {
      await api.completeCard(profile.id, c.id);
      progress.setData((p) => [...(p ?? []), { card_id: c.id, completed_at: new Date().toISOString() }]);
      toast.push("achievement", t("achievement.card"));
    } catch (e) {
      toast.push("error", errorText(t, e));
    } finally {
      setMarking(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (glossary.data ?? []).filter((g) => !s || [g.term_en, g.term_zh, g.en, g.zh].some((x) => x.toLowerCase().includes(s)));
  }, [glossary.data, q]);

  return (
    <div>
      <PageHeader title={t("learn.title")} subtitle={t("learn.subtitle")} />
      {total > 0 && (
        <Card className="mb-5 flex items-center gap-4 p-4">
          <GraduationCap className="size-6 shrink-0 text-primary" aria-hidden />
          <div className="flex-1">
            <p className="mb-1.5 text-sm font-medium">{t("learn.progress", { done: done.size, total })}</p>
            <Progress value={pct} label={t("learn.progress", { done: done.size, total })} />
          </div>
        </Card>
      )}
      <Tabs value={tab} onChange={setTab} className="mb-5" tabs={[{ value: "cards", label: t("learn.cards") }, { value: "glossary", label: t("learn.glossary") }]} />

      {tab === "cards" ? (
        cards.loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
          : cards.error ? <ErrorState error={cards.error} onRetry={cards.reload} /> : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.data?.map((c) => {
                const learned = done.has(c.id);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpenCard(c)}
                      className={cn("flex h-full w-full flex-col rounded-xl border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop",
                        learned && "border-success/40")}>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={c.level === 1 ? "default" : c.level === 2 ? "accent" : "warning"}>{t("learn.level", { n: c.level })}</Badge>
                        {learned && <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-4" aria-hidden />{t("learn.learned")}</span>}
                      </div>
                      <h3 className="mt-3 font-semibold leading-snug">{zh ? c.title_zh : c.title_en}</h3>
                      <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{zh ? c.body_zh : c.body_en}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
      ) : (
        <div>
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("learn.glossarySearch")} aria-label={t("learn.glossarySearch")}
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          {glossary.loading ? <Skeleton className="h-64" /> : glossary.error ? <ErrorState error={glossary.error} onRetry={glossary.reload} /> : !filtered.length ? (
            <EmptyState title={t("common.noResults")} />
          ) : (
            <dl className="grid gap-3 md:grid-cols-2">
              {filtered.map((g) => (
                <Card key={g.id} className="p-4">
                  <dt className="font-semibold"><Term id={g.id}>{zh ? g.term_zh : g.term_en}</Term></dt>
                  {zh && <p className="text-xs text-muted-foreground">{g.term_en}</p>}
                  <dd className="mt-1.5 text-sm leading-6 text-foreground/85">{zh ? g.zh : g.en}</dd>
                </Card>
              ))}
            </dl>
          )}
        </div>
      )}

      <Dialog open={!!openCard} onClose={() => setOpenCard(null)} size="lg"
        title={openCard ? (zh ? openCard.title_zh : openCard.title_en) : ""}
        footer={openCard && <>
          <Link to={`/masters/buffett?q=${encodeURIComponent(t("learn.askAbout", { title: zh ? openCard.title_zh : openCard.title_en }))}`}
            className={buttonVariants({ variant: "outline" })}><MessagesSquare /> {t("learn.askMaster")}</Link>
          {done.has(openCard.id) ? (
            <Button variant="secondary" disabled><CheckCircle2 /> {t("learn.learned")}</Button>
          ) : (
            <Button onClick={() => void markLearned(openCard)} loading={marking}>{!marking && <CheckCircle2 />} {t("learn.markLearned")}</Button>
          )}
        </>}>
        {openCard && (
          <div className="space-y-4">
            <Badge variant={openCard.level === 1 ? "default" : openCard.level === 2 ? "accent" : "warning"}>{t("learn.level", { n: openCard.level })}</Badge>
            <p className="leading-7">{zh ? openCard.body_zh : openCard.body_en}</p>
            <div className="rounded-xl bg-primary-soft/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("learn.example")}</p>
              <p className="mt-1 text-sm leading-6">{zh ? openCard.example_zh : openCard.example_en}</p>
            </div>
            <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-4">
              <Lightbulb className="size-5 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("learn.reflect")}</p>
                <p className="mt-1 text-sm font-medium leading-6">{zh ? openCard.question_zh : openCard.question_en}</p>
              </div>
            </div>
            {openCard.terms.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("learn.relatedTerms")}</p>
                <div className="flex flex-wrap gap-2">
                  {openCard.terms.map((id) => (
                    <span key={id} className="rounded-full border px-3 py-1 text-sm"><Term id={id} /></span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
