import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";
import { setParentToken } from "@/lib/parentAuth";
import { errorText } from "@/lib/errorText";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/input";

export function PinForm({ onSuccess, message }: { onSuccess: () => void; message?: string }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,12}$/.test(pin)) { setErr(t("onboarding.pinInvalid")); return; }
    setBusy(true);
    setErr(null);
    try {
      const tok = await api.parentLogin(pin);
      setParentToken(tok);
      setPin("");
      onSuccess();
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Field label={t("pin.label")} htmlFor="parent-pin" error={err}>
        <Input
          id="parent-pin"
          data-autofocus
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!err}
          className="text-center text-lg tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        {!busy && <Lock />} {busy ? t("pin.checking") : t("pin.unlock")}
      </Button>
    </form>
  );
}

export function PinDialog({ open, onClose, onSuccess, message }: { open: boolean; onClose: () => void; onSuccess: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t("pin.title")} description={message ?? t("pin.text")} size="sm">
      <PinForm onSuccess={onSuccess} />
    </Dialog>
  );
}
