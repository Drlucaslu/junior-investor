"""v0.4 learning path: two accounts, level unlocks, CDs, options, allowance, scenarios, leaderboard."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.data.learn_cards import CARDS
from app.data.levels import LEVELS
from app.data.scenarios import SCENARIO_INDEX, prices
from app.db import SessionLocal
from app.models import AllowanceSchedule, Deposit
from app.services import products
from app.services.portfolio import current_account

API = "/api/v1"
QUIZ = {c["id"]: c["quiz"] for c in CARDS}


def pf(client, pid, account="learning"):
    r = client.get(f"{API}/profiles/{pid}/portfolio?account={account}")
    assert r.status_code == 200, r.text
    return r.json()


def trade(client, pid, sym, side, qty, account="learning", **kw):
    return client.post(f"{API}/profiles/{pid}/trades/execute",
                       json={"symbol": sym, "side": side, "quantity": qty, "account": account, **kw})


def complete_cards(client, pid, ids):
    for cid in ids:
        body = {"answer": QUIZ[cid]["answer"]} if QUIZ.get(cid) else None
        r = client.post(f"{API}/profiles/{pid}/learn/{cid}/complete", json=body)
        assert r.status_code == 200 and r.json()["correct"], r.text


def play(client, pid, sid, alloc=None, reason="Because I want to learn how this works"):
    run = client.post(f"{API}/profiles/{pid}/scenarios/{sid}/start").json()
    rid = run["run"]["id"]
    for _ in range(run["scenario"]["decisions_total"]):
        r = client.post(f"{API}/scenario-runs/{rid}/decide", json={"allocations": alloc or {"CASH": 100}, "reason": reason})
        assert r.status_code == 200, r.text
    return r.json()


def test_two_accounts_and_level1_gating(client, profile):
    pid = profile["id"]
    learn, fam = pf(client, pid), pf(client, pid, "family")
    assert learn["cash"] == 10_000 and learn["account_kind"] == "learning"
    assert fam["cash"] == 1_000_000
    r = trade(client, pid, "AAPL", "BUY", 1)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "ASSET_LOCKED"
    assert r.json()["detail"]["unlock_level"] == 4
    assert trade(client, pid, "AAPL", "BUY", 1, account="family").status_code == 200  # family default: stocks & ETFs
    path = client.get(f"{API}/profiles/{pid}/path").json()
    assert path["level"] == 1 and path["next_step"]["id"] == "compounding"
    assert path["allowed"]["learning"] == ["cash", "cd"]


def test_level_up_bonus_and_bond_unlock(client, profile):
    pid = profile["id"]
    complete_cards(client, pid, LEVELS[1]["cards"])
    path = client.get(f"{API}/profiles/{pid}/path").json()
    assert path["level"] == 2 and "bond_etf" in path["allowed"]["learning"]
    client.get(f"{API}/profiles/{pid}/path")  # idempotent
    p = pf(client, pid)
    assert p["cash"] == 20_000 and p["contributions"] == 10_000 and p["total_pnl"] == 0
    assert trade(client, pid, "BND", "BUY", 10).status_code == 200
    r = trade(client, pid, "SPY", "BUY", 1)
    assert r.json()["detail"]["code"] == "ASSET_LOCKED" and r.json()["detail"]["unlock_level"] == 3
    assert path["xp"]["total"] == 4 * 10 + 50


def test_family_access_follows_level(client, profile, parent):
    pid = profile["id"]
    assert client.patch(f"{API}/profiles/{pid}", headers=parent, json={"family_access": "level"}).status_code == 200
    r = trade(client, pid, "AAPL", "BUY", 1, account="family")
    assert r.json()["detail"]["code"] == "ASSET_LOCKED"


def test_cd_lifecycle(client, profile):
    pid = profile["id"]
    offers = client.get(f"{API}/cd/offers").json()["offers"]
    assert [o["term_months"] for o in offers] == [3, 6, 12]
    r = client.post(f"{API}/profiles/{pid}/cd", json={"account": "learning", "amount": 5000, "term_months": 12})
    assert r.status_code == 200, r.text
    assert client.post(f"{API}/profiles/{pid}/cd", json={"amount": 50000, "term_months": 12}).json()["detail"]["code"] == "INSUFFICIENT_CASH"
    p = pf(client, pid)
    assert p["cash"] == 5000 and p["cd_value"] == 5000 and p["total_equity"] == 10_000
    # Fast-forward: pretend it was opened a year ago -> matures with interest on next sync.
    with SessionLocal() as db:
        dep = db.get(Deposit, r.json()["id"])
        dep.opened_at = datetime.now(timezone.utc) - timedelta(days=366)
        dep.matures_at = datetime.now(timezone.utc) - timedelta(days=1)
        apy = Decimal(dep.apy)
        db.commit()
    p = pf(client, pid)
    assert p["cds"] == []
    expected = float((Decimal(5000) * (1 + apy) ** Decimal(365 / 365)).quantize(Decimal("0.01")))
    assert abs(p["cash"] - (5000 + expected)) < 1.0
    assert p["total_pnl"] > 0 and abs(p["interest"] - (expected - 5000)) < 1.0


def test_cd_early_withdrawal_penalty(client, profile):
    pid = profile["id"]
    dep = client.post(f"{API}/profiles/{pid}/cd", json={"amount": 1000, "term_months": 6}).json()
    with SessionLocal() as db:
        d = db.get(Deposit, dep["id"])
        d.opened_at = datetime.now(timezone.utc) - timedelta(days=30)
        db.commit()
    r = client.post(f"{API}/profiles/{pid}/cd/{dep['id']}/withdraw?account=learning")
    assert r.json()["status"] == "BROKEN"
    assert Decimal(str(r.json()["payout"])) >= Decimal("1000")  # penalty never eats principal
    assert pf(client, pid)["cd_value"] == 0


def test_allowance_idempotent_and_not_profit(client, profile, parent):
    pid = profile["id"]
    start = date.today() - timedelta(days=20)
    r = client.put(f"{API}/profiles/{pid}/allowance", headers=parent,
                   json={"amount": 25, "frequency": "weekly", "weekday": start.weekday(), "start_date": start.isoformat()})
    assert r.status_code == 200, r.text
    fam = pf(client, pid, "family")
    fam2 = pf(client, pid, "family")
    assert fam["contributions"] == fam2["contributions"] == 75  # days 0, 7, 14
    assert fam2["cash"] == 1_000_075 and fam2["total_pnl"] == 0
    assert client.put(f"{API}/profiles/{pid}/allowance", json={"amount": 5}).status_code == 401  # parent only
    client.post(f"{API}/profiles/{pid}/deposit", headers=parent, json={"amount": 100, "note": "Birthday"})
    assert pf(client, pid, "family")["contributions"] == 175
    with SessionLocal() as db:
        assert db.query(AllowanceSchedule).count() == 1


def test_scenario_math_and_rules(client, profile):
    pid = profile["id"]
    run = client.post(f"{API}/profiles/{pid}/scenarios/rate_shock_2022/start").json()
    rid = run["run"]["id"]
    assert "name" not in run["companies"][0]  # names hidden until the end
    bad = client.post(f"{API}/scenario-runs/{rid}/decide", json={"allocations": {"A": 50}, "reason": "Testing the rules here"})
    assert bad.json()["detail"]["code"] == "ALLOCATION_NOT_100"
    short = client.post(f"{API}/scenario-runs/{rid}/decide", json={"allocations": {"B": 100}, "reason": "hm"})
    assert short.json()["detail"]["code"] == "REASON_REQUIRED"
    for _ in range(3):
        out = client.post(f"{API}/scenario-runs/{rid}/decide", json={"allocations": {"B": 100}, "reason": "Long bonds are safe, right?"})
    assert out.json()["run"]["status"] == "done"
    res = out.json()["result"]
    P = prices()["TLT"]
    s = SCENARIO_INDEX["rate_shock_2022"]["dates"]
    assert abs(res["final_value"] - 10000 * P[s[-1]] / P[s[0]]) < 0.05  # rebalancing 100% into one fund = buy & hold
    assert out.json()["companies"][1]["ticker"] == "TLT"
    assert res["xp_awarded"] == 40 + 3 * 5


def test_level3_requires_scenario(client, profile):
    pid = profile["id"]
    complete_cards(client, pid, LEVELS[1]["cards"] + LEVELS[2]["cards"])
    assert client.get(f"{API}/profiles/{pid}/path").json()["level"] == 2
    out = play(client, pid, "rate_shock_2022")
    assert out["level"] == 3 and out["level_up"] is True
    assert pf(client, pid)["contributions"] == 40_000


def test_options_covered_call_assignment(client, profile, parent, providers):
    pid = profile["id"]
    client.patch(f"{API}/profiles/{pid}", headers=parent, json={"level_override": 5})
    providers["quote"].set_price("AAPL", 200)
    assert trade(client, pid, "AAPL", "BUY", 200).status_code == 200
    chain = client.get(f"{API}/profiles/{pid}/options/chain/AAPL?strategy=covered_call&account=learning").json()
    assert chain["max_contracts"] == 2
    exp = chain["expirations"][0]
    strike = exp["strikes"][2]["strike"]
    body = {"account": "learning", "symbol": "AAPL", "strategy": "covered_call", "strike": strike, "expiry": exp["expiry"],
            "contracts": 1, "journal_content": "Earn some income while I hold for the long term"}
    prev = client.post(f"{API}/profiles/{pid}/options/preview", json=body).json()
    assert prev["cash_delta"] > 0
    cash_before = pf(client, pid)["cash"]
    op = client.post(f"{API}/profiles/{pid}/options/open", json=body)
    assert op.status_code == 200, op.text
    assert abs(pf(client, pid)["cash"] - cash_before - prev["cash_delta"]) < 0.02
    r = trade(client, pid, "AAPL", "SELL", 150)
    assert r.json()["detail"]["code"] == "SHARES_LOCKED_BY_CALL"
    assert trade(client, pid, "AAPL", "SELL", 100).status_code == 200
    # Expiry passes with the stock above the strike -> shares are called away at the strike.
    with SessionLocal() as db:
        acct = current_account(db, pid, "learning")
        n = products.settle_expired(db, acct, now=datetime.now(timezone.utc) + timedelta(days=120),
                                    price_override={"AAPL": Decimal(str(strike)) + 20})
        assert n == 1
    p = pf(client, pid)
    assert p["options"] == [] and not any(x["ticker"] == "AAPL" for x in p["positions"])


def test_protective_put_requires_shares(client, profile, parent):
    pid = profile["id"]
    client.patch(f"{API}/profiles/{pid}", headers=parent, json={"level_override": 5})
    chain = client.get(f"{API}/profiles/{pid}/options/chain/MSFT?strategy=protective_put&account=learning").json()
    exp = chain["expirations"][0]
    body = {"account": "learning", "symbol": "MSFT", "strategy": "protective_put", "strike": exp["strikes"][-1]["strike"],
            "expiry": exp["expiry"], "contracts": 1}
    assert client.post(f"{API}/profiles/{pid}/options/preview", json=body).json()["detail"]["code"] == "NOT_ENOUGH_SHARES"


def test_options_locked_below_level5(client, profile):
    r = client.get(f"{API}/profiles/{profile['id']}/options/chain/AAPL?strategy=covered_call")
    assert r.json()["detail"]["code"] == "ASSET_LOCKED"


def test_leaderboard_by_learning_points(client, profile, parent):
    r = client.post(f"{API}/profiles", headers=parent, json={"nickname": "Mia", "age_group": "A"})
    mia = r.json()["id"]
    complete_cards(client, mia, ["compounding", "cd_savings"])
    rows = client.get(f"{API}/family/leaderboard").json()["rows"]
    assert rows[0]["nickname"] == "Mia" and rows[0]["xp_week"] == 20
    assert all("total_pnl" not in r and "return" not in "".join(r.keys()) for r in rows)


def test_black_scholes_sanity():
    c = products.bs_price(100, 100, 1, 0.05, 0.2, "CALL")
    p = products.bs_price(100, 100, 1, 0.05, 0.2, "PUT")
    assert abs(c - 10.4506) < 0.01 and abs(p - 5.5735) < 0.01
    assert abs((c - p) - (100 - 100 * 2.718281828 ** -0.05)) < 1e-6  # put-call parity
