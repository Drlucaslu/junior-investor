from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import err, get_profile
from app.api.schemas import CardCompleteIn
from app.data.levels import XP
from app.services import learning
from app.data.glossary import GLOSSARY
from app.data.learn_cards import CARDS
from app.db import get_db
from app.models import ChildProfile, LearningProgress

router = APIRouter()


@router.get("/learn/cards")
def cards():
    return CARDS


@router.get("/learn/glossary")
def glossary_all():
    return [{"id": k, **v} for k, v in GLOSSARY.items()]


@router.get("/profiles/{profile_id}/learn/progress")
def progress(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    return [{"card_id": r.card_id, "completed_at": r.completed_at} for r in db.scalars(select(LearningProgress).where(LearningProgress.profile_id == p.id))]


@router.post("/profiles/{profile_id}/learn/{card_id}/complete")
def complete(card_id: str, body: CardCompleteIn | None = None, p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db)):
    card = next((c for c in CARDS if c["id"] == card_id), None)
    if not card:
        raise err(404, "CARD_NOT_FOUND")
    quiz = card.get("quiz")
    if quiz:
        answer = body.answer if body else None
        if answer is None:
            raise err(422, "QUIZ_ANSWER_REQUIRED")
        if answer != quiz["answer"]:
            return {"ok": False, "correct": False}
    before = learning.current_level(db, p)
    try:
        db.add(LearningProgress(profile_id=p.id, card_id=card_id))
        db.commit()
    except IntegrityError:
        db.rollback()
    xp = learning.award(db, p.id, "card", card_id, XP["card"])
    info = learning.sync(db, p)
    return {"ok": True, "correct": True, "xp_awarded": XP["card"] if xp else 0, "level": info["level"],
            "level_up": info["level"] > before}
