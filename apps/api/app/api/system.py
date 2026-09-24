from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.services import auth
from app.services.observability import snapshot

router = APIRouter()


@router.get("/health")
async def health(deep: bool = False):
    s = get_settings()
    from app.services import ai_config

    cfg = ai_config.load()
    out = {"status": "ok", "app": "olares-junior-investor", "llm_model": cfg.model, "llm_configured": bool(cfg.base_url and cfg.model)}
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        out["database"] = "ok"
    except Exception as e:  # pragma: no cover
        out["database"] = f"error: {e.__class__.__name__}"
        out["status"] = "degraded"
    if deep and s.llm_provider != "mock" and cfg.base_url:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                h = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
                r = await c.get(f"{cfg.base_url.rstrip('/')}/models", headers=h)
                out["llm"] = "ok" if r.status_code < 400 else f"http {r.status_code}"
        except Exception as e:
            out["llm"] = f"unreachable: {e.__class__.__name__}"
    return out


@router.get("/metrics")
def metrics(_: str = Depends(auth.require_parent)):
    return snapshot()
