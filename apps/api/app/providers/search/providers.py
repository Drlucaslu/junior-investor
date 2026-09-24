"""Web / news search adapters."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from app.providers.base import SearchProvider
from app.providers.types import ProviderError, SearchResult

log = logging.getLogger(__name__)


def _host(url: str) -> str | None:
    try:
        return urlparse(url).netloc.removeprefix("www.") or None
    except Exception:
        return None


class DuckDuckGoSearchProvider(SearchProvider):
    """Keyless search via the `ddgs` package. Good enough for a family app;
    swap to Tavily/Brave with an API key for higher reliability."""

    name = "duckduckgo"

    def _ddgs(self):
        from ddgs import DDGS

        return DDGS()

    def search_web(self, query: str, limit: int = 6) -> list[SearchResult]:
        now = datetime.now(timezone.utc)
        try:
            rows = self._ddgs().text(query, max_results=limit, safesearch="strict") or []
        except Exception as e:
            raise ProviderError(f"web search failed: {e}") from e
        return [
            SearchResult(title=r.get("title", ""), url=r.get("href") or r.get("url", ""), publisher=_host(r.get("href", "")),
                         retrieved_at=now, snippet=r.get("body"), kind="web")
            for r in rows if (r.get("href") or r.get("url"))
        ]

    def search_news(self, query: str, limit: int = 6) -> list[SearchResult]:
        now = datetime.now(timezone.utc)
        try:
            rows = self._ddgs().news(query, max_results=limit, safesearch="strict") or []
        except Exception as e:
            raise ProviderError(f"news search failed: {e}") from e
        return [
            SearchResult(title=r.get("title", ""), url=r.get("url", ""), publisher=r.get("source") or _host(r.get("url", "")),
                         published_at=r.get("date"), retrieved_at=now, snippet=r.get("body"), kind="news")
            for r in rows if r.get("url")
        ]


class TavilySearchProvider(SearchProvider):
    name = "tavily"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("SEARCH_API_KEY required for tavily")
        self.api_key = api_key

    def _search(self, query: str, limit: int, topic: str) -> list[SearchResult]:
        now = datetime.now(timezone.utc)
        try:
            r = httpx.post("https://api.tavily.com/search", timeout=30, json={
                "api_key": self.api_key, "query": query, "max_results": limit, "topic": topic, "search_depth": "basic"})
            r.raise_for_status()
        except Exception as e:
            raise ProviderError(f"tavily failed: {e}") from e
        return [
            SearchResult(title=x.get("title", ""), url=x["url"], publisher=_host(x["url"]), published_at=x.get("published_date"),
                         retrieved_at=now, snippet=x.get("content"), kind="news" if topic == "news" else "web")
            for x in r.json().get("results", []) if x.get("url")
        ]

    def search_web(self, query: str, limit: int = 6) -> list[SearchResult]:
        return self._search(query, limit, "general")

    def search_news(self, query: str, limit: int = 6) -> list[SearchResult]:
        return self._search(query, limit, "news")


class BraveSearchProvider(SearchProvider):
    name = "brave"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("SEARCH_API_KEY required for brave")
        self.api_key = api_key

    def _get(self, path: str, query: str, limit: int) -> dict:
        try:
            r = httpx.get(f"https://api.search.brave.com/res/v1/{path}", timeout=20,
                          headers={"X-Subscription-Token": self.api_key, "Accept": "application/json"},
                          params={"q": query, "count": limit, "safesearch": "strict"})
            r.raise_for_status()
            return r.json()
        except Exception as e:
            raise ProviderError(f"brave failed: {e}") from e

    def search_web(self, query: str, limit: int = 6) -> list[SearchResult]:
        now = datetime.now(timezone.utc)
        data = self._get("web/search", query, limit)
        return [SearchResult(title=x.get("title", ""), url=x["url"], publisher=_host(x["url"]), published_at=x.get("age"),
                             retrieved_at=now, snippet=x.get("description"), kind="web")
                for x in data.get("web", {}).get("results", []) if x.get("url")]

    def search_news(self, query: str, limit: int = 6) -> list[SearchResult]:
        now = datetime.now(timezone.utc)
        data = self._get("news/search", query, limit)
        return [SearchResult(title=x.get("title", ""), url=x["url"], publisher=(x.get("meta_url") or {}).get("hostname"),
                             published_at=x.get("age"), retrieved_at=now, snippet=x.get("description"), kind="news")
                for x in data.get("results", []) if x.get("url")]
