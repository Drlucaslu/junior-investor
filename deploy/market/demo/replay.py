"""Replay a live demo dump (from capture.py) locally so Market screenshots can be
rendered at exactly 1440x900 with real data and real model output.

    python replay.py demo.json   # serves http://127.0.0.1:8100
"""
import json
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DB = "/tmp/replay.db"
for f in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(f):
        os.remove(f)
os.environ.update({
    "DATABASE_URL": f"sqlite:///{DB}", "MARKET_DATA_PROVIDER": "mock", "FUNDAMENTALS_PROVIDER": "mock",
    "SEARCH_PROVIDER": "mock", "LLM_PROVIDER": "mock", "STATIC_DIR": os.path.join(ROOT, "apps/web/dist"),
})
sys.path.insert(0, os.path.join(ROOT, "apps/api"))

import uvicorn  # noqa: E402
from sqlalchemy import Date, DateTime, Numeric  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app, run_migrations, seed  # noqa: E402
from app.models import AppSetting  # noqa: E402
from app.providers import registry  # noqa: E402
from app.providers.mock import MockFundamentalsProvider, MockQuoteProvider  # noqa: E402
from app.providers.types import MarketStatus, ProviderError, Quote, ValuationMetrics  # noqa: E402

dump = json.load(open(sys.argv[1]))


def conv(col, v):
    if v is None:
        return None
    if isinstance(col.type, DateTime):
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    if isinstance(col.type, Date):
        return date.fromisoformat(str(v)[:10])
    if isinstance(col.type, Numeric):
        return Decimal(str(v))
    if col.type.__class__.__name__ == "JSON" and isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    if col.type.__class__.__name__ == "Boolean":
        return bool(v)
    return v


run_migrations()
with engine.begin() as conn:
    for t in Base.metadata.sorted_tables:
        rows = dump["tables"].get(t.name)
        if not rows or t.name == "master_personas":
            continue
        for r in rows:
            conn.execute(t.insert().values({c.name: conv(c, r.get(c.name)) for c in t.columns if c.name in r}))
seed()
from app.models import User  # noqa: E402
from app.services.auth import hash_pin  # noqa: E402

with SessionLocal() as db:
    fam = dump["tables"]["families"][0]["id"]
    db.add(User(family_id=fam, display_name="Parent", role="parent", pin_hash=hash_pin("2468")))
    db.merge(AppSetting(key="default_language", value="en-US"))
    db.merge(AppSetting(key="llm_config", value={"preset": "olares", "base_url": "https://llm.example.olares.com/v1",
                                                   "model": "qwen3.8-27b", "api_key": "", "temperature": 0.3, "native_tools": True}))
    db.commit()


class ReplayQuotes(MockQuoteProvider):
    def get_quote(self, symbol):
        q = dump["quotes"].get(symbol.upper())
        if not q:
            raise ProviderError("not recorded")
        return Quote(**{k: v for k, v in q.items() if k != "metrics"})

    def get_market_status(self):
        return MarketStatus(**dump["status"])


class ReplayFundamentals(MockFundamentalsProvider):
    def get_metrics(self, symbol):
        q = dump["quotes"].get(symbol.upper())
        if not q or "metrics" not in q:
            raise ProviderError("not recorded")
        return ValuationMetrics(**q["metrics"])

    def get_corporate_actions(self, symbol, since=None):
        return []


registry.override("quote", ReplayQuotes())
registry.override("fundamentals", ReplayFundamentals())
os.environ["SKIP_MIGRATIONS"] = "1"
print("profile:", dump["profile_id"], flush=True)
uvicorn.run(app, host="127.0.0.1", port=8100, log_level="warning")
