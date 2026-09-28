"""Learning path service: levels, asset unlocks, learning points (XP), badges,
the family leaderboard, and the idempotent "sync" that credits level bonuses,
matures CDs, settles options and pays pocket money."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.data.learn_cards import CARDS
from app.data.levels import BADGES, DAILY_CAPS, LEARNING_START_CASH, LEVELS, MAX_LEVEL, REASON_MIN_CHARS, XP
from app.models import (
    ChildProfile, Deposit, JournalEntry, LearningProgress, LedgerEntry, ResearchReport, ScenarioRun,
    SimulationAccount, XPEvent,
)
from app.services.portfolio import ledger_entries, replay

log = logging.getLogger(__name__)
ALL_FAMILY_ASSETS = ["cash", "cd", "bond_etf", "equity_etf", "stock"]


# ---------------------------------------------------------------- accounts

def ensure_accounts(db: Session, profile: ChildProfile) -> dict[str, SimulationAccount]:
    from app.services.trading import create_account

    accts = {a.kind: a for a in db.scalars(select(SimulationAccount).where(SimulationAccount.profile_id == profile.id))}
    changed = False
    if "family" not in accts:
        accts["family"] = create_account(db, profile, Decimal(profile.starting_cash), "family")
        changed = True
    if "learning" not in accts:
        accts["learning"] = create_account(db, profile, LEARNING_START_CASH, "learning")
        changed = True
    if changed:
        db.commit()
    return accts


# ---------------------------------------------------------------- levels

def completed_cards(db: Session, pid: str) -> set[str]:
    return set(db.scalars(select(LearningProgress.card_id).where(LearningProgress.profile_id == pid)))


def completed_scenarios(db: Session, pid: str) -> set[str]:
    return set(db.scalars(select(ScenarioRun.scenario_id).where(ScenarioRun.profile_id == pid, ScenarioRun.status == "done")))


def earned_level(cards: set[str], scenarios: set[str]) -> int:
    lvl = 1
    for lv in LEVELS[1:]:
        if all(c in cards for c in lv["cards"]) and all(s in scenarios for s in lv["scenarios"]):
            lvl = lv["level"]
        else:
            break
    return lvl


def current_level(db: Session, profile: ChildProfile, cards: set[str] | None = None, scenarios: set[str] | None = None) -> int:
    cards = completed_cards(db, profile.id) if cards is None else cards
    scenarios = completed_scenarios(db, profile.id) if scenarios is None else scenarios
    return min(MAX_LEVEL, max(earned_level(cards, scenarios), profile.level_override or 1))


def unlock_level(asset_class: str) -> int | None:
    return next((lv["level"] for lv in LEVELS if asset_class in lv["assets"]), None)


def allowed_assets(db: Session, profile: ChildProfile, kind: str, level: int | None = None) -> list[str]:
    level = current_level(db, profile) if level is None else level
    if kind == "family" and profile.family_access == "all":
        return ALL_FAMILY_ASSETS + (["options"] if level >= unlock_level("options") else [])
    return list(LEVELS[level - 1]["assets"])


# ---------------------------------------------------------------- XP

def award(db: Session, pid: str, kind: str, ref: str, points: int, commit: bool = True) -> bool:
    if db.scalar(select(XPEvent.id).where(XPEvent.profile_id == pid, XPEvent.kind == kind, XPEvent.ref == ref)):
        return False
    try:
        with db.begin_nested():
            db.add(XPEvent(profile_id=pid, kind=kind, ref=ref, points=points))
    except IntegrityError:
        return False
    if commit:
        db.commit()
    return True


def _day_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def award_capped(db: Session, pid: str, kind: str, ref: str) -> bool:
    cap = DAILY_CAPS.get(kind)
    if cap is not None:
        today = db.scalar(select(func.count(XPEvent.id)).where(XPEvent.profile_id == pid, XPEvent.kind == kind,
                                                                XPEvent.created_at >= _day_start())) or 0
        if today >= cap:
            return False
    return award(db, pid, kind, ref, XP[kind])


def xp_summary(db: Session, pid: str) -> dict:
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    total = db.scalar(select(func.coalesce(func.sum(XPEvent.points), 0)).where(XPEvent.profile_id == pid)) or 0
    week = db.scalar(select(func.coalesce(func.sum(XPEvent.points), 0)).where(XPEvent.profile_id == pid,
                                                                             XPEvent.created_at >= week_start)) or 0
    return {"total": int(total), "week": int(week)}


# ---------------------------------------------------------------- sync

def sync(db: Session, profile: ChildProfile) -> dict:
    """Idempotent housekeeping. Safe to call on every page load."""
    from app.services import allowance, products
    from app.services.trading import add_ledger

    accts = ensure_accounts(db, profile)
    for acct in accts.values():
        try:
            products.mature_cds(db, acct)
            products.settle_expired(db, acct)
        except Exception as e:  # noqa: BLE001 - never block page loads
            log.warning("product housekeeping failed: %s", e)
            db.rollback()
    try:
        allowance.apply_due(db, profile, accts["family"])
    except Exception as e:  # noqa: BLE001
        log.warning("allowance failed: %s", e)
        db.rollback()

    cards = completed_cards(db, profile.id)
    scenarios = completed_scenarios(db, profile.id)
    level = current_level(db, profile, cards, scenarios)
    learn = accts["learning"]
    refs = set(db.scalars(select(LedgerEntry.reference_id).where(LedgerEntry.account_id == learn.id,
                                                                   LedgerEntry.epoch == learn.epoch, LedgerEntry.type == "LEVEL_BONUS")))
    new_levels = []
    for lv in LEVELS[1:level]:
        ref = f"level:{lv['level']}"
        if ref not in refs and lv["bonus"] > 0:
            add_ledger(db, profile.id, learn.epoch, "LEVEL_BONUS", lv["bonus"], account_id=learn.id, reference_id=ref,
                       note=f"Level {lv['level']} ({lv['id']}) unlocked")
            new_levels.append(lv["level"])
        if lv["level"] <= earned_level(cards, scenarios):  # points only for levels earned by learning, not granted by a parent
            award(db, profile.id, "level_up", str(lv["level"]), XP["level_up"], commit=False)
    for cid in cards:  # XP for lessons completed before v0.4
        award(db, profile.id, "card", cid, XP["card"], commit=False)
    # Patience: positions held 30+ days in either account.
    now = datetime.now(timezone.utc)
    for acct in accts.values():
        st = replay(ledger_entries(db, acct))
        for sym, lot in st.lots.items():
            if lot.quantity > 0 and lot.first_acquired and (now - lot.first_acquired).days >= 30:
                award(db, profile.id, "patience", f"{acct.kind}:{sym}:{lot.first_acquired.date().isoformat()}", XP["patience"], commit=False)
    db.commit()
    return {"level": level, "new_levels": new_levels, "accounts": accts}


# ---------------------------------------------------------------- badges & path

def badges(db: Session, profile: ChildProfile, level: int, scenarios: set[str]) -> list[dict]:
    from app.data.scenarios import SCENARIOS

    pid = profile.id
    accts = list(db.scalars(select(SimulationAccount).where(SimulationAccount.profile_id == pid)))
    ids = [a.id for a in accts]
    earned: set[str] = set()
    if db.scalar(select(Deposit.id).where(Deposit.profile_id == pid).limit(1)):
        earned.add("first_cd")
    from app.services.assets import BOND_ETFS
    bought = set(db.scalars(select(LedgerEntry.symbol).where(LedgerEntry.account_id.in_(ids), LedgerEntry.type == "BUY")))
    if bought & BOND_ETFS:
        earned.add("lender")
    now = datetime.now(timezone.utc)
    for a in accts:
        st = replay(ledger_entries(db, a))
        classes = {"cash"} if st.cash > 0 else set()
        held = [s for s, lot in st.lots.items() if lot.quantity > 0]
        for s in held:
            classes.add("bond" if s in BOND_ETFS else "equity")
        if db.scalar(select(Deposit.id).where(Deposit.account_id == a.id, Deposit.status == "OPEN").limit(1)):
            classes.add("cd")
        if len(classes) >= 3 or len(held) >= 5:
            earned.add("diversified")
        if any(lot.quantity > 0 and lot.first_acquired and (now - lot.first_acquired).days >= 90 for lot in st.lots.values()):
            earned.add("patient")
    if scenarios:
        earned.add("time_traveler")
    if all(s["id"] in scenarios for s in SCENARIOS):
        earned.add("historian")
    reasons = db.scalar(select(func.count(JournalEntry.id)).where(JournalEntry.profile_id == pid,
                                                                  func.length(JournalEntry.content) >= REASON_MIN_CHARS)) or 0
    if reasons >= 10:
        earned.add("reflective")
    if level >= MAX_LEVEL:
        earned.add("graduate")
    return [{**b, "earned": b["id"] in earned} for b in BADGES]


def _level_public(lv: dict) -> dict:
    return {k: (str(v) if k == "bonus" else v) for k, v in lv.items()}


def path(db: Session, profile: ChildProfile) -> dict:
    from app.data.scenarios import SCENARIO_INDEX

    info = sync(db, profile)
    cards = completed_cards(db, profile.id)
    scenarios = completed_scenarios(db, profile.id)
    level = info["level"]
    earned = earned_level(cards, scenarios)
    titles = {c["id"]: (c["title_en"], c["title_zh"]) for c in CARDS}
    levels = []
    next_step = None
    for lv in LEVELS:
        reqs = [{"type": "card", "id": c, "title_en": titles[c][0], "title_zh": titles[c][1], "done": c in cards} for c in lv["cards"]]
        reqs += [{"type": "scenario", "id": s, "title_en": SCENARIO_INDEX[s]["title_en"], "title_zh": SCENARIO_INDEX[s]["title_zh"],
                  "done": s in scenarios} for s in lv["scenarios"]]
        unlocked = lv["level"] <= level
        if next_step is None and lv["level"] > earned:
            next_step = next(({**r, "level": lv["level"]} for r in reqs if not r["done"]), None)
        levels.append({**_level_public(lv), "unlocked": unlocked, "requirements": reqs,
                       "progress": {"done": sum(r["done"] for r in reqs), "total": len(reqs)}})
    xp = xp_summary(db, profile.id)
    return {"level": level, "earned_level": earned, "level_override": profile.level_override, "max_level": MAX_LEVEL,
            "levels": levels, "xp": xp, "badges": badges(db, profile, level, scenarios), "next_step": next_step,
            "new_levels": info["new_levels"],
            "allowed": {"learning": allowed_assets(db, profile, "learning", level),
                        "family": allowed_assets(db, profile, "family", level)},
            "family_access": profile.family_access}


def leaderboard(db: Session, family_id: str) -> list[dict]:
    rows = []
    for p in db.scalars(select(ChildProfile).where(ChildProfile.family_id == family_id, ChildProfile.archived.is_(False))):
        scen = completed_scenarios(db, p.id)
        lvl = current_level(db, p, None, scen)
        xp = xp_summary(db, p.id)
        rows.append({"profile_id": p.id, "nickname": p.nickname, "avatar": p.avatar, "level": lvl, "xp_total": xp["total"],
                     "xp_week": xp["week"], "scenarios_done": len(scen), "cards_done": len(completed_cards(db, p.id)),
                     "badges": sum(b["earned"] for b in badges(db, p, lvl, scen))})
    rows.sort(key=lambda r: (-r["xp_week"], -r["xp_total"], r["nickname"].lower()))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def research_done(db: Session, report: ResearchReport) -> None:
    try:
        award_capped(db, report.profile_id, "research", report.id)
    except Exception as e:  # noqa: BLE001
        log.info("research xp failed: %s", e)
        db.rollback()



