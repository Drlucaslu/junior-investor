import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/errors";
import { KEYS, local } from "@/lib/storage";
import type { Language, Portfolio, Profile, SetupStatus } from "@/lib/types";
import { currentLanguage, setLanguage, storedLanguage } from "@/i18n";

interface AppState {
  booting: boolean;
  bootError: ApiError | null;
  retryBoot: () => void;
  setup: SetupStatus | null;
  refreshSetup: () => Promise<SetupStatus | null>;
  profiles: Profile[];
  refreshProfiles: () => Promise<Profile[]>;
  activeProfile: Profile | null;
  selectProfile: (id: string | null) => void;
  updateActiveProfile: (p: Profile) => void;
  portfolio: Portfolio | null;
  portfolioError: ApiError | null;
  refreshPortfolio: () => Promise<void>;
  language: Language;
  changeLanguage: (lng: Language) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<ApiError | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => local.get(KEYS.activeProfile));
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [portfolioError, setPortfolioError] = useState<ApiError | null>(null);
  const [language, setLang] = useState<Language>(currentLanguage());
  const [bootKey, setBootKey] = useState(0);

  const refreshSetup = useCallback(async () => {
    try {
      const s = await api.setupStatus();
      setSetup(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    const list = await api.profiles();
    setProfiles(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      setBootError(null);
      try {
        const [s, list] = await Promise.all([api.setupStatus(), api.profiles()]);
        if (cancelled) return;
        setSetup(s);
        setProfiles(list);
        // Device has no explicit choice yet: follow the family default once onboarded.
        if (!storedLanguage() && s.onboarded) {
          setLanguage(s.default_language);
          setLang(s.default_language);
        }
        const stored = local.get(KEYS.activeProfile);
        if (stored && !list.some((p) => p.id === stored)) {
          local.set(KEYS.activeProfile, null);
          setActiveId(null);
        }
      } catch (e) {
        if (!cancelled) setBootError(toApiError(e));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bootKey]);

  const activeProfile = useMemo(() => profiles.find((p) => p.id === activeId) ?? null, [profiles, activeId]);

  const selectProfile = useCallback((id: string | null) => {
    local.set(KEYS.activeProfile, id);
    setActiveId(id);
    setPortfolio(null);
  }, []);

  // When the learner changes, use their language.
  const lastLangProfile = useRef<string | null>(null);
  useEffect(() => {
    if (activeProfile && lastLangProfile.current !== activeProfile.id) {
      lastLangProfile.current = activeProfile.id;
      setLanguage(activeProfile.language);
      setLang(activeProfile.language);
    }
  }, [activeProfile]);

  const updateActiveProfile = useCallback((p: Profile) => {
    setProfiles((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  }, []);

  const refreshPortfolio = useCallback(async () => {
    if (!activeId) return;
    try {
      const pf = await api.portfolio(activeId);
      setPortfolio(pf);
      setPortfolioError(null);
    } catch (e) {
      setPortfolioError(toApiError(e));
    }
  }, [activeId]);

  useEffect(() => {
    if (activeProfile) void refreshPortfolio();
  }, [activeProfile, refreshPortfolio]);

  const changeLanguage = useCallback((lng: Language) => {
    setLanguage(lng);
    setLang(lng);
    if (activeProfile && activeProfile.language !== lng) {
      api.patchProfile(activeProfile.id, { language: lng })
        .then((p) => updateActiveProfile(p))
        .catch(() => { /* language still switches locally */ });
    }
  }, [activeProfile, updateActiveProfile]);

  const value: AppState = {
    booting, bootError, retryBoot: () => setBootKey((k) => k + 1),
    setup, refreshSetup, profiles, refreshProfiles, activeProfile, selectProfile, updateActiveProfile,
    portfolio, portfolioError, refreshPortfolio, language, changeLanguage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

/** For pages rendered inside the profile guard. */
export function useProfile(): Profile {
  const { activeProfile } = useApp();
  if (!activeProfile) throw new Error("No active profile");
  return activeProfile;
}
