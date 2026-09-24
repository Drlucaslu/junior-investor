import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, ArrowUpRight, Cpu, Info, Users } from "lucide-react";
import { api } from "@/lib/api";
import { loadColorConvention, saveColorConvention, type ColorConvention } from "@/lib/colorConvention";
import { useApp } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { ErrorState, PageHeader } from "@/components/States";
import { AISettingsCard } from "@/components/AISettingsCard";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { language, changeLanguage } = useApp();
  const [conv, setConv] = useState<ColorConvention>(() => loadColorConvention());
  const settings = useAsync(() => api.settings(), []);
  useDocumentTitle(t("settings.title"));

  const pick = (c: ColorConvention) => { setConv(c); saveColorConvention(c); };
  const s = settings.data;

  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} actions={<Link to="/family" className={buttonVariants({ variant: "outline" })}><Users /> {t("settings.switchProfile")}</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("settings.language")}</CardTitle></CardHeader>
          <CardContent>
            <Segmented label={t("settings.language")} value={language} onChange={changeLanguage}
              options={[{ value: "zh-CN", label: t("lang.zh") }, { value: "en-US", label: t("lang.en") }]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.colorConvention")}</CardTitle>
            <CardDescription>{t("settings.colorConventionHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label={t("settings.colorConvention")} className="grid gap-2 sm:grid-cols-2">
              {(["green-up", "red-up"] as const).map((c) => {
                const up = c === "green-up" ? "text-[hsl(var(--up))]" : "text-[hsl(var(--down))]";
                const down = c === "green-up" ? "text-[hsl(var(--down))]" : "text-[hsl(var(--up))]";
                return (
                  <button key={c} type="button" role="radio" aria-checked={conv === c} onClick={() => pick(c)}
                    className={cn("rounded-xl border-2 p-3 text-left transition-colors", conv === c ? "border-primary bg-primary-soft" : "border-border hover:bg-muted")}>
                    <span className="block text-sm font-medium">{c === "green-up" ? t("settings.greenUp") : t("settings.redUp")}</span>
                    <span className="mt-2 flex gap-3 text-sm font-semibold tabular">
                      <span className={cn("inline-flex items-center gap-0.5", up)}><ArrowUpRight className="size-4" aria-hidden />+2.4% <span className="sr-only">{t("settings.up")}</span></span>
                      <span className={cn("inline-flex items-center gap-0.5", down)}><ArrowDownRight className="size-4" aria-hidden />−1.8% <span className="sr-only">{t("settings.down")}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <AISettingsCard onSaved={settings.reload} />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="size-4 text-primary" aria-hidden />{t("settings.dataAndSimulation")}</CardTitle></CardHeader>
          <CardContent>
            {settings.loading ? <Skeleton className="h-32" /> : settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} compact /> : s && (
              <dl className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.dataProviders")}</p>
                <Row k={t("settings.marketData")} v={s.providers.market} />
                <Row k={t("settings.fundamentals")} v={s.providers.fundamentals} />
                <Row k={t("settings.searchProvider")} v={s.providers.search} />
                <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("settings.simulation")}</p>
                <Row k={t("settings.commission")} v={t("settings.bps", { n: s.simulation.commission_bps })} />
                <Row k={t("settings.slippage")} v={t("settings.bps", { n: s.simulation.slippage_bps })} />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Info className="size-4 text-primary" aria-hidden />{t("settings.about")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-foreground/85">
            <p className="font-medium text-foreground">{t("app.brand")}</p>
            <p>{t("settings.aboutText")}</p>
            <p>{t("settings.aboutMasters")}</p>
            <p>{t("settings.aboutData")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono text-xs">{v}</dd>
    </div>
  );
}
