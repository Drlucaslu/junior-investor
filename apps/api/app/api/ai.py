"""Research, Masters chat, Explain — AI endpoints. All stream over SSE and
persist results even if the client disconnects."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.agents.common import UsageLimitExceeded, check_and_count_usage
from app.agents.explain_agent import explain_stream, glossary_entry
from app.agents.master_agent import run_master_chat
from app.agents.research_agent import run_research
from app.api.deps import err, get_profile
from app.api.schemas import ChatIn, ExplainIn, FollowupIn, ResearchIn, ResearchPatch
from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import ChatMessage, ChatSession, ChildProfile, MasterPersona, ResearchReport, ResearchSource
from app.prompts.personas import DISCLAIMER_EN, DISCLAIMER_ZH
from app.prompts.policies import PROMPT_VERSION
from app.providers import registry
from app.providers.llm.base import LLMNotConfigured, LLMUnavailable
from app.services.streaming import collect, run_detached, sse_response

log = logging.getLogger(__name__)
router = APIRouter()


def _lang(profile: ChildProfile, override: str | None) -> str:
    return override or profile.language or get_settings().app_default_language


def _usage(db: Session, p: ChildProfile) -> None:
    try:
        check_and_count_usage(db, p)
    except UsageLimitExceeded as e:
        raise err(429, "AI_DAILY_LIMIT_REACHED", limit=p.daily_ai_limit) from e


# ------------------------------------------------------------------ research

def report_out(r: ResearchReport, with_content: bool = True) -> dict:
    d = {"id": r.id, "profile_id": r.profile_id, "parent_id": r.parent_id, "symbol": r.symbol, "query": r.query, "mode": r.mode,
         "language": r.language, "status": r.status, "favorite": r.favorite, "model": r.model, "prompt_version": r.prompt_version,
         "created_at": r.created_at, "error": r.error}
    if with_content:
        d["content_markdown"] = r.content_markdown
        d["structured_json"] = r.structured_json
        d["sources"] = [{"ref": s.ref, "title": s.title, "url": s.url, "publisher": s.publisher, "published_at": s.published_at,
                         "retrieved_at": s.retrieved_at, "kind": s.kind, "snippet": s.snippet} for s in r.sources]
    return d


def _start_research(body: ResearchIn, db: Session):
    p = get_profile(body.profile_id, db)
    _usage(db, p)
    lang = _lang(p, body.language)
    rep = ResearchReport(profile_id=p.id, query=body.query.strip(), mode=body.mode, language=lang, age_group=p.age_group,
                         status="running", model=getattr(registry.llm_provider(), "model", None), prompt_version=PROMPT_VERSION)
    db.add(rep)
    db.commit()
    report_id = rep.id

    async def persist(ev: dict):
        if ev["type"] not in ("final", "error", "resolved"):
            return
        with SessionLocal() as s:
            r = s.get(ResearchReport, report_id)
            if ev["type"] == "resolved":
                r.symbol = ev["symbols"][0] if len(ev["symbols"]) == 1 else None
                r.structured_json = {"symbols": ev["symbols"]}
            elif ev["type"] == "final":
                r.status = "done"
                r.content_markdown = ev["content_markdown"]
                r.structured_json = ev["structured"]
                r.model = ev.get("model") or r.model
                for src in ev["sources"]:
                    s.add(ResearchSource(report_id=report_id, ref=src["ref"], title=src["title"][:1000], url=src.get("url"),
                                         publisher=src.get("publisher"), published_at=(src.get("published_at") or None) and str(src["published_at"])[:40],
                                         snippet=src.get("snippet"), kind=src.get("kind", "web")))
            else:
                r.status = "failed"
                r.error = ev.get("code")
                if ev.get("structured"):
                    r.structured_json = ev["structured"]
            s.commit()

    q = run_detached(run_research(body.query.strip(), body.mode, lang, p.age_group), persist)
    return report_id, q


@router.post("/research/stream")
async def research_stream(body: ResearchIn, db: Session = Depends(get_db)):
    report_id, q = _start_research(body, db)
    return sse_response(q, first={"type": "started", "report_id": report_id})


@router.post("/research")
async def research_sync(body: ResearchIn, db: Session = Depends(get_db)):
    report_id, q = _start_research(body, db)
    await collect(q)
    with SessionLocal() as s:
        r = s.get(ResearchReport, report_id)
        return report_out(r)


@router.get("/research/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.get(ResearchReport, report_id)
    if not r:
        raise err(404, "NOT_FOUND")
    d = report_out(r)
    d["followups"] = [report_out(x) for x in db.scalars(select(ResearchReport).where(ResearchReport.parent_id == r.id).order_by(ResearchReport.created_at))]
    return d


@router.patch("/research/{report_id}")
def patch_report(report_id: str, body: ResearchPatch, db: Session = Depends(get_db)):
    r = db.get(ResearchReport, report_id)
    if not r:
        raise err(404, "NOT_FOUND")
    if body.favorite is not None:
        r.favorite = body.favorite
    db.commit()
    return report_out(r, with_content=False)


@router.get("/profiles/{profile_id}/research")
def list_research(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), symbol: str | None = None,
                  favorites: bool = False, limit: int = 50):
    stmt = select(ResearchReport).where(ResearchReport.profile_id == p.id, ResearchReport.parent_id.is_(None))
    if symbol:
        stmt = stmt.where(ResearchReport.symbol == symbol.upper())
    if favorites:
        stmt = stmt.where(ResearchReport.favorite.is_(True))
    return [report_out(r, with_content=False) for r in db.scalars(stmt.order_by(desc(ResearchReport.created_at)).limit(min(limit, 200)))]


RESEARCH_TUTOR = MasterPersona(
    id="research_tutor", name_en="Research Tutor", name_zh="投研导师", avatar="tutor", short_bio_en="", short_bio_zh="",
    philosophy_tags=[], knowledge_base_ids=[], disclaimer="",
    system_prompt="You are the Research Tutor of a children's investment-learning app. You answer follow-up questions about a "
                  "research report the student just read. Stay grounded in the report and fresh tool data; teach how to think, "
                  "never recommend buying or selling.")


def _start_followup(report_id: str, body: FollowupIn, db: Session):
    parent = db.get(ResearchReport, report_id)
    if not parent:
        raise err(404, "NOT_FOUND")
    p = get_profile(parent.profile_id, db)
    _usage(db, p)
    lang = _lang(p, body.language or parent.language)
    fu = ResearchReport(profile_id=p.id, parent_id=parent.id, symbol=parent.symbol, query=body.question, mode="followup", language=lang,
                        age_group=p.age_group, status="running", model=getattr(registry.llm_provider(), "model", None),
                        prompt_version=PROMPT_VERSION)
    db.add(fu)
    db.commit()
    fu_id = fu.id
    history = [{"role": "user", "content": f"Please show me the research report for: {parent.query}"},
               {"role": "assistant", "content": (parent.content_markdown or "")[:14000]}]
    for prev in db.scalars(select(ResearchReport).where(ResearchReport.parent_id == parent.id, ResearchReport.status == "done")
                           .order_by(ResearchReport.created_at)):
        history += [{"role": "user", "content": prev.query}, {"role": "assistant", "content": prev.content_markdown[:4000]}]

    async def persist(ev: dict):
        if ev["type"] not in ("final", "error"):
            return
        with SessionLocal() as s:
            r = s.get(ResearchReport, fu_id)
            if ev["type"] == "final":
                r.status = "done"
                r.content_markdown = ev["content"]
                r.structured_json = {"sources": ev.get("sources"), "tool_calls": ev.get("tool_calls")}
                for i, src in enumerate(ev.get("sources") or []):
                    s.add(ResearchSource(report_id=fu_id, ref=f"S{i + 1}", title=(src.get("title") or "")[:1000], url=src.get("url"),
                                         publisher=src.get("publisher"), published_at=(src.get("published_at") or None) and str(src["published_at"])[:40],
                                         snippet=src.get("snippet"), kind=src.get("kind", "web")))
            else:
                r.status = "failed"
                r.error = ev.get("code")
            s.commit()

    q = run_detached(run_master_chat(RESEARCH_TUTOR, p, lang, history, body.question), persist)
    return fu_id, q


@router.post("/research/{report_id}/followup/stream")
async def followup_stream(report_id: str, body: FollowupIn, db: Session = Depends(get_db)):
    fu_id, q = _start_followup(report_id, body, db)
    return sse_response(q, first={"type": "started", "followup_id": fu_id})


@router.post("/research/{report_id}/followup")
async def followup_sync(report_id: str, body: FollowupIn, db: Session = Depends(get_db)):
    fu_id, q = _start_followup(report_id, body, db)
    await collect(q)
    with SessionLocal() as s:
        return report_out(s.get(ResearchReport, fu_id))


# ------------------------------------------------------------------ masters

def persona_out(m: MasterPersona) -> dict:
    return {"id": m.id, "name_en": m.name_en, "name_zh": m.name_zh, "avatar": m.avatar, "short_bio_en": m.short_bio_en,
            "short_bio_zh": m.short_bio_zh, "philosophy_tags": m.philosophy_tags, "disclaimer_en": DISCLAIMER_EN,
            "disclaimer_zh": DISCLAIMER_ZH}


@router.get("/masters")
def masters(db: Session = Depends(get_db)):
    return [persona_out(m) for m in db.scalars(select(MasterPersona).where(MasterPersona.enabled.is_(True)).order_by(MasterPersona.sort_order))]


def _start_chat(master_id: str, body: ChatIn, db: Session):
    persona = db.get(MasterPersona, master_id)
    if not persona or not persona.enabled:
        raise err(404, "MASTER_NOT_FOUND")
    p = get_profile(body.profile_id, db)
    _usage(db, p)
    lang = _lang(p, body.language)
    sess = db.get(ChatSession, body.session_id) if body.session_id else None
    if sess and (sess.profile_id != p.id or sess.master_id != master_id):
        sess = None
    if not sess:
        sess = ChatSession(profile_id=p.id, master_id=master_id, title=body.message[:80])
        db.add(sess)
        db.flush()
    history = [{"role": m.role, "content": m.content} for m in db.scalars(
        select(ChatMessage).where(ChatMessage.session_id == sess.id).order_by(desc(ChatMessage.created_at)).limit(12))][::-1]
    db.add(ChatMessage(session_id=sess.id, role="user", content=body.message))
    sess.updated_at = datetime.now(timezone.utc)
    db.commit()
    session_id = sess.id

    async def persist(ev: dict):
        if ev["type"] != "final":
            return
        with SessionLocal() as s:
            s.add(ChatMessage(session_id=session_id, role="assistant", content=ev["content"], tool_calls=ev.get("tool_calls"),
                              sources=ev.get("sources")))
            s.commit()

    q = run_detached(run_master_chat(persona, p, lang, history, body.message), persist)
    return session_id, q


@router.post("/masters/{master_id}/chat/stream")
async def chat_stream(master_id: str, body: ChatIn, db: Session = Depends(get_db)):
    session_id, q = _start_chat(master_id, body, db)
    return sse_response(q, first={"type": "started", "session_id": session_id})


@router.post("/masters/{master_id}/chat")
async def chat_sync(master_id: str, body: ChatIn, db: Session = Depends(get_db)):
    session_id, q = _start_chat(master_id, body, db)
    events = await collect(q)
    final = next((e for e in events if e["type"] == "final"), None)
    if not final:
        code = next((e.get("code") for e in events if e["type"] == "error"), "AI_UNAVAILABLE")
        raise err(503, code)
    return {"session_id": session_id, "content": final["content"], "sources": final["sources"], "tool_calls": final["tool_calls"]}


@router.get("/profiles/{profile_id}/master-chats")
def list_chats(p: ChildProfile = Depends(get_profile), db: Session = Depends(get_db), master_id: str | None = None):
    stmt = select(ChatSession).where(ChatSession.profile_id == p.id)
    if master_id:
        stmt = stmt.where(ChatSession.master_id == master_id)
    return [{"id": s.id, "master_id": s.master_id, "title": s.title, "created_at": s.created_at, "updated_at": s.updated_at}
            for s in db.scalars(stmt.order_by(desc(ChatSession.updated_at)).limit(100))]


@router.get("/chat-sessions/{session_id}/messages")
def chat_messages(session_id: str, db: Session = Depends(get_db)):
    if not db.get(ChatSession, session_id):
        raise err(404, "NOT_FOUND")
    return [{"id": m.id, "role": m.role, "content": m.content, "sources": m.sources, "tool_calls": m.tool_calls, "created_at": m.created_at}
            for m in db.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at))]


# ------------------------------------------------------------------ explain

@router.get("/glossary")
def glossary(term: str, language: str = "en-US"):
    g = glossary_entry(term, language)
    if not g:
        raise err(404, "TERM_NOT_FOUND")
    return g


@router.post("/explain/stream")
async def explain(body: ExplainIn, db: Session = Depends(get_db)):
    age, lang = "B", body.language or "en-US"
    if body.profile_id:
        p = get_profile(body.profile_id, db)
        _usage(db, p)
        age, lang = p.age_group, body.language or p.language

    async def gen():
        base = glossary_entry(body.term, lang)
        if base:
            yield {"type": "glossary", **base}
        text = ""
        try:
            async for tok in explain_stream(body.term, body.context, age, lang):
                text += tok
                yield {"type": "token", "text": tok}
        except LLMUnavailable as e:
            yield {"type": "error", "code": "AI_NOT_CONFIGURED" if isinstance(e, LLMNotConfigured) else "AI_UNAVAILABLE"}
            return
        yield {"type": "final", "content": text}

    return sse_response(run_detached(gen()))
