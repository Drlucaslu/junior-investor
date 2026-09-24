"""Provider registry: builds providers from settings. Tests call `override()`."""
from __future__ import annotations

from app.config import get_settings
from app.providers.base import FundamentalsProvider, QuoteProvider, SearchProvider
from app.providers.llm.base import LLMProvider

_instances: dict[str, object] = {}


def _build(kind: str):
    s = get_settings()
    if kind == "quote":
        if s.market_data_provider == "mock":
            from app.providers.mock import MockQuoteProvider

            return MockQuoteProvider()
        from app.providers.market.yahoo import YahooQuoteProvider

        return YahooQuoteProvider()
    if kind == "fundamentals":
        if s.fundamentals_provider == "mock":
            from app.providers.mock import MockFundamentalsProvider

            return MockFundamentalsProvider()
        from app.providers.market.yahoo import YahooFundamentalsProvider

        return YahooFundamentalsProvider()
    if kind == "search":
        from app.providers.search import providers as sp

        if s.search_provider == "mock":
            from app.providers.mock import MockSearchProvider

            return MockSearchProvider()
        if s.search_provider == "tavily":
            return sp.TavilySearchProvider(s.search_api_key)
        if s.search_provider == "brave":
            return sp.BraveSearchProvider(s.search_api_key)
        return sp.DuckDuckGoSearchProvider()
    if kind == "llm":
        if s.llm_provider == "mock":
            from app.providers.llm.mock import MockLLMProvider

            return MockLLMProvider()
        from app.providers.llm.openai_compat import OpenAICompatibleProvider
        from app.services import ai_config
        from app.services.observability import record_llm_metric

        # Parent-chosen settings (local Olares model or a cloud provider) override env.
        c = ai_config.load()
        return OpenAICompatibleProvider(c.base_url, c.model, c.api_key, c.temperature, s.llm_max_tokens,
                                        s.llm_timeout, metrics_hook=record_llm_metric,
                                        retry_seconds=s.llm_retry_seconds if not ai_config.is_cloud(c) else 20)
    raise KeyError(kind)


def _get(kind: str):
    if kind not in _instances:
        _instances[kind] = _build(kind)
    return _instances[kind]


def quote_provider() -> QuoteProvider:
    return _get("quote")  # type: ignore[return-value]


def fundamentals_provider() -> FundamentalsProvider:
    return _get("fundamentals")  # type: ignore[return-value]


def search_provider() -> SearchProvider:
    return _get("search")  # type: ignore[return-value]


def llm_provider() -> LLMProvider:
    return _get("llm")  # type: ignore[return-value]


def reset_llm() -> None:
    _instances.pop("llm", None)


def override(kind: str, instance: object) -> None:
    _instances[kind] = instance


def reset() -> None:
    _instances.clear()
