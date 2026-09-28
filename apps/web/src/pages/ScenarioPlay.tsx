import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, CalendarClock, Eye, Lightbulb, MessagesSquare, Newspaper, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { ScenarioState } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Alert, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/States";
import { Change } from "@/components/Change";
import { SERIES, useChartColors } from "@/components/charts";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

export function fmtMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "short" }).format(new Date(Date.UTC(y, mo - 1, 15)));
}

const MIN_REASON = 10;

export default function ScenarioPlay() {
  const { scenarioId = "" } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const profile = useProfile();
  const { language, refreshPath } = useApp();
  const zh = language === "zh-CN";
  const toast = useToast();
  const [st, setSt] = useState<ScenarioState | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runParam = params.get("run");

  const load = async () => {
    setLoadErr(null);
    try {
      const s = runParam ? await api.scenarioRun(runParam) : await api.startScenario(profile.id, scenarioId);
      setSt(s);
    } catch (e) {
      setLoadErr(e);
    }
  };
  useEffect(() => { void load(); }, [scenarioId, runParam, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill sliders with the current holdings (or all cash at the start).
  useEffect(() => {
    if (!st || st.run.status === "done") return;
    const keys = [...st.companies.map((c) => c.key), "CASH"];
    const w = st.run.step === 0 ? { CASH: 100 } : st.now.weights;
    const out: Record<string, number> = {};
    keys.forEach((k) => { out[k] = Math.round(w[k] ?? 0); });
    const diff = 100 - Object.values(out).reduce((a, b) => a + b, 0);
    out.CASH = Math.max(0, (out.CASH ?? 0) + diff);
    setAlloc(out);
    setReason("");
    setErr(null);
  }, [st?.run.id, st?.run.step, st?.run.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = st ? (zh ? st.scenario.title_zh : st.scenario.title_en) : t("scenarios.title");
  useDocumentTitle(title);

  const total = Object.values(alloc).reduce((a, b) => a + b, 0);

  const submit = async () => {
    if (!st) return;
    if (Math.abs(total - 100) > 0.5) { setErr(t("errors.ALLOCATION_NOT_100")); return; }
    if (reason.trim().length < MIN_REASON) { setErr(t("scenarios.reasonNeeded")); return; }
    setBusy(true);
    setErr(null);
    try {
      const clean = Object.fromEntries(Object.entries(alloc).filter(([, v]) => v > 0));
      const next = await api.decideScenario(st.run.id, clean, reason.trim());
      setSt(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (next.run.status === "done") {
        toast.push("achievement", t("achievement.scenario"));
        if (next.level_up) toast.push("achievement", t("achievement.levelUp"));
        void refreshPath();
      }
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to="/scenarios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {t("scenarios.title")}
    </Link>
  );

  if (loadErr) return <div>{back}<ErrorState error={loadErr} onRetry={() => void load()} /></div>;
  if (!st) return <div className="space-y-4">{back}<Skeleton className="h-40" /><Skeleton className="h-80" /></div>;

  const done = st.run.status === "done";
  const nextDate = st.scenario.dates[Math.min(st.run.step + 1, st.scenario.dates.length - 1)];
  const lastDecision = st.run.step + 1 >= st.scenario.decisions_total;

  return (
    <div className="space-y-6">
      {back}
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden /> {t("scenarios.today", { date: fmtMonth(st.now.month) })}
          {!done && <span>· {t("scenarios.step", { n: st.run.step + 1, total: st.scenario.decisions_total })}</span>}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground">{zh ? st.scenario.tagline_zh : st.scenario.tagline_en}</p>
      </div>

      {done ? <Reveal st={st} zh={zh} onReplay={async () => { const s = await api.startScenario(profile.id, scenarioId); setSt(s); }} /> : (
        <>
          {st.run.step === 0 ? (
            <Card className="p-5 sm:p-6">
              <p className="leading-7">{zh ? st.scenario.intro_zh : st.scenario.intro_en}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("scenarios.startValue", { amount: fmtMoney(st.scenario.start_value, { decimals: 0 }) })}</p>
            </Card>
          ) : (
            <>
              <Alert variant="info" icon={<Newspaper className="size-4 text-primary" aria-hidden />} title={t("scenarios.news")}>
                {zh ? st.now.event_zh : st.now.event_en}
              </Alert>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <p className="text-xs font-medium text-muted-foreground">{t("scenarios.yourValue")}</p>
                  <p className="mt-1 text-2xl font-semibold tabular">{fmtMoney(st.now.value, { decimals: 0 })}</p>
                  <Change value={st.now.value - st.scenario.start_value} pct={(st.now.value / st.scenario.start_value - 1) * 100} size="sm" />
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("scenarios.sinceStart")}</p>
                  {st.history.length > 1 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">{t("scenarios.news")} ({st.history.length})</summary>
                      <ul className="mt-2 space-y-2">
                        {st.history.slice(0, -1).map((h) => (
                          <li key={h.month}><span className="font-medium">{fmtMonth(h.month)}:</span> {zh ? h.event_zh : h.event_en}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t("scenarios.chart")}</CardTitle></CardHeader>
                  <CardContent><IndexChart st={st} /></CardContent>
                </Card>
              </div>
            </>
          )}

          <ul className={cn("grid gap-3", st.companies.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
            {st.companies.map((c, i) => (
              <li key={c.key}>
                <Card className="h-full p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="size-2.5 rounded-full" style={{ background: `var(${SERIES[i]})` }} aria-hidden />
                      {t("scenarios.company", { key: c.key })}
                    </span>
                    {st.run.step > 0 && <Badge variant={c.price_index >= 100 ? "gain" : "loss"}>{c.price_index.toFixed(0)}</Badge>}
                  </div>
                  <p className="mt-2 text-sm leading-6">{zh ? c.desc_zh : c.desc_en}</p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-5 text-muted-foreground">
                    {(zh ? c.facts_zh : c.facts_en).map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>

          <Card>
            <CardHeader>
              <CardTitle>{t("scenarios.allocate")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("scenarios.allocateHint")} {t("scenarios.cashNote")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[...st.companies.map((c) => c.key), "CASH"].map((k, i) => {
                  const gone = k !== "CASH" && st.run.step > 0 && (st.companies.find((c) => c.key === k)?.price_index ?? 1) <= 0;
                  return (
                  <div key={k} className={cn("rounded-xl border p-3", gone && "opacity-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`alloc-${k}`} className="flex items-center gap-2 text-sm font-medium">
                        <span className="size-2.5 rounded-full" style={{ background: k === "CASH" ? "var(--series-other)" : `var(${SERIES[i]})` }} aria-hidden />
                        {k === "CASH" ? t("scenarios.cash") : t("scenarios.company", { key: k })}
                        {gone && <Badge variant="danger">{t("scenarios.delisted")}</Badge>}
                      </label>
                      <span className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={alloc[k] ?? 0} aria-label={`${k} %`} disabled={gone}
                          onChange={(e) => setAlloc((a) => ({ ...a, [k]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) }))}
                          className="h-8 w-16 rounded-md border border-input bg-card px-2 text-right text-sm tabular" />
                        <span className="text-sm text-muted-foreground">%</span>
                      </span>
                    </div>
                    <input id={`alloc-${k}`} type="range" min={0} max={100} step={5} value={alloc[k] ?? 0} disabled={gone}
                      onChange={(e) => setAlloc((a) => ({ ...a, [k]: Number(e.target.value) }))} className="mt-2 w-full accent-[hsl(var(--primary))]" />
                  </div>
                  );
                })}
              </div>
              <p className={cn("text-sm font-medium tabular", Math.abs(total - 100) <= 0.5 ? "text-success" : "text-warning")} aria-live="polite">
                {t("scenarios.total")}: {total}%{total < 100 ? ` · ${t("scenarios.remaining", { pct: `${100 - total}%` })}` : total > 100 ? ` · ${t("scenarios.over", { pct: `${total - 100}%` })}` : ""}
              </p>
              <div>
                <label htmlFor="reason" className="text-sm font-medium">{t("scenarios.reason")}</label>
                <Textarea id="reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("scenarios.reasonPlaceholder")} className="mt-1.5" />
              </div>
              {err && <Alert variant="danger">{err}</Alert>}
              <div className="flex justify-end">
                <Button size="lg" onClick={() => void submit()} loading={busy} disabled={Math.abs(total - 100) > 0.5 || reason.trim().length < MIN_REASON}>
                  {lastDecision ? t("scenarios.finish", { date: fmtMonth(nextDate) }) : t("scenarios.lockIn", { date: fmtMonth(nextDate) })}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function IndexChart({ st, showNames }: { st: ScenarioState; showNames?: boolean }) {
  const { t } = useTranslation();
  const c = useChartColors();
  const keys = st.companies.map((x) => x.key);
  const data = st.chart.months.map((m, i) => {
    const row: Record<string, number | string> = { m };
    for (const k of [...keys, "MARKET"]) row[k] = st.chart.series[k][i];
    return row;
  });
  const label = (k: string) => {
    if (k === "MARKET") return t("scenarios.market");
    const co = st.companies.find((x) => x.key === k);
    return showNames && co?.name ? `${k}: ${co.name}` : t("scenarios.company", { key: k });
  };
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey="m" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} width={44}
            tickFormatter={(v: number) => String(Math.round(v))} />
          <Tooltip contentStyle={{ background: c["--card"], border: `1px solid ${c["--border"]}`, borderRadius: 10, fontSize: 12, color: c["--foreground"] }}
            labelFormatter={(v) => fmtMonth(String(v))} formatter={(v, name) => [Number(v).toFixed(0), label(String(name))]} />
          <Legend formatter={(v) => label(String(v))} wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={c[SERIES[i]]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
          <Line type="monotone" dataKey="MARKET" stroke={c["--muted-foreground"]} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ValueChart({ st }: { st: ScenarioState }) {
  const { t } = useTranslation();
  const c = useChartColors();
  const r = st.result!;
  const mk = st.chart.series.MARKET;
  const data = st.chart.months.map((m, i) => ({ m, you: r.path.find((p) => p.month === m)?.value ?? null, market: (mk[i] / 100) * st.scenario.start_value }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c["--chart-grid"]} vertical={false} />
          <XAxis dataKey="m" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tick={{ fontSize: 11, fill: c["--muted-foreground"] }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => fmtMoney(v, { decimals: 0 })} />
          <Tooltip contentStyle={{ background: c["--card"], border: `1px solid ${c["--border"]}`, borderRadius: 10, fontSize: 12, color: c["--foreground"] }}
            labelFormatter={(v) => fmtMonth(String(v))} formatter={(v, name) => [fmtMoney(Number(v), { decimals: 0 }), name === "you" ? t("scenarios.yourResult") : t("scenarios.market")]} />
          <Legend formatter={(v) => (v === "you" ? t("scenarios.yourResult") : t("scenarios.market"))} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="you" stroke={c["--series-1"]} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="market" stroke={c["--muted-foreground"]} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Reveal({ st, zh, onReplay }: { st: ScenarioState; zh: boolean; onReplay: () => void }) {
  const { t } = useTranslation();
  const r = st.result!;
  const title = zh ? st.scenario.title_zh : st.scenario.title_en;
  const prompt = t("scenarios.discussPrompt", { title, ret: fmtPct(r.return_pct, { sign: true, decimals: 0 }), mkt: fmtPct(r.benchmark_return_pct, { sign: true, decimals: 0 }) });
  const names = useMemo(() => Object.fromEntries(st.companies.map((c) => [c.key, c.name ?? c.key])), [st.companies]);
  const lev = r.leverage;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-primary/40 bg-primary-soft/50 p-5">
          <p className="text-xs font-medium text-muted-foreground">{t("scenarios.yourResult")}</p>
          <p className="mt-1 text-2xl font-semibold tabular">{fmtMoney(r.final_value, { decimals: 0 })}</p>
          <Change value={r.final_value - st.scenario.start_value} pct={r.return_pct} size="sm" />
          {r.annualized_pct != null && <p className="mt-0.5 text-xs text-muted-foreground">{fmtPct(r.annualized_pct, { sign: true })} {t("scenarios.annualized")}</p>}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">{t("scenarios.vsMarket")}</p>
          <p className="mt-1 text-2xl font-semibold tabular">{fmtMoney(r.benchmark_value, { decimals: 0 })}</p>
          <Change value={r.benchmark_value - st.scenario.start_value} pct={r.benchmark_return_pct} size="sm" />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">{t("scenarios.equalSplit")}</p>
          <p className="mt-1 text-2xl font-semibold tabular">{fmtMoney(r.equal_weight_value, { decimals: 0 })}</p>
          <Change value={r.equal_weight_value - st.scenario.start_value} pct={r.equal_weight_return_pct} size="sm" />
        </Card>
      </div>
      {r.xp_awarded > 0 && (
        <Alert variant="success" icon={<Sparkles className="size-4 text-accent" aria-hidden />}>{t("scenarios.xpEarned", { n: r.xp_awarded })}</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("scenarios.yourResult")} · {t("scenarios.maxDrawdown")} {fmtPct(r.max_drawdown_pct, { decimals: 0 })}</CardTitle></CardHeader>
          <CardContent><ValueChart st={st} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("scenarios.chart")}</CardTitle></CardHeader>
          <CardContent><IndexChart st={st} showNames /></CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Eye className="size-5 text-primary" aria-hidden />{t("scenarios.reveal")}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {st.companies.map((c, i) => (
            <li key={c.key}>
              <Card className="h-full p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">
                    <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: `var(${SERIES[i]})` }} aria-hidden />
                    {t("scenarios.company", { key: c.key })} = {c.name}
                  </p>
                  <Badge variant={r.company_returns_pct[c.key] >= 0 ? "gain" : "loss"}>{fmtPct(r.company_returns_pct[c.key], { sign: true, decimals: 0 })}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/85">{zh ? c.story_zh : c.story_en}</p>
                {c.approx && <p className="mt-1 text-xs text-warning">{t("scenarios.approx")}</p>}
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("scenarios.bestChoice", { key: names[r.best_company] })}</p>
      </section>

      {lev.wiped_out && (
        <Alert variant="warning" icon={<TriangleAlert className="size-4 text-warning" aria-hidden />} title={t("scenarios.leverageTitle")}>
          {t("scenarios.leverageText", { dd: fmtPct(lev.market_max_drawdown_pct, { decimals: 0 }), lev: fmtPct(lev.with_2x_leverage_pct, { decimals: 0 }),
            wiped: lev.with_2x_leverage_pct <= -100 ? t("scenarios.wipedOut") : t("scenarios.notWipedOut") })}
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>{t("scenarios.yourDecisions")}</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {st.run.decisions.map((d) => (
              <li key={d.step} className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground">{fmtMonth(d.month)}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(d.allocations).map(([k, v]) => (
                    <Badge key={k} variant="muted">{k === "CASH" ? t("scenarios.cash") : names[k]} {v}%</Badge>
                  ))}
                </p>
                <p className="mt-1.5 text-sm italic text-foreground/85">“{d.reason}”</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-accent" aria-hidden />{t("scenarios.lessons")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{(zh ? st.lessons_zh : st.lessons_en)?.map((l) => <li key={l}>{l}</li>)}</ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("scenarios.discuss")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6">{(zh ? st.questions_zh : st.questions_en)?.map((q) => <li key={q}>{q}</li>)}</ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to={`/masters/buffett?q=${encodeURIComponent(prompt)}`} className={buttonVariants()}><MessagesSquare /> {t("scenarios.askMaster")}</Link>
              <Button variant="outline" onClick={onReplay}><RotateCcw /> {t("scenarios.playAgain")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
