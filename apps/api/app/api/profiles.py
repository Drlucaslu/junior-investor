"""Setup, parent auth, profiles, settings and the parent dashboard."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import err, get_profile
from app.api.schemas import CHILD_EDITABLE, AIConfigIn, PinChangeIn, PinIn, ProfileIn, ProfilePatch, ResetIn, SettingsPatch, SetupIn
from app.config import get_settings
from app.db import get_db
from app.models import (
    AIUsage,
    AppSetting,
    ChatMessage,
    ChatSession,
    ChildProfile,
    Family,
    JournalEntry,
    LearningProgress,
    LedgerEntry,
    ResearchReport,
    Trade,
    User,
    WatchlistItem,
)
from app.services import auth, market_data
from app.services.portfolio import compute_portfolio
from app.services.trading import create_account, reset_account

router = APIRouter()


def _setting(db: Session, key: str, default=None):
    row = db.get(AppSetting, key)
    return row.value if row else default


def _set(db: Session, key: str, value) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def _family(db: Session) -> Family | None:
    return db.scalar(select(Family).limit(1))


def _parent(db: Session) -> User | None:
    return db.scalar(select(User).where(User.role == "parent").limit(1))


def profile_out(p: ChildProfile) -> dict:
    return {"id": p.id, "nickname": p.nickname, "age_group": p.age_group, "language": p.language, "avatar": p.avatar,
            "starting_cash": p.starting_cash, "allow_etf": p.allow_etf, "allow_fractional": p.allow_fractional,
            "daily_ai_limit": p.daily_ai_limit, "daily_minutes_limit": p.daily_minutes_limit, "created_at": p.created_at}


# ------------------------------------------------------------------ setup / onboarding

@router.get("/setup/status")
def setup_status(db: Session = Depends(get_db)):
    fam = _family(db)
    parent = _parent(db)
    n = db.scalar(select(func.count()).select_from(ChildProfile).where(ChildProfile.archived.is_(False))) or 0
    return {"onboarded": bool(parent and parent.pin_hash), "has_profiles": n > 0, "profile_count": n,
            "default_language": _setting(db, "default_language", get_settings().app_default_language),
            "family_name": fam.name if fam else None,
            "fractional_enabled": get_settings().allow_fractional_shares,
            "default_starting_cash": get_settings().default_starting_cash}


@router.post("/setup")
def setup(body: SetupIn, db: Session = Depends(get_db)):
    parent = _parent(db)
    if parent and parent.pin_hash:
        raise err(409, "ALREADY_SET_UP")
    fam = _family(db) or Family(name=body.family_name)
    fam.name = body.family_name
    db.add(fam)
    db.flush()
    parent = parent or User(family_id=fam.id, role="parent")
    parent.display_name = body.parent_name
    parent.pin_hash = auth.hash_pin(body.pin)
    db.add(parent)
    _set(db, "default_language", body.language)
    db.commit()
    token, exp = auth.issue_parent_token(parent.id)
    return {"parent_token": token, "expires_at": exp}


@router.post("/parent/login")
def parent_login(body: PinIn, db: Session = Depends(get_db)):
    parent = _parent(db)
    if not parent or not auth.verify_pin(body.pin, parent.pin_hash):
        raise err(401, "INVALID_PIN")
    token, exp = auth.issue_parent_token(parent.id)
    return {"parent_token": token, "expires_at": exp}


@router.post("/parent/pin")
def change_pin(body: PinChangeIn, db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    parent = _parent(db)
    if not body.new_pin.isdigit():
        raise err(422, "PIN_DIGITS_ONLY")
    if not parent or not auth.verify_pin(body.old_pin, parent.pin_hash):
        raise err(401, "INVALID_PIN")
    parent.pin_hash = auth.hash_pin(body.new_pin)
    db.commit()
    return {"ok": True}


@router.get("/settings")
def get_app_settings(db: Session = Depends(get_db)):
    s = get_settings()
    fam = _family(db)
    return {"default_language": _setting(db, "default_language", s.app_default_language), "family_name": fam.name if fam else None,
            "llm": _llm_public(),
            "providers": {"market": s.market_data_provider, "fundamentals": s.fundamentals_provider, "search": s.search_provider},
            "simulation": {"currency": s.default_currency, "commission_bps": s.simulated_commission_bps,
                           "slippage_bps": s.simulated_slippage_bps, "fractional_enabled": s.allow_fractional_shares}}


@router.patch("/settings")
def patch_settings(body: SettingsPatch, db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    if body.default_language:
        _set(db, "default_language", body.default_language)
    if body.family_name:
        fam = _family(db)
        if fam:
            fam.name = body.family_name
    db.commit()
    return get_app_settings(db)


# ------------------------------------------------------------------ profiles

@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db)):
    rows = db.scalars(select(ChildProfile).where(ChildProfile.archived.is_(False)).order_by(ChildProfile.created_at))
    return [profile_out(p) for p in rows]


@router.post("/profiles")
def create_profile(body: ProfileIn, db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    fam = _family(db)
    if not fam:
        raise err(409, "SETUP_REQUIRED")
    p = ChildProfile(family_id=fam.id, nickname=body.nickname.strip(), age_group=body.age_group, language=body.language,
                     avatar=body.avatar, starting_cash=body.starting_cash, allow_etf=body.allow_etf,
                     allow_fractional=body.allow_fractional, daily_ai_limit=body.daily_ai_limit,
                     daily_minutes_limit=body.daily_minutes_limit)
    db.add(p)
    db.flush()
    create_account(db, p, Decimal(body.starting_cash))
    db.commit()
    return profile_out(p)


@router.get("/profiles/{profile_id}")
def get_profile_route(p: ChildProfile = Depends(get_profile)):
    return profile_out(p)


@router.patch("/profiles/{profile_id}")
def patch_profile(body: ProfilePatch, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                  x_parent_token: str | None = Header(default=None)):
    changes = body.model_dump(exclude_unset=True, exclude={"clear_ai_limit", "clear_minutes_limit"})
    is_parent = auth.check_parent_token(x_parent_token) is not None
    if not is_parent and (set(changes) - CHILD_EDITABLE or body.clear_ai_limit or body.clear_minutes_limit):
        raise err(401, "PARENT_AUTH_REQUIRED")
    for k, v in changes.items():
        if v is not None:
            setattr(p, k, v)
    if body.clear_ai_limit:
        p.daily_ai_limit = None
    if body.clear_minutes_limit:
        p.daily_minutes_limit = None
    db.commit()
    return profile_out(p)


@router.delete("/profiles/{profile_id}")
def archive_profile(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    p.archived = True  # history is kept; the profile is hidden
    db.commit()
    return {"ok": True}


@router.post("/profiles/{profile_id}/reset-portfolio")
def reset_portfolio(body: ResetIn, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db),
                    _: str = Depends(auth.require_parent)):
    acct = reset_account(db, p, body.starting_cash)
    return {"ok": True, "epoch": acct.epoch, "starting_cash": acct.starting_cash}


@router.get("/profiles/{profile_id}/export")
def export_history(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    trades = db.scalars(select(Trade).where(Trade.profile_id == p.id).order_by(Trade.requested_at)).all()
    ledger = db.scalars(select(LedgerEntry).where(LedgerEntry.profile_id == p.id).order_by(LedgerEntry.epoch, LedgerEntry.timestamp, LedgerEntry.seq)).all()
    journal = db.scalars(select(JournalEntry).where(JournalEntry.profile_id == p.id).order_by(JournalEntry.created_at)).all()
    cols = lambda obj: {c.name: getattr(obj, c.name) for c in obj.__table__.columns}  # noqa: E731
    return {"profile": profile_out(p), "exported_at": datetime.now(timezone.utc), "trades": [cols(t) for t in trades],
            "ledger": [cols(e) for e in ledger], "journal": [cols(j) for j in journal]}


# ------------------------------------------------------------------ parent dashboard

@router.get("/parent/overview")
def parent_overview(db: Session = Depends(get_db), _: str = Depends(auth.require_parent)):
    out = []
    today = date.today()
    for p in db.scalars(select(ChildProfile).where(ChildProfile.archived.is_(False)).order_by(ChildProfile.created_at)):
        try:
            pf = compute_portfolio(db, p.id, market_data.get_quote)
            summary = {k: pf[k] for k in ("total_equity", "cash", "total_pnl", "total_return_pct", "today_pnl", "largest_position_pct")}
            summary["positions"] = len(pf["positions"])
        except Exception:
            summary = None
        trades = db.scalars(select(Trade).where(Trade.profile_id == p.id, Trade.status == "EXECUTED")).all()
        research = db.scalars(select(ResearchReport).where(ResearchReport.profile_id == p.id, ResearchReport.status == "done",
                                                            ResearchReport.parent_id.is_(None))).all()  # follow-ups are not reports
        journal_trade_ids = set(db.scalars(select(JournalEntry.trade_id).where(JournalEntry.profile_id == p.id, JournalEntry.trade_id.is_not(None))))
        chats = db.scalar(select(func.count()).select_from(ChatMessage).join(ChatSession, ChatSession.id == ChatMessage.session_id)
                          .where(ChatSession.profile_id == p.id, ChatMessage.role == "user")) or 0
        learned = db.scalar(select(func.count()).select_from(LearningProgress).where(LearningProgress.profile_id == p.id)) or 0
        watch = db.scalar(select(func.count()).select_from(WatchlistItem).where(WatchlistItem.profile_id == p.id)) or 0
        usage = db.scalar(select(AIUsage).where(AIUsage.profile_id == p.id, AIUsage.day == today))

        def researched_before(t: Trade) -> bool:
            ts = _aware(t.executed_at or t.requested_at)
            return any(r.symbol == t.symbol and _aware(r.created_at) <= ts for r in research)

        buys = [t for t in trades if t.side == "BUY"]
        holding_days = []
        for t in trades:
            if t.side == "SELL":
                first_buy = min((_aware(b.executed_at) for b in buys if b.symbol == t.symbol and b.executed_at and _aware(b.executed_at) <= _aware(t.executed_at)), default=None)
                if first_buy:
                    holding_days.append((_aware(t.executed_at) - first_buy).days)
        out.append({
            "profile": profile_out(p),
            "portfolio": summary,
            "stats": {
                "trades": len(trades), "research_reports": len(research), "master_questions": chats, "learning_cards_completed": learned,
                "watchlist": watch, "ai_requests_today": usage.requests if usage else 0,
                "journal_completion_rate": round(len([t for t in trades if t.id in journal_trade_ids]) / len(trades) * 100, 1) if trades else None,
                "research_before_trade_rate": round(len([t for t in trades if researched_before(t)]) / len(trades) * 100, 1) if trades else None,
                "average_holding_days_on_sells": round(sum(holding_days) / len(holding_days), 1) if holding_days else None,
            },
            "recent_research": [{"id": r.id, "query": r.query, "symbol": r.symbol, "mode": r.mode, "created_at": r.created_at}
                                for r in sorted(research, key=lambda r: _aware(r.created_at), reverse=True)[:5]],
        })
    return {"profiles": out}


def _aware(ts):
    return ts if ts is None or ts.tzinfo else ts.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ AI model settings (parent only)

def _llm_public() -> dict:
    from app.services import ai_config

    c = ai_config.load().public()
    return {"provider": c["preset"], "model": c["model"], "configured": c["configured"], "cloud": c["cloud"]}


@router.get("/settings/ai")
def get_ai_settings(_: str = Depends(auth.require_parent)):
    from app.services import ai_config

    return {"config": ai_config.load().public(), "presets": ai_config.PRESETS}


@router.put("/settings/ai")
def put_ai_settings(body: AIConfigIn, _: str = Depends(auth.require_parent)):
    from app.providers import registry
    from app.services import ai_config

    preset = body.preset if body.preset in ai_config.PRESET_IDS else "custom"
    if not body.model.strip():
        raise err(422, "AI_MODEL_REQUIRED")
    cfg = ai_config.save(preset, body.base_url, body.model, body.api_key, body.temperature, body.native_tools)
    registry.reset_llm()
    return {"config": cfg.public()}


@router.delete("/settings/ai")
def reset_ai_settings(_: str = Depends(auth.require_parent)):
    from app.providers import registry
    from app.services import ai_config

    cfg = ai_config.reset_to_env()
    registry.reset_llm()
    return {"config": cfg.public()}


def _resolve_key(body: AIConfigIn) -> str:
    from app.services import ai_config

    if body.api_key:
        return body.api_key.strip()
    cur = ai_config.load()
    return cur.api_key if cur.base_url.rstrip("/") == body.base_url.rstrip("/") else ""


@router.post("/settings/ai/test")
async def test_ai_settings(body: AIConfigIn, _: str = Depends(auth.require_parent)):
    import time as _t

    from app.providers.llm.base import LLMUnavailable
    from app.providers.llm.openai_compat import OpenAICompatibleProvider

    if not body.model.strip():
        raise err(422, "AI_MODEL_REQUIRED")
    llm = OpenAICompatibleProvider(body.base_url, body.model.strip(), _resolve_key(body), body.temperature, 64, 90, retry_seconds=60)
    t0 = _t.monotonic()
    try:
        r = await llm.chat([{"role": "user", "content": "Reply with exactly: OK"}], max_tokens=16)
    except LLMUnavailable as e:
        return {"ok": False, "error": str(e)[:400], "latency_ms": int((_t.monotonic() - t0) * 1000)}
    return {"ok": True, "reply": (r.content or "")[:200], "model": r.model or body.model, "latency_ms": int((_t.monotonic() - t0) * 1000)}


@router.post("/settings/ai/models")
async def list_ai_models(body: AIConfigIn, _: str = Depends(auth.require_parent)):
    import httpx

    key = _resolve_key(body)
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    if "anthropic.com" in body.base_url and key:
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{body.base_url.rstrip('/')}/models", headers=headers)
        if r.status_code >= 400:
            return {"ok": False, "models": [], "error": f"HTTP {r.status_code}: {r.text[:200]}"}
        data = r.json()
        rows = data.get("data", data.get("models", [])) if isinstance(data, dict) else data
        ids = sorted({(m.get("id") or m.get("name") or "").removeprefix("models/") for m in rows if isinstance(m, dict)} - {""})
        return {"ok": True, "models": ids[:500]}
    except Exception as e:  # network errors, bad JSON
        return {"ok": False, "models": [], "error": str(e)[:200]}
