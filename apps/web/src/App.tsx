import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppProvider, useApp } from "./context/AppContext";
import { ToastProvider } from "./components/ui/toast";
import { Layout } from "./components/Layout";
import { ErrorState } from "./components/States";
import { Spinner } from "./components/ui/misc";
import { Logo } from "./components/Logo";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Family = lazy(() => import("./pages/Family"));
const HomePage = lazy(() => import("./pages/Home"));
const Masters = lazy(() => import("./pages/Masters"));
const MasterChat = lazy(() => import("./pages/MasterChat"));
const Research = lazy(() => import("./pages/Research"));
const ResearchReport = lazy(() => import("./pages/ResearchReport"));
const Stock = lazy(() => import("./pages/Stock"));
const PortfolioPage = lazy(() => import("./pages/Portfolio"));
const TradePage = lazy(() => import("./pages/Trade"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Journal = lazy(() => import("./pages/Journal"));
const Learn = lazy(() => import("./pages/Learn"));
const Parent = lazy(() => import("./pages/Parent"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={t("common.loading")} />
    </div>
  );
}

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Logo className="size-14" />
      {children}
    </div>
  );
}

function Boot({ children }: { children: ReactNode }) {
  const { booting, bootError, retryBoot } = useApp();
  const { t } = useTranslation();
  if (booting) return <Splash><Spinner label={t("common.loading")} /></Splash>;
  if (bootError) return <Splash><ErrorState error={bootError} onRetry={retryBoot} /></Splash>;
  return <>{children}</>;
}

function RootRedirect() {
  const { setup, activeProfile } = useApp();
  if (setup && !setup.onboarded) return <Navigate to="/onboarding" replace />;
  return <Navigate to={activeProfile ? "/home" : "/family"} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <Boot>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/family" element={<Family />} />
              <Route element={<Layout />}>
                <Route path="/home" element={<HomePage />} />
                <Route path="/masters" element={<Masters />} />
                <Route path="/masters/:masterId" element={<MasterChat />} />
                <Route path="/research" element={<Research />} />
                <Route path="/research/:researchId" element={<ResearchReport />} />
                <Route path="/stocks/:symbol" element={<Stock />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/trade/:symbol" element={<TradePage />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/parent" element={<Parent />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </Boot>
      </AppProvider>
    </ToastProvider>
  );
}
