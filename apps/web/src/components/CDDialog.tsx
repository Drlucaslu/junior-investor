/** Open a simulated CD (Certificate of Deposit) in the chosen account. */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiggyBank } from "lucide-react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errorText";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { AccountKind, CDOffer } from "@/lib/types";
import { useProfile } from "@/context/AppContext";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/input";
import { Alert, Skeleton } from "./ui/misc";
import { useToast } from "./ui/toast";
import { cn } from "@/lib/utils";

export function CDDialog({ open, onClose, account, cash, onDone }: {
  open: boolean; onClose: () => void; account: AccountKind; cash: number; onDone: () => void;
}) {
  const { t } = useTranslation();
  const profile = useProfile();
  const toast = useToast();
  const [offers, setOffers] = useState<CDOffer[] | null>(null);
  const [term, setTerm] = useState(12);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setAmount(String(Math.floor(Math.min(cash, 1000))));
    api.cdOffers().then((r) => setOffers(r.offers)).catch((e) => setErr(errorText(t, e)));
  }, [open, cash, t]);

  const offer = offers?.find((o) => o.term_months === term);
  const amt = Number(amount);
  const atMaturity = offer && amt > 0 ? amt * Math.pow(1 + offer.apy, term / 12) : null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.openCd(profile.id, account, amt, term);
      toast.push("success", t("cd.opened"));
      onDone();
      onClose();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("cd.title")} description={t("cd.subtitle")}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => void submit()} loading={busy} disabled={!offer || !(amt >= 100) || amt > cash}><PiggyBank /> {t("cd.confirm")}</Button>
      </>}>
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">{t("cd.term")}</p>
          {!offers ? <Skeleton className="h-16" /> : (
            <div role="radiogroup" aria-label={t("cd.term")} className="grid grid-cols-3 gap-2">
              {offers.map((o) => (
                <button key={o.term_months} type="button" role="radio" aria-checked={term === o.term_months} onClick={() => setTerm(o.term_months)}
                  className={cn("rounded-xl border-2 p-3 text-left transition", term === o.term_months ? "border-primary bg-primary-soft" : "border-border hover:bg-muted")}>
                  <span className="block text-sm font-semibold">{t("cd.months", { n: o.term_months })}</span>
                  <span className="block text-xs text-muted-foreground">{fmtPct(o.apy * 100, { decimals: 2 })} APY</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label={t("cd.amount")} htmlFor="cd-amount" hint={`${t("trade.availableCash")}: ${fmtMoney(cash)}`}>
          <Input id="cd-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="text-lg font-semibold tabular" />
        </Field>
        {offer && atMaturity !== null && (
          <div className="rounded-xl bg-muted/50 p-3 text-sm">
            <p>{t("cd.atMaturity")}: <span className="font-semibold tabular">{fmtMoney(atMaturity)}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{t("cd.penalty", { n: offer.penalty_months })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("cd.rateSource")}</p>
          </div>
        )}
        {err && <Alert variant="danger">{err}</Alert>}
      </div>
    </Dialog>
  );
}
