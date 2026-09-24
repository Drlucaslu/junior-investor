/** Locale-aware number / currency / date formatting via Intl. */
import i18n from "../i18n";
import { parseDate } from "./utils";

const cache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = i18n.language || "en-US";
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function fmtMoney(v: number | null | undefined, opts: { decimals?: number; sign?: boolean } = {}): string {
  if (!isNum(v)) return "—";
  const d = opts.decimals ?? 2;
  return nf({
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: d, maximumFractionDigits: d,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  }).format(v);
}

/** $391.0B / 3,910亿 style compact currency for big values. */
export function fmtMoneyCompact(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!isNum(v)) return "—";
  if (Math.abs(v) < 100_000) return fmtMoney(v, { decimals: Math.abs(v) < 1000 ? 2 : 0, sign: opts.sign });
  return nf({
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  }).format(v);
}

export function fmtCompact(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return nf({ notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function fmtNumber(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return "—";
  return nf({ minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(v);
}

export function fmtQty(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return nf({ maximumFractionDigits: 6 }).format(v);
}

/** Percent where the input is already in percent units (e.g. 12.5 => 12.5%). */
export function fmtPct(v: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (!isNum(v)) return "—";
  return nf({
    style: "percent", minimumFractionDigits: opts.decimals ?? 2, maximumFractionDigits: opts.decimals ?? 2,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  }).format(v / 100);
}

/** Percent where the input is a ratio (e.g. 0.125 => 12.5%). */
export function fmtRatioPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return "—";
  return nf({ style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function fmtMultiple(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  return `${nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}×`;
}

export function fmtDate(v: string | null | undefined, withTime = false): string {
  const d = parseDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat(i18n.language || "en-US", withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" }).format(d);
}

export function fmtTime(v: string | null | undefined): string {
  const d = parseDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat(i18n.language || "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(d);
}

export function fmtRelative(v: string | null | undefined): string {
  const d = parseDate(v);
  if (!d) return "—";
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(i18n.language || "en-US", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(v);
}

export function signOf(v: number | null | undefined): "up" | "down" | "flat" {
  if (!isNum(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

/** "$1,000,000" in English, "100 万美元" in Chinese — used in friendly sentences. */
export function fmtCashWords(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  if ((i18n.language || "").startsWith("zh")) {
    const n = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
    if (v >= 100_000_000) return `${n.format(v / 100_000_000)} 亿美元`;
    if (v >= 10_000) return `${n.format(v / 10_000)} 万美元`;
    return `${n.format(v)} 美元`;
  }
  return fmtMoney(v, { decimals: v % 1 === 0 ? 0 : 2 });
}
