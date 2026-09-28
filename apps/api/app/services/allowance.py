"""Pocket-money top-ups ("allowance") into the child's family account.

Idempotent: each payment uses reference ``allowance:<schedule>:<date>``, so
running it any number of times never pays twice. Missed days are caught up the
next time the app is opened (at most 60 payments at once).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AllowanceSchedule, ChildProfile, LedgerEntry, SimulationAccount

MAX_CATCH_UP = 60


def is_due(s: AllowanceSchedule, d: date) -> bool:
    if s.frequency == "weekly":
        return d.weekday() == s.weekday
    return d.day == s.day_of_month


def next_date(s: AllowanceSchedule, after: date) -> date | None:
    if not s.enabled:
        return None
    d = max(after, s.start_date)
    for _ in range(40):
        if is_due(s, d):
            return d
        d += timedelta(days=1)
    return None


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def apply_due(db: Session, profile: ChildProfile, acct: SimulationAccount, today: date | None = None) -> int:
    from app.services.trading import add_ledger

    s = db.scalar(select(AllowanceSchedule).where(AllowanceSchedule.profile_id == profile.id))
    if not s or not s.enabled or Decimal(s.amount) <= 0:
        return 0
    today = today or today_utc()
    start = max(s.start_date, (s.last_run_date + timedelta(days=1)) if s.last_run_date else s.start_date)
    if start > today:
        return 0
    existing = set(db.scalars(select(LedgerEntry.reference_id).where(LedgerEntry.account_id == acct.id, LedgerEntry.epoch == acct.epoch,
                                                                     LedgerEntry.type == "ALLOWANCE")))
    due = []
    d = start
    while d <= today:
        if is_due(s, d):
            due.append(d)
        d += timedelta(days=1)
    paid = 0
    for d in due[-MAX_CATCH_UP:]:
        ref = f"allowance:{s.id}:{d.isoformat()}"
        if ref in existing:
            continue
        ts = datetime(d.year, d.month, d.day, 12, 0, tzinfo=timezone.utc)
        add_ledger(db, profile.id, acct.epoch, "ALLOWANCE", Decimal(s.amount), account_id=acct.id, reference_id=ref, timestamp=ts,
                   note=s.note or ("Weekly pocket money" if s.frequency == "weekly" else "Monthly pocket money"))
        paid += 1
    s.last_run_date = today
    db.commit()
    return paid


def schedule_out(s: AllowanceSchedule | None) -> dict | None:
    if not s:
        return None
    return {"amount": s.amount, "frequency": s.frequency, "weekday": s.weekday, "day_of_month": s.day_of_month,
            "start_date": s.start_date, "enabled": s.enabled, "note": s.note, "last_run_date": s.last_run_date,
            "next_date": next_date(s, max(today_utc() + timedelta(days=1), s.start_date) if s.last_run_date else s.start_date)}
