"""Scenario engine: deterministic replays of real history with hidden names."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.data.levels import REASON_MIN_CHARS, XP
from app.data.scenarios import SCENARIO_INDEX, SCENARIOS, prices
from app.models import ChildProfile, ScenarioRun

START_VALUE = 10000.0
MIN_REASON = 10


class ScenarioError(Exception):
    def __init__(self, code: str, detail: dict | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail or {}


def _months(start: str, end: str) -> list[str]:
    y, m = int(start[:4]), int(start[5:])
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _px(ticker: str, month: str) -> float:
    return prices()[ticker][month]


def _lang(obj: dict, key: str, zh: bool):
    return obj[f"{key}_zh" if zh else f"{key}_en"]


def list_public(zh: bool = False) -> list[dict]:
    return [{"id": s["id"], "year": s["year"], "difficulty": s["difficulty"], "unlocks_for": s["unlocks_for"],
             "title_en": s["title_en"], "title_zh": s["title_zh"], "tagline_en": s["tagline_en"], "tagline_zh": s["tagline_zh"],
             "companies": len(s["companies"]), "years": int(s["dates"][-1][:4]) - int(s["dates"][0][:4])} for s in SCENARIOS]


def _keys(s: dict) -> list[str]:
    return [c["key"] for c in s["companies"]]


def _value_at(s: dict, units: dict[str, float], cash: float, month: str) -> float:
    return cash + sum(u * _px(c["ticker"], month) for c in s["companies"] for k, u in units.items() if k == c["key"])


def replay(s: dict, decisions: list[dict], upto_step: int) -> dict:
    """Replay decisions. Returns holdings at dates[upto_step] and the monthly value path."""
    dates = s["dates"]
    tick = {c["key"]: c["ticker"] for c in s["companies"]}
    value = START_VALUE
    units: dict[str, float] = {}
    cash = START_VALUE
    path: list[tuple[str, float]] = [(dates[0], START_VALUE)]
    checkpoints = [START_VALUE]
    for i in range(upto_step):
        alloc = decisions[i]["allocations"]
        month = dates[i]
        value = cash + sum(u * _px(tick[k], month) for k, u in units.items())
        units = {k: value * pct / 100 / _px(tick[k], month) for k, pct in alloc.items() if k != "CASH" and pct > 0 and _px(tick[k], month) > 0}
        cash = value * alloc.get("CASH", 0) / 100
        for mth in _months(month, dates[i + 1])[1:]:
            path.append((mth, cash + sum(u * _px(tick[k], mth) for k, u in units.items())))
        checkpoints.append(path[-1][1])
    now_month = dates[upto_step]
    value = cash + sum(u * _px(tick[k], now_month) for k, u in units.items())
    weights = {k: (u * _px(tick[k], now_month) / value * 100 if value else 0) for k, u in units.items()}
    weights["CASH"] = cash / value * 100 if value else 0
    return {"value": value, "units": units, "cash": cash, "path": path, "checkpoints": checkpoints, "weights": weights}


def _chart(s: dict, upto: str) -> dict:
    months = _months(s["dates"][0], upto)
    series = {}
    for c in s["companies"]:
        base = _px(c["ticker"], months[0])
        series[c["key"]] = [round(_px(c["ticker"], m) / base * 100, 2) for m in months]
    b = s["benchmark"]
    series["MARKET"] = [round(_px(b, m) / _px(b, months[0]) * 100, 2) for m in months]
    return {"months": months, "series": series}


def _max_drawdown(values: list[float]) -> float:
    peak, mdd = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        if peak > 0:
            mdd = min(mdd, v / peak - 1)
    return round(mdd * 100, 2)


def _result(s: dict, run: ScenarioRun) -> dict:
    dates = s["dates"]
    rp = replay(s, run.decisions, len(dates) - 1)
    start, end = dates[0], dates[-1]
    years = (int(end[:4]) - int(start[:4])) + (int(end[5:]) - int(start[5:])) / 12
    final = rp["value"]
    b = s["benchmark"]
    bench = START_VALUE * _px(b, end) / _px(b, start)
    per = {c["key"]: round((_px(c["ticker"], end) / _px(c["ticker"], start) - 1) * 100, 2) for c in s["companies"]}
    equal = sum(START_VALUE / len(s["companies"]) * _px(c["ticker"], end) / _px(c["ticker"], start) for c in s["companies"])
    best = max(per, key=lambda k: per[k])
    bmonths = _months(start, end)
    bvals = [_px(b, m) for m in bmonths]
    bench_mdd = _max_drawdown(bvals)
    return {
        "final_value": round(final, 2), "return_pct": round((final / START_VALUE - 1) * 100, 2),
        "annualized_pct": round(((final / START_VALUE) ** (1 / years) - 1) * 100, 2) if years > 0 and final > 0 else None,
        "benchmark_value": round(bench, 2), "benchmark_return_pct": round((bench / START_VALUE - 1) * 100, 2),
        "equal_weight_value": round(equal, 2), "equal_weight_return_pct": round((equal / START_VALUE - 1) * 100, 2),
        "company_returns_pct": per, "best_company": best, "max_drawdown_pct": _max_drawdown([v for _, v in rp["path"]]),
        "checkpoint_values": [round(v, 2) for v in rp["checkpoints"]],
        "path": [{"month": m, "value": round(v, 2)} for m, v in rp["path"]],
        "leverage": {"market_max_drawdown_pct": bench_mdd, "with_2x_leverage_pct": max(-100.0, round(bench_mdd * 2, 2)),
                     "wiped_out": bench_mdd * 2 <= -100 or bench_mdd <= -40},
        "years": round(years, 1),
    }


def state(db: Session, run: ScenarioRun, zh: bool = False) -> dict:
    s = SCENARIO_INDEX[run.scenario_id]
    dates = s["dates"]
    done = run.status == "done"
    step = len(dates) - 1 if done else run.step
    rp = replay(s, run.decisions, step)
    now = dates[step]
    companies = []
    for c in s["companies"]:
        pub = {"key": c["key"], "desc_en": c["desc_en"], "desc_zh": c["desc_zh"], "facts_en": c["facts_en"], "facts_zh": c["facts_zh"],
               "price_index": round(_px(c["ticker"], now) / _px(c["ticker"], dates[0]) * 100, 2)}
        if done:
            pub.update({"name": c["name"], "ticker": c["ticker"], "story_en": c["story_en"], "story_zh": c["story_zh"], "approx": c["approx"]})
        companies.append(pub)
    out = {
        "run": {"id": run.id, "scenario_id": run.scenario_id, "status": run.status, "step": step, "decisions": run.decisions,
                "started_at": run.started_at, "finished_at": run.finished_at},
        "scenario": {"id": s["id"], "title_en": s["title_en"], "title_zh": s["title_zh"], "tagline_en": s["tagline_en"],
                     "tagline_zh": s["tagline_zh"], "intro_en": s["intro_en"], "intro_zh": s["intro_zh"], "dates": dates,
                     "decisions_total": len(dates) - 1, "start_value": START_VALUE},
        "now": {"month": now, "value": round(rp["value"], 2), "weights": {k: round(v, 2) for k, v in rp["weights"].items()},
                "event_en": s["events"].get(now, {}).get("en") if step > 0 else None,
                "event_zh": s["events"].get(now, {}).get("zh") if step > 0 else None},
        "companies": companies,
        "chart": _chart(s, now),
        "history": [{"month": dates[i + 1], "event_en": s["events"][dates[i + 1]]["en"], "event_zh": s["events"][dates[i + 1]]["zh"]}
                    for i in range(step)],
    }
    if done:
        out["result"] = run.result
        out["lessons_en"], out["lessons_zh"] = s["lessons_en"], s["lessons_zh"]
        out["questions_en"], out["questions_zh"] = s["questions_en"], s["questions_zh"]
    return out


def start(db: Session, profile: ChildProfile, scenario_id: str) -> ScenarioRun:
    if scenario_id not in SCENARIO_INDEX:
        raise ScenarioError("SCENARIO_NOT_FOUND")
    active = db.scalar(select(ScenarioRun).where(ScenarioRun.profile_id == profile.id, ScenarioRun.scenario_id == scenario_id,
                                                 ScenarioRun.status == "active"))
    if active:
        return active
    run = ScenarioRun(profile_id=profile.id, scenario_id=scenario_id, status="active", step=0, decisions=[])
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def decide(db: Session, profile: ChildProfile, run: ScenarioRun, allocations: dict[str, float], reason: str) -> ScenarioRun:
    from app.services import learning

    if run.status != "active":
        raise ScenarioError("SCENARIO_FINISHED")
    s = SCENARIO_INDEX[run.scenario_id]
    keys = set(_keys(s)) | {"CASH"}
    alloc = {}
    for k, v in (allocations or {}).items():
        if k not in keys:
            raise ScenarioError("INVALID_ALLOCATION", {"key": k})
        try:
            f = float(v)
        except (TypeError, ValueError) as e:
            raise ScenarioError("INVALID_ALLOCATION", {"key": k}) from e
        if f < 0 or f > 100:
            raise ScenarioError("INVALID_ALLOCATION", {"key": k})
        if f > 0:
            alloc[k] = round(f, 2)
    if abs(sum(alloc.values()) - 100) > 0.5:
        raise ScenarioError("ALLOCATION_NOT_100", {"total": round(sum(alloc.values()), 2)})
    reason = (reason or "").strip()
    if len(reason) < MIN_REASON:
        raise ScenarioError("REASON_REQUIRED", {"min_chars": MIN_REASON})
    step = run.step
    month = s["dates"][step]
    # Cannot buy something with no price yet / after it disappeared.
    for k in alloc:
        if k != "CASH":
            t = next(c["ticker"] for c in s["companies"] if c["key"] == k)
            if _px(t, month) <= 0:
                raise ScenarioError("ASSET_UNAVAILABLE", {"key": k})
    decisions = list(run.decisions or [])
    decisions = decisions[:step] + [{"step": step, "month": month, "allocations": alloc, "reason": reason[:1000]}]
    run.decisions = decisions
    if step + 1 >= len(s["dates"]) - 1:
        run.step = len(s["dates"]) - 1
        run.status = "done"
        run.finished_at = datetime.now(timezone.utc)
        first = not db.scalar(select(ScenarioRun.id).where(ScenarioRun.profile_id == profile.id, ScenarioRun.scenario_id == run.scenario_id,
                                                           ScenarioRun.status == "done", ScenarioRun.id != run.id))
        xp = 0
        if first:
            xp = XP["scenario"] + sum(XP["scenario_reason"] for d in decisions if len(d["reason"]) >= REASON_MIN_CHARS)
            learning.award(db, profile.id, "scenario", run.scenario_id, xp, commit=False)
        run.result = {**_result(s, run), "xp_awarded": xp}
    else:
        run.step = step + 1
    db.commit()
    db.refresh(run)
    return run


def runs_for(db: Session, profile: ChildProfile) -> list[dict]:
    out = []
    for s in SCENARIOS:
        rows = list(db.scalars(select(ScenarioRun).where(ScenarioRun.profile_id == profile.id, ScenarioRun.scenario_id == s["id"])
                               .order_by(desc(ScenarioRun.started_at))))
        active = next((r for r in rows if r.status == "active"), None)
        done = [r for r in rows if r.status == "done"]
        best = max((r.result["return_pct"] for r in done if r.result), default=None)
        out.append({"scenario_id": s["id"], "active_run_id": active.id if active else None, "active_step": active.step if active else None,
                    "completed": len(done), "best_return_pct": best, "last_run_id": rows[0].id if rows else None})
    return out
