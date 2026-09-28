"""v0.4 learning path API: levels, leaderboard, time-machine scenarios, CDs,
simplified options, pocket money and parent deposits."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import err, get_profile
from app.api.schemas import AllowanceIn, CDIn, DepositIn, OptionIn, ScenarioDecisionIn
from app.db import get_db
from app.models import AllowanceSchedule, ChildProfile, JournalEntry, ScenarioRun
from app.services import allowance, auth, learning, products, scenarios
from app.services.portfolio import current_account

router = APIRouter()


def _acct(db: Session, p: ChildProfile, kind: str):
    learning.ensure_accounts(db, p)
    return current_account(db, p.id, kind)


def _product_err(e: products.ProductError):
    status = 503 if e.code == "MARKET_DATA_UNAVAILABLE" else 422
    return err(status, e.code, **e.detail)


def _require_asset(db: Session, p: ChildProfile, kind: str, asset: str) -> None:
    if asset not in learning.allowed_assets(db, p, kind):
        raise err(422, "ASSET_LOCKED", asset_class=asset, unlock_level=learning.unlock_level(asset), account=kind)


# ---------------------------------------------------------------- path & leaderboard

@router.get("/profiles/{profile_id}/path")
def get_path(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    return learning.path(db, p)


@router.get("/family/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    from app.models import Family

    fam = db.scalar(select(Family).limit(1))
    return {"rows": learning.leaderboard(db, fam.id) if fam else [], "basis": "learning_points"}


# ---------------------------------------------------------------- scenarios

@router.get("/scenarios")
def list_scenarios():
    return scenarios.list_public()


@router.get("/profiles/{profile_id}/scenarios")
def profile_scenarios(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    return {"scenarios": scenarios.list_public(), "runs": scenarios.runs_for(db, p)}


@router.post("/profiles/{profile_id}/scenarios/{scenario_id}/start")
def start_scenario(scenario_id: str, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    try:
        run = scenarios.start(db, p, scenario_id)
    except scenarios.ScenarioError as e:
        raise err(404, e.code) from e
    return scenarios.state(db, run)


def _run(db: Session, run_id: str) -> ScenarioRun:
    run = db.get(ScenarioRun, run_id)
    if not run:
        raise err(404, "RUN_NOT_FOUND")
    return run


@router.get("/scenario-runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)):
    return scenarios.state(db, _run(db, run_id))


@router.post("/scenario-runs/{run_id}/decide")
def decide(run_id: str, body: ScenarioDecisionIn, db: Session = Depends(get_db)):
    run = _run(db, run_id)
    p = db.get(ChildProfile, run.profile_id)
    before = learning.current_level(db, p)
    try:
        run = scenarios.decide(db, p, run, body.allocations, body.reason)
    except scenarios.ScenarioError as e:
        raise err(422, e.code, **e.detail) from e
    out = scenarios.state(db, run)
    if run.status == "done":
        info = learning.sync(db, p)
        out["level"] = info["level"]
        out["level_up"] = info["level"] > before
    return out


# ---------------------------------------------------------------- CDs

@router.get("/cd/offers")
def get_cd_offers():
    return {"offers": products.cd_offers(), "rate_source": "13-week US Treasury bill yield (Yahoo ^IRX), simulated bank rates"}


@router.post("/profiles/{profile_id}/cd")
def open_cd(body: CDIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    _require_asset(db, p, body.account, "cd")
    acct = _acct(db, p, body.account)
    try:
        dep = products.open_cd(db, p, acct, body.amount, body.term_months)
    except products.ProductError as e:
        raise _product_err(e) from e
    return {"id": dep.id, "principal": dep.principal, "apy": dep.apy, "matures_at": dep.matures_at}


@router.post("/profiles/{profile_id}/cd/{deposit_id}/withdraw")
def withdraw_cd(deposit_id: str, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                account: str = Query("learning", pattern="^(learning|family)$")):
    acct = _acct(db, p, account)
    try:
        dep = products.break_cd(db, acct, deposit_id)
    except products.ProductError as e:
        raise _product_err(e) from e
    return {"id": dep.id, "status": dep.status, "payout": dep.payout}


# ---------------------------------------------------------------- options

@router.get("/profiles/{profile_id}/options/chain/{symbol}")
def option_chain(symbol: str, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                 strategy: str = Query("covered_call", pattern="^(covered_call|protective_put)$"),
                 account: str = Query("learning", pattern="^(learning|family)$")):
    _require_asset(db, p, account, "options")
    try:
        return products.chain(db, _acct(db, p, account), symbol, strategy)
    except products.ProductError as e:
        raise _product_err(e) from e


@router.post("/profiles/{profile_id}/options/preview")
def option_preview(body: OptionIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    _require_asset(db, p, body.account, "options")
    try:
        return products.preview_option(db, _acct(db, p, body.account), body.symbol, body.strategy, body.strike, body.expiry, body.contracts)
    except products.ProductError as e:
        raise _product_err(e) from e


@router.post("/profiles/{profile_id}/options/open")
def option_open(body: OptionIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    _require_asset(db, p, body.account, "options")
    acct = _acct(db, p, body.account)
    try:
        op = products.open_option(db, p, acct, body.symbol, body.strategy, body.strike, body.expiry, body.contracts,
                                  journal=body.journal_content)
    except products.ProductError as e:
        raise _product_err(e) from e
    if body.journal_content and body.journal_content.strip():
        db.add(JournalEntry(profile_id=p.id, symbol=op.underlying, type="pre_trade", content=body.journal_content.strip(),
                            context={"option": op.strategy, "strike": str(op.strike), "expiry": op.expiry.isoformat(),
                                     "contracts": op.contracts, "premium": str(op.open_premium), "account": body.account}))
        db.commit()
        if len(body.journal_content.strip()) >= 20:
            learning.award_capped(db, p.id, "journal", f"option:{op.id}")
    return {"id": op.id, "status": op.status, "premium": op.open_premium, "contracts": op.contracts}


@router.post("/profiles/{profile_id}/options/{option_id}/close")
def option_close(option_id: str, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                 account: str = Query("learning", pattern="^(learning|family)$")):
    try:
        op = products.close_option(db, _acct(db, p, account), option_id)
    except products.ProductError as e:
        raise _product_err(e) from e
    return {"id": op.id, "status": op.status, "close_premium": op.close_premium, "realized_pnl": op.realized_pnl}


# ---------------------------------------------------------------- pocket money & deposits (parent)

@router.get("/profiles/{profile_id}/allowance")
def get_allowance(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    return {"schedule": allowance.schedule_out(db.scalar(select(AllowanceSchedule).where(AllowanceSchedule.profile_id == p.id)))}


@router.put("/profiles/{profile_id}/allowance")
def put_allowance(body: AllowanceIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                  _: str = Depends(auth.require_parent)):
    s = db.scalar(select(AllowanceSchedule).where(AllowanceSchedule.profile_id == p.id))
    start = body.start_date or allowance.today_utc()
    if not s:
        s = AllowanceSchedule(profile_id=p.id, amount=body.amount, start_date=start)
        db.add(s)
    changed_timing = (s.frequency, s.weekday, s.day_of_month, s.start_date) != (body.frequency, body.weekday, body.day_of_month, start)
    s.amount, s.frequency, s.weekday, s.day_of_month = body.amount, body.frequency, body.weekday, body.day_of_month
    s.start_date, s.enabled, s.note = start, body.enabled, body.note
    if changed_timing:
        # New timing applies from the start date; days already paid are never paid twice (idempotent references).
        s.last_run_date = None
    db.commit()
    learning.sync(db, p)
    db.refresh(s)
    return {"schedule": allowance.schedule_out(s)}


@router.delete("/profiles/{profile_id}/allowance")
def delete_allowance(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    s = db.scalar(select(AllowanceSchedule).where(AllowanceSchedule.profile_id == p.id))
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}


@router.post("/profiles/{profile_id}/deposit")
def parent_deposit(body: DepositIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                   _: str = Depends(auth.require_parent)):
    from app.services.trading import add_ledger

    acct = _acct(db, p, "family")
    now = datetime.now(timezone.utc)
    add_ledger(db, p.id, acct.epoch, "PARENT_DEPOSIT", Decimal(body.amount), account_id=acct.id,
               reference_id=f"deposit:{now.timestamp():.6f}", note=body.note or "Deposit from parent", timestamp=now)
    db.commit()
    return {"ok": True, "amount": body.amount}
