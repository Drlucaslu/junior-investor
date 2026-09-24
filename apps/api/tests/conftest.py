import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_tmp}/test.db",
    "MARKET_DATA_PROVIDER": "mock",
    "FUNDAMENTALS_PROVIDER": "mock",
    "SEARCH_PROVIDER": "mock",
    "LLM_PROVIDER": "mock",
    "APP_SECRET": "test-secret",
    "STATIC_DIR": "/nonexistent",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.providers import registry  # noqa: E402
from app.providers.llm.mock import MockLLMProvider  # noqa: E402
from app.providers.mock import MockFundamentalsProvider, MockQuoteProvider, MockSearchProvider  # noqa: E402
from app.services import market_data  # noqa: E402

KEEP = {"master_personas", "alembic_version"}


@pytest.fixture(scope="session")
def _app():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def providers():
    q, f, s, llm = MockQuoteProvider(), MockFundamentalsProvider(), MockSearchProvider(), MockLLMProvider()
    registry.override("quote", q)
    registry.override("fundamentals", f)
    registry.override("search", s)
    registry.override("llm", llm)
    market_data.clear_cache()
    return {"quote": q, "fundamentals": f, "search": s, "llm": llm}


@pytest.fixture()
def client(_app, providers):
    with engine.begin() as conn:
        for t in reversed(Base.metadata.sorted_tables):
            if t.name not in KEEP:
                conn.execute(t.delete())
    market_data.clear_cache()
    return _app


@pytest.fixture()
def parent(client):
    r = client.post("/api/v1/setup", json={"language": "en-US", "pin": "1234", "parent_name": "Mom"})
    assert r.status_code == 200, r.text
    return {"X-Parent-Token": r.json()["parent_token"]}


@pytest.fixture()
def profile(client, parent):
    r = client.post("/api/v1/profiles", headers=parent, json={"nickname": "Kai", "age_group": "B", "language": "en-US"})
    assert r.status_code == 200, r.text
    return r.json()
