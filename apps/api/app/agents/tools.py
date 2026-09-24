"""Tools the agents may call (PRD §14.4). All read-only.

There is deliberately NO execute_trade tool: trades only happen when the
child confirms in the UI.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.db import SessionLocal
from app.providers.types import ProviderError, SearchResult
from app.services import market_data
from app.services.observability import timed
from app.services.portfolio import compute_portfolio

log = logging.getLogger(__name__)

TOOL_SCHEMAS: list[dict] = [
    {"type": "function", "function": {
        "name": "get_quote", "description": "Latest market price, daily change and session for a US stock or ETF ticker.",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string", "description": "e.g. AAPL"}}, "required": ["ticker"]}}},
    {"type": "function", "function": {
        "name": "search_symbol", "description": "Find the ticker symbol for a company name (e.g. 'Nvidia' -> NVDA).",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "get_company_profile", "description": "What a company does: sector, industry, business summary.",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}}, "required": ["ticker"]}}},
    {"type": "function", "function": {
        "name": "get_financials", "description": "Annual revenue, profit, EPS, free cash flow, margins, cash and debt for recent years.",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}, "periods": {"type": "integer", "default": 4}}, "required": ["ticker"]}}},
    {"type": "function", "function": {
        "name": "get_valuation_metrics", "description": "Market cap, P/E, forward P/E, P/S, FCF yield, 52-week range.",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}}, "required": ["ticker"]}}},
    {"type": "function", "function": {
        "name": "get_price_history", "description": "Price history summary for a range (1D,1W,1M,6M,1Y,5Y).",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}, "range": {"type": "string", "default": "1Y"}}, "required": ["ticker"]}}},
    {"type": "function", "function": {
        "name": "search_news", "description": "Recent news articles about a company or topic.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "search_web", "description": "General web search for background information.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "get_portfolio", "description": "The student's own simulated portfolio: cash, positions, P&L.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "get_position", "description": "The student's simulated position in one ticker.",
        "parameters": {"type": "object", "properties": {"ticker": {"type": "string"}}, "required": ["ticker"]}}},
]

TOOL_NAMES = {t["function"]["name"] for t in TOOL_SCHEMAS}


@dataclass
class ToolResult:
    name: str
    args: dict
    ok: bool
    data: Any
    sources: list[dict] = field(default_factory=list)

    def to_message(self) -> str:
        payload = {"ok": self.ok, "data": self.data}
        if self.sources:
            payload["sources"] = self.sources
        if not self.ok:
            payload["instruction"] = "Data unavailable. Tell the student this data could not be retrieved. Do not guess."
        return json.dumps(payload, default=str, ensure_ascii=False)[:12000]


def _src(title: str, url: str | None, publisher: str, kind: str, published_at: str | None = None) -> dict:
    return {"title": title, "url": url, "publisher": publisher, "kind": kind, "published_at": published_at,
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


def _sr(r: SearchResult) -> dict:
    return {"title": r.title, "url": r.url, "publisher": r.publisher, "kind": r.kind, "published_at": r.published_at,
            "retrieved_at": r.retrieved_at.isoformat(), "snippet": (r.snippet or "")[:400]}


def run_tool_sync(name: str, args: dict, profile_id: str | None) -> ToolResult:
    t = (args.get("ticker") or "").upper().strip()
    try:
        with timed(f"tool.{name}"):
            if name == "get_quote":
                q = market_data.get_quote(t)
                return ToolResult(name, args, True, q.model_dump(mode="json"),
                                  [_src(f"{t} quote", f"https://finance.yahoo.com/quote/{t}", q.source, "market", q.timestamp.isoformat())])
            if name == "search_symbol":
                rows = market_data.search_symbols(args.get("query", ""), 5)
                return ToolResult(name, args, True, [r.model_dump() for r in rows])
            if name == "get_company_profile":
                p = market_data.get_company_profile(t)
                d = p.model_dump(mode="json")
                d["summary"] = (d.get("summary") or "")[:1500]
                return ToolResult(name, args, True, d, [_src(f"{p.name} profile", p.source_url, p.source, "fundamentals")])
            if name == "get_financials":
                f = market_data.get_financials(t, int(args.get("periods") or 4))
                return ToolResult(name, args, True, f.model_dump(mode="json"),
                                  [_src(f"{t} annual financial statements", f.source_url, f.source, "fundamentals")])
            if name == "get_valuation_metrics":
                m = market_data.get_metrics(t)
                return ToolResult(name, args, True, m.model_dump(mode="json"),
                                  [_src(f"{t} valuation statistics", m.source_url, m.source, "fundamentals")])
            if name == "get_price_history":
                rng = (args.get("range") or "1Y").upper()
                c = market_data.get_history(t, rng)
                closes = [x.c for x in c]
                data = {"ticker": t, "range": rng, "start": c[0].t.isoformat(), "end": c[-1].t.isoformat(), "first_close": closes[0],
                        "last_close": closes[-1], "high": max(closes), "low": min(closes),
                        "change_pct": round((closes[-1] / closes[0] - 1) * 100, 2) if closes[0] else None}
                return ToolResult(name, args, True, data, [_src(f"{t} price history ({rng})", f"https://finance.yahoo.com/quote/{t}/history", "Yahoo Finance", "market")])
            if name == "search_news":
                rows = market_data.search_news(args.get("query", ""), 6)
                return ToolResult(name, args, True, [_sr(r) for r in rows], [_sr(r) for r in rows])
            if name == "search_web":
                rows = market_data.search_web(args.get("query", ""), 6)
                return ToolResult(name, args, True, [_sr(r) for r in rows], [_sr(r) for r in rows])
            if name in ("get_portfolio", "get_position"):
                if not profile_id:
                    return ToolResult(name, args, False, "no profile")
                with SessionLocal() as db:
                    pf = compute_portfolio(db, profile_id, market_data.get_quote)
                if name == "get_position":
                    pos = next((p for p in pf["positions"] if p["ticker"] == t), None)
                    return ToolResult(name, args, True, pos or {"ticker": t, "quantity": 0})
                slim = {k: pf[k] for k in ("cash", "market_value", "total_equity", "total_pnl", "total_return_pct", "largest_position_pct")}
                slim["positions"] = [{k: p[k] for k in ("ticker", "quantity", "average_cost", "last_price", "unrealized_pnl_pct", "allocation_pct")} for p in pf["positions"]]
                return ToolResult(name, args, True, json.loads(json.dumps(slim, default=str)))
    except ProviderError as e:
        return ToolResult(name, args, False, f"unavailable: {e}")
    except Exception as e:  # never let a tool crash the conversation
        log.warning("tool %s failed: %s", name, e)
        return ToolResult(name, args, False, "unavailable")
    return ToolResult(name, args, False, f"unknown tool {name}")


async def run_tool(name: str, args: dict, profile_id: str | None) -> ToolResult:
    return await asyncio.to_thread(run_tool_sync, name, args, profile_id)
