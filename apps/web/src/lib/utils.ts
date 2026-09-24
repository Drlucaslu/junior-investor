import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Parse a backend timestamp. Naive timestamps (SQLite) are UTC. */
export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(v);
  const d = new Date(hasTz ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
