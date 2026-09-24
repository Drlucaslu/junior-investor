import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/common.json";
import zh from "./locales/zh-CN/common.json";
import { KEYS, local } from "./lib/storage";
import type { Language } from "./lib/types";

export const LANGUAGES: Language[] = ["zh-CN", "en-US"];

export function isLanguage(v: unknown): v is Language {
  return v === "zh-CN" || v === "en-US";
}

export function storedLanguage(): Language | null {
  const v = local.get(KEYS.language);
  return isLanguage(v) ? v : null;
}

function detect(): Language {
  const s = storedLanguage();
  if (s) return s;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en-US";
  return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

void i18n.use(initReactI18next).init({
  resources: { "en-US": { common: en }, "zh-CN": { common: zh } },
  lng: detect(),
  fallbackLng: "en-US",
  defaultNS: "common",
  ns: ["common"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyHtmlLang(lng: string) {
  if (typeof document !== "undefined") document.documentElement.lang = lng === "zh-CN" ? "zh-CN" : "en";
}
applyHtmlLang(i18n.language);
i18n.on("languageChanged", applyHtmlLang);

export function setLanguage(lng: Language): void {
  local.set(KEYS.language, lng);
  if (i18n.language !== lng) void i18n.changeLanguage(lng);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : "en-US";
}

export default i18n;
