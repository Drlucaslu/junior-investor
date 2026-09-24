import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getParentToken } from "@/lib/parentAuth";
import { useDocumentTitle } from "@/hooks/useAsync";
import { ProfileAvatar } from "@/components/Avatar";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { PinDialog } from "@/components/PinDialog";

export default function Family() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setup, profiles, selectProfile } = useApp();
  const [pinOpen, setPinOpen] = useState(false);
  useDocumentTitle(t("family.title"));

  if (setup && !setup.onboarded) return <Navigate to="/onboarding" replace />;

  const goParent = () => {
    if (getParentToken()) navigate("/parent");
    else setPinOpen(true);
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <span className="font-semibold">{t("app.name")}</span>
        </div>
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 text-center sm:px-6 sm:pt-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("family.title")}</h1>
        <p className="mt-2 text-muted-foreground">{profiles.length ? t("family.subtitle") : t("family.noProfiles")}</p>
        <ul className="mt-10 flex flex-wrap justify-center gap-4 sm:gap-6">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => { selectProfile(p.id); navigate("/home"); }}
                className="group flex w-32 flex-col items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-card focus-visible:bg-card sm:w-36"
              >
                <ProfileAvatar avatar={p.avatar} size={96} className="ring-4 ring-transparent transition group-hover:ring-primary/30 group-focus-visible:ring-primary/40" />
                <span className="max-w-full truncate font-medium">{p.nickname}</span>
                <span className="-mt-2 text-xs text-muted-foreground">{t(`profile.age.${p.age_group}`)}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={goParent}
              className="group flex w-32 flex-col items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-card sm:w-36"
            >
              <span className="flex size-24 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/60 text-muted-foreground transition group-hover:border-primary group-hover:text-primary">
                <Shield className="size-9" aria-hidden />
              </span>
              <span className="font-medium">{t("family.parent")}</span>
              <span className="-mt-2 text-xs text-muted-foreground">{t("family.parentHint")}</span>
            </button>
          </li>
        </ul>
        <p className="mt-16 text-xs text-muted-foreground">{t("disclaimer.app")}</p>
      </main>
      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} onSuccess={() => { setPinOpen(false); navigate("/parent"); }} />
    </div>
  );
}
