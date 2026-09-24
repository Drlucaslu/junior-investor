"""Yahoo Finance adapter (via the `yfinance` library). No API key needed.

Quotes from Yahoo are typically real-time for US equities on the regular
session and may be delayed; we always record timestamp + source so the
simulation can show exactly which price was used.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.providers.base import FundamentalsProvider, QuoteProvider
from app.providers.market.clock import us_market_session
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

log = logging.getLogger(__name__)

SOURCE = "Yahoo Finance"

RANGE_MAP: dict[str, tuple[str, str]] = {
    "1D": ("1d", "5m"),
    "1W": ("5d", "30m"),
    "1M": ("1mo", "1d"),
    "6M": ("6mo", "1d"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
}

US_EXCHANGES = {"NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS", "NASDAQ", "NYSE", "NYSEArca", "AMEX", "NAS", "CBOE", "BATS"}


def _yf():
    import yfinance as yf  # imported lazily so tests don't need network

    return yf


def _num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _dec(v: Any) -> Decimal | None:
    f = _num(v)
    return None if f is None else Decimal(str(round(f, 6)))


class YahooQuoteProvider(QuoteProvider):
    name = "yahoo"

    def get_quote(self, symbol: str) -> Quote:
        yf = _yf()
        sym = symbol.upper()
        try:
            t = yf.Ticker(sym)
            info = t.info or {}
        except Exception as e:  # network / parsing errors
            raise ProviderError(f"quote unavailable for {sym}: {e}") from e

        state = (info.get("marketState") or "").upper()
        regular = _num(info.get("regularMarketPrice")) or _num(info.get("currentPrice"))
        prev = _num(info.get("regularMarketPreviousClose")) or _num(info.get("previousClose"))
        ts_raw = info.get("regularMarketTime")
        price, session = regular, "regular"
        if state.startswith("PRE") and _num(info.get("preMarketPrice")):
            price, session = _num(info.get("preMarketPrice")), "premarket"
            ts_raw = info.get("preMarketTime") or ts_raw
        elif state.startswith("POST") and _num(info.get("postMarketPrice")):
            price, session = _num(info.get("postMarketPrice")), "afterhours"
            ts_raw = info.get("postMarketTime") or ts_raw
        elif state and state not in ("REGULAR",):
            session = "closed"

        if price is None:
            try:
                fi = t.fast_info
                price = _num(fi.get("lastPrice") if hasattr(fi, "get") else fi.last_price)
                prev = prev or _num(fi.get("previousClose") if hasattr(fi, "get") else fi.previous_close)
            except Exception:  # pragma: no cover - network
                price = None
        if price is None or price <= 0:
            raise ProviderError(f"no price for {sym}")

        if isinstance(ts_raw, (int, float)):
            ts = datetime.fromtimestamp(ts_raw, tz=timezone.utc)
        else:
            ts = datetime.now(timezone.utc)
        if not state:
            session = us_market_session(datetime.now(timezone.utc))
        change = (price - prev) if prev else None
        change_pct = (change / prev * 100) if (prev and change is not None) else None
        return Quote(
            symbol=sym,
            price=Decimal(str(round(price, 4))),
            bid=_dec(info.get("bid")) or None,
            ask=_dec(info.get("ask")) or None,
            previous_close=_dec(prev),
            change=_dec(change),
            change_pct=_dec(change_pct),
            timestamp=ts,
            session=session,  # type: ignore[arg-type]
            delayed_seconds=(int(info["exchangeDataDelayedBy"]) * 60) if info.get("exchangeDataDelayedBy") else 0,
            currency=info.get("currency") or "USD",
            name=info.get("shortName") or info.get("longName"),
            source=SOURCE,
        )

    def get_history(self, symbol: str, range_: str) -> list[Candle]:
        yf = _yf()
        period, interval = RANGE_MAP.get(range_.upper(), RANGE_MAP["1Y"])
        try:
            df = yf.Ticker(symbol.upper()).history(period=period, interval=interval, auto_adjust=True)
        except Exception as e:
            raise ProviderError(f"history unavailable: {e}") from e
        if df is None or df.empty:
            raise ProviderError("empty history")
        out: list[Candle] = []
        for idx, row in df.iterrows():
            c = _num(row.get("Close"))
            if c is None:
                continue
            ts = idx.to_pydatetime()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            out.append(
                Candle(t=ts, o=_num(row.get("Open")), h=_num(row.get("High")), l=_num(row.get("Low")), c=c, v=_num(row.get("Volume")))
            )
        return out

    def get_market_status(self) -> MarketStatus:
        now = datetime.now(timezone.utc)
        session = us_market_session(now)
        try:
            state = ((_yf().Ticker("SPY").info or {}).get("marketState") or "").upper()
            if state == "REGULAR":
                session = "regular"
            elif state.startswith("PRE"):
                session = "premarket"
            elif state.startswith("POST"):
                session = "afterhours"
            elif state:
                session = "closed"
        except Exception:  # pragma: no cover - network
            pass
        status = {"regular": "OPEN", "premarket": "PREMARKET", "afterhours": "AFTERHOURS"}.get(session, "CLOSED")
        return MarketStatus(status=status, session=session, as_of=now, source=SOURCE)  # type: ignore[arg-type]

    def search_symbols(self, query: str, limit: int = 8) -> list[SymbolMatch]:
        yf = _yf()
        try:
            quotes = yf.Search(query, max_results=limit * 2, news_count=0).quotes
        except Exception as e:
            raise ProviderError(f"search unavailable: {e}") from e
        out: list[SymbolMatch] = []
        for q in quotes or []:
            qt = (q.get("quoteType") or "").upper()
            exch = q.get("exchange") or q.get("exchDisp")
            sym = q.get("symbol") or ""
            if qt not in ("EQUITY", "ETF") or "." in sym or "=" in sym:
                continue
            if exch and exch not in US_EXCHANGES and q.get("exchDisp") not in US_EXCHANGES:
                continue
            out.append(SymbolMatch(symbol=sym, name=q.get("longname") or q.get("shortname") or sym, exchange=q.get("exchDisp") or exch, type=qt))
            if len(out) >= limit:
                break
        return out


def _row(df, *names: str):
    if df is None or getattr(df, "empty", True):
        return {}
    for n in names:
        if n in df.index:
            return df.loc[n]
    return {}


class YahooFundamentalsProvider(FundamentalsProvider):
    name = "yahoo"

    def _ticker(self, symbol: str):
        return _yf().Ticker(symbol.upper())

    def get_company_profile(self, symbol: str) -> CompanyProfile:
        sym = symbol.upper()
        try:
            info = self._ticker(sym).info or {}
        except Exception as e:
            raise ProviderError(f"profile unavailable: {e}") from e
        name = info.get("longName") or info.get("shortName")
        if not name:
            raise ProviderError(f"unknown symbol {sym}")
        return CompanyProfile(
            symbol=sym,
            name=name,
            exchange=info.get("fullExchangeName") or info.get("exchange"),
            quote_type=(info.get("quoteType") or "").upper() or None,
            sector=info.get("sector"),
            industry=info.get("industry"),
            country=info.get("country"),
            website=info.get("website"),
            employees=info.get("fullTimeEmployees"),
            summary=info.get("longBusinessSummary"),
            currency=info.get("financialCurrency") or info.get("currency") or "USD",
            source=SOURCE,
            source_url=f"https://finance.yahoo.com/quote/{sym}/profile",
        )

    def get_financials(self, symbol: str, periods: int = 4) -> Financials:
        sym = symbol.upper()
        try:
            t = self._ticker(sym)
            inc, cf, bs = t.income_stmt, t.cashflow, t.balance_sheet
        except Exception as e:
            raise ProviderError(f"financials unavailable: {e}") from e
        if inc is None or inc.empty:
            raise ProviderError("no income statement")
        cols = sorted(list(inc.columns))[-periods:]
        rows = {
            "revenue": _row(inc, "Total Revenue", "Operating Revenue"),
            "gross_profit": _row(inc, "Gross Profit"),
            "operating_income": _row(inc, "Operating Income", "EBIT"),
            "net_income": _row(inc, "Net Income", "Net Income Common Stockholders"),
            "eps_diluted": _row(inc, "Diluted EPS", "Basic EPS"),
            "operating_cash_flow": _row(cf, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities"),
            "capex": _row(cf, "Capital Expenditure"),
            "free_cash_flow": _row(cf, "Free Cash Flow"),
            "cash": _row(bs, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"),
            "total_debt": _row(bs, "Total Debt"),
        }
        out: list[FinancialPeriod] = []
        for col in cols:
            vals = {}
            for k, r in rows.items():
                try:
                    vals[k] = _num(r.get(col)) if hasattr(r, "get") else None
                except Exception:
                    vals[k] = None
            if vals.get("free_cash_flow") is None and vals.get("operating_cash_flow") is not None and vals.get("capex") is not None:
                vals["free_cash_flow"] = vals["operating_cash_flow"] + vals["capex"]  # capex is negative in Yahoo data
            d = col.to_pydatetime() if hasattr(col, "to_pydatetime") else col
            out.append(FinancialPeriod(period_end=d.strftime("%Y-%m-%d"), fiscal_year=d.year, **vals))
        _derive(out)
        return Financials(
            symbol=sym, periods=out, source=SOURCE, source_url=f"https://finance.yahoo.com/quote/{sym}/financials"
        )

    def get_metrics(self, symbol: str) -> ValuationMetrics:
        sym = symbol.upper()
        try:
            info = self._ticker(sym).info or {}
        except Exception as e:
            raise ProviderError(f"metrics unavailable: {e}") from e
        if not info:
            raise ProviderError("no metrics")
        mcap = _num(info.get("marketCap"))
        fcf = _num(info.get("freeCashflow"))
        dy = _num(info.get("dividendYield"))
        if dy is not None and dy > 1:  # yfinance>=0.2.5x returns percent units for dividendYield
            dy = dy / 100
        return ValuationMetrics(
            symbol=sym,
            price=_num(info.get("regularMarketPrice")) or _num(info.get("currentPrice")),
            market_cap=mcap,
            pe_ttm=_num(info.get("trailingPE")),
            pe_forward=_num(info.get("forwardPE")),
            ps_ttm=_num(info.get("priceToSalesTrailing12Months")),
            pb=_num(info.get("priceToBook")),
            fcf_ttm=fcf,
            fcf_yield=(fcf / mcap) if (fcf is not None and mcap) else None,
            eps_ttm=_num(info.get("trailingEps")),
            dividend_yield=dy,
            beta=_num(info.get("beta")),
            week52_high=_num(info.get("fiftyTwoWeekHigh")),
            week52_low=_num(info.get("fiftyTwoWeekLow")),
            revenue_ttm=_num(info.get("totalRevenue")),
            net_income_ttm=_num(info.get("netIncomeToCommon")),
            source=SOURCE,
            source_url=f"https://finance.yahoo.com/quote/{sym}/key-statistics",
            as_of=datetime.now(timezone.utc),
        )

    def get_corporate_actions(self, symbol: str, since: str | None = None) -> list[CorporateAction]:
        sym = symbol.upper()
        try:
            actions = self._ticker(sym).actions
        except Exception as e:
            raise ProviderError(f"corporate actions unavailable: {e}") from e
        out: list[CorporateAction] = []
        if actions is None or actions.empty:
            return out
        for idx, row in actions.iterrows():
            d = idx.to_pydatetime().strftime("%Y-%m-%d")
            if since and d <= since:
                continue
            div = _num(row.get("Dividends"))
            split = _num(row.get("Stock Splits"))
            if div:
                out.append(CorporateAction(symbol=sym, date=d, type="DIVIDEND", value=Decimal(str(div)), source=SOURCE))
            if split:
                out.append(CorporateAction(symbol=sym, date=d, type="SPLIT", value=Decimal(str(split)), source=SOURCE))
        return out

    def get_company_news(self, symbol: str, limit: int = 8) -> list[SearchResult]:
        try:
            items = self._ticker(symbol).news or []
        except Exception:
            return []
        now = datetime.now(timezone.utc)
        out: list[SearchResult] = []
        for it in items[:limit]:
            c = it.get("content") or it
            title = c.get("title")
            url = (c.get("canonicalUrl") or {}).get("url") if isinstance(c.get("canonicalUrl"), dict) else c.get("link")
            url = url or ((c.get("clickThroughUrl") or {}).get("url") if isinstance(c.get("clickThroughUrl"), dict) else None)
            if not title or not url:
                continue
            pub = c.get("pubDate")
            if not pub and it.get("providerPublishTime"):
                pub = datetime.fromtimestamp(it["providerPublishTime"], tz=timezone.utc).isoformat()
            provider = c.get("provider") if isinstance(c.get("provider"), dict) else {}
            out.append(
                SearchResult(
                    title=title,
                    url=url,
                    publisher=provider.get("displayName") or it.get("publisher"),
                    published_at=pub,
                    retrieved_at=now,
                    snippet=c.get("summary") or c.get("description"),
                    kind="news",
                )
            )
        return out

    def get_filings(self, symbol: str, limit: int = 3) -> list[SearchResult]:
        from app.providers.fundamentals.sec import sec_recent_filings

        return sec_recent_filings(symbol, limit=limit)


def _derive(periods: list[FinancialPeriod]) -> None:
    prev: FinancialPeriod | None = None
    for p in periods:
        if p.revenue:
            if p.gross_profit is not None:
                p.gross_margin = p.gross_profit / p.revenue
            if p.operating_income is not None:
                p.operating_margin = p.operating_income / p.revenue
            if p.net_income is not None:
                p.net_margin = p.net_income / p.revenue
            if prev and prev.revenue:
                p.revenue_growth = p.revenue / prev.revenue - 1
        prev = p
