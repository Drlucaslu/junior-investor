import { KEYS, local } from "./storage";

export type ColorConvention = "green-up" | "red-up";

export function loadColorConvention(): ColorConvention {
  return local.get(KEYS.colorConvention) === "red-up" ? "red-up" : "green-up";
}

export function applyColorConvention(c: ColorConvention): void {
  document.documentElement.setAttribute("data-color-convention", c);
}

export function saveColorConvention(c: ColorConvention): void {
  local.set(KEYS.colorConvention, c);
  applyColorConvention(c);
}
