from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from app.api.deps import err
from app.providers.types import ProviderError
from app.services import market_data

router = APIRouter(prefix="/market")


async def _call(fn, *args):
    try:
        return await run_in_threadpool(fn, *args)
    except ProviderError as e:
        raise err(503, "MARKET_DATA_UNAVAILABLE", error=str(e)[:200]) from e


@router.get("/status")
async def status():
    return await _call(market_data.get_market_status)


@router.get("/quote/{symbol}")
async def quote(symbol: str):
    return await _call(market_data.get_quote, symbol)


@router.get("/quotes")
async def quotes(symbols: str = Query(..., max_length=400)):
    out = {}
    for s in [x for x in symbols.split(",") if x.strip()][:40]:
        try:
            out[market_data.norm(s)] = await run_in_threadpool(market_data.get_quote, s)
        except ProviderError:
            out[market_data.norm(s)] = None
    return out


@router.get("/history/{symbol}")
async def history(symbol: str, range: str = Query("1Y", pattern="^(1D|1W|1M|6M|1Y|5Y)$")):  # noqa: A002
    return {"symbol": market_data.norm(symbol), "range": range, "candles": await _call(market_data.get_history, symbol, range)}


@router.get("/company/{symbol}")
async def company(symbol: str):
    return await _call(market_data.get_company_profile, symbol)


@router.get("/financials/{symbol}")
async def financials(symbol: str, periods: int = Query(5, ge=1, le=8)):
    return await _call(market_data.get_financials, symbol, periods)


@router.get("/metrics/{symbol}")
async def metrics(symbol: str):
    return await _call(market_data.get_metrics, symbol)


@router.get("/search")
async def search(q: str = Query(..., min_length=1, max_length=60)):
    return await _call(market_data.search_symbols, q, 8)
