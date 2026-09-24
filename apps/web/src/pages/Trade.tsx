import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, Clock, Info, Lightbulb, NotebookPen, ShieldCheck, Telescope } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtPct, fmtQty, fmtTime } from "@/lib/format";
import type { Side, Trade, TradePreview } from "@/lib/types";
import { useApp, useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { Change } from "@/components/Change";
import { Term } from "@/components/Term";
import { cn } from "@/lib/utils";

const QUESTIONS: Record<Side, string[]> = {
  BUY: ["buy_why_own", "buy_more_valuable", "buy_biggest_risk", "buy_change_mind"],
  SELL: ["sell_why", "sell_thesis_changed", "sell_right_reason", "sell_learned"],
};

type Stage = "form" | "confirm" | "done";

export default function TradePage() {
  const { symbol: raw = "" } = useParams();
  const symbol = raw.toUpperCase();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const profile = useProfile();
  const { setup, portfolio, refreshPortfolio } = useApp();
  const toast = useToast();
  useDocumentTitle(`${t("trade.title")} · ${symbol}`);

  const [side, setSide] = useState<Side>(params.get("side")?.toLowerCase() === "sell" ? "SELL" : "BUY");
  const [qty, setQty] = useState("");
  const [why, setWhy] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>("form");
  const [preview, setPreview] = useState<TradePreview | null>(null);
  const [result, setResult] = useState<Trade | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qtyErr, setQtyErr] = useState<string | null>(null);

  const quote = useAsync(() => api.quote(symbol), [symbol]);
  const research = useAsync(() => api.researchList(profile.id, { symbol, limit: 5 }), [profile.id, symbol]);
  useEffect(() => { void refreshPortfolio(); }, [refreshPortfolio]);

  const fractional = profile.allow_fractional && !!setup?.fractional_enabled;
  const held = portfolio?.positions.find((p) => p.ticker === symbol)?.quantity ?? 0;
  const qtyNum = Number(qty);
  const price = quote.data?.price ?? null;
  const est = price !== null && qtyNum > 0 ? price * qtyNum : null;
  const researchParam = params.get("research");
  const doneResearch = research.data?.filter((r) => r.status === "done") ?? [];
  const linkedResearch = useMemo(
    () => (researchParam ? doneResearch.find((r) => r.id === researchParam) ?? { id: researchParam, query: symbol } : doneResearch[0] ?? null),
    [researchParam, doneResearch, symbol],
  );

  const journalContent = why.trim();
  const journalAnswers = Object.fromEntries(
    QUESTIONS[side].filter((k) => answers[k]?.trim()).map((k) => [k, answers[k].trim()]),
  );

  const validateQty = (): boolean => {
    if (!(qtyNum > 0)) { setQtyErr(t("trade.qtyInvalid")); return false; }
    if (!fractional && !Number.isInteger(qtyNum)) { setQtyErr(t("trade.qtyWholeInvalid")); return false; }
    setQtyErr(null);
    return true;
  };

  const doPreview = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!validateQty()) return;
    setBusy(true);
    try {
      const p = await api.previewTrade(profile.id, { symbol, side, quantity: qtyNum });
      setPreview(p);
      setStage("confirm");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  const doExecute = async () => {
    setErr(null);
    setBusy(true);
    try {
      const tr = await api.executeTrade(profile.id, {
        symbol, side, quantity: qtyNum,
        journal_content: journalContent || null,
        journal_answers: Object.keys(journalAnswers).length ? journalAnswers : null,
        research_id: linkedResearch?.id ?? null,
      });
      setResult(tr);
      setStage("done");
      void refreshPortfolio();
      if (journalContent || Object.keys(journalAnswers).length) toast.push("achievement", t("achievement.journal"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to={`/stocks/${symbol}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {symbol}
    </Link>
  );

  // ------------------------------------------------------------------ success
  if (stage === "done" && result) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("trade.simulatedTrade")}</p>
          <h1 className="mt-1 text-xl font-semibold">{t("trade.successTitle")}</h1>
          <p className="mt-3 text-foreground/85">
            {t("trade.successText", {
              side: result.side === "BUY" ? t("trade.boughtVerb") : t("trade.soldVerb"),
              qty: fmtQty(result.quantity), symbol: result.symbol, price: fmtMoney(result.execution_price),
            })}
          </p>
          {(journalContent || Object.keys(journalAnswers).length > 0) && (
            <p className="mt-4 rounded-xl bg-primary-soft/60 p-3 text-sm text-foreground/85">{t("trade.journalSaved")}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("trade.noRealMoney")}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/portfolio" className={buttonVariants()}>{t("trade.viewPortfolio")}</Link>
            <Link to="/journal" className={buttonVariants({ variant: "outline" })}><NotebookPen /> {t("trade.viewJournal")}</Link>
            <Link to={`/stocks/${symbol}`} className={buttonVariants({ variant: "ghost" })}>{t("trade.anotherTrade", { symbol })}</Link>
          </div>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------ confirmation
  if (stage === "confirm" && preview) {
    return (
      <div className="mx-auto max-w-xl">
        {back}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-center gap-2 bg-accent-soft px-4 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-accent-foreground dark:text-accent">
            <ShieldCheck className="size-4" aria-hidden /> {t("trade.simulatedTrade")}
          </div>
          <div className="p-5 sm:p-6">
            <h1 className="text-lg font-semibold">{t("trade.confirmTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("trade.noRealMoney")}</p>
            {preview.market_closed_notice && (
              <Alert variant="warning" className="mt-4" icon={<Clock className="size-4 text-warning" aria-hidden />}>{t("trade.marketClosed")}</Alert>
            )}
            <dl className="mt-5 divide-y rounded-xl border text-sm">
              <ConfirmRow label={t("trade.order")} value={
                <span className="font-semibold">{t(side === "BUY" ? "trade.buy" : "trade.sell")} {fmtQty(preview.quantity)} {preview.symbol}</span>
              } />
              <ConfirmRow label={t("trade.price")} value={fmtMoney(preview.price)} />
              <ConfirmRow label={t("trade.priceTime")} value={fmtTime(preview.price_timestamp)} />
              <ConfirmRow label={t("trade.priceSource")} value={preview.price_source} />
              <ConfirmRow label={t("trade.estimatedAmount")} value={<span className="font-semibold">{fmtMoney(preview.estimated_value)}</span>} />
              {preview.fee > 0 && <ConfirmRow label={t("trade.fee")} value={fmtMoney(preview.fee)} />}
              <ConfirmRow label={t("trade.cashAfter")} value={fmtMoney(preview.cash_after)} />
              <ConfirmRow label={t("trade.positionAfter")} value={`${fmtQty(preview.position_after)} ${t("common.sharesUnit")}`} />
              <ConfirmRow label={t("trade.allocationAfter")} value={fmtPct(preview.allocation_after_pct, { decimals: 1 })} />
            </dl>
            {linkedResearch && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Telescope className="size-3.5" aria-hidden /> {t("trade.linkedResearch")}:{" "}
                <Link to={`/research/${linkedResearch.id}`} className="truncate text-primary hover:underline">{linkedResearch.query}</Link>
              </p>
            )}
            {err && <Alert variant="danger" className="mt-4">{err}</Alert>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => { setStage("form"); setErr(null); }} disabled={busy}>{t("trade.edit")}</Button>
              <Button onClick={() => void doExecute()} loading={busy}>{busy ? t("trade.confirming") : t("trade.confirm")}</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------ ticket
  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("trade.title")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{quote.data?.name ?? symbol} <span className="text-muted-foreground">· {symbol}</span></h1>
        </div>
        {quote.data && <div className="text-right"><p className="text-xl font-semibold tabular">{fmtMoney(quote.data.price)}</p><Change value={quote.data.change} pct={quote.data.change_pct} /></div>}
      </div>

      {!research.loading && doneResearch.length === 0 && !researchParam && (
        <Alert variant="info" className="mb-5" icon={<Lightbulb className="size-4 text-accent" aria-hidden />}
          action={<Link to={`/research?q=${encodeURIComponent(symbol)}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>{t("trade.nudgeCta", { symbol })}</Link>}>
          {t("trade.nudge", { symbol })}
        </Alert>
      )}

      {quote.error && <Alert variant="danger" className="mb-5">{quote.error.code === "MARKET_DATA_UNAVAILABLE" ? t("trade.unknownSymbol", { symbol }) : errorText(t, quote.error)}</Alert>}

      <form onSubmit={doPreview} className="grid gap-5 lg:grid-cols-5" noValidate>
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader><CardTitle>{t("trade.ticketTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("trade.side")}</p>
              <Segmented label={t("trade.side")} value={side} onChange={(v) => { setSide(v); setErr(null); }} className="w-full"
                options={[{ value: "BUY", label: t("trade.buy") }, { value: "SELL", label: t("trade.sell") }]} />
            </div>
            <Field label={t("trade.quantity")} htmlFor="qty" hint={fractional ? t("trade.qtyFractional") : t("trade.qtyWhole")} error={qtyErr}>
              <Input id="qty" inputMode={fractional ? "decimal" : "numeric"} value={qty} autoComplete="off"
                onChange={(e) => setQty(e.target.value.replace(fractional ? /[^\d.]/g : /\D/g, ""))} aria-invalid={!!qtyErr}
                className="text-lg font-semibold tabular" placeholder="0" />
            </Field>
            <dl className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              <Mini label={t("trade.currentPrice")} value={quote.loading ? <Skeleton className="h-4 w-16" /> : fmtMoney(price)} />
              <Mini label={t("trade.estimatedValue")} value={<span className="font-semibold">{fmtMoney(est)}</span>} />
              <Mini label={t("trade.availableCash")} value={portfolio ? fmtMoney(portfolio.cash) : "—"} />
              <Mini label={t("trade.sharesHeld")} value={fmtQty(held)} />
            </dl>
            {side === "SELL" && held === 0 && portfolio && <p className="text-xs text-warning">{t("trade.notOwned", { symbol })}</p>}
            <p className="flex gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span><Term id="market_order" icon={false} /> · {t("trade.noRealMoney")}</span></p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><NotebookPen className="size-4 text-primary" aria-hidden />{t("trade.whyLabel")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label htmlFor="why" className="sr-only">{t("trade.whyLabel")}</label>
            <Textarea id="why" rows={3} maxLength={5000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("trade.whyPlaceholder")} />
            <div>
              <p className="text-sm font-medium">{t("trade.guidedTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("trade.guidedHint")}</p>
            </div>
            {QUESTIONS[side].map((k) => (
              <Field key={k} label={t(`trade.questions.${k}`)} htmlFor={`q-${k}`}>
                <Textarea id={`q-${k}`} rows={2} maxLength={1000} value={answers[k] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
              </Field>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-5">
          {err && <Alert variant="danger" className="mb-3">{err}</Alert>}
          <div className={cn("flex justify-end")}>
            <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto">
              {busy ? t("trade.previewing") : t("trade.preview")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
