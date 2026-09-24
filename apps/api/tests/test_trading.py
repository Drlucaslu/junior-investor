"""Trading math — PRD §24.1 unit tests and §24.2 integration cases."""
from decimal import Decimal

from app.db import SessionLocal
from app.models import ChildProfile
from app.providers.types import CorporateAction
from app.services.corporate_actions import apply_corporate_actions

API = "/api/v1"


def buy(client, pid, sym, qty, **kw):
    return client.post(f"{API}/profiles/{pid}/trades/execute", json={"symbol": sym, "side": "BUY", "quantity": qty, **kw})


def sell(client, pid, sym, qty):
    return client.post(f"{API}/profiles/{pid}/trades/execute", json={"symbol": sym, "side": "SELL", "quantity": qty})


def pf(client, pid):
    r = client.get(f"{API}/profiles/{pid}/portfolio")
    assert r.status_code == 200, r.text
    return r.json()


def pos(p, sym):
    return next(x for x in p["positions"] if x["ticker"] == sym)


def test_default_account(client, profile):
    p = pf(client, profile["id"])
    assert p["cash"] == 1_000_000
    assert p["total_equity"] == 1_000_000
    assert p["positions"] == []


def test_case1_buy(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    r = buy(client, profile["id"], "AAPL", 100)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "EXECUTED"
    p = pf(client, profile["id"])
    assert p["cash"] == 980_000
    a = pos(p, "AAPL")
    assert a["quantity"] == 100
    assert a["average_cost"] == 200
    assert a["market_value"] == 20_000


def test_case2_price_move(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    buy(client, profile["id"], "AAPL", 100)
    providers["quote"].set_price("AAPL", 220)
    from app.services import market_data
    market_data.clear_cache()
    p = pf(client, profile["id"])
    assert pos(p, "AAPL")["unrealized_pnl"] == 2_000
    assert p["total_equity"] == 1_002_000
    assert p["total_pnl"] == 2_000


def test_case3_sell_realized(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    buy(client, profile["id"], "AAPL", 100)
    providers["quote"].set_price("AAPL", 220)
    from app.services import market_data
    market_data.clear_cache()
    r = sell(client, profile["id"], "AAPL", 40)
    assert r.status_code == 200, r.text
    assert Decimal(str(r.json()["realized_pnl"])) == Decimal("800")
    p = pf(client, profile["id"])
    a = pos(p, "AAPL")
    assert a["quantity"] == 60
    assert a["average_cost"] == 200
    assert p["realized_pnl"] == 800
    assert p["cash"] == 980_000 + 40 * 220


def test_case4_insufficient_cash(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    r = buy(client, profile["id"], "AAPL", 5001)  # 1,000,200 > 1,000,000
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INSUFFICIENT_CASH"
    assert pf(client, profile["id"])["cash"] == 1_000_000
    hist = client.get(f"{API}/profiles/{profile['id']}/trades?include_rejected=true").json()
    assert hist[0]["status"] == "REJECTED"


def test_exact_cash_allowed_never_negative(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    assert buy(client, profile["id"], "AAPL", 5000).status_code == 200
    assert pf(client, profile["id"])["cash"] == 0
    assert buy(client, profile["id"], "AAPL", 1).status_code == 422


def test_case5_oversell(client, profile, providers):
    buy(client, profile["id"], "AAPL", 10)
    r = sell(client, profile["id"], "AAPL", 11)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INSUFFICIENT_POSITION"
    r = sell(client, profile["id"], "MSFT", 1)
    assert r.json()["detail"]["code"] == "INSUFFICIENT_POSITION"


def test_average_cost_multiple_buys(client, profile, providers):
    providers["quote"].set_price("AAPL", 100)
    buy(client, profile["id"], "AAPL", 10)
    providers["quote"].set_price("AAPL", 200)
    buy(client, profile["id"], "AAPL", 30)
    p = pf(client, profile["id"])
    assert pos(p, "AAPL")["average_cost"] == 175  # (1000 + 6000) / 40


def test_fractional_rejected_by_default(client, profile):
    r = buy(client, profile["id"], "AAPL", 1.5)
    assert r.json()["detail"]["code"] == "FRACTIONAL_NOT_ALLOWED"


def test_market_data_outage_does_not_change_portfolio(client, profile, providers):
    providers["quote"].fail = True
    r = buy(client, profile["id"], "AAPL", 1)
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "MARKET_DATA_UNAVAILABLE"
    providers["quote"].fail = False
    assert pf(client, profile["id"])["cash"] == 1_000_000


def test_preview_matches_prd(client, profile, providers):
    providers["quote"].set_price("AAPL", 200)
    r = client.post(f"{API}/profiles/{profile['id']}/trades/preview", json={"symbol": "AAPL", "side": "BUY", "quantity": 100})
    d = r.json()
    assert d["estimated_value"] == 20000
    assert d["cash_before"] == 1000000
    assert d["cash_after"] == 980000
    assert d["allocation_after_pct"] == 2.0
    assert d["simulation"] is True
    assert pf(client, profile["id"])["cash"] == 1_000_000  # preview changes nothing


def test_commission_and_slippage(client, profile, providers, monkeypatch):
    from app.config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "simulated_commission_bps", Decimal("10"))  # 0.1%
    monkeypatch.setattr(s, "simulated_slippage_bps", Decimal("0"))
    providers["quote"].set_price("AAPL", 200)
    buy(client, profile["id"], "AAPL", 100)
    p = pf(client, profile["id"])
    assert p["cash"] == 1_000_000 - 20_000 - 20
    assert pos(p, "AAPL")["average_cost"] == 200.2


def test_etf_restriction(client, profile, parent):
    client.patch(f"{API}/profiles/{profile['id']}", headers=parent, json={"allow_etf": False})
    r = buy(client, profile["id"], "SPY", 1)
    assert r.json()["detail"]["code"] == "ETF_NOT_ALLOWED"


def test_split_and_reverse_split(client, profile, providers):
    providers["quote"].set_price("NVDA", 400)
    buy(client, profile["id"], "NVDA", 10)
    with SessionLocal() as db:
        prof = db.get(ChildProfile, profile["id"])
        applied = apply_corporate_actions(db, prof, force=True, actions_override={
            "NVDA": [CorporateAction(symbol="NVDA", date="2099-01-01", type="SPLIT", value=Decimal("4"), source="test")]})
        assert applied == []  # future-dated actions are ignored
    # Backdate the buy so a split "today-ish" applies.
    from app.models import LedgerEntry
    from datetime import datetime, timezone
    with SessionLocal() as db:
        for e in db.query(LedgerEntry).filter(LedgerEntry.type == "BUY").all():
            e.timestamp = datetime(2024, 1, 2, 15, tzinfo=timezone.utc)
        db.commit()
        prof = db.get(ChildProfile, profile["id"])
        applied = apply_corporate_actions(db, prof, force=True, actions_override={
            "NVDA": [CorporateAction(symbol="NVDA", date="2024-06-10", type="SPLIT", value=Decimal("4"), source="test")]})
        assert applied == ["SPLIT:NVDA:2024-06-10"]
        # idempotent
        assert apply_corporate_actions(db, prof, force=True, actions_override={
            "NVDA": [CorporateAction(symbol="NVDA", date="2024-06-10", type="SPLIT", value=Decimal("4"), source="test")]}) == []
    providers["quote"].set_price("NVDA", 100)
    from app.services import market_data
    market_data.clear_cache()
    p = pf(client, profile["id"])
    n = pos(p, "NVDA")
    assert n["quantity"] == 40 and n["average_cost"] == 100
    with SessionLocal() as db:
        prof = db.get(ChildProfile, profile["id"])
        apply_corporate_actions(db, prof, force=True, actions_override={
            "NVDA": [CorporateAction(symbol="NVDA", date="2024-07-01", type="SPLIT", value=Decimal("0.1"), source="test")]})
    n = pos(pf(client, profile["id"]), "NVDA")
    assert n["quantity"] == 4 and n["average_cost"] == 1000


def test_cash_dividend(client, profile, providers):
    buy(client, profile["id"], "KO", 100)
    from app.models import LedgerEntry
    from datetime import datetime, timezone
    with SessionLocal() as db:
        for e in db.query(LedgerEntry).filter(LedgerEntry.type == "BUY").all():
            e.timestamp = datetime(2024, 1, 2, 15, tzinfo=timezone.utc)
        db.commit()
        prof = db.get(ChildProfile, profile["id"])
        applied = apply_corporate_actions(db, prof, force=True, actions_override={
            "KO": [CorporateAction(symbol="KO", date="2024-03-14", type="DIVIDEND", value=Decimal("0.485"), source="test")]})
        assert applied == ["DIV:KO:2024-03-14"]
    p = pf(client, profile["id"])
    assert p["dividends"] == 48.5
    assert p["cash"] == 1_000_000 - 100 * 65 + 48.5


def test_reset_requires_parent_and_keeps_history(client, profile, parent):
    buy(client, profile["id"], "AAPL", 10)
    r = client.post(f"{API}/profiles/{profile['id']}/reset-portfolio", json={})
    assert r.status_code == 401
    r = client.post(f"{API}/profiles/{profile['id']}/reset-portfolio", headers=parent, json={"starting_cash": 100000})
    assert r.status_code == 200
    p = pf(client, profile["id"])
    assert p["cash"] == 100_000 and p["positions"] == []
    exp = client.get(f"{API}/profiles/{profile['id']}/export", headers=parent).json()
    assert len(exp["trades"]) == 1  # history preserved
    assert any(e["type"] == "ACCOUNT_RESET" for e in exp["ledger"])


def test_profiles_are_isolated(client, parent, profile):
    r = client.post(f"{API}/profiles", headers=parent, json={"nickname": "Mia", "age_group": "A", "starting_cash": 10000})
    other = r.json()
    buy(client, profile["id"], "AAPL", 10)
    assert pf(client, other["id"])["cash"] == 10_000
    assert pf(client, other["id"])["positions"] == []


def test_child_cannot_change_starting_cash_or_limits(client, profile):
    r = client.patch(f"{API}/profiles/{profile['id']}", json={"daily_ai_limit": 999})
    assert r.status_code == 401
    r = client.patch(f"{API}/profiles/{profile['id']}", json={"language": "zh-CN"})
    assert r.status_code == 200 and r.json()["language"] == "zh-CN"


def test_journal_with_trade(client, profile):
    r = buy(client, profile["id"], "COST", 2, journal_content="Members renew every year", journal_answers={"risk": "store growth slows"})
    tid = r.json()["id"]
    j = client.get(f"{API}/profiles/{profile['id']}/journal?symbol=COST").json()
    assert j[0]["trade_id"] == tid and j[0]["type"] == "pre_trade"
    assert j[0]["trade"]["side"] == "BUY"


def test_watchlist(client, profile):
    assert client.post(f"{API}/profiles/{profile['id']}/watchlist", json={"symbol": "msft"}).status_code == 200
    assert client.post(f"{API}/profiles/{profile['id']}/watchlist", json={"symbol": "NOPE1"}).status_code == 422
    w = client.get(f"{API}/profiles/{profile['id']}/watchlist").json()
    assert w[0]["symbol"] == "MSFT" and w[0]["quote"]["price"] == 420
    client.delete(f"{API}/profiles/{profile['id']}/watchlist/MSFT")
    assert client.get(f"{API}/profiles/{profile['id']}/watchlist").json() == []


def test_parent_pin(client, parent):
    assert client.post(f"{API}/parent/login", json={"pin": "0000"}).status_code == 401
    assert client.post(f"{API}/parent/login", json={"pin": "1234"}).status_code == 200
    assert client.post(f"{API}/setup", json={"pin": "9999"}).status_code == 409
