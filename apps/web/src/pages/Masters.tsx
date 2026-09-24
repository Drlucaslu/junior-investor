import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info, MessagesSquare } from "lucide-react";
import { api } from "@/lib/api";
import type { Master } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { useAsync, useDocumentTitle } from "@/hooks/useAsync";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/misc";
import { ErrorState, PageHeader } from "@/components/States";
import { MasterAvatar } from "@/components/Avatar";

let mastersCache: Master[] | null = null;
export async function loadMasters(): Promise<Master[]> {
  if (!mastersCache) mastersCache = await api.masters();
  return mastersCache;
}

export default function Masters() {
  const { t, i18n } = useTranslation();
  const { language } = useApp();
  const [params] = useSearchParams();
  const symbol = params.get("symbol")?.toUpperCase() ?? null;
  const masters = useAsync(loadMasters, []);
  useDocumentTitle(t("masters.title"));
  const zh = language === "zh-CN";

  return (
    <div>
      <PageHeader title={t("masters.title")} subtitle={t("masters.subtitle")} />
      {symbol && <Alert variant="info" className="mb-4">{t("masters.aboutSymbol", { symbol })}</Alert>}
      {masters.loading ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-60" />)}</div>
      ) : masters.error ? (
        <ErrorState error={masters.error} onRetry={masters.reload} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {masters.data?.map((m) => (
            <Card key={m.id} className="flex flex-col p-5 transition hover:shadow-pop">
              <div className="flex items-start gap-4">
                <MasterAvatar id={m.id} size={64} />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{zh ? m.name_zh : m.name_en}</h2>
                  <p className="text-sm text-muted-foreground">{zh ? m.name_en : m.name_zh}</p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-6 text-foreground/85">{zh ? m.short_bio_zh : m.short_bio_en}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {m.philosophy_tags.map((tag) => (
                  <li key={tag}><Badge variant="muted">{i18n.exists(`masters.tags.${tag}`) ? t(`masters.tags.${tag}`) : tag.replace(/_/g, " ")}</Badge></li>
                ))}
              </ul>
              <p className="mt-4 flex gap-1.5 text-xs leading-5 text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {zh ? m.disclaimer_zh : m.disclaimer_en}
              </p>
              <Link
                to={`/masters/${m.id}${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`}
                className={buttonVariants({ className: "mt-4 w-full sm:w-auto sm:self-start" })}
              >
                <MessagesSquare /> {t("masters.startChat")} <ArrowRight />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
