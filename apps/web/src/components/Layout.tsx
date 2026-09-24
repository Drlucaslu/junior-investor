import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen, Briefcase, ChevronDown, GraduationCap, Home, LayoutGrid, MessagesSquare, NotebookPen, Search, Settings, Shield,
  Telescope, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { fmtMoney } from "@/lib/format";
import { useInterval } from "@/hooks/useAsync";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "./Avatar";
import { LanguageToggle } from "./LanguageToggle";
import { MarketStatusPill } from "./MarketStatusPill";
import { SymbolSearch } from "./SymbolSearch";
import { Dialog } from "./ui/dialog";
import { Logo } from "./Logo";
import { Spinner } from "./ui/misc";

interface NavItem { to: string; key: string; icon: LucideIcon }

const NAV: NavItem[] = [
  { to: "/home", key: "home", icon: Home },
  { to: "/masters", key: "masters", icon: MessagesSquare },
  { to: "/research", key: "research", icon: Telescope },
  { to: "/portfolio", key: "portfolio", icon: Briefcase },
  { to: "/watchlist", key: "watchlist", icon: BookOpen },
  { to: "/journal", key: "journal", icon: NotebookPen },
  { to: "/learn", key: "learn", icon: GraduationCap },
  { to: "/parent", key: "parent", icon: Shield },
  { to: "/settings", key: "settings", icon: Settings },
];
const MOBILE_MAIN = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

/** Routes reachable without a selected learner profile. */
const NO_PROFILE_OK = ["/parent", "/settings"];

export function Layout() {
  const { setup, activeProfile } = useApp();
  const loc = useLocation();
  if (setup && !setup.onboarded) return <Navigate to="/onboarding" replace />;
  if (!activeProfile && !NO_PROFILE_OK.some((p) => loc.pathname.startsWith(p))) return <Navigate to="/family" replace />;

  return (
    <div className="min-h-screen md:pl-[76px] lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop">
        <SkipText />
      </a>
      <Sidebar />
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 md:pb-12 lg:px-8 lg:pt-7">
        <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

function SkipText() {
  const { t } = useTranslation();
  return <>{t("app.skipToContent")}</>;
}

function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r bg-card/80 backdrop-blur md:flex lg:w-60">
      <Link to="/home" className="flex h-16 items-center gap-2.5 px-4 lg:px-5" aria-label={t("app.brand")}>
        <Logo className="size-9 shrink-0" />
        <span className="hidden leading-tight lg:block">
          <span className="block text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">{t("app.vendor")}</span>
          <span className="block text-[0.95rem] font-semibold">{t("app.name")}</span>
        </span>
      </Link>
      <nav aria-label={t("nav.mainNav")} className="flex-1 overflow-y-auto px-2.5 py-3 lg:px-3">
        <ul className="space-y-1">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                title={t(`nav.${n.key}`)}
                className={({ isActive }) => cn(
                  "group flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[0.65rem] font-medium transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm",
                  isActive ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <n.icon className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{t(`nav.${n.key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className="hidden px-5 pb-5 text-xs leading-5 text-muted-foreground lg:block">{t("disclaimer.app")}</p>
    </aside>
  );
}

function TopBar() {
  const { t } = useTranslation();
  const { activeProfile, portfolio, refreshPortfolio } = useApp();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  useInterval(() => void refreshPortfolio(), activeProfile ? 60_000 : null);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
        <Link to="/home" className="flex items-center gap-2 md:hidden" aria-label={t("app.brand")}>
          <Logo className="size-8" />
        </Link>
        <div className="hidden min-w-0 flex-1 sm:block">
          <SymbolSearch className="max-w-md" onSelect={(m) => navigate(`/stocks/${encodeURIComponent(m.symbol)}`)} />
        </div>
        <div className="flex-1 sm:hidden" />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted sm:hidden"
          aria-label={t("topbar.searchLabel")}
        >
          <Search className="size-5" />
        </button>
        {activeProfile && portfolio && (
          <Link to="/portfolio" className="hidden flex-col items-end leading-tight lg:flex" title={t("topbar.portfolioValue")}>
            <span className="text-[0.7rem] text-muted-foreground">{t("topbar.portfolioValue")}</span>
            <span className="text-sm font-semibold tabular">{fmtMoney(portfolio.total_equity)}</span>
          </Link>
        )}
        <MarketStatusPill className="hidden sm:inline-flex" />
        <MarketStatusPill className="sm:hidden" dotOnly />
        <LanguageToggle compact className="shrink-0" />
        <ProfileMenu />
      </div>
      {searchOpen && (
        <div className="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 sm:hidden">
          <SymbolSearch
            autoFocus
            className="flex-1"
            onSelect={(m) => { setSearchOpen(false); navigate(`/stocks/${encodeURIComponent(m.symbol)}`); }}
          />
          <button type="button" onClick={() => setSearchOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label={t("common.close")}>
            <X className="size-5" />
          </button>
        </div>
      )}
    </header>
  );
}

function ProfileMenu() {
  const { t } = useTranslation();
  const { activeProfile, profiles, selectProfile } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!activeProfile) {
    return (
      <Link to="/family" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label={t("topbar.whoIsLearning")}>
        <Users className="size-5" />
      </Link>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("topbar.profileMenu")}
        className="flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-1.5 hover:bg-muted sm:pr-2.5"
      >
        <ProfileAvatar avatar={activeProfile.avatar} size={30} />
        <span className="hidden max-w-[7rem] truncate text-sm font-medium sm:inline">{activeProfile.nickname}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border bg-card p-1.5 shadow-pop animate-fade-in">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{t("topbar.switchProfile")}</p>
          {profiles.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              type="button"
              onClick={() => { selectProfile(p.id); setOpen(false); navigate("/home"); }}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted", p.id === activeProfile.id && "bg-primary-soft")}
            >
              <ProfileAvatar avatar={p.avatar} size={28} />
              <span className="flex-1 truncate">{p.nickname}</span>
            </button>
          ))}
          <div className="my-1 border-t" />
          <button role="menuitem" type="button" onClick={() => { setOpen(false); navigate("/family"); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
            <Users className="size-4 text-muted-foreground" aria-hidden /> {t("topbar.whoIsLearning")}
          </button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); navigate("/settings"); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
            <Settings className="size-4 text-muted-foreground" aria-hidden /> {t("nav.settings")}
          </button>
        </div>
      )}
    </div>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const moreActive = MOBILE_MORE.some((n) => loc.pathname.startsWith(n.to));
  useEffect(() => setMore(false), [loc.pathname]);
  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.68rem] font-medium";
  return (
    <>
      <nav aria-label={t("nav.mainNav")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="flex">
          {MOBILE_MAIN.map((n) => (
            <li key={n.to} className="flex flex-1">
              <NavLink to={n.to} className={({ isActive }) => cn(item, isActive ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" aria-hidden />
                <span>{t(`nav.${n.key}`)}</span>
              </NavLink>
            </li>
          ))}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} className={cn(item, moreActive ? "text-primary" : "text-muted-foreground")} aria-haspopup="dialog">
              <LayoutGrid className="size-5" aria-hidden />
              <span>{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title={t("nav.more")}>
        <ul className="grid grid-cols-3 gap-2">
          {MOBILE_MORE.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                className={({ isActive }) => cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-sm font-medium",
                  isActive ? "border-primary/40 bg-primary-soft text-primary" : "hover:bg-muted",
                )}
              >
                <n.icon className="size-6" aria-hidden />
                {t(`nav.${n.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("disclaimer.app")}</p>
      </Dialog>
    </>
  );
}
