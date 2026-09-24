import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotebookPen, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";
import { useProfile } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert, Segmented } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { cn } from "@/lib/utils";

const REFLECT = ["reflect_learned", "reflect_surprised", "reflect_differently"] as const;

export default function Journal() {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const toast = useToast();
  useDocumentTitle(t("journal.title"));
  const list = useAsync(() => api.journal(profile.id), [profile.id]);
  const [filter, setFilter] = useState<string>("__all");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"free" | "guided">("guided");
  const [content, setContent] = useState("");
  const [symbol, setSymbol] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const symbols = useMemo(() => Array.from(new Set((list.data ?? []).map((j) => j.symbol).filter((s): s is string => !!s))).sort(), [list.data]);
  const shown = useMemo(() => (list.data ?? []).filter((j) => filter === "__all" || (filter === "__none" ? !j.symbol : j.symbol === filter)), [list.data, filter]);

  const qLabel = (k: string) =>
    i18n.exists(`trade.questions.${k}`) ? t(`trade.questions.${k}`) : i18n.exists(`journal.reflect.${k}`) ? t(`journal.reflect.${k}`) : k;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ans = kind === "guided" ? Object.fromEntries(REFLECT.filter((k) => answers[k]?.trim()).map((k) => [k, answers[k].trim()])) : {};
    if (!content.trim() && !Object.keys(ans).length) { setErr(t("journal.emptyError")); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.addJournal(profile.id, { content: content.trim(), symbol: symbol.trim().toUpperCase() || null, type: "free_note", answers: Object.keys(ans).length ? ans : null });
      toast.push("achievement", t("achievement.journal"));
      setOpen(false);
      setContent(""); setSymbol(""); setAnswers({});
      void list.reload();
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("journal.title")} subtitle={t("journal.subtitle")}
        actions={<Button onClick={() => setOpen(true)}><Plus /> {t("journal.newEntry")}</Button>} />

      {symbols.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("journal.filterAll")}>
          {["__all", ...symbols].map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
              className={cn("rounded-full border px-3 py-1 text-sm font-medium", filter === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {s === "__all" ? t("journal.filterAll") : s}
            </button>
          ))}
        </div>
      )}

      {list.loading && !list.data ? <LoadingRows rows={4} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !shown.length ? (
        <EmptyState icon={<NotebookPen />} title={t("journal.empty")} action={<Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus /> {t("journal.newEntry")}</Button>} />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-border pl-5 sm:pl-6">
          {shown.map((j) => <Entry key={j.id} j={j} qLabel={qLabel} />)}
        </ol>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={t("journal.newEntry")} size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="journal-form" loading={busy}>{t("journal.save")}</Button>
        </>}>
        <form id="journal-form" onSubmit={save} className="space-y-4">
          <Segmented value={kind} onChange={setKind} label={t("journal.newEntry")}
            options={[{ value: "guided", label: t("journal.guided") }, { value: "free", label: t("journal.freeNote") }]} />
          <Field label={t("journal.symbolLabel")} htmlFor="j-sym">
            <Input id="j-sym" value={symbol} maxLength={16} placeholder={t("journal.symbolPlaceholder")} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="max-w-[12rem]" />
          </Field>
          {kind === "guided" && REFLECT.map((k) => (
            <Field key={k} label={t(`journal.reflect.${k}`)} htmlFor={`j-${k}`}>
              <Textarea id={`j-${k}`} rows={2} value={answers[k] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
            </Field>
          ))}
          <Field label={t("journal.contentLabel")} htmlFor="j-content" optionalText={kind === "guided" ? t("common.optional") : undefined}>
            <Textarea id="j-content" rows={kind === "guided" ? 2 : 5} maxLength={10000} value={content} placeholder={t("journal.contentPlaceholder")} onChange={(e) => setContent(e.target.value)} />
          </Field>
          {err && <Alert variant="danger">{err}</Alert>}
        </form>
      </Dialog>
    </div>
  );
}

function Entry({ j, qLabel }: { j: JournalEntry; qLabel: (k: string) => string }) {
  const { t } = useTranslation();
  const answers = Object.entries(j.answers ?? {}).filter(([, v]) => v);
  return (
    <li className="relative">
      <span className={cn("absolute -left-[29px] top-5 size-3.5 rounded-full border-2 border-background sm:-left-[33px]",
        j.type === "pre_trade" ? "bg-primary" : j.type === "post_trade" ? "bg-accent" : "bg-muted-foreground/60")} aria-hidden />
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={j.type === "pre_trade" ? "default" : j.type === "post_trade" ? "accent" : "muted"}>{t(`journal.types.${j.type}`)}</Badge>
          {j.symbol && <Link to={`/stocks/${j.symbol}`} className="font-semibold hover:text-primary">{j.symbol}</Link>}
          <span className="text-muted-foreground">{fmtDate(j.created_at, true)}</span>
        </div>
        {j.trade && (
          <p className="mt-2 text-sm font-medium tabular">
            {t("journal.linkedTrade", { side: t(`portfolio.${j.trade.side}`), qty: fmtQty(j.trade.quantity), price: fmtMoney(j.trade.execution_price) })}
          </p>
        )}
        {!j.trade && j.context?.price && (
          <p className="mt-2 text-xs text-muted-foreground">{t("journal.priceAtTime", { price: fmtMoney(Number(j.context.price)) })}</p>
        )}
        {j.content && <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-7">{j.content}</p>}
        {answers.length > 0 && (
          <dl className="mt-3 space-y-2.5 rounded-xl bg-muted/50 p-3">
            {answers.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium text-muted-foreground">{qLabel(k)}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {j.research_id && (
          <Link to={`/research/${j.research_id}`} className="mt-3 inline-block text-xs text-primary hover:underline">{t("trade.linkedResearch")}</Link>
        )}
      </Card>
    </li>
  );
}
