import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useApp();
  return (
    <div role="group" aria-label={t("lang.switchTo")} className={cn("inline-flex items-center rounded-lg border bg-card p-0.5 text-xs font-medium", className)}>
      {!compact && <Languages className="mx-1.5 size-3.5 text-muted-foreground" aria-hidden />}
      {(["zh-CN", "en-US"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l === "zh-CN" ? "zh-CN" : "en"}
          aria-pressed={language === l}
          onClick={() => changeLanguage(l)}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            language === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l === "zh-CN" ? t("lang.zh") : compact ? "EN" : t("lang.en")}
        </button>
      ))}
    </div>
  );
}
