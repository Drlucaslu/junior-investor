"""Deterministic offline providers for tests and local development without
network. Values are illustrative only and clearly labelled as mock data."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.providers.base import FundamentalsProvider, QuoteProvider, SearchProvider
from app.providers.types import (
    Candle,
    CompanyProfile,
    CorporateAction,
    FinancialPeriod,
    Financials,
    MarketStatus,
    ProviderError,
    Quote,
    SearchResult,
    SymbolMatch,
    ValuationMetrics,
)
from app.providers.market.yahoo import _derive

SOURCE = "Mock Data (offline)"

UNIVERSE: dict[str, dict] = {
    "AAPL": {"name": "Apple Inc.", "price": "200", "type": "EQUITY", "sector": "Technology", "rev": 390e9},
    "MSFT": {"name": "Microsoft Corporation", "price": "420", "type": "EQUITY", "sector": "Technology", "rev": 250e9},
    "NVDA": {"name": "NVIDIA Corporation", "price": "120", "type": "EQUITY", "sector": "Technology", "rev": 130e9},
    "TSLA": {"name": "Tesla, Inc.", "price": "250", "type": "EQUITY", "sector": "Consumer Cyclical", "rev": 97e9},
    "COST": {"name": "Costco Wholesale Corporation", "price": "900", "type": "EQUITY", "sector": "Consumer Defensive", "rev": 254e9},
    "GOOGL": {"name": "Alphabet Inc.", "price": "170", "type": "EQUITY", "sector": "Communication Services", "rev": 350e9},
    "KO": {"name": "The Coca-Cola Company", "price": "65", "type": "EQUITY", "sector": "Consumer Defensive", "rev": 46e9},
    "SPY": {"name": "SPDR S&P 500 ETF Trust", "price": "550", "type": "ETF", "sector": None, "rev": None},
    "QQQ": {"name": "Invesco QQQ Trust", "price": "480", "type": "ETF", "sector": None, "rev": None},
}


class MockQuoteProvider(QuoteProvider):
    name = "mock"

    def __init__(self):
        self.prices: dict[str, Decimal] = {k: Decimal(v["price"]) for k, v in UNIVERSE.items()}
        self.session = "regular"
        self.fail = False

    def set_price(self, symbol: str, price) -> None:
        self.prices[symbol.upper()] = Decimal(str(price))

    def get_quote(self, symbol: str) -> Quote:
        sym = symbol.upper()
        if self.fail:
            raise ProviderError("mock outage")
        if sym not in self.prices:
            raise ProviderError(f"unknown symbol {sym}")
        p = self.prices[sym]
        prev = Decimal(UNIVERSE.get(sym, {}).get("price", str(p)))
        chg = p - prev
        return Quote(symbol=sym, price=p, previous_close=prev, change=chg,
                     change_pct=(chg / prev * 100).quantize(Decimal("0.01")) if prev else None,
                     timestamp=datetime.now(timezone.utc), session=self.session, delayed_seconds=0,
                     name=UNIVERSE.get(sym, {}).get("name", sym), source=SOURCE)

    def get_history(self, symbol: str, range_: str) -> list[Candle]:
        sym = symbol.upper()
        if sym not in self.prices:
            raise ProviderError("unknown symbol")
        n = {"1D": 78, "1W": 65, "1M": 22, "6M": 126, "1Y": 252, "5Y": 260}.get(range_.upper(), 252)
        step = {"1D": timedelta(minutes=5), "1W": timedelta(minutes=30), "5Y": timedelta(weeks=1)}.get(range_.upper(), timedelta(days=1))
        end = float(self.prices[sym])
        now = datetime.now(timezone.utc)
        seed = sum(ord(c) for c in sym)
        out = []
        for i in range(n):
            x = i / max(n - 1, 1)
            c = end * (0.8 + 0.2 * x) * (1 + 0.03 * math.sin(i / 5 + seed))
            out.append(Candle(t=now - step * (n - 1 - i), c=round(c, 2)))
        out[-1] = Candle(t=now, c=end)
        return out

    def get_market_status(self) -> MarketStatus:
        status = {"regular": "OPEN", "premarket": "PREMARKET", "afterhours": "AFTERHOURS"}.get(self.session, "CLOSED")
        return MarketStatus(status=status, session=self.session, as_of=datetime.now(timezone.utc), source=SOURCE)  # type: ignore[arg-type]

    def search_symbols(self, query: str, limit: int = 8) -> list[SymbolMatch]:
        q = query.lower()
        return [SymbolMatch(symbol=s, name=v["name"], exchange="NASDAQ", type=v["type"])
                for s, v in UNIVERSE.items() if q in s.lower() or q in v["name"].lower()][:limit]


class MockFundamentalsProvider(FundamentalsProvider):
    name = "mock"

    def __init__(self):
        self.actions: dict[str, list[CorporateAction]] = {}
        self.fail = False

    def _check(self, symbol: str) -> dict:
        if self.fail:
            raise ProviderError("mock outage")
        u = UNIVERSE.get(symbol.upper())
        if not u:
            raise ProviderError("unknown symbol")
        return u

    def get_company_profile(self, symbol: str) -> CompanyProfile:
        u = self._check(symbol)
        return CompanyProfile(symbol=symbol.upper(), name=u["name"], exchange="NASDAQ", quote_type=u["type"], sector=u["sector"],
                              summary=f"{u['name']} (mock profile for offline development).", source=SOURCE)

    def get_financials(self, symbol: str, periods: int = 4) -> Financials:
        u = self._check(symbol)
        if not u["rev"]:
            raise ProviderError("no financial statements for ETF")
        ps = []
        for i in range(periods):
            rev = u["rev"] * (0.8 + 0.07 * i)
            ps.append(FinancialPeriod(period_end=f"{2022 + i}-12-31", fiscal_year=2022 + i, revenue=rev, gross_profit=rev * 0.45,
                                      operating_income=rev * 0.3, net_income=rev * 0.24, eps_diluted=round(6 + i * 0.5, 2),
                                      operating_cash_flow=rev * 0.3, capex=-rev * 0.03, free_cash_flow=rev * 0.27,
                                      cash=rev * 0.2, total_debt=rev * 0.25))
        _derive(ps)
        return Financials(symbol=symbol.upper(), periods=ps, source=SOURCE)

    def get_metrics(self, symbol: str) -> ValuationMetrics:
        u = self._check(symbol)
        price = float(u["price"])
        mcap = u["rev"] * 7 if u["rev"] else 5e11
        return ValuationMetrics(symbol=symbol.upper(), price=price, market_cap=mcap, pe_ttm=28.5, pe_forward=25.1, ps_ttm=7.0,
                                fcf_ttm=(u["rev"] or 0) * 0.27 or None, fcf_yield=0.035 if u["rev"] else None, eps_ttm=7.0,
                                week52_high=price * 1.15, week52_low=price * 0.75, source=SOURCE, as_of=datetime.now(timezone.utc))

    def get_corporate_actions(self, symbol: str, since: str | None = None) -> list[CorporateAction]:
        acts = self.actions.get(symbol.upper(), [])
        return [a for a in acts if not since or a.date > since]

    def get_company_news(self, symbol: str, limit: int = 8) -> list[SearchResult]:
        return [SearchResult(title=f"{symbol.upper()} mock headline {i + 1}", url=f"https://example.com/news/{symbol.lower()}/{i}",
                             publisher="Example News", published_at="2026-09-01", retrieved_at=datetime.now(timezone.utc),
                             snippet="Mock news item for offline development.", kind="news") for i in range(min(limit, 3))]


class MockSearchProvider(SearchProvider):
    name = "mock"

    def search_web(self, query: str, limit: int = 6) -> list[SearchResult]:
        return [SearchResult(title=f"Result about {query}", url="https://example.com/article", publisher="example.com",
                             retrieved_at=datetime.now(timezone.utc), snippet="Mock search result.", kind="web")]

    def search_news(self, query: str, limit: int = 6) -> list[SearchResult]:
        return [SearchResult(title=f"News about {query}", url="https://example.com/news", publisher="example.com",
                             published_at="2026-09-01", retrieved_at=datetime.now(timezone.utc), snippet="Mock news.", kind="news")]
