import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <Compass className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">{t("common.notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("common.notFoundText")}</p>
      <Link to="/home" className={buttonVariants({ className: "mt-2" })}>{t("common.goHome")}</Link>
    </div>
  );
}
