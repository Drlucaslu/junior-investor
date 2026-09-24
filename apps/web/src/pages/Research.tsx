import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, Search, Star, Telescope, Zap, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { startResearch } from "@/lib/researchStore";
import { errorText } from "@/lib/errorText";
import { fmtRelative } from "@/lib/format";
import type { ResearchSummary } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Tabs } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { cn } from "@/lib/utils";

export default function Research() {
  const { t } = useTranslation();
  const profile = useProfile();
  const { language } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useDocumentTitle(t("research.title"));
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "fav">("all");

  const history = useAsync(() => api.researchList(profile.id, { favorites: tab === "fav", limit: 50 }), [profile.id, tab]);

  const submit = async (e?: FormEvent, q = query) => {
    e?.preventDefault();
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await startResearch({ profile_id: profile.id, query: text, mode, language });
      navigate(`/research/${id}`);
    } catch (e2) {
      setErr(errorText(t, e2));
      setBusy(false);
    }
  };

  const toggleFav = async (r: ResearchSummary) => {
    history.setData((rows) => (rows ?? []).map((x) => (x.id === r.id ? { ...x, favorite: !r.favorite } : x)));
    try {
      await api.patchResearch(r.id, !r.favorite);
      if (tab === "fav") void history.reload();
    } catch {
      history.setData((rows) => (rows ?? []).map((x) => (x.id === r.id ? { ...x, favorite: r.favorite } : x)));
    }
  };

  const examples = ["AAPL", t("research.exampleNvidia"), t("research.exampleCompare"), t("research.exampleKo")];

  return (
    <div>
      <PageHeader title={t("research.title")} subtitle={t("research.subtitle")} />

      <Card className="p-4 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="research-q" className="text-sm font-medium">{t("research.inputLabel")}</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="research-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={500}
                placeholder={t("research.placeholder")}
                className="h-12 w-full rounded-xl border border-input bg-card pl-11 pr-3 text-base placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" size="lg" loading={busy} disabled={!query.trim()}>
              {!busy && <Telescope />} {busy ? t("research.starting") : t("research.start")}
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label={t("research.title")} className="grid grid-cols-2 gap-2 sm:flex">
              {([
                ["quick", Zap, t("research.quick"), t("research.quickHint")],
                ["deep", Layers, t("research.deep"), t("research.deepHint")],
              ] as const).map(([m, Icon, label, hint]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-colors",
                    mode === m ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", mode === m ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" aria-hidden />{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("research.examples")}:</span>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={busy}
                onClick={() => { setQuery(ex); void submit(undefined, ex); }}
                className="rounded-full border bg-card px-3 py-1 text-sm hover:border-primary/40 hover:bg-primary-soft disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
          {err && <Alert variant="danger">{err}</Alert>}
        </form>
      </Card>

      <section className="mt-8" aria-labelledby="hist-h">
        <h2 id="hist-h" className="sr-only">{t("research.history")}</h2>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[{ value: "all", label: t("research.history") }, { value: "fav", label: <span className="inline-flex items-center gap-1"><Star className="size-3.5" aria-hidden />{t("research.favorites")}</span> }]}
        />
        <div className="mt-4">
          {history.loading ? <LoadingRows rows={4} /> : history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : !history.data?.length ? (
            <EmptyState icon={tab === "fav" ? <Star /> : <Telescope />} title={tab === "fav" ? t("research.favoritesEmpty") : t("research.historyEmpty")} />
          ) : (
            <ul className="grid gap-2">
              {history.data.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-xl border bg-card pr-2 shadow-card">
                  <Link to={`/research/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-4 py-3 hover:bg-muted/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.query}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmtRelative(r.created_at)}</span>
                        {r.symbol && <Badge variant="muted">{r.symbol}</Badge>}
                        <Badge variant="outline">{t(`research.mode.${r.mode}`)}</Badge>
                      </span>
                    </span>
                    {r.status !== "done" && (
                      <Badge variant={r.status === "failed" ? "danger" : "warning"}>{t(`research.status.${r.status}`)}</Badge>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggleFav(r)}
                    aria-pressed={r.favorite}
                    aria-label={r.favorite ? t("report.unfavorite") : t("report.favorite")}
                    className="rounded-lg p-2 hover:bg-muted"
                  >
                    <Star className={cn("size-5", r.favorite ? "fill-accent text-accent" : "text-muted-foreground")} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
