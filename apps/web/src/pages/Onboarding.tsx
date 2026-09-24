import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { api } from "@/lib/api";
import { getParentToken, setParentToken } from "@/lib/parentAuth";
import { errorText } from "@/lib/errorText";
import type { Language } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { useDocumentTitle } from "@/hooks/useAsync";
import { setLanguage } from "@/i18n";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ProfileForm, defaultProfileForm, startingCashOf, type ProfileFormValue } from "@/components/ProfileForm";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setup, refreshSetup, refreshProfiles, selectProfile, language, changeLanguage } = useApp();
  useDocumentTitle(t("onboarding.welcomeTitle"));
  const resumeChild = !!setup?.onboarded && !setup.has_profiles && !!getParentToken();
  const [step, setStep] = useState<0 | 1 | 2>(resumeChild ? 2 : 0);
  const [family, setFamily] = useState("");
  const [parentName, setParentName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormValue>(() => defaultProfileForm(language, setup?.default_starting_cash ?? 1_000_000));
  const [formErrors, setFormErrors] = useState<Partial<Record<"nickname" | "cash", string>>>({});

  if (setup?.onboarded && !resumeChild && step !== 2) return <Navigate to="/family" replace />;

  const pickLanguage = (l: Language) => {
    setLanguage(l);
    changeLanguage(l);
    setForm((f) => ({ ...f, language: l }));
    setStep(1);
  };

  const submitParent = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4,12}$/.test(pin)) { setPinErr(t("onboarding.pinInvalid")); return; }
    if (pin !== pin2) { setPinErr(t("onboarding.pinMismatch")); return; }
    setPinErr(null);
    setBusy(true);
    try {
      const tok = await api.setup({
        language, pin,
        family_name: family.trim() || t("onboarding.familyNamePlaceholder"),
        parent_name: parentName.trim() || t("family.parent"),
      });
      setParentToken(tok);
      await refreshSetup();
      setStep(2);
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  const submitChild = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof formErrors = {};
    if (!form.nickname.trim()) errs.nickname = t("onboarding.nicknameRequired");
    const cash = startingCashOf(form);
    if (cash === null) errs.cash = t("onboarding.customCashInvalid");
    setFormErrors(errs);
    if (Object.keys(errs).length || cash === null) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await api.createProfile({
        nickname: form.nickname.trim(), age_group: form.age_group, language: form.language, avatar: form.avatar, starting_cash: cash,
      });
      await Promise.all([refreshProfiles(), refreshSetup()]);
      selectProfile(p.id);
      navigate("/home", { replace: true });
    } catch (e2) {
      setErr(errorText(t, e2));
    } finally {
      setBusy(false);
    }
  };

  const steps = [t("onboarding.steps.language"), t("onboarding.steps.parent"), t("onboarding.steps.child")];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-xl flex-col px-4 py-8 sm:py-14">
        <div className="mb-8 flex items-center gap-3">
          <Logo className="size-10" />
          <div className="leading-tight">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("app.vendor")}</p>
            <p className="font-semibold">{t("app.name")}</p>
          </div>
        </div>

        <ol className="mb-6 flex items-center gap-2" aria-label={t("onboarding.stepOf", { n: step + 1, total: 3 })}>
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary-soft text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground",
              )} aria-current={i === step ? "step" : undefined}>
                {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("hidden truncate text-xs sm:block", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
              {i < 2 && <span className="h-px flex-1 bg-border" aria-hidden />}
            </li>
          ))}
        </ol>

        <Card className="p-5 sm:p-7 animate-fade-in" key={step}>
          {step === 0 && (
            <div className="text-center">
              <h1 className="text-xl font-semibold sm:text-2xl">{t("lang.chooseTitle")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("lang.chooseSubtitle")}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button size="lg" variant={language === "zh-CN" ? "default" : "outline"} className="h-16 text-lg" lang="zh-CN" onClick={() => pickLanguage("zh-CN")}>
                  {t("lang.zh")}
                </Button>
                <Button size="lg" variant={language === "en-US" ? "default" : "outline"} className="h-16 text-lg" lang="en" onClick={() => pickLanguage("en-US")}>
                  {t("lang.en")}
                </Button>
              </div>
              <div className="mt-8 rounded-xl bg-primary-soft/60 p-4 text-left">
                <p className="font-medium">{t("onboarding.welcomeTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.welcomeText")}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={submitParent} className="space-y-5" noValidate>
              <div>
                <h1 className="text-xl font-semibold">{t("onboarding.parentTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.parentText")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("onboarding.familyName")} htmlFor="ob-family">
                  <Input id="ob-family" maxLength={80} value={family} placeholder={t("onboarding.familyNamePlaceholder")} onChange={(e) => setFamily(e.target.value)} />
                </Field>
                <Field label={t("onboarding.parentName")} htmlFor="ob-parent">
                  <Input id="ob-parent" maxLength={80} value={parentName} placeholder={t("onboarding.parentNamePlaceholder")} onChange={(e) => setParentName(e.target.value)} />
                </Field>
                <Field label={t("onboarding.pin")} htmlFor="ob-pin" hint={t("onboarding.pinHint")} error={pinErr}>
                  <Input id="ob-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pinErr} />
                </Field>
                <Field label={t("onboarding.pinConfirm")} htmlFor="ob-pin2">
                  <Input id="ob-pin2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={pin2}
                    onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pinErr} />
                </Field>
              </div>
              {err && <Alert variant="danger">{err}</Alert>}
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft /> {t("common.back")}</Button>
                <Button type="submit" loading={busy}>{t("common.continue")} {!busy && <ArrowRight />}</Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitChild} className="space-y-6" noValidate>
              <div>
                <h1 className="text-xl font-semibold">{t("onboarding.childTitle")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.childText")}</p>
              </div>
              <ProfileForm value={form} onChange={setForm} mode="onboarding" errors={formErrors} />
              {err && <Alert variant="danger">{err}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {busy ? t("onboarding.creating") : t("onboarding.createProfile")}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">{t("disclaimer.app")}</p>
      </div>
    </div>
  );
}
