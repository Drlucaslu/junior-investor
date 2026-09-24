"""Stock splits, reverse splits and cash dividends (PRD §7.7).

Idempotent: each action writes a ledger row with a unique reference_id
(e.g. `DIV:AAPL:2026-08-11`), so re-running never double-applies.

Known simplifications (documented in README):
* Dividends are credited on the ex-date (real brokers pay on the pay date).
* Shares held at the *start* of the ex-date are eligible.
* Fractional shares created by a reverse split are kept as fractions.
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ChildProfile
from app.providers.types import CorporateAction, ProviderError
from app.services import market_data
from app.services.portfolio import current_account, ledger_entries, replay
from app.services.trading import _locks, add_ledger

log = logging.getLogger(__name__)
NY = ZoneInfo("America/New_York")
CHECK_INTERVAL = timedelta(hours=6)


def _ex_ts(d: str) -> datetime:
    y, m, dd = (int(x) for x in d.split("-"))
    return datetime.combine(datetime(y, m, dd).date(), time(0, 0), NY).astimezone(timezone.utc)


def apply_corporate_actions(db: Session, profile: ChildProfile, force: bool = False,
                            actions_override: dict[str, list[CorporateAction]] | None = None) -> list[str]:
    acct = current_account(db, profile.id)
    now = datetime.now(timezone.utc)
    last = acct.last_corporate_action_check
    if not force and last and (now - (last if last.tzinfo else last.replace(tzinfo=timezone.utc))) < CHECK_INTERVAL:
        return []
    applied: list[str] = []
    with _locks[profile.id]:
        entries = ledger_entries(db, profile.id, acct.epoch)
        symbols = sorted({e.symbol for e in entries if e.symbol and e.type in ("BUY", "SELL")})
        existing = {e.reference_id for e in entries if e.reference_id}
        for sym in symbols:
            first = min((e.timestamp for e in entries if e.symbol == sym and e.type == "BUY"), default=None)
            if first is None:
                continue
            first = first if first.tzinfo else first.replace(tzinfo=timezone.utc)
            since = (first.astimezone(NY).date() - timedelta(days=1)).isoformat()
            try:
                actions = (actions_override or {}).get(sym) if actions_override is not None else market_data.get_corporate_actions(sym, since)
            except ProviderError as e:
                log.info("corporate actions unavailable for %s: %s", sym, e)
                continue
            for a in sorted(actions or [], key=lambda x: x.date):
                ex = _ex_ts(a.date)
                if ex <= first or ex > now:
                    continue
                ref = f"{'DIV' if a.type == 'DIVIDEND' else 'SPLIT'}:{sym}:{a.date}"
                if ref in existing:
                    continue
                st = replay([e for e in ledger_entries(db, profile.id, acct.epoch) if (e.timestamp if e.timestamp.tzinfo else e.timestamp.replace(tzinfo=timezone.utc)) < ex])
                held = st.lots.get(sym).quantity if sym in st.lots else Decimal(0)
                if held <= 0:
                    continue
                try:
                    if a.type == "DIVIDEND":
                        add_ledger(db, profile.id, acct.epoch, "DIVIDEND_CASH", held * Decimal(a.value), symbol=sym,
                                   quantity=None, price=Decimal(a.value), reference_id=ref, timestamp=ex,
                                   note=f"Cash dividend {a.value}/share on {held} shares ({a.source})")
                    else:
                        ratio = Decimal(a.value)
                        if ratio <= 0:
                            continue
                        delta = held * ratio - held
                        add_ledger(db, profile.id, acct.epoch, "SPLIT_ADJUSTMENT", Decimal(0), symbol=sym, quantity=delta,
                                   reference_id=ref, timestamp=ex, note=f"Split ratio {ratio} ({a.source})")
                    db.flush()
                    existing.add(ref)
                    applied.append(ref)
                except IntegrityError:
                    db.rollback()
        acct.last_corporate_action_check = now
        db.commit()
    return applied
