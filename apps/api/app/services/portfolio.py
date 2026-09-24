"""Portfolio accounting — derived purely from the ledger + latest prices.

Method: **Average Cost** (PRD §7.6). Fees are added to cost basis on buys and
subtracted from proceeds on sells.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LedgerEntry, SimulationAccount
from app.providers.types import ProviderError

ZERO = Decimal("0")
NY = ZoneInfo("America/New_York")


def q2(x: Decimal | None) -> Decimal | None:
    return None if x is None else x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def q6(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


@dataclass
class Lot:
    symbol: str
    quantity: Decimal = ZERO
    cost_basis: Decimal = ZERO  # total cost of the shares currently held
    realized_pnl: Decimal = ZERO
    dividends: Decimal = ZERO
    first_acquired: datetime | None = None

    @property
    def average_cost(self) -> Decimal:
        return (self.cost_basis / self.quantity) if self.quantity else ZERO


@dataclass
class LedgerState:
    cash: Decimal = ZERO
    starting_cash: Decimal = ZERO
    lots: dict[str, Lot] = field(default_factory=dict)
    realized_pnl: Decimal = ZERO
    dividends: Decimal = ZERO
    manual_adjustments: Decimal = ZERO


def ledger_entries(db: Session, profile_id: str, epoch: int, until: datetime | None = None) -> list[LedgerEntry]:
    stmt = select(LedgerEntry).where(LedgerEntry.profile_id == profile_id, LedgerEntry.epoch == epoch)
    rows = list(db.scalars(stmt))
    if until is not None:
        rows = [r for r in rows if _aware(r.timestamp) < until]
    rows.sort(key=lambda r: (_aware(r.timestamp), r.seq))
    return rows


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def replay(entries: list[LedgerEntry]) -> LedgerState:
    st = LedgerState()
    for e in entries:
        amt = Decimal(e.amount or 0)
        if e.type == "ACCOUNT_INITIALIZATION":
            st.cash += amt
            st.starting_cash += amt
        elif e.type == "BUY":
            lot = st.lots.setdefault(e.symbol, Lot(e.symbol))
            qty = Decimal(e.quantity)
            if lot.quantity == 0:
                lot.first_acquired = _aware(e.timestamp)
            lot.quantity += qty
            lot.cost_basis += -amt  # amount is negative (cash out) incl. fee
            st.cash += amt
        elif e.type == "SELL":
            lot = st.lots.setdefault(e.symbol, Lot(e.symbol))
            qty = -Decimal(e.quantity)  # stored negative
            avg = lot.average_cost
            proceeds = amt  # positive, net of fee
            realized = proceeds - qty * avg
            lot.realized_pnl += realized
            st.realized_pnl += realized
            lot.cost_basis -= qty * avg
            lot.quantity -= qty
            if lot.quantity == 0:
                lot.cost_basis = ZERO
            st.cash += amt
        elif e.type == "DIVIDEND_CASH":
            st.cash += amt
            st.dividends += amt
            if e.symbol:
                st.lots.setdefault(e.symbol, Lot(e.symbol)).dividends += amt
        elif e.type == "SPLIT_ADJUSTMENT":
            lot = st.lots.setdefault(e.symbol, Lot(e.symbol))
            lot.quantity += Decimal(e.quantity or 0)  # cost basis unchanged -> average cost adjusts
            st.cash += amt  # cash-in-lieu if any
        elif e.type == "MANUAL_ADJUSTMENT":
            st.cash += amt
            st.manual_adjustments += amt
        # ACCOUNT_RESET rows live in the *old* epoch and carry no amount.
    return st


def current_account(db: Session, profile_id: str) -> SimulationAccount:
    acct = db.scalar(select(SimulationAccount).where(SimulationAccount.profile_id == profile_id))
    if acct is None:
        raise LookupError("account not found")
    return acct


def compute_portfolio(db: Session, profile_id: str, quote_fn) -> dict:
    """Return the full portfolio view. `quote_fn(symbol) -> Quote` supplies prices;
    if a price is unavailable the position is flagged instead of guessed."""
    acct = current_account(db, profile_id)
    entries = ledger_entries(db, profile_id, acct.epoch)
    st = replay(entries)

    # Start-of-day state (America/New_York calendar day) for Today P&L.
    ny_midnight = datetime.now(NY).replace(hour=0, minute=0, second=0, microsecond=0)
    sod = replay([e for e in entries if _aware(e.timestamp) < ny_midnight])
    sod_has_history = any(_aware(e.timestamp) < ny_midnight for e in entries)
    flows_today = sum((Decimal(e.amount) for e in entries if _aware(e.timestamp) >= ny_midnight and e.type in ("MANUAL_ADJUSTMENT", "ACCOUNT_INITIALIZATION")), ZERO)

    positions = []
    market_value = ZERO
    unrealized = ZERO
    sod_value = sod.cash
    stale = []
    quotes = {}
    for sym in sorted(set(list(st.lots) + list(sod.lots))):
        if (st.lots.get(sym) and st.lots[sym].quantity != 0) or (sod.lots.get(sym) and sod.lots[sym].quantity != 0):
            try:
                quotes[sym] = quote_fn(sym)
            except ProviderError:
                quotes[sym] = None
    for sym, lot in sorted(st.lots.items()):
        if lot.quantity == 0:
            continue
        qt = quotes.get(sym)
        last = Decimal(qt.price) if qt else None
        mv = (last * lot.quantity) if last is not None else lot.cost_basis
        if qt is None:
            stale.append(sym)
        u = (mv - lot.cost_basis) if last is not None else None
        market_value += mv
        unrealized += u or ZERO
        positions.append({
            "ticker": sym,
            "quantity": lot.quantity.normalize() if lot.quantity == lot.quantity.to_integral() else lot.quantity,
            "average_cost": q6(lot.average_cost),
            "last_price": last,
            "price_timestamp": qt.timestamp if qt else None,
            "price_source": qt.source if qt else None,
            "change_pct": qt.change_pct if qt else None,
            "market_value": q2(mv),
            "cost_basis": q2(lot.cost_basis),
            "unrealized_pnl": q2(u),
            "unrealized_pnl_pct": q2(u / lot.cost_basis * 100) if (u is not None and lot.cost_basis) else None,
            "realized_pnl": q2(lot.realized_pnl),
            "dividends": q2(lot.dividends),
            "first_acquired": lot.first_acquired,
            "price_available": qt is not None,
        })
    for sym, lot in sod.lots.items():
        if lot.quantity == 0:
            continue
        qt = quotes.get(sym)
        base = Decimal(qt.previous_close) if (qt and qt.previous_close) else (Decimal(qt.price) if qt else lot.average_cost)
        sod_value += base * lot.quantity

    equity = st.cash + market_value
    for p in positions:
        p["allocation_pct"] = q2(p["market_value"] / equity * 100) if equity else ZERO
    total_pnl = equity - st.starting_cash - st.manual_adjustments
    if sod_has_history:
        today_pnl = equity - sod_value - flows_today
        today_base = sod_value
    else:  # account created today
        today_pnl = total_pnl
        today_base = st.starting_cash
    return {
        "profile_id": profile_id,
        "base_currency": acct.base_currency,
        "starting_cash": q2(st.starting_cash),
        "cash": q2(st.cash),
        "market_value": q2(market_value),
        "total_equity": q2(equity),
        "unrealized_pnl": q2(unrealized),
        "realized_pnl": q2(st.realized_pnl),
        "dividends": q2(st.dividends),
        "total_pnl": q2(total_pnl),
        "total_return_pct": q2(total_pnl / st.starting_cash * 100) if st.starting_cash else ZERO,
        "today_pnl": q2(today_pnl),
        "today_return_pct": q2(today_pnl / today_base * 100) if today_base else ZERO,
        "largest_position_pct": max((p["allocation_pct"] for p in positions), default=ZERO),
        "positions": positions,
        "stale_prices": stale,
        "epoch": acct.epoch,
        "as_of": datetime.now(timezone.utc),
    }
