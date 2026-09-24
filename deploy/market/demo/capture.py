"""Run INSIDE the Junior Investor container: creates a throwaway demo database
(/tmp/demo.db) using LIVE market data + the configured LLM, then prints a JSON
dump (DB rows + quotes) used to render honest Market screenshots."""
import json, os, subprocess, sys, time, urllib.request as u

PORT = 8013
env = dict(os.environ, DATABASE_URL="sqlite:////tmp/demo.db")
if os.path.exists("/tmp/demo.db"):
    os.remove("/tmp/demo.db")
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)], env=env, cwd="/app",
                       stdout=subprocess.DEVNULL, stderr=open("/tmp/demo.log", "w"))
B = f"http://127.0.0.1:{PORT}/api/v1"
for _ in range(90):
    try:
        u.urlopen(f"http://127.0.0.1:{PORT}/healthz"); break
    except Exception:
        time.sleep(1)

def req(path, body=None, h=None, method=None):
    r = u.Request(B + path, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Content-Type": "application/json", **(h or {})}, method=method or ("POST" if body is not None else "GET"))
    return json.loads(u.urlopen(r, timeout=900).read())

log = lambda *a: print(*a, file=sys.stderr, flush=True)  # noqa: E731
tok = req("/setup", {"language": "en-US", "pin": "0000", "family_name": "Demo Family"})["parent_token"]
H = {"X-Parent-Token": tok}
kid = req("/profiles", {"nickname": "Maya", "age_group": "B", "language": "en-US", "avatar": "fox", "starting_cash": 100000}, H)
pid = kid["id"]
req("/profiles", {"nickname": "Leo", "age_group": "A", "language": "zh-CN", "avatar": "owl", "starting_cash": 100000}, H)
trades = [
    ("COST", 12, "Members renew every year, so revenue is steady. Biggest risk: paying too much for a great company."),
    ("MSFT", 30, "Cloud and Office are sticky — businesses rarely switch. I want to see Azure keep growing."),
    ("KO", 120, "Strong brand, pays dividends, grows slowly. A calm stock to learn from."),
    ("AAPL", 40, "Huge loyal customer base and services revenue. Risk: phone sales slowing."),
    ("SPY", 25, "An ETF of ~500 companies for diversification."),
]
for sym, q, why in trades:
    try:
        req(f"/profiles/{pid}/trades/execute", {"symbol": sym, "side": "BUY", "quantity": q, "journal_content": why,
                                                "journal_answers": {"why": why}})
        log("bought", sym)
    except Exception as e:
        log("trade failed", sym, e)
for sym in ("NVDA", "GOOGL", "TSLA"):
    try:
        req(f"/profiles/{pid}/watchlist", {"symbol": sym})
    except Exception as e:
        log("watch failed", sym, e)
for card in ("what_is_stock", "revenue_vs_profit", "moat", "diversification"):
    req(f"/profiles/{pid}/learn/{card}/complete", {})
t0 = time.time()
rep = req("/research", {"profile_id": pid, "query": "COST", "mode": "deep"})
log("research", rep["status"], round(time.time() - t0), "s")
rep2 = req("/research", {"profile_id": pid, "query": "NVDA", "mode": "quick"})
log("research2", rep2["status"])
chat = req("/masters/buffett/chat", {"profile_id": pid, "message": "How can I tell if a company has a strong moat?"})
log("chat ok", len(chat["content"]))

import sqlite3
con = sqlite3.connect("/tmp/demo.db")
con.row_factory = sqlite3.Row
dump = {"tables": {}, "profile_id": pid}
for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
    if name in ("market_data_cache", "alembic_version", "sqlite_sequence"):
        continue
    rows = [dict(r) for r in con.execute(f"SELECT * FROM {name}")]
    if rows:
        dump["tables"][name] = rows
quotes = {}
for sym in ["COST", "MSFT", "KO", "AAPL", "SPY", "NVDA", "GOOGL", "TSLA"]:
    try:
        quotes[sym] = req(f"/market/quote/{sym}")
        quotes[sym]["metrics"] = req(f"/market/metrics/{sym}")
    except Exception as e:
        log("quote failed", sym, e)
dump["quotes"] = quotes
dump["status"] = req("/market/status")
srv.terminate()
print(json.dumps(dump, default=str, ensure_ascii=False))
