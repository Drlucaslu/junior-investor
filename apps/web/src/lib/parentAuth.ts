import { KEYS, session } from "./storage";
import type { ParentToken } from "./types";

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getParentToken(): string | null {
  const raw = session.get(KEYS.parentToken);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as ParentToken;
    if (!t.parent_token || (t.expires_at && t.expires_at * 1000 < Date.now() + 5000)) {
      session.set(KEYS.parentToken, null);
      return null;
    }
    return t.parent_token;
  } catch {
    session.set(KEYS.parentToken, null);
    return null;
  }
}

export function setParentToken(t: ParentToken): void {
  session.set(KEYS.parentToken, JSON.stringify(t));
  listeners.forEach((l) => l(t.parent_token));
}

export function clearParentToken(): void {
  session.set(KEYS.parentToken, null);
  listeners.forEach((l) => l(null));
}

export function onParentTokenChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
