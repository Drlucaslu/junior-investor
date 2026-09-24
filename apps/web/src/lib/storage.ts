/** Safe wrappers around Web Storage — private mode / blocked storage must never crash the app. */

function get(store: "local" | "session", key: string): string | null {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    return s.getItem(key);
  } catch {
    return null;
  }
}

function set(store: "local" | "session", key: string, value: string | null): void {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const local = {
  get: (k: string) => get("local", k),
  set: (k: string, v: string | null) => set("local", k, v),
};
export const session = {
  get: (k: string) => get("session", k),
  set: (k: string, v: string | null) => set("session", k, v),
};

export const KEYS = {
  activeProfile: "ji.activeProfile",
  language: "ji.language",
  colorConvention: "ji.colorConvention",
  parentToken: "ji.parentToken",
  welcomed: (profileId: string) => `ji.welcomed.${profileId}`,
  promptIndex: "ji.promptIndex",
} as const;
