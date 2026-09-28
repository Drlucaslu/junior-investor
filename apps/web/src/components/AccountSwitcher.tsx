/** Learning account (gamified, unlocked by lessons) vs family account (private, funded by parents). */
import { useTranslation } from "react-i18next";
import { GraduationCap, Home } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { AccountKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AccountSwitcher({ className, value, onChange, showHint = true }: {
  className?: string; value?: AccountKind; onChange?: (a: AccountKind) => void; showHint?: boolean;
}) {
  const { t } = useTranslation();
  const app = useApp();
  const current = value ?? app.account;
  const set = onChange ?? app.setAccount;
  const opts: { v: AccountKind; icon: typeof Home; label: string }[] = [
    { v: "learning", icon: GraduationCap, label: t("accounts.learning") },
    { v: "family", icon: Home, label: t("accounts.family") },
  ];
  return (
    <div className={className}>
      <div role="radiogroup" aria-label={t("accounts.switch")} className="inline-flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-auto">
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={current === o.v} onClick={() => set(o.v)}
            className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              current === o.v ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}>
            <o.icon className="size-4" aria-hidden />{o.label}
          </button>
        ))}
      </div>
      {showHint && <p className="mt-1.5 text-xs text-muted-foreground">{t(current === "learning" ? "accounts.learningDesc" : "accounts.familyDesc")}</p>}
    </div>
  );
}
