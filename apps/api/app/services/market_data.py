"""Market data facade with caching (PRD §15.4). All callers go through here."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, TypeVar

from pydantic import BaseModel
from sqlalchemy import delete

from app.config import get_settings
from app.db import SessionLocal
from app.models import MarketDataCache
from app.providers import registry
from app.providers.types import (
    Candle,
    CompanyProfile,
    CorporateAction,
    Financials,
    MarketStatus,
    ProviderError,
    Quote,
    SearchResult,
    SymbolMatch,
    ValuationMetrics,
)
from app.services.observability import incr, timed

log = logging.getLogger(__name__)
T = TypeVar("T")

_mem: dict[str, tuple[float, Any]] = {}
_mem_lock = threading.Lock()


def clear_cache() -> None:
    with _mem_lock:
        _mem.clear()
    try:
        with SessionLocal() as db:
            db.execute(delete(MarketDataCache))
            db.commit()
    except Exception:  # pragma: no cover
        pass


def _cached(key: str, ttl: int, fetch: Callable[[], Any], model: type | None = None, persist: bool = False, many: bool = False):
    now = time.time()
    with _mem_lock:
        hit = _mem.get(key)
        if hit and hit[0] > now:
            return hit[1]
    if persist:
        try:
            with SessionLocal() as db:
                row = db.get(MarketDataCache, key)
                if row and row.expires_at.replace(tzinfo=row.expires_at.tzinfo or timezone.utc) > datetime.now(timezone.utc):
                    val = row.value
                    obj = [model.model_validate(v) for v in val] if (model and many) else (model.model_validate(val) if model else val)
                    with _mem_lock:
                        _mem[key] = (now + ttl, obj)
                    return obj
        except Exception as e:  # cache failures never break data access
            log.debug("cache read failed: %s", e)
    with timed(f"provider.{key.split(':', 1)[0]}"):
        try:
            obj = fetch()
        except ProviderError:
            incr("market_data.failures")
            raise
        except Exception as e:  # normalise unexpected provider errors
            incr("market_data.failures")
            raise ProviderError(str(e)) from e
    with _mem_lock:
        _mem[key] = (now + ttl, obj)
    if persist:
        try:
            val = [o.model_dump(mode="json") for o in obj] if many else (obj.model_dump(mode="json") if isinstance(obj, BaseModel) else obj)
            with SessionLocal() as db:
                db.merge(MarketDataCache(key=key, value=val, expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl)))
                db.commit()
        except Exception as e:
            log.debug("cache write failed: %s", e)
    return obj


def norm(symbol: str) -> str:
    return symbol.strip().upper().replace("$", "")


def get_quote(symbol: str, fresh: bool = False) -> Quote:
    s = get_settings()
    sym = norm(symbol)
    if fresh:
        with _mem_lock:
            _mem.pop(f"quote:{sym}", None)
    return _cached(f"quote:{sym}", s.cache_quote_ttl, lambda: registry.quote_provider().get_quote(sym))


def get_history(symbol: str, range_: str) -> list[Candle]:
    s = get_settings()
    ttl = s.cache_history_intraday_ttl if range_.upper() in ("1D", "1W") else s.cache_history_daily_ttl
    if range_.upper() == "1D":
        ttl = 120
    return _cached(f"history:{norm(symbol)}:{range_.upper()}", ttl,
                   lambda: registry.quote_provider().get_history(norm(symbol), range_), model=Candle, persist=range_.upper() not in ("1D",), many=True)


def get_market_status() -> MarketStatus:
    return _cached("status:US", 60, lambda: registry.quote_provider().get_market_status())


def search_symbols(q: str, limit: int = 8) -> list[SymbolMatch]:
    return _cached(f"symsearch:{q.lower()}:{limit}", 3600, lambda: registry.quote_provider().search_symbols(q, limit))


def get_company_profile(symbol: str) -> CompanyProfile:
    s = get_settings()
    return _cached(f"profile:{norm(symbol)}", s.cache_profile_ttl,
                   lambda: registry.fundamentals_provider().get_company_profile(norm(symbol)), model=CompanyProfile, persist=True)


def get_financials(symbol: str, periods: int = 4) -> Financials:
    s = get_settings()
    return _cached(f"financials:{norm(symbol)}:{periods}", s.cache_fundamentals_ttl,
                   lambda: registry.fundamentals_provider().get_financials(norm(symbol), periods), model=Financials, persist=True)


def get_metrics(symbol: str) -> ValuationMetrics:
    s = get_settings()
    return _cached(f"metrics:{norm(symbol)}", min(s.cache_fundamentals_ttl, 3600),
                   lambda: registry.fundamentals_provider().get_metrics(norm(symbol)), model=ValuationMetrics, persist=True)


def get_corporate_actions(symbol: str, since: str | None = None) -> list[CorporateAction]:
    return _cached(f"actions:{norm(symbol)}:{since}", 6 * 3600,
                   lambda: registry.fundamentals_provider().get_corporate_actions(norm(symbol), since))


def get_company_news(symbol: str, limit: int = 8) -> list[SearchResult]:
    return _cached(f"cnews:{norm(symbol)}:{limit}", get_settings().cache_search_ttl,
                   lambda: registry.fundamentals_provider().get_company_news(norm(symbol), limit))


def get_filings(symbol: str, limit: int = 3) -> list[SearchResult]:
    return _cached(f"filings:{norm(symbol)}:{limit}", 24 * 3600,
                   lambda: registry.fundamentals_provider().get_filings(norm(symbol), limit), model=SearchResult, persist=True, many=True)


def search_web(q: str, limit: int = 6) -> list[SearchResult]:
    return _cached(f"web:{q}:{limit}", get_settings().cache_search_ttl, lambda: registry.search_provider().search_web(q, limit))


def search_news(q: str, limit: int = 6) -> list[SearchResult]:
    return _cached(f"news:{q}:{limit}", get_settings().cache_search_ttl, lambda: registry.search_provider().search_news(q, limit))
