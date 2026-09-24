import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { AgeGroup, Language } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AVATAR_IDS, ProfileAvatar } from "./Avatar";
import { Field, Input } from "./ui/input";
import { Segmented, Switch } from "./ui/misc";

export const CASH_PRESETS = [10_000, 100_000, 1_000_000] as const;

export interface ProfileFormValue {
  nickname: string;
  age_group: AgeGroup;
  language: Language;
  avatar: string;
  cashChoice: string; // preset amount as string, or "custom"
  customCash: string;
  allow_etf: boolean;
  allow_fractional: boolean;
  daily_ai_limit: string;
  daily_minutes_limit: string;
}

export function defaultProfileForm(language: Language, defaultCash = 1_000_000): ProfileFormValue {
  const preset = (CASH_PRESETS as readonly number[]).includes(defaultCash);
  return {
    nickname: "", age_group: "B", language, avatar: "owl",
    cashChoice: preset ? String(defaultCash) : "custom", customCash: preset ? "" : String(defaultCash),
    allow_etf: true, allow_fractional: false, daily_ai_limit: "", daily_minutes_limit: "",
  };
}

export function startingCashOf(v: ProfileFormValue): number | null {
  const n = v.cashChoice === "custom" ? Number(v.customCash.replace(/[,\s]/g, "")) : Number(v.cashChoice);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000_000 ? n : null;
}

export function limitOf(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("profile.avatar")} className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {AVATAR_IDS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={t(`profile.avatars.${a}`)}
          title={t(`profile.avatars.${a}`)}
          onClick={() => onChange(a)}
          className={cn(
            "relative flex items-center justify-center rounded-2xl border-2 p-1.5 transition-colors",
            value === a ? "border-primary bg-primary-soft" : "border-transparent hover:bg-muted",
          )}
        >
          <ProfileAvatar avatar={a} size={52} />
          {value === a && (
            <span className="absolute -right-1 -top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
              <Check className="size-3" aria-hidden />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ProfileForm({ value, onChange, mode, errors = {}, fractionalServerEnabled = false }: {
  value: ProfileFormValue; onChange: (v: ProfileFormValue) => void; mode: "onboarding" | "create" | "edit";
  errors?: Partial<Record<"nickname" | "cash", string>>; fractionalServerEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof ProfileFormValue>(k: K, v: ProfileFormValue[K]) => onChange({ ...value, [k]: v });
  const parentFields = mode !== "onboarding";
  return (
    <div className="space-y-5">
      <Field label={t("profile.nickname")} htmlFor="pf-nick" error={errors.nickname}>
        <Input id="pf-nick" maxLength={40} value={value.nickname} placeholder={t("profile.nicknamePlaceholder")}
          onChange={(e) => set("nickname", e.target.value)} aria-invalid={!!errors.nickname} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("profile.ageGroup")}</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-2">
          {(["A", "B", "C"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={value.age_group === g}
              onClick={() => set("age_group", g)}
              className={cn(
                "rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                value.age_group === g ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
              )}
            >
              <span className="block text-sm font-semibold">{t(`profile.age.${g}`)}</span>
              <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{t(`profile.ageDesc.${g}`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium" id="pf-lang">{t("profile.language")}</p>
        <Segmented
          label={t("profile.language")}
          value={value.language}
          onChange={(v) => set("language", v)}
          options={[{ value: "zh-CN", label: t("lang.zh") }, { value: "en-US", label: t("lang.en") }]}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("profile.avatar")}</p>
        <AvatarPicker value={value.avatar} onChange={(v) => set("avatar", v)} />
      </div>

      {mode !== "edit" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("profile.startingCash")}</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[...CASH_PRESETS.map(String), "custom"].map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={value.cashChoice === c}
                onClick={() => set("cashChoice", c)}
                className={cn(
                  "rounded-xl border-2 px-3 py-2 text-sm font-semibold tabular transition-colors",
                  value.cashChoice === c ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-muted",
                )}
              >
                {c === "custom" ? t("profile.customCash") : fmtMoney(Number(c), { decimals: 0 })}
              </button>
            ))}
          </div>
          {value.cashChoice === "custom" && (
            <Input
              inputMode="decimal"
              aria-label={t("profile.customCashPlaceholder")}
              placeholder={t("profile.customCashPlaceholder")}
              value={value.customCash}
              onChange={(e) => set("customCash", e.target.value.replace(/[^\d.,]/g, ""))}
              aria-invalid={!!errors.cash}
            />
          )}
          {errors.cash && <p className="text-xs text-danger" role="alert">{errors.cash}</p>}
        </fieldset>
      )}

      {parentFields && (
        <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("parent.aiLimit")} htmlFor="pf-ai" hint={t("parent.unlimited")}>
              <Input id="pf-ai" inputMode="numeric" value={value.daily_ai_limit}
                onChange={(e) => set("daily_ai_limit", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("parent.minutesLimit")} htmlFor="pf-min" hint={t("parent.unlimited")}>
              <Input id="pf-min" inputMode="numeric" value={value.daily_minutes_limit}
                onChange={(e) => set("daily_minutes_limit", e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            {t("parent.allowEtf")}
            <Switch checked={value.allow_etf} onChange={(v) => set("allow_etf", v)} label={t("parent.allowEtf")} />
          </label>
          <div>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              {t("parent.allowFractional")}
              <Switch checked={value.allow_fractional} onChange={(v) => set("allow_fractional", v)} label={t("parent.allowFractional")} />
            </label>
            {!fractionalServerEnabled && <p className="mt-1 text-xs text-muted-foreground">{t("parent.fractionalServerOff")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
