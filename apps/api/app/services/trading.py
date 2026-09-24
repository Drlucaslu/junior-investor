"""Deterministic paper-trading engine (PRD §7, §16).

The LLM never calls into this module. Trades happen only when the child
confirms in the UI, which calls `execute_trade`.
"""
from __future__ import annotations

import threading
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ChildProfile, JournalEntry, LedgerEntry, SimulationAccount, Trade
from app.providers.types import ProviderError, Quote
from app.services import market_data
from app.services.portfolio import current_account, ledger_entries, q2, q6, replay

ZERO = Decimal("0")
_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)


class TradeRejected(Exception):
    def __init__(self, code: str, detail: dict | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail or {}


@dataclass
class PricedOrder:
    symbol: str
    side: str
    quantity: Decimal
    quote: Quote
    execution_price: Decimal
    gross_value: Decimal
    fee: Decimal
    cash_delta: Decimal


def _next_seq(db: Session, profile_id: str) -> int:
    return (db.scalar(select(func.max(LedgerEntry.seq)).where(LedgerEntry.profile_id == profile_id)) or 0) + 1


def add_ledger(db: Session, profile_id: str, epoch: int, type_: str, amount: Decimal, *, symbol=None, quantity=None,
               price=None, reference_id=None, note=None, timestamp: datetime | None = None, currency="USD") -> LedgerEntry:
    e = LedgerEntry(profile_id=profile_id, epoch=epoch, seq=_next_seq(db, profile_id), type=type_, amount=q6(Decimal(amount)),
                    symbol=symbol, quantity=quantity, price=price, reference_id=reference_id, note=note, currency=currency,
                    timestamp=timestamp or datetime.now(timezone.utc))
    db.add(e)
    db.flush()
    return e


def create_account(db: Session, profile: ChildProfile, starting_cash: Decimal) -> SimulationAccount:
    acct = SimulationAccount(profile_id=profile.id, base_currency=get_settings().default_currency, starting_cash=starting_cash, epoch=1)
    db.add(acct)
    db.flush()
    add_ledger(db, profile.id, 1, "ACCOUNT_INITIALIZATION", starting_cash, reference_id="init:1", note="Initial virtual cash")
    return acct


def reset_account(db: Session, profile: ChildProfile, starting_cash: Decimal | None = None) -> SimulationAccount:
    with _locks[profile.id]:
        acct = current_account(db, profile.id)
        new_cash = Decimal(starting_cash) if starting_cash is not None else Decimal(profile.starting_cash)
        add_ledger(db, profile.id, acct.epoch, "ACCOUNT_RESET", ZERO, reference_id=f"reset:{acct.epoch}",
                   note=f"Account reset by parent; new epoch {acct.epoch + 1}")
        acct.epoch += 1
        acct.starting_cash = new_cash
        acct.reset_at = datetime.now(timezone.utc)
        acct.last_corporate_action_check = None
        profile.starting_cash = new_cash
        add_ledger(db, profile.id, acct.epoch, "ACCOUNT_INITIALIZATION", new_cash, reference_id=f"init:{acct.epoch}",
                   note="Virtual cash after reset")
        db.commit()
        return acct


def _validate_qty(profile: ChildProfile, qty: Decimal) -> Decimal:
    s = get_settings()
    if qty <= 0:
        raise TradeRejected("INVALID_QUANTITY")
    fractional_ok = profile.allow_fractional and s.allow_fractional_shares
    if not fractional_ok and qty != qty.to_integral_value():
        raise TradeRejected("FRACTIONAL_NOT_ALLOWED")
    if qty > Decimal("100000000"):
        raise TradeRejected("INVALID_QUANTITY")
    return qty.quantize(Decimal("0.000001"))


def _check_asset_allowed(profile: ChildProfile, symbol: str) -> None:
    try:
        prof = market_data.get_company_profile(symbol)
    except ProviderError:
        return  # asset-type check is best effort; the quote check below still applies
    qt = (prof.quote_type or "").upper()
    if qt and qt not in ("EQUITY", "ETF"):
        raise TradeRejected("ASSET_TYPE_NOT_SUPPORTED", {"quote_type": qt})
    if qt == "ETF" and not profile.allow_etf:
        raise TradeRejected("ETF_NOT_ALLOWED")


def price_order(profile: ChildProfile, symbol: str, side: str, quantity: Decimal) -> PricedOrder:
    s = get_settings()
    side = side.upper()
    if side not in ("BUY", "SELL"):
        raise TradeRejected("INVALID_SIDE")
    qty = _validate_qty(profile, Decimal(str(quantity)))
    sym = market_data.norm(symbol)
    try:
        quote = market_data.get_quote(sym, fresh=True)
    except ProviderError as e:
        raise TradeRejected("MARKET_DATA_UNAVAILABLE", {"error": str(e)}) from e
    if quote.currency and quote.currency.upper() != s.default_currency:
        raise TradeRejected("CURRENCY_NOT_SUPPORTED", {"currency": quote.currency})
    ts = quote.timestamp if quote.timestamp.tzinfo else quote.timestamp.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    if age > s.max_quote_age_seconds:
        raise TradeRejected("QUOTE_TOO_OLD", {"quote_timestamp": ts.isoformat()})
    base = Decimal(quote.price)
    slip = Decimal(s.simulated_slippage_bps) / Decimal(10000)
    px = base * (1 + slip) if side == "BUY" else base * (1 - slip)
    px = px.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    gross = q6(px * qty)
    fee = q6(gross * Decimal(s.simulated_commission_bps) / Decimal(10000))
    cash_delta = -(gross + fee) if side == "BUY" else (gross - fee)
    return PricedOrder(sym, side, qty, quote, px, gross, fee, cash_delta)


def _check_funds(db: Session, profile: ChildProfile, order: PricedOrder) -> dict:
    acct = current_account(db, profile.id)
    st = replay(ledger_entries(db, profile.id, acct.epoch))
    held = st.lots.get(order.symbol).quantity if order.symbol in st.lots else ZERO
    if order.side == "BUY":
        required = order.gross_value + order.fee
        if required > st.cash:
            raise TradeRejected("INSUFFICIENT_CASH", {"required_cash": str(q2(required)), "available_cash": str(q2(st.cash))})
    else:
        if order.quantity > held:
            raise TradeRejected("INSUFFICIENT_POSITION", {"requested": str(order.quantity), "held": str(held)})
    return {"acct": acct, "state": st, "held": held}


def preview_trade(db: Session, profile: ChildProfile, symbol: str, side: str, quantity) -> dict:
    _check_asset_allowed(profile, symbol)
    order = price_order(profile, symbol, side, Decimal(str(quantity)))
    ctx = _check_funds(db, profile, order)
    st = ctx["state"]
    cash_after = st.cash + order.cash_delta
    # Estimate equity using the order price for this symbol and cost basis for others (fast, no extra quotes).
    other_value = sum((lot.cost_basis for sym, lot in st.lots.items() if sym != order.symbol and lot.quantity), ZERO)
    new_qty = ctx["held"] + (order.quantity if order.side == "BUY" else -order.quantity)
    pos_value = new_qty * order.execution_price
    equity_after = cash_after + other_value + pos_value
    try:
        market_status = market_data.get_market_status().status
    except ProviderError:
        market_status = "UNKNOWN"
    return {
        "symbol": order.symbol,
        "name": order.quote.name,
        "side": order.side,
        "quantity": order.quantity,
        "price": order.execution_price,
        "estimated_value": q2(order.gross_value),
        "fee": q2(order.fee),
        "cash_before": q2(st.cash),
        "cash_after": q2(cash_after),
        "position_before": ctx["held"],
        "position_after": new_qty,
        "allocation_after_pct": q2(pos_value / equity_after * 100) if equity_after else ZERO,
        "price_timestamp": order.quote.timestamp,
        "price_source": order.quote.source,
        "session": order.quote.session,
        "market_status": market_status,
        "market_closed_notice": order.quote.session != "regular",
        "simulation": True,
    }


def execute_trade(db: Session, profile: ChildProfile, symbol: str, side: str, quantity, *, journal: dict | None = None,
                  research_id: str | None = None) -> Trade:
    """Execute a simulated market order. Re-prices at execution time, validates
    funds under a per-profile lock, and writes Trade + Ledger atomically."""
    with _locks[profile.id]:
        acct = db.scalar(select(SimulationAccount).where(SimulationAccount.profile_id == profile.id).with_for_update())
        trade = Trade(profile_id=profile.id, epoch=acct.epoch if acct else 1, symbol=market_data.norm(symbol), side=side.upper(),
                      quantity=Decimal(str(quantity)) if _is_num(quantity) else ZERO, research_id=research_id,
                      journal_note=(journal or {}).get("content"))
        try:
            _check_asset_allowed(profile, symbol)
            order = price_order(profile, symbol, side, Decimal(str(quantity)))
            _check_funds(db, profile, order)
        except TradeRejected as rej:
            trade.status = "REJECTED"
            trade.reject_reason = rej.code
            db.add(trade)
            db.commit()
            raise
        now = datetime.now(timezone.utc)
        trade.quantity = order.quantity
        trade.execution_price = order.execution_price
        trade.gross_value = order.gross_value
        trade.fee = order.fee
        trade.executed_at = now
        trade.source_price_timestamp = order.quote.timestamp
        trade.price_source = order.quote.source
        trade.session = order.quote.session
        trade.status = "EXECUTED"
        db.add(trade)
        db.flush()
        if order.side == "SELL":
            st = replay(ledger_entries(db, profile.id, acct.epoch))
            avg = st.lots[order.symbol].average_cost
            trade.realized_pnl = q6(order.cash_delta - order.quantity * avg)
        add_ledger(db, profile.id, acct.epoch, order.side, order.cash_delta, symbol=order.symbol,
                   quantity=order.quantity if order.side == "BUY" else -order.quantity, price=order.execution_price,
                   reference_id=f"trade:{trade.id}", timestamp=now)
        if journal and (journal.get("content") or journal.get("answers")):
            db.add(JournalEntry(profile_id=profile.id, symbol=order.symbol, trade_id=trade.id, research_id=research_id,
                                type="pre_trade" if order.side == "BUY" else "post_trade", content=journal.get("content") or "",
                                answers=journal.get("answers"),
                                context={"price": str(order.execution_price), "side": order.side, "quantity": str(order.quantity),
                                         "price_timestamp": order.quote.timestamp.isoformat(), "source": order.quote.source}))
        db.commit()
        db.refresh(trade)
        return trade


def _is_num(v) -> bool:
    try:
        Decimal(str(v))
        return True
    except Exception:
        return False
