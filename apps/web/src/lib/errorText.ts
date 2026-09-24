import type { TFunction } from "i18next";
import { ApiError } from "./errors";
import { fmtMoney, fmtQty } from "./format";

/** Map an API error code to a friendly, translated message. */
export function errorText(t: TFunction, e: unknown): string {
  const err = e instanceof ApiError ? e : null;
  const code = err?.code ?? "UNKNOWN_ERROR";
  const d = err?.detail ?? {};
  const num = (k: string) => {
    const v = d[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const vars: Record<string, string> = {
    required: fmtMoney(num("required_cash")),
    available: fmtMoney(num("available_cash")),
    held: fmtQty(num("held")),
  };
  return t(`errors.${code}`, { ...vars, defaultValue: t("errors.UNKNOWN_ERROR") });
}
