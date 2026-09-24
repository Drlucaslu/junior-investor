"""Olares Junior Investor — FastAPI entry point.

Serves the JSON API under /api/v1 and the built single-page frontend at /.
"""
from __future__ import annotations

import logging
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


from app.api import ai, learn, market, portfolio, profiles, system
from app.config import get_settings
from app.db import SessionLocal
from app.models import AppSetting, MasterPersona
from app.prompts.personas import DISCLAIMER_EN, PERSONAS
from app.services.observability import record_latency

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("junior-investor")


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    here = Path(__file__).resolve().parent.parent
    cfg = Config(str(here / "alembic.ini"))
    cfg.set_main_option("script_location", str(here / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(cfg, "head")


def seed() -> None:
    with SessionLocal() as db:
        for p in PERSONAS:
            row = db.get(MasterPersona, p["id"]) or MasterPersona(id=p["id"])
            for k, v in p.items():
                setattr(row, k, v)
            row.disclaimer = DISCLAIMER_EN
            db.merge(row)
        # Stable signing secret for parent tokens (generated once, stored locally).
        if settings.app_secret == "change-me-in-production":
            row = db.get(AppSetting, "app_secret")
            if not row:
                row = AppSetting(key="app_secret", value=secrets.token_urlsafe(48))
                db.add(row)
            settings.app_secret = row.value
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.environ.get("SKIP_MIGRATIONS") != "1":
        run_migrations()
    seed()
    log.info("Junior Investor ready (llm=%s model=%s market=%s)", settings.llm_provider, settings.llm_model, settings.market_data_provider)
    yield


app = FastAPI(title="Olares Junior Investor API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs",
              openapi_url="/api/openapi.json")


@app.middleware("http")
async def request_meta(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    t0 = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error rid=%s path=%s", rid, request.url.path)
        return JSONResponse({"detail": {"code": "INTERNAL_ERROR", "request_id": rid}}, status_code=500)
    ms = (time.monotonic() - t0) * 1000
    if request.url.path.startswith("/api/"):
        record_latency("http", ms)
        # metadata only — never request bodies (children's chats stay out of logs)
        log.info("rid=%s %s %s %s %.0fms", rid, request.method, request.url.path, response.status_code, ms)
    response.headers["x-request-id"] = rid
    return response


API = "/api/v1"
app.include_router(system.router, prefix=API, tags=["system"])
app.include_router(profiles.router, prefix=API, tags=["profiles"])
app.include_router(market.router, prefix=API, tags=["market"])
app.include_router(portfolio.router, prefix=API, tags=["portfolio"])
app.include_router(ai.router, prefix=API, tags=["ai"])
app.include_router(learn.router, prefix=API, tags=["learn"])


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}


# ---------------------------------------------------------------- static SPA
static_dir = Path(settings.static_dir)
if not static_dir.is_absolute():
    static_dir = Path(__file__).resolve().parent.parent / static_dir
if (static_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": {"code": "NOT_FOUND"}}, status_code=404)
    candidate = (static_dir / full_path).resolve()
    if full_path and candidate.is_file() and static_dir.resolve() in candidate.parents:
        return FileResponse(candidate)
    index = static_dir / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"detail": "Frontend not built. API docs at /api/docs"}, status_code=404)


