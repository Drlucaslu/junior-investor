from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ChildProfile


def get_profile(profile_id: str, db: Session = Depends(get_db)) -> ChildProfile:
    p = db.get(ChildProfile, profile_id)
    if not p or p.archived:
        raise HTTPException(404, detail={"code": "PROFILE_NOT_FOUND"})
    return p


def err(status: int, code: str, **extra) -> HTTPException:
    return HTTPException(status, detail={"code": code, **extra})
