/** Simplified options: covered call (sell) or protective put (buy) on shares already owned. */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { AccountKind, OptionChain, OptionPreview, OptionStrategy, Position } from "@/lib/types";
import { useProfile } from "@/context/AppContext";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/input";
import { Alert, Segmented, Skeleton } from "./ui/misc";
import { useToast } from "./ui/toast";
import { Term } from "./Term";
import { cn } from "@/lib/utils";

export function OptionsDialog({ open, onClose, account, positions, onDone, initialSymbol }: {
  open: boolean; onClose: () => void; account: AccountKind; positions: Position[]; onDone: () => void; initialSymbol?: string;
}) {
  const { t } = useTranslation();
  const profile = useProfile();
  const toast = useToast();
  const eligible = useMemo(() => positions.filter((p) => p.quantity >= 100), [positions]);
  const [symbol, setSymbol] = useState("");
  const [strategy, setStrategy] = useState<OptionStrategy>("covered_call");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [expiry, setExpiry] = useState("");
  const [strike, setStrike] = useState<number | null>(null);
  const [contracts, setContracts] = useState("1");
  const [why, setWhy] = useState("");
  const [preview, setPreview] = useState<OptionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSymbol(initialSymbol && eligible.some((p) => p.ticker === initialSymbol) ? initialSymbol : eligible[0]?.ticker ?? "");
    setPreview(null);
    setErr(null);
    setWhy("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !symbol) return;
    setChain(null);
    setPreview(null);
    setErr(null);
    api.optionChain(profile.id, account, symbol, strategy).then((c) => {
      setChain(c);
      setExpiry(c.expirations[0]?.expiry ?? "");
      const rows = c.expirations[0]?.strikes ?? [];
      setStrike(rows.length ? rows[strategy === "covered_call" ? Math.min(1, rows.length - 1) : Math.max(0, rows.length - 2)].strike : null);
      setContracts(String(Math.max(1, Math.min(1, c.max_contracts))));
    }).catch((e) => setErr(errorText(t, e)));
  }, [open, symbol, strategy, account, profile.id, t]);

  const exp = chain?.expirations.find((e) => e.expiry === expiry);
  const n = Number(contracts);
  const body = { account, symbol, strategy, strike: strike ?? 0, expiry, contracts: n, journal_content: why.trim() || null };

  const doPreview = async () => {
    setBusy(true);
    setErr(null);
    try {
      setPreview(await api.previewOption(profile.id, body));
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const doOpen = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.openOption(profile.id, body);
      toast.push("success", t("options.opened"));
      onDone();
      onClose();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const footer = eligible.length === 0 ? <Button variant="outline" onClick={onClose}>{t("common.close")}</Button> : preview ? (
    <>
      <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>{t("trade.edit")}</Button>
      <Button onClick={() => void doOpen()} loading={busy}><ShieldCheck /> {t("options.confirm")}</Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
      <Button onClick={() => void doPreview()} loading={busy} disabled={!chain || !strike || !(n >= 1) || n > (chain?.max_contracts ?? 0)}>{t("options.preview")}</Button>
    </>
  );

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={t("options.title")} description={t("options.subtitle")} footer={footer}>
      {eligible.length === 0 ? <Alert variant="info">{t("options.noShares")}</Alert> : preview ? (
        <PreviewView p={preview} />
      ) : (
        <div className="space-y-4">
          <Segmented label={t("options.title")} value={strategy} onChange={setStrategy} className="w-full"
            options={[{ value: "covered_call", label: t("options.covered_call") }, { value: "protective_put", label: t("options.protective_put") }]} />
          <p className="text-sm leading-6 text-foreground/85">
            {strategy === "covered_call" ? t("options.coveredCallDesc") : t("options.protectivePutDesc")}{" "}
            <Term id={strategy} icon />
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("options.symbol")} htmlFor="opt-sym">
              <Select id="opt-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {eligible.map((p) => <option key={p.ticker} value={p.ticker}>{p.ticker} · {p.quantity}</option>)}
              </Select>
            </Field>
            <Field label={t("options.expiry")} htmlFor="opt-exp">
              <Select id="opt-exp" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!chain}>
                {chain?.expirations.map((e) => <option key={e.expiry} value={e.expiry}>{e.expiry} ({t("options.days", { n: e.days })})</option>)}
              </Select>
            </Field>
          </div>
          {!chain ? <Skeleton className="h-40" /> : (
            <>
              <p className="text-xs text-muted-foreground">
                {chain.symbol} {fmtMoney(chain.price)} · {t("options.maxContracts", { n: chain.max_contracts })}
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm tabular">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium"><Term id="strike" icon={false} /></th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t("options.premium")}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t("options.delta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exp?.strikes.map((r) => (
                      <tr key={r.strike} onClick={() => setStrike(r.strike)} className={cn("cursor-pointer border-t hover:bg-muted/40", strike === r.strike && "bg-primary-soft")}>
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-2">
                            <input type="radio" name="strike" checked={strike === r.strike} onChange={() => setStrike(r.strike)} className="accent-[hsl(var(--primary))]" />
                            {fmtMoney(r.strike)}
                          </label>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoney(strategy === "covered_call" ? r.bid : r.ask)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{r.delta.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label={t("options.contracts")} htmlFor="opt-n" hint={t("options.maxContracts", { n: chain.max_contracts })}>
                <Input id="opt-n" inputMode="numeric" value={contracts} onChange={(e) => setContracts(e.target.value.replace(/\D/g, ""))} className="w-28 tabular" />
              </Field>
              <p className="text-xs text-muted-foreground">{t("options.model", { vol: fmtPct(chain.volatility * 100, { decimals: 0 }) })}</p>
            </>
          )}
          <Field label={t("options.reason")} htmlFor="opt-why">
            <Textarea id="opt-why" rows={2} maxLength={2000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("trade.whyPlaceholder")} />
          </Field>
          {err && <Alert variant="danger">{err}</Alert>}
        </div>
      )}
      {preview && err && <Alert variant="danger" className="mt-3">{err}</Alert>}
    </Dialog>
  );
}

function PreviewView({ p }: { p: OptionPreview }) {
  const { t } = useTranslation();
  const call = p.right === "CALL";
  const strike = fmtMoney(p.strike);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-bold uppercase tracking-[0.2em] text-accent-foreground dark:text-accent">
        <ShieldCheck className="size-4" aria-hidden /> {t("trade.simulatedTrade")}
      </div>
      <dl className="divide-y rounded-xl border text-sm">
        <Row label={t(`options.${p.strategy}`)} value={`${p.symbol} · ${strike} · ${p.expiry}`} />
        <Row label={t("options.contracts")} value={`${p.contracts} (${p.shares_covered} ${t("common.sharesUnit")})`} />
        <Row label={t("options.premium")} value={fmtMoney(p.premium)} />
        <Row label={call ? t("options.youReceive") : t("options.youPay")} value={<span className="font-semibold">{fmtMoney(Math.abs(p.cash_delta))}</span>} />
        <Row label={t("trade.cashAfter")} value={fmtMoney(p.cash_after)} />
      </dl>
      <ul className="space-y-2 text-sm leading-6">
        {call ? (
          <>
            <li>• {t("options.ifAbove", { strike, shares: p.shares_covered, total: fmtMoney(p.max_sale_value) })}</li>
            <li>• {t("options.ifBelowCall", { strike })}</li>
          </>
        ) : (
          <>
            <li>• {t("options.ifBelowPut", { strike, shares: p.shares_covered, worst: fmtMoney(p.worst_case_value) })}</li>
            <li>• {t("options.ifAbovePut", { strike })}</li>
          </>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">{t("options.model", { vol: fmtPct(p.volatility * 100, { decimals: 0 }) })}</p>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </div>
  );
}
