/** Typed client for the Junior Investor API (all routes under /api/v1). */
import { ApiError, errorFromResponse, toApiError } from "./errors";
import { clearParentToken, getParentToken } from "./parentAuth";
import type {
  AIConfig, AIConfigInput, AIPreset, AppSettings, ChatMessage, ChatSession, CompanyProfile, Financials, GlossaryEntry, History, HistoryRange, JournalCreate,
  JournalEntry, Language, LearningCard, LearningProgress, MarketStatus, Master, ParentChildOverview, ParentToken, Portfolio,
  Position, Profile, ProfileCreate, ProfilePatch, Quote, ResearchReport, ResearchSummary, ResetResult, SetupStatus,
  SymbolMatch, Trade, TradePreview, TradeRequest, ValuationMetrics, WatchlistItem,
} from "./types";

export const API_BASE = "/api/v1";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOpts {
  body?: unknown;
  parent?: boolean; // attach X-Parent-Token (optional for PATCH /profiles)
  signal?: AbortSignal;
}

export function buildHeaders(parent: boolean, json: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (json) h["Content-Type"] = "application/json";
  if (parent) {
    const tok = getParentToken();
    if (tok) h["X-Parent-Token"] = tok;
  }
  return h;
}

async function request<T>(method: Method, path: string, opts: RequestOpts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: buildHeaders(!!opts.parent, opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    throw toApiError(e);
  }
  if (!res.ok) {
    const err = await errorFromResponse(res);
    if (err.code === "PARENT_AUTH_REQUIRED" && opts.parent) clearParentToken();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  // ---------------------------------------------------------------- AI model (parent only)
  aiSettings: () => request<{ config: AIConfig; presets: AIPreset[] }>("GET", "/settings/ai", { parent: true }),
  saveAiSettings: (body: AIConfigInput) => request<{ config: AIConfig }>("PUT", "/settings/ai", { body, parent: true }),
  resetAiSettings: () => request<{ config: AIConfig }>("DELETE", "/settings/ai", { parent: true }),
  testAiSettings: (body: AIConfigInput) =>
    request<{ ok: boolean; reply?: string; model?: string; error?: string; latency_ms: number }>("POST", "/settings/ai/test", { body, parent: true }),
  listAiModels: (body: AIConfigInput) =>
    request<{ ok: boolean; models: string[]; error?: string }>("POST", "/settings/ai/models", { body, parent: true }),

  // ---------------------------------------------------------------- system / setup
  health: () => request<{ status: string; llm_model: string }>("GET", "/health"),
  setupStatus: () => request<SetupStatus>("GET", "/setup/status"),
  setup: (body: { language: Language; family_name: string; parent_name?: string; pin: string }) =>
    request<ParentToken>("POST", "/setup", { body }),
  parentLogin: (pin: string) => request<ParentToken>("POST", "/parent/login", { body: { pin } }),
  changePin: (old_pin: string, new_pin: string) =>
    request<{ ok: boolean }>("POST", "/parent/pin", { body: { old_pin, new_pin }, parent: true }),
  settings: () => request<AppSettings>("GET", "/settings"),
  patchSettings: (body: { default_language?: Language; family_name?: string }) =>
    request<AppSettings>("PATCH", "/settings", { body, parent: true }),

  // ---------------------------------------------------------------- profiles
  profiles: () => request<Profile[]>("GET", "/profiles"),
  profile: (id: string) => request<Profile>("GET", `/profiles/${enc(id)}`),
  createProfile: (body: ProfileCreate) => request<Profile>("POST", "/profiles", { body, parent: true }),
  patchProfile: (id: string, body: ProfilePatch, parent = false) =>
    request<Profile>("PATCH", `/profiles/${enc(id)}`, { body, parent }),
  archiveProfile: (id: string) => request<{ ok: boolean }>("DELETE", `/profiles/${enc(id)}`, { parent: true }),
  resetPortfolio: (id: string, starting_cash?: number | null) =>
    request<ResetResult>("POST", `/profiles/${enc(id)}/reset-portfolio`, {
      body: starting_cash ? { starting_cash } : {}, parent: true,
    }),
  exportHistory: (id: string) => request<Record<string, unknown>>("GET", `/profiles/${enc(id)}/export`, { parent: true }),
  parentOverview: () => request<{ profiles: ParentChildOverview[] }>("GET", "/parent/overview", { parent: true }),

  // ---------------------------------------------------------------- market
  marketStatus: () => request<MarketStatus>("GET", "/market/status"),
  quote: (s: string) => request<Quote>("GET", `/market/quote/${enc(s)}`),
  quotes: (symbols: string[]) => request<Record<string, Quote | null>>("GET", `/market/quotes?symbols=${enc(symbols.join(","))}`),
  history: (s: string, range: HistoryRange) => request<History>("GET", `/market/history/${enc(s)}?range=${range}`),
  company: (s: string) => request<CompanyProfile>("GET", `/market/company/${enc(s)}`),
  financials: (s: string, periods = 5) => request<Financials>("GET", `/market/financials/${enc(s)}?periods=${periods}`),
  metrics: (s: string) => request<ValuationMetrics>("GET", `/market/metrics/${enc(s)}`),
  search: (q: string, signal?: AbortSignal) => request<SymbolMatch[]>("GET", `/market/search?q=${enc(q)}`, { signal }),

  // ---------------------------------------------------------------- portfolio & trading
  portfolio: (pid: string) => request<Portfolio>("GET", `/profiles/${enc(pid)}/portfolio`),
  positions: (pid: string) => request<Position[]>("GET", `/profiles/${enc(pid)}/positions`),
  trades: (pid: string, symbol?: string) =>
    request<Trade[]>("GET", `/profiles/${enc(pid)}/trades${symbol ? `?symbol=${enc(symbol)}` : ""}`),
  previewTrade: (pid: string, body: TradeRequest) => request<TradePreview>("POST", `/profiles/${enc(pid)}/trades/preview`, { body }),
  executeTrade: (pid: string, body: TradeRequest) => request<Trade>("POST", `/profiles/${enc(pid)}/trades/execute`, { body }),

  watchlist: (pid: string) => request<WatchlistItem[]>("GET", `/profiles/${enc(pid)}/watchlist`),
  addWatch: (pid: string, symbol: string, note?: string) =>
    request<{ ok: boolean; symbol: string }>("POST", `/profiles/${enc(pid)}/watchlist`, { body: { symbol, note } }),
  removeWatch: (pid: string, symbol: string) =>
    request<{ ok: boolean }>("DELETE", `/profiles/${enc(pid)}/watchlist/${enc(symbol)}`),

  journal: (pid: string, symbol?: string) =>
    request<JournalEntry[]>("GET", `/profiles/${enc(pid)}/journal${symbol ? `?symbol=${enc(symbol)}` : ""}`),
  addJournal: (pid: string, body: JournalCreate) => request<JournalEntry>("POST", `/profiles/${enc(pid)}/journal`, { body }),

  // ---------------------------------------------------------------- research
  researchList: (pid: string, opts: { symbol?: string; favorites?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.symbol) q.set("symbol", opts.symbol);
    if (opts.favorites) q.set("favorites", "true");
    if (opts.limit) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return request<ResearchSummary[]>("GET", `/profiles/${enc(pid)}/research${qs ? `?${qs}` : ""}`);
  },
  research: (id: string) => request<ResearchReport>("GET", `/research/${enc(id)}`),
  patchResearch: (id: string, favorite: boolean) => request<ResearchSummary>("PATCH", `/research/${enc(id)}`, { body: { favorite } }),

  // ---------------------------------------------------------------- masters
  masters: () => request<Master[]>("GET", "/masters"),
  chatSessions: (pid: string, masterId?: string) =>
    request<ChatSession[]>("GET", `/profiles/${enc(pid)}/master-chats${masterId ? `?master_id=${enc(masterId)}` : ""}`),
  chatMessages: (sid: string) => request<ChatMessage[]>("GET", `/chat-sessions/${enc(sid)}/messages`),

  // ---------------------------------------------------------------- learn
  cards: () => request<LearningCard[]>("GET", "/learn/cards"),
  glossary: () => request<GlossaryEntry[]>("GET", "/learn/glossary"),
  learnProgress: (pid: string) => request<LearningProgress[]>("GET", `/profiles/${enc(pid)}/learn/progress`),
  completeCard: (pid: string, cardId: string) =>
    request<{ ok: boolean }>("POST", `/profiles/${enc(pid)}/learn/${enc(cardId)}/complete`),
};

// Glossary is static — fetch once and cache for the session.
let glossaryPromise: Promise<Map<string, GlossaryEntry>> | null = null;
export function loadGlossary(): Promise<Map<string, GlossaryEntry>> {
  if (!glossaryPromise) {
    glossaryPromise = api
      .glossary()
      .then((rows) => new Map(rows.map((r) => [r.id, r])))
      .catch((e: unknown) => {
        glossaryPromise = null;
        throw e;
      });
  }
  return glossaryPromise;
}

export { ApiError };
