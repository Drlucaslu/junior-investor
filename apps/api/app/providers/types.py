"""Provider-neutral data types. Business logic only ever sees these."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, PlainSerializer

# Decimals are exact internally but serialise as JSON numbers for the frontend.
Num = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

Session = Literal["regular", "premarket", "afterhours", "closed"]


class Quote(BaseModel):
    symbol: str
    price: Num
    bid: Num | None = None
    ask: Num | None = None
    previous_close: Num | None = None
    change: Num | None = None
    change_pct: Num | None = None
    timestamp: datetime
    session: Session = "regular"
    delayed_seconds: int | None = None
    currency: str = "USD"
    name: str | None = None
    source: str


class Candle(BaseModel):
    t: datetime
    o: float | None = None
    h: float | None = None
    l: float | None = None  # noqa: E741
    c: float
    v: float | None = None


class MarketStatus(BaseModel):
    market: str = "US"
    status: Literal["OPEN", "CLOSED", "PREMARKET", "AFTERHOURS"]
    session: Session
    as_of: datetime
    source: str


class SymbolMatch(BaseModel):
    symbol: str
    name: str
    exchange: str | None = None
    type: str | None = None  # EQUITY | ETF


class CompanyProfile(BaseModel):
    symbol: str
    name: str
    exchange: str | None = None
    quote_type: str | None = None  # EQUITY | ETF
    sector: str | None = None
    industry: str | None = None
    country: str | None = None
    website: str | None = None
    employees: int | None = None
    summary: str | None = None
    currency: str = "USD"
    source: str
    source_url: str | None = None


class FinancialPeriod(BaseModel):
    period_end: str  # YYYY-MM-DD
    fiscal_year: int | None = None
    revenue: float | None = None
    gross_profit: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    eps_diluted: float | None = None
    operating_cash_flow: float | None = None
    capex: float | None = None
    free_cash_flow: float | None = None
    cash: float | None = None
    total_debt: float | None = None
    # derived
    revenue_growth: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None


class Financials(BaseModel):
    symbol: str
    currency: str = "USD"
    periods: list[FinancialPeriod] = Field(default_factory=list)  # oldest -> newest
    source: str
    source_url: str | None = None


class ValuationMetrics(BaseModel):
    symbol: str
    price: float | None = None
    market_cap: float | None = None
    pe_ttm: float | None = None
    pe_forward: float | None = None
    ps_ttm: float | None = None
    pb: float | None = None
    fcf_ttm: float | None = None
    fcf_yield: float | None = None
    eps_ttm: float | None = None
    dividend_yield: float | None = None
    beta: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    revenue_ttm: float | None = None
    net_income_ttm: float | None = None
    source: str
    source_url: str | None = None
    as_of: datetime | None = None


class CorporateAction(BaseModel):
    symbol: str
    date: str  # ex-date YYYY-MM-DD
    type: Literal["DIVIDEND", "SPLIT"]
    value: Num  # dividend per share, or split ratio (new/old, e.g. 4 for 4:1; 0.1 for 1:10 reverse)
    source: str


class SearchResult(BaseModel):
    title: str
    url: str
    publisher: str | None = None
    published_at: str | None = None
    retrieved_at: datetime
    snippet: str | None = None
    kind: Literal["web", "news", "filing"] = "web"


class ProviderError(Exception):
    """Raised when an upstream data source cannot provide data. Callers must
    surface 'data unavailable' rather than inventing values."""
