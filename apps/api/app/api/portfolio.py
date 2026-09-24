"""Portfolio, trades, watchlist and journal endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import err, get_profile
from app.api.schemas import JournalIn, TradeIn, WatchIn
from app.db import get_db
from app.models import ChildProfile, JournalEntry, LedgerEntry, ResearchReport, Trade, WatchlistItem
from app.providers.types import ProviderError
from app.services import market_data
from app.services.corporate_actions import apply_corporate_actions
from app.services.observability import incr, timed
from app.services.portfolio import compute_portfolio, current_account
from app.services.trading import TradeRejected, execute_trade, preview_trade

log = logging.getLogger(__name__)
router = APIRouter(prefix="/profiles/{profile_id}")


def trade_out(t: Trade) -> dict:
    return {c.name: getattr(t, c.name) for c in Trade.__table__.columns}


@router.get("/portfolio")
def portfolio(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    try:
        apply_corporate_actions(db, p)
    except Exception as e:  # never block the portfolio view
        log.warning("corporate action check failed: %s", e)
    with timed("api.portfolio"):
        return compute_portfolio(db, p.id, market_data.get_quote)


@router.get("/positions")
def positions(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    return compute_portfolio(db, p.id, market_data.get_quote)["positions"]


@router.get("/trades")
def trades(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), symbol: str | None = None,
           include_rejected: bool = False, limit: int = Query(200, le=1000)):
    stmt = select(Trade).where(Trade.profile_id == p.id)
    if not include_rejected:
        stmt = stmt.where(Trade.status == "EXECUTED")
    if symbol:
        stmt = stmt.where(Trade.symbol == market_data.norm(symbol))
    return [trade_out(t) for t in db.scalars(stmt.order_by(desc(Trade.requested_at)).limit(limit))]


@router.get("/ledger")
def ledger(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), all_epochs: bool = False):
    acct = current_account(db, p.id)
    stmt = select(LedgerEntry).where(LedgerEntry.profile_id == p.id)
    if not all_epochs:
        stmt = stmt.where(LedgerEntry.epoch == acct.epoch)
    rows = db.scalars(stmt.order_by(desc(LedgerEntry.timestamp), desc(LedgerEntry.seq)).limit(1000))
    return [{c.name: getattr(e, c.name) for c in LedgerEntry.__table__.columns} for e in rows]


def _rejected(e: TradeRejected):
    status = 503 if e.code == "MARKET_DATA_UNAVAILABLE" else 422
    return err(status, e.code, **e.detail)


@router.post("/trades/preview")
def trades_preview(body: TradeIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    try:
        return preview_trade(db, p, body.symbol, body.side, body.quantity)
    except TradeRejected as e:
        raise _rejected(e) from e


@router.post("/trades/execute")
def trades_execute(body: TradeIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    journal = None
    if body.journal_content or body.journal_answers:
        journal = {"content": body.journal_content or "", "answers": body.journal_answers}
    try:
        with timed("api.trade_execute"):
            t = execute_trade(db, p, body.symbol, body.side, body.quantity, journal=journal, research_id=body.research_id)
    except TradeRejected as e:
        incr("trades.rejected")
        raise _rejected(e) from e
    incr("trades.executed")
    return trade_out(t)


# ------------------------------------------------------------------ watchlist

@router.get("/watchlist")
def watchlist(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    items = db.scalars(select(WatchlistItem).where(WatchlistItem.profile_id == p.id).order_by(WatchlistItem.added_at)).all()
    out = []
    for it in items:
        row = {"symbol": it.symbol, "note": it.note, "added_at": it.added_at, "quote": None, "market_cap": None, "latest_research_at": None}
        try:
            row["quote"] = market_data.get_quote(it.symbol)
        except ProviderError:
            pass
        try:
            row["market_cap"] = market_data.get_metrics(it.symbol).market_cap
        except ProviderError:
            pass
        r = db.scalar(select(ResearchReport).where(ResearchReport.profile_id == p.id, ResearchReport.symbol == it.symbol,
                                                   ResearchReport.status == "done").order_by(desc(ResearchReport.created_at)).limit(1))
        row["latest_research_at"] = r.created_at if r else None
        row["latest_research_id"] = r.id if r else None
        out.append(row)
    return out


@router.post("/watchlist")
def add_watch(body: WatchIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    sym = market_data.norm(body.symbol)
    try:
        market_data.get_quote(sym)
    except ProviderError as e:
        raise err(422, "UNKNOWN_SYMBOL") from e
    try:
        db.add(WatchlistItem(profile_id=p.id, symbol=sym, note=body.note))
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"ok": True, "symbol": sym}


@router.delete("/watchlist/{symbol}")
def del_watch(symbol: str, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    it = db.scalar(select(WatchlistItem).where(WatchlistItem.profile_id == p.id, WatchlistItem.symbol == market_data.norm(symbol)))
    if it:
        db.delete(it)
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ journal

def journal_out(j: JournalEntry) -> dict:
    return {c.name: getattr(j, c.name) for c in JournalEntry.__table__.columns}


@router.get("/journal")
def journal(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), symbol: str | None = None):
    stmt = select(JournalEntry).where(JournalEntry.profile_id == p.id)
    if symbol:
        stmt = stmt.where(JournalEntry.symbol == market_data.norm(symbol))
    rows = db.scalars(stmt.order_by(desc(JournalEntry.created_at)).limit(500)).all()
    trade_ids = [r.trade_id for r in rows if r.trade_id]
    trades = {t.id: t for t in db.scalars(select(Trade).where(Trade.id.in_(trade_ids)))} if trade_ids else {}
    out = []
    for r in rows:
        d = journal_out(r)
        t = trades.get(r.trade_id)
        d["trade"] = {"side": t.side, "quantity": t.quantity, "execution_price": t.execution_price, "executed_at": t.executed_at} if t else None
        out.append(d)
    return out


@router.post("/journal")
def add_journal(body: JournalIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    if not body.content.strip() and not body.answers:
        raise err(422, "EMPTY_JOURNAL")
    ctx = None
    if body.symbol:
        try:
            q = market_data.get_quote(body.symbol)
            ctx = {"price": str(q.price), "price_timestamp": q.timestamp.isoformat(), "source": q.source}
        except ProviderError:
            ctx = None
    j = JournalEntry(profile_id=p.id, symbol=market_data.norm(body.symbol) if body.symbol else None, trade_id=body.trade_id,
                     research_id=body.research_id, type=body.type, content=body.content, answers=body.answers, context=ctx)
    db.add(j)
    db.commit()
    return journal_out(j)
