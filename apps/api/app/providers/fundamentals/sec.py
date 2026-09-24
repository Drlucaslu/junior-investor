"""SEC EDGAR helpers: links to a company's latest official filings (10-K / 10-Q)
so research reports can cite primary sources. Free, no API key; SEC requires a
descriptive User-Agent (SEC_USER_AGENT)."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.providers.types import SearchResult

log = logging.getLogger(__name__)
_lock = threading.Lock()
_ticker_map: dict[str, int] = {}
_ticker_map_at = 0.0


def _client() -> httpx.Client:
    return httpx.Client(timeout=15, headers={"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip"})


def _cik(symbol: str) -> int | None:
    global _ticker_map_at
    with _lock:
        if not _ticker_map or time.time() - _ticker_map_at > 7 * 86400:
            with _client() as c:
                r = c.get("https://www.sec.gov/files/company_tickers.json")
                r.raise_for_status()
                _ticker_map.clear()
                for row in r.json().values():
                    _ticker_map[str(row["ticker"]).upper()] = int(row["cik_str"])
                _ticker_map_at = time.time()
    return _ticker_map.get(symbol.upper().replace(".", "-"))


def sec_recent_filings(symbol: str, limit: int = 3) -> list[SearchResult]:
    try:
        cik = _cik(symbol)
        if not cik:
            return []
        with _client() as c:
            r = c.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
            r.raise_for_status()
            data = r.json()
    except Exception as e:  # network failures are non-fatal for research
        log.info("SEC filings unavailable for %s: %s", symbol, e)
        return []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    out: list[SearchResult] = []
    now = datetime.now(timezone.utc)
    for i, form in enumerate(forms):
        if form not in ("10-K", "10-Q", "20-F", "40-F"):
            continue
        acc = recent["accessionNumber"][i].replace("-", "")
        doc = recent["primaryDocument"][i]
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}"
        period = recent.get("reportDate", [""] * len(forms))[i]
        out.append(
            SearchResult(
                title=f"{data.get('name', symbol)} — Form {form} (period {period})",
                url=url,
                publisher="U.S. SEC EDGAR",
                published_at=recent["filingDate"][i],
                retrieved_at=now,
                snippet=f"Official {form} filing for fiscal period ending {period}.",
                kind="filing",
            )
        )
        if len(out) >= limit:
            break
    return out
