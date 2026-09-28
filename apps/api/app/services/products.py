"""CDs (Certificates of Deposit) and simplified options (covered calls and
protective puts). All prices are simulated and clearly labelled as such.

Option prices use the Black-Scholes model with the stock's own 1-year historical
volatility and the 13-week US Treasury bill yield as the risk-free rate. Real
option quotes differ (bid/ask spreads, implied volatility, dividends).
"""
from __future__ import annotations

import logging
import math
import threading
import time as _time
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChildProfile, Deposit, OptionPosition, SimulationAccount, Trade
from app.providers.types import ProviderError
from app.services import market_data
from app.services.portfolio import ledger_entries, q2, q6, replay

log = logging.getLogger(__name__)
ZERO = Decimal("0")
NY = ZoneInfo("America/New_York")
CD_TERMS = (3, 6, 12)
CD_MIN = Decimal("100")
CONTRACT = 100
SPREAD = Decimal("0.03")  # simulated bid/ask: ±3% around the model price
MIN_DAYS_TO_EXPIRY = 7


class ProductError(Exception):
    def __init__(self, code: str, detail: dict | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail or {}


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- rates

_rate_cache: dict[str, tuple[float, float]] = {}
_rate_lock = threading.Lock()


def risk_free_rate() -> float:
    """13-week T-bill yield (Yahoo ^IRX, quoted in percent). Falls back to 4%."""
    with _rate_lock:
        hit = _rate_cache.get("irx")
        if hit and _time.time() - hit[1] < 6 * 3600:
            return hit[0]
    r = 0.04
    try:
        q = market_data.get_quote("^IRX")
        v = float(q.price) / 100
        if 0.0 <= v < 0.2:
            r = v
    except (ProviderError, Exception) as e:  # noqa: BLE001 - rate lookup is best effort
        log.info("risk-free rate unavailable, using 4%%: %s", e)
    with _rate_lock:
        _rate_cache["irx"] = (r, _time.time())
    return r


def cd_offers() -> list[dict]:
    base = Decimal(str(risk_free_rate()))
    adj = {3: Decimal("-0.0025"), 6: Decimal("-0.0010"), 12: Decimal("0")}
    out = []
    for m in CD_TERMS:
        apy = max(Decimal("0.005"), base + adj[m]).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        out.append({"term_months": m, "apy": apy, "penalty_months": 3 if m >= 6 else 1})
    return out


# ---------------------------------------------------------------- CDs

def _add_months(d: datetime, months: int) -> datetime:
    y, mo = divmod(d.month - 1 + months, 12)
    y += d.year
    mo += 1
    day = min(d.day, 28)
    return d.replace(year=y, month=mo, day=day)


def cd_value(dep: Deposit, at: datetime | None = None) -> Decimal:
    at = at or _now()
    end = min(_aware(at), _aware(dep.matures_at))
    days = max((end - _aware(dep.opened_at)).total_seconds() / 86400, 0)
    growth = (1 + float(dep.apy)) ** (days / 365)
    return q6(Decimal(dep.principal) * Decimal(str(growth)))


def _penalty(dep: Deposit) -> Decimal:
    months = 3 if dep.term_months >= 6 else 1
    return q6(Decimal(dep.principal) * Decimal(dep.apy) * Decimal(months) / Decimal(12))


def open_cd(db: Session, profile: ChildProfile, acct: SimulationAccount, amount, term_months: int) -> Deposit:
    from app.services.trading import add_ledger

    amt = Decimal(str(amount)).quantize(Decimal("0.01"))
    if term_months not in CD_TERMS:
        raise ProductError("INVALID_TERM")
    if amt < CD_MIN:
        raise ProductError("CD_MIN_AMOUNT", {"min": str(CD_MIN)})
    cash = replay(ledger_entries(db, acct)).cash
    if amt > cash:
        raise ProductError("INSUFFICIENT_CASH", {"required_cash": str(amt), "available_cash": str(q2(cash))})
    offer = next(o for o in cd_offers() if o["term_months"] == term_months)
    now = _now()
    dep = Deposit(profile_id=profile.id, account_id=acct.id, epoch=acct.epoch, principal=amt, apy=offer["apy"],
                  term_months=term_months, opened_at=now, matures_at=_add_months(now, term_months), status="OPEN")
    db.add(dep)
    db.flush()
    add_ledger(db, profile.id, acct.epoch, "CD_OPEN", -amt, reference_id=f"cd:{dep.id}:open", account_id=acct.id,
               note=f"CD {term_months} months @ {offer['apy'] * 100:.2f}% APY", timestamp=now)
    db.commit()
    db.refresh(dep)
    return dep


def _close_cd(db: Session, acct: SimulationAccount, dep: Deposit, payout: Decimal, status: str, at: datetime) -> None:
    from app.services.trading import add_ledger

    dep.status = status
    dep.closed_at = at
    dep.payout = payout
    add_ledger(db, dep.profile_id, dep.epoch, "CD_CLOSE", payout, quantity=Decimal(dep.principal), account_id=acct.id,
               reference_id=f"cd:{dep.id}:close", note="CD matured" if status == "MATURED" else "CD withdrawn early (penalty)",
               timestamp=at)


def break_cd(db: Session, acct: SimulationAccount, deposit_id: str) -> Deposit:
    dep = db.get(Deposit, deposit_id)
    if not dep or dep.account_id != acct.id or dep.status != "OPEN":
        raise ProductError("CD_NOT_FOUND")
    now = _now()
    if _aware(dep.matures_at) <= now:
        _close_cd(db, acct, dep, cd_value(dep, dep.matures_at), "MATURED", _aware(dep.matures_at))
    else:
        payout = max(Decimal(dep.principal), cd_value(dep, now) - _penalty(dep))
        _close_cd(db, acct, dep, q6(payout), "BROKEN", now)
    db.commit()
    return dep


def mature_cds(db: Session, acct: SimulationAccount) -> int:
    n = 0
    for dep in db.scalars(select(Deposit).where(Deposit.account_id == acct.id, Deposit.epoch == acct.epoch, Deposit.status == "OPEN")):
        if _aware(dep.matures_at) <= _now():
            _close_cd(db, acct, dep, cd_value(dep, dep.matures_at), "MATURED", _aware(dep.matures_at))
            n += 1
    if n:
        db.commit()
    return n


def cd_holdings(db: Session, acct: SimulationAccount) -> list[dict]:
    out = []
    for dep in db.scalars(select(Deposit).where(Deposit.account_id == acct.id, Deposit.epoch == acct.epoch,
                                                Deposit.status == "OPEN").order_by(Deposit.opened_at)):
        v = cd_value(dep)
        out.append({"id": dep.id, "principal": q2(Decimal(dep.principal)), "apy": dep.apy, "term_months": dep.term_months,
                    "opened_at": dep.opened_at, "matures_at": dep.matures_at, "value": q2(v),
                    "interest_so_far": q2(v - Decimal(dep.principal)),
                    "value_at_maturity": q2(cd_value(dep, dep.matures_at)),
                    "early_withdrawal_value": q2(max(Decimal(dep.principal), v - _penalty(dep)))})
    return out


def sod_product_value(db: Session, acct: SimulationAccount, sod: datetime) -> Decimal:
    """Value of CDs and options that already existed at start of day (for Today P&L)."""
    total = ZERO
    for dep in db.scalars(select(Deposit).where(Deposit.account_id == acct.id, Deposit.epoch == acct.epoch)):
        if _aware(dep.opened_at) < sod and (dep.closed_at is None or _aware(dep.closed_at) >= sod):
            total += cd_value(dep, sod)
    for op in db.scalars(select(OptionPosition).where(OptionPosition.account_id == acct.id, OptionPosition.epoch == acct.epoch)):
        if _aware(op.opened_at) < sod and (op.closed_at is None or _aware(op.closed_at) >= sod):
            sign = Decimal(-1) if op.right == "CALL" else Decimal(1)
            total += sign * Decimal(op.open_premium) * CONTRACT * op.contracts
    return total


# ---------------------------------------------------------------- Black-Scholes

def _ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_price(s: float, k: float, t: float, r: float, sigma: float, right: str) -> float:
    if t <= 0 or sigma <= 0:
        return max(0.0, s - k) if right == "CALL" else max(0.0, k - s)
    d1 = (math.log(s / k) + (r + sigma * sigma / 2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    if right == "CALL":
        return s * _ncdf(d1) - k * math.exp(-r * t) * _ncdf(d2)
    return k * math.exp(-r * t) * _ncdf(-d2) - s * _ncdf(-d1)


def bs_delta(s: float, k: float, t: float, r: float, sigma: float, right: str) -> float:
    if t <= 0 or sigma <= 0:
        return (1.0 if s > k else 0.0) if right == "CALL" else (-1.0 if s < k else 0.0)
    d1 = (math.log(s / k) + (r + sigma * sigma / 2) * t) / (sigma * math.sqrt(t))
    return _ncdf(d1) if right == "CALL" else _ncdf(d1) - 1


def historical_volatility(symbol: str) -> float:
    try:
        candles = market_data.get_history(symbol, "1Y")
        closes = [c.c for c in candles if c.c]
        rets = [math.log(b / a) for a, b in zip(closes, closes[1:]) if a > 0 and b > 0]
        if len(rets) < 20:
            raise ValueError("too few points")
        mean = sum(rets) / len(rets)
        var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
        vol = math.sqrt(var) * math.sqrt(252)
    except (ProviderError, ValueError, ZeroDivisionError) as e:
        log.info("volatility unavailable for %s (%s); using 30%%", symbol, e)
        vol = 0.30
    return min(1.5, max(0.10, vol))


def _expiry_close(d: date) -> datetime:
    return datetime.combine(d, time(16, 0), NY).astimezone(timezone.utc)


def years_to(d: date, now: datetime | None = None) -> float:
    return max((_expiry_close(d) - (now or _now())).total_seconds() / (365 * 86400), 0.0)


def third_friday(y: int, m: int) -> date:
    d = date(y, m, 15)
    return d + timedelta(days=(4 - d.weekday()) % 7)


def expirations(today: date | None = None, n: int = 3) -> list[date]:
    today = today or datetime.now(NY).date()
    out, y, m = [], today.year, today.month
    while len(out) < n:
        f = third_friday(y, m)
        if (f - today).days >= MIN_DAYS_TO_EXPIRY:
            out.append(f)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def strike_step(price: float) -> float:
    return 1.0 if price < 25 else 2.5 if price < 100 else 5.0 if price < 250 else 10.0


def strikes_for(price: float, strategy: str) -> list[float]:
    step = strike_step(price)
    atm = round(price / step) * step
    rng = range(0, 6) if strategy == "covered_call" else range(-5, 1)  # calls above, puts below the price
    return [round(atm + i * step, 2) for i in rng if atm + i * step > 0]


def _px(v: float) -> Decimal:
    return max(Decimal("0.01"), Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def quote_option(s: float, k: float, expiry: date, sigma: float, right: str, r: float | None = None) -> dict:
    r = risk_free_rate() if r is None else r
    t = years_to(expiry)
    mid = bs_price(s, k, t, r, sigma, right)
    return {"mid": _px(mid), "bid": _px(mid * (1 - float(SPREAD))), "ask": _px(mid * (1 + float(SPREAD))),
            "delta": round(bs_delta(s, k, t, r, sigma, right), 3), "years": t}


# ---------------------------------------------------------------- option positions

def _open_options(db: Session, acct: SimulationAccount, symbol: str | None = None) -> list[OptionPosition]:
    stmt = select(OptionPosition).where(OptionPosition.account_id == acct.id, OptionPosition.epoch == acct.epoch,
                                        OptionPosition.status == "OPEN")
    if symbol:
        stmt = stmt.where(OptionPosition.underlying == symbol)
    return list(db.scalars(stmt))


def locked_shares(db: Session, acct: SimulationAccount, symbol: str) -> Decimal:
    """Shares promised to covered-call buyers (cannot be sold until the call is closed)."""
    return Decimal(sum(o.contracts * CONTRACT for o in _open_options(db, acct, symbol) if o.right == "CALL"))


def protected_shares(db: Session, acct: SimulationAccount, symbol: str) -> Decimal:
    return Decimal(sum(o.contracts * CONTRACT for o in _open_options(db, acct, symbol) if o.right == "PUT"))


def _held(db: Session, acct: SimulationAccount, symbol: str) -> Decimal:
    st = replay(ledger_entries(db, acct))
    return st.lots[symbol].quantity if symbol in st.lots else ZERO


def chain(db: Session, acct: SimulationAccount, symbol: str, strategy: str) -> dict:
    if strategy not in ("covered_call", "protective_put"):
        raise ProductError("INVALID_STRATEGY")
    sym = market_data.norm(symbol)
    try:
        q = market_data.get_quote(sym)
    except ProviderError as e:
        raise ProductError("MARKET_DATA_UNAVAILABLE", {"error": str(e)}) from e
    s = float(q.price)
    sigma = historical_volatility(sym)
    r = risk_free_rate()
    right = "CALL" if strategy == "covered_call" else "PUT"
    held = _held(db, acct, sym)
    used = locked_shares(db, acct, sym) if right == "CALL" else protected_shares(db, acct, sym)
    max_contracts = int(max(held - used, ZERO) // CONTRACT)
    exps = []
    for d in expirations():
        rows = []
        for k in strikes_for(s, strategy):
            oq = quote_option(s, k, d, sigma, right, r)
            rows.append({"strike": k, "bid": oq["bid"], "ask": oq["ask"], "mid": oq["mid"], "delta": oq["delta"]})
        exps.append({"expiry": d.isoformat(), "days": (d - datetime.now(NY).date()).days, "strikes": rows})
    return {"symbol": sym, "name": q.name, "price": q.price, "price_timestamp": q.timestamp, "strategy": strategy, "right": right,
            "volatility": round(sigma, 4), "risk_free_rate": round(r, 4), "shares_held": held, "shares_in_use": used,
            "max_contracts": max_contracts, "contract_size": CONTRACT, "expirations": exps,
            "pricing_model": "Black-Scholes (simulated)", "source": q.source}


def _validate_option(db: Session, acct: SimulationAccount, symbol: str, strategy: str, strike, expiry: str, contracts: int):
    if strategy not in ("covered_call", "protective_put"):
        raise ProductError("INVALID_STRATEGY")
    if not isinstance(contracts, int) or contracts < 1 or contracts > 1000:
        raise ProductError("INVALID_CONTRACTS")
    sym = market_data.norm(symbol)
    try:
        exp = date.fromisoformat(expiry)
    except ValueError as e:
        raise ProductError("INVALID_EXPIRY") from e
    if exp not in expirations():
        raise ProductError("INVALID_EXPIRY")
    try:
        q = market_data.get_quote(sym, fresh=True)
    except ProviderError as e:
        raise ProductError("MARKET_DATA_UNAVAILABLE", {"error": str(e)}) from e
    s = float(q.price)
    k = float(strike)
    if k not in strikes_for(s, strategy):
        raise ProductError("INVALID_STRIKE")
    right = "CALL" if strategy == "covered_call" else "PUT"
    held = _held(db, acct, sym)
    used = locked_shares(db, acct, sym) if right == "CALL" else protected_shares(db, acct, sym)
    if Decimal(contracts * CONTRACT) > held - used:
        raise ProductError("NOT_ENOUGH_SHARES", {"needed": contracts * CONTRACT, "available": str(max(held - used, ZERO))})
    sigma = historical_volatility(sym)
    oq = quote_option(s, k, exp, sigma, right)
    premium = oq["bid"] if right == "CALL" else oq["ask"]  # we SELL calls, BUY puts
    cash_delta = premium * CONTRACT * contracts * (1 if right == "CALL" else -1)
    return sym, exp, right, Decimal(str(k)), q, sigma, oq, premium, cash_delta


def preview_option(db: Session, acct: SimulationAccount, symbol: str, strategy: str, strike, expiry: str, contracts: int) -> dict:
    sym, exp, right, k, q, sigma, oq, premium, cash_delta = _validate_option(db, acct, symbol, strategy, strike, expiry, contracts)
    cash = replay(ledger_entries(db, acct)).cash
    if cash + cash_delta < 0:
        raise ProductError("INSUFFICIENT_CASH", {"required_cash": str(q2(-cash_delta)), "available_cash": str(q2(cash))})
    s = Decimal(str(q.price))
    n = CONTRACT * contracts
    if right == "CALL":
        outcome = {"premium_received": q2(premium * n), "max_sale_value": q2((k + premium) * n),
                   "breakeven_note": "shares are sold at the strike if the price ends above it"}
    else:
        outcome = {"premium_paid": q2(premium * n), "worst_case_value": q2(k * n),
                   "max_loss_from_now": q2((s - k + premium) * n) if s > k else q2(premium * n)}
    return {"symbol": sym, "name": q.name, "strategy": strategy, "right": right, "strike": k, "expiry": exp.isoformat(),
            "contracts": contracts, "shares_covered": n, "underlying_price": q.price, "premium": premium, "cash_delta": q2(cash_delta),
            "cash_before": q2(cash), "cash_after": q2(cash + cash_delta), "volatility": round(sigma, 4), "delta": oq["delta"],
            "days_to_expiry": (exp - datetime.now(NY).date()).days, **outcome, "pricing_model": "Black-Scholes (simulated)",
            "simulation": True}


def open_option(db: Session, profile: ChildProfile, acct: SimulationAccount, symbol: str, strategy: str, strike, expiry: str,
                contracts: int, journal: str | None = None) -> OptionPosition:
    from app.services.trading import _locks, add_ledger

    with _locks[acct.id]:
        sym, exp, right, k, q, sigma, oq, premium, cash_delta = _validate_option(db, acct, symbol, strategy, strike, expiry, contracts)
        cash = replay(ledger_entries(db, acct)).cash
        if cash + cash_delta < 0:
            raise ProductError("INSUFFICIENT_CASH", {"required_cash": str(q2(-cash_delta)), "available_cash": str(q2(cash))})
        now = _now()
        op = OptionPosition(profile_id=profile.id, account_id=acct.id, epoch=acct.epoch, underlying=sym, right=right, strategy=strategy,
                            strike=k, expiry=exp, contracts=contracts, open_premium=premium, open_underlying_price=Decimal(str(q.price)),
                            volatility=Decimal(str(round(sigma, 6))), opened_at=now, status="OPEN", journal_note=journal)
        db.add(op)
        db.flush()
        add_ledger(db, profile.id, acct.epoch, "OPTION_OPEN", cash_delta, symbol=sym, quantity=Decimal(contracts), price=premium,
                   account_id=acct.id, reference_id=f"opt:{op.id}:open", timestamp=now,
                   note=f"{'Sold covered call' if right == 'CALL' else 'Bought protective put'} {sym} {k} {exp.isoformat()} x{contracts}")
        db.commit()
        db.refresh(op)
        return op


def close_option(db: Session, acct: SimulationAccount, option_id: str) -> OptionPosition:
    from app.services.trading import _locks, add_ledger

    with _locks[acct.id]:
        op = db.get(OptionPosition, option_id)
        if not op or op.account_id != acct.id or op.status != "OPEN":
            raise ProductError("OPTION_NOT_FOUND")
        try:
            q = market_data.get_quote(op.underlying, fresh=True)
        except ProviderError as e:
            raise ProductError("MARKET_DATA_UNAVAILABLE", {"error": str(e)}) from e
        oq = quote_option(float(q.price), float(op.strike), op.expiry, float(op.volatility), op.right)
        n = CONTRACT * op.contracts
        if op.right == "CALL":  # buy back the call we sold
            price = oq["ask"]
            cash_delta = -price * n
            pnl = (Decimal(op.open_premium) - price) * n
        else:  # sell the put we bought
            price = oq["bid"]
            cash_delta = price * n
            pnl = (price - Decimal(op.open_premium)) * n
        if cash_delta < 0:
            cash = replay(ledger_entries(db, acct)).cash
            if cash + cash_delta < 0:
                raise ProductError("INSUFFICIENT_CASH", {"required_cash": str(q2(-cash_delta)), "available_cash": str(q2(cash))})
        now = _now()
        op.status, op.close_premium, op.closed_at, op.realized_pnl = "CLOSED", price, now, q6(pnl)
        add_ledger(db, op.profile_id, op.epoch, "OPTION_CLOSE", cash_delta, symbol=op.underlying, quantity=Decimal(op.contracts),
                   price=price, account_id=acct.id, reference_id=f"opt:{op.id}:close", timestamp=now, note="Option closed early")
        db.commit()
        return op


def _settlement_price(op: OptionPosition) -> Decimal | None:
    try:
        candles = market_data.get_history(op.underlying, "1M")
        on_or_before = [c for c in candles if _aware(c.t).astimezone(NY).date() <= op.expiry]
        if on_or_before:
            return Decimal(str(on_or_before[-1].c))
    except ProviderError:
        pass
    try:
        return Decimal(str(market_data.get_quote(op.underlying).price))
    except ProviderError:
        return None


def settle_expired(db: Session, acct: SimulationAccount, now: datetime | None = None, price_override: dict | None = None) -> int:
    """Settle options whose expiration has passed (after 4pm New York on the expiry day)."""
    from app.services.trading import add_ledger

    now = now or _now()
    n = 0
    for op in _open_options(db, acct):
        if _expiry_close(op.expiry) > now:
            continue
        s = (price_override or {}).get(op.underlying) or _settlement_price(op)
        if s is None:
            continue
        s = Decimal(str(s))
        k = Decimal(op.strike)
        shares = CONTRACT * op.contracts
        at = _expiry_close(op.expiry)
        op.settlement_price, op.closed_at = s, at
        itm = (s > k) if op.right == "CALL" else (s < k)
        if not itm:
            op.status = "EXPIRED"
            op.realized_pnl = q6(Decimal(op.open_premium) * shares * (1 if op.right == "CALL" else -1))
        else:
            op.status = "EXERCISED"
            held = _held(db, acct, op.underlying)
            if held >= shares:  # deliver shares at the strike
                st = replay(ledger_entries(db, acct))
                avg = st.lots[op.underlying].average_cost
                proceeds = k * shares
                t = Trade(profile_id=op.profile_id, account_id=acct.id, epoch=acct.epoch, symbol=op.underlying, side="SELL",
                          quantity=Decimal(shares), requested_at=at, executed_at=at, execution_price=k, gross_value=q6(proceeds),
                          fee=ZERO, realized_pnl=q6(proceeds - shares * avg), source_price_timestamp=at, price_source="option exercise",
                          session="regular", status="EXECUTED",
                          journal_note=("Covered call assigned: shares sold at the strike" if op.right == "CALL"
                                        else "Protective put exercised: shares sold at the strike"))
                db.add(t)
                db.flush()
                add_ledger(db, op.profile_id, acct.epoch, "SELL", proceeds, symbol=op.underlying, quantity=-Decimal(shares), price=k,
                           account_id=acct.id, reference_id=f"trade:{t.id}", timestamp=at)
                op.realized_pnl = q6(Decimal(op.open_premium) * shares * (1 if op.right == "CALL" else -1))
            else:  # put without the shares any more: cash-settle the intrinsic value
                intrinsic = (k - s) * shares
                add_ledger(db, op.profile_id, acct.epoch, "OPTION_CLOSE", intrinsic, symbol=op.underlying,
                           quantity=Decimal(op.contracts), price=k - s, account_id=acct.id,
                           reference_id=f"opt:{op.id}:settle", timestamp=at, note="Put settled in cash at expiration")
                op.realized_pnl = q6(intrinsic - Decimal(op.open_premium) * shares)
        n += 1
    if n:
        db.commit()
    return n


def option_holdings(db: Session, acct: SimulationAccount, quote_fn) -> list[dict]:
    out = []
    r = None
    for op in sorted(_open_options(db, acct), key=lambda o: (o.expiry, o.underlying)):
        n = CONTRACT * op.contracts
        try:
            s = float(quote_fn(op.underlying).price)
        except ProviderError:
            s = None
        mv = unreal = mid = None
        if s is not None:
            r = risk_free_rate() if r is None else r
            mid = _px(bs_price(s, float(op.strike), years_to(op.expiry), r, float(op.volatility), op.right))
            if op.right == "CALL":
                mv, unreal = -mid * n, (Decimal(op.open_premium) - mid) * n
            else:
                mv, unreal = mid * n, (mid - Decimal(op.open_premium)) * n
        out.append({"id": op.id, "underlying": op.underlying, "right": op.right, "strategy": op.strategy, "strike": op.strike,
                    "expiry": op.expiry.isoformat(), "contracts": op.contracts, "shares": n, "open_premium": op.open_premium,
                    "current_premium": mid, "underlying_price": s, "market_value": q2(mv) if mv is not None else None,
                    "unrealized_pnl": q2(unreal) if unreal is not None else None, "opened_at": op.opened_at,
                    "days_to_expiry": (op.expiry - datetime.now(NY).date()).days})
    return out
