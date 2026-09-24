/** Types mirroring the FastAPI backend responses (apps/api/app/api/*.py). */

export type Language = "zh-CN" | "en-US";
export type AgeGroup = "A" | "B" | "C";
export type Side = "BUY" | "SELL";
export type Session = "regular" | "premarket" | "afterhours" | "closed";
export type MarketStatusCode = "OPEN" | "CLOSED" | "PREMARKET" | "AFTERHOURS";

export interface SetupStatus {
  onboarded: boolean;
  has_profiles: boolean;
  profile_count: number;
  default_language: Language;
  family_name: string | null;
  fractional_enabled: boolean;
  default_starting_cash: number;
}

export interface ParentToken {
  parent_token: string;
  expires_at: number; // unix seconds
}

export interface Profile {
  id: string;
  nickname: string;
  age_group: AgeGroup;
  language: Language;
  avatar: string;
  starting_cash: number;
  allow_etf: boolean;
  allow_fractional: boolean;
  daily_ai_limit: number | null;
  daily_minutes_limit: number | null;
  created_at: string;
}

export interface ProfileCreate {
  nickname: string;
  age_group: AgeGroup;
  language: Language;
  avatar: string;
  starting_cash: number;
  allow_etf?: boolean;
  allow_fractional?: boolean;
  daily_ai_limit?: number | null;
  daily_minutes_limit?: number | null;
}

export interface ProfilePatch {
  nickname?: string;
  age_group?: AgeGroup;
  language?: Language;
  avatar?: string;
  allow_etf?: boolean;
  allow_fractional?: boolean;
  daily_ai_limit?: number | null;
  daily_minutes_limit?: number | null;
  clear_ai_limit?: boolean;
  clear_minutes_limit?: boolean;
}

export interface AppSettings {
  default_language: Language;
  family_name: string | null;
  llm: { provider: string; model: string; configured?: boolean; cloud?: boolean };
  providers: { market: string; fundamentals: string; search: string };
  simulation: { currency: string; commission_bps: number; slippage_bps: number; fractional_enabled: boolean };
}

// ------------------------------------------------------------------ market

export interface Quote {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  timestamp: string;
  session: Session;
  delayed_seconds: number | null;
  currency: string;
  name: string | null;
  source: string;
}

export interface MarketStatus {
  market: string;
  status: MarketStatusCode;
  session: Session;
  as_of: string;
  source: string;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

export interface Candle {
  t: string;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number;
  v: number | null;
}

export type HistoryRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y";

export interface History {
  symbol: string;
  range: HistoryRange;
  candles: Candle[];
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange: string | null;
  quote_type: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  employees: number | null;
  summary: string | null;
  currency: string;
  source: string;
  source_url: string | null;
}

export interface FinancialPeriod {
  period_end: string;
  fiscal_year: number | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  cash: number | null;
  total_debt: number | null;
  revenue_growth: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
}

export interface Financials {
  symbol: string;
  currency: string;
  periods: FinancialPeriod[];
  source: string;
  source_url: string | null;
}

export interface ValuationMetrics {
  symbol: string;
  price: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  pe_forward: number | null;
  ps_ttm: number | null;
  pb: number | null;
  fcf_ttm: number | null;
  fcf_yield: number | null;
  eps_ttm: number | null;
  dividend_yield: number | null;
  beta: number | null;
  week52_high: number | null;
  week52_low: number | null;
  revenue_ttm: number | null;
  net_income_ttm: number | null;
  source: string;
  source_url: string | null;
  as_of: string | null;
}

// ------------------------------------------------------------------ portfolio

export interface Position {
  ticker: string;
  quantity: number;
  average_cost: number;
  last_price: number | null;
  price_timestamp: string | null;
  price_source: string | null;
  change_pct: number | null;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  realized_pnl: number;
  dividends: number;
  first_acquired: string | null;
  price_available: boolean;
  allocation_pct: number;
}

export interface Portfolio {
  profile_id: string;
  base_currency: string;
  starting_cash: number;
  cash: number;
  market_value: number;
  total_equity: number;
  unrealized_pnl: number;
  realized_pnl: number;
  dividends: number;
  total_pnl: number;
  total_return_pct: number;
  today_pnl: number;
  today_return_pct: number;
  largest_position_pct: number;
  positions: Position[];
  stale_prices: string[];
  epoch: number;
  as_of: string;
}

export interface TradeRequest {
  symbol: string;
  side: Side;
  quantity: number;
  journal_content?: string | null;
  journal_answers?: Record<string, string> | null;
  research_id?: string | null;
}

export interface TradePreview {
  symbol: string;
  name: string | null;
  side: Side;
  quantity: number;
  price: number;
  estimated_value: number;
  fee: number;
  cash_before: number;
  cash_after: number;
  position_before: number;
  position_after: number;
  allocation_after_pct: number;
  price_timestamp: string;
  price_source: string;
  session: Session;
  market_status: MarketStatusCode | "UNKNOWN";
  market_closed_notice: boolean;
  simulation: boolean;
}

export interface Trade {
  id: string;
  profile_id: string;
  epoch: number;
  symbol: string;
  side: Side;
  quantity: number;
  requested_at: string;
  executed_at: string | null;
  execution_price: number | null;
  gross_value: number | null;
  fee: number | null;
  realized_pnl: number | null;
  source_price_timestamp: string | null;
  price_source: string | null;
  session: Session | null;
  status: "EXECUTED" | "REJECTED" | string;
  reject_reason: string | null;
  journal_note: string | null;
  research_id: string | null;
}

export interface WatchlistItem {
  symbol: string;
  note: string | null;
  added_at: string;
  quote: Quote | null;
  market_cap: number | null;
  latest_research_at: string | null;
  latest_research_id: string | null;
}

export type JournalType = "pre_trade" | "post_trade" | "free_note";

export interface JournalEntry {
  id: string;
  profile_id: string;
  symbol: string | null;
  trade_id: string | null;
  research_id: string | null;
  type: JournalType;
  content: string;
  answers: Record<string, string> | null;
  context: Record<string, string> | null;
  created_at: string;
  trade: { side: Side; quantity: number; execution_price: number | null; executed_at: string | null } | null;
}

export interface JournalCreate {
  symbol?: string | null;
  trade_id?: string | null;
  research_id?: string | null;
  type?: JournalType;
  content: string;
  answers?: Record<string, string> | null;
}

// ------------------------------------------------------------------ AI: research

export type ReportStatus = "running" | "done" | "failed";

export interface Source {
  ref?: string;
  title: string;
  url: string | null;
  publisher: string | null;
  published_at: string | null;
  retrieved_at?: string | null;
  kind: string;
  snippet?: string | null;
}

export interface CompanyData {
  ticker: string;
  name: string;
  data_status: Partial<Record<"quote" | "profile" | "financials" | "valuation" | "news", boolean>>;
  quote?: Quote & { ref?: string };
  profile?: CompanyProfile & { ref?: string };
  financials?: Financials & { ref?: string };
  valuation?: ValuationMetrics & { ref?: string };
}

export interface ResearchStructured {
  symbols?: string[];
  companies?: CompanyData[];
  mode?: "quick" | "deep" | "topic";
  sections?: string[];
  query?: string;
  prompt_version?: string;
  // follow-ups store these instead:
  sources?: Source[] | null;
  tool_calls?: ToolCallLog[] | null;
}

export interface ResearchSummary {
  id: string;
  profile_id: string;
  parent_id: string | null;
  symbol: string | null;
  query: string;
  mode: "quick" | "deep" | "followup";
  language: Language;
  status: ReportStatus;
  favorite: boolean;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  error: string | null;
}

export interface ResearchReport extends ResearchSummary {
  content_markdown: string | null;
  structured_json: ResearchStructured | null;
  sources: Source[];
  followups?: ResearchReport[];
}

// ------------------------------------------------------------------ AI: masters

export interface Master {
  id: string;
  name_en: string;
  name_zh: string;
  avatar: string;
  short_bio_en: string;
  short_bio_zh: string;
  philosophy_tags: string[];
  disclaimer_en: string;
  disclaimer_zh: string;
}

export interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface ChatSession {
  id: string;
  master_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[] | null;
  tool_calls: ToolCallLog[] | null;
  created_at: string;
}

// ------------------------------------------------------------------ learn

export interface GlossaryEntry {
  id: string;
  term_en: string;
  term_zh: string;
  en: string;
  zh: string;
}

export interface LearningCard {
  id: string;
  level: number;
  terms: string[];
  title_en: string;
  title_zh: string;
  body_en: string;
  body_zh: string;
  example_en: string;
  example_zh: string;
  question_en: string;
  question_zh: string;
}

export interface LearningProgress {
  card_id: string;
  completed_at: string;
}

// ------------------------------------------------------------------ parent

export interface ParentChildOverview {
  profile: Profile;
  portfolio: {
    total_equity: number;
    cash: number;
    total_pnl: number;
    total_return_pct: number;
    today_pnl: number;
    largest_position_pct: number;
    positions: number;
  } | null;
  stats: {
    trades: number;
    research_reports: number;
    master_questions: number;
    learning_cards_completed: number;
    watchlist: number;
    ai_requests_today: number;
    journal_completion_rate: number | null;
    research_before_trade_rate: number | null;
    average_holding_days_on_sells: number | null;
  };
  recent_research: { id: string; query: string; symbol: string | null; mode: string; created_at: string }[];
}

export interface ResetResult {
  ok: boolean;
  epoch: number;
  starting_cash: number;
}

// ------------------------------------------------------------------ streaming events

export type ResearchStep = "resolving" | "gathering" | "writing";

export type ResearchEvent =
  | { type: "started"; report_id: string }
  | { type: "status"; step: ResearchStep }
  | { type: "resolved"; symbols: string[] }
  | { type: "data"; structured: ResearchStructured; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "notice"; code: string }
  | { type: "final"; content_markdown: string; structured: ResearchStructured; sources: Source[]; model?: string }
  | { type: "error"; code: string; structured?: ResearchStructured; sources?: Source[] };

export type ChatEvent =
  | { type: "started"; session_id?: string; followup_id?: string }
  | { type: "tool"; name: string; args: Record<string, unknown>; ok: boolean }
  | { type: "token"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "final"; content: string; sources: Source[]; tool_calls: ToolCallLog[] }
  | { type: "notice"; code: string }
  | { type: "error"; code: string };

export type ExplainEvent =
  | { type: "glossary"; id?: string; term: string; definition: string; source?: string }
  | { type: "token"; text: string }
  | { type: "final"; content: string }
  | { type: "error"; code: string };

// ------------------------------------------------------------------ AI model settings

export interface AIPreset {
  id: string;
  cloud: boolean;
  base_url: string;
  needs_key: boolean;
}

export interface AIConfig {
  preset: string;
  base_url: string;
  model: string;
  temperature: number;
  native_tools: boolean;
  source: "env" | "settings";
  has_api_key: boolean;
  api_key_hint: string;
  configured: boolean;
  cloud: boolean;
}

export interface AIConfigInput {
  preset: string;
  base_url: string;
  model: string;
  api_key?: string | null;
  temperature: number;
  native_tools: boolean;
}
