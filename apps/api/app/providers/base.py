"""Provider interfaces (PRD §15). Implementations are synchronous; async code
calls them through `asyncio.to_thread`."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.providers.types import (
    Candle,
    CompanyProfile,
    CorporateAction,
    Financials,
    MarketStatus,
    Quote,
    SearchResult,
    SymbolMatch,
    ValuationMetrics,
)


class QuoteProvider(ABC):
    name: str = "base"

    @abstractmethod
    def get_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    def get_history(self, symbol: str, range_: str) -> list[Candle]: ...

    @abstractmethod
    def get_market_status(self) -> MarketStatus: ...

    @abstractmethod
    def search_symbols(self, query: str, limit: int = 8) -> list[SymbolMatch]: ...


class FundamentalsProvider(ABC):
    name: str = "base"

    @abstractmethod
    def get_company_profile(self, symbol: str) -> CompanyProfile: ...

    @abstractmethod
    def get_financials(self, symbol: str, periods: int = 4) -> Financials: ...

    @abstractmethod
    def get_metrics(self, symbol: str) -> ValuationMetrics: ...

    @abstractmethod
    def get_corporate_actions(self, symbol: str, since: str | None = None) -> list[CorporateAction]: ...

    def get_company_news(self, symbol: str, limit: int = 8) -> list[SearchResult]:
        return []

    def get_filings(self, symbol: str, limit: int = 3) -> list[SearchResult]:
        return []


class SearchProvider(ABC):
    name: str = "base"

    @abstractmethod
    def search_web(self, query: str, limit: int = 6) -> list[SearchResult]: ...

    @abstractmethod
    def search_news(self, query: str, limit: int = 6) -> list[SearchResult]: ...
