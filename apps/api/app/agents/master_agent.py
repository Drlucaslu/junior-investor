"""Master Chat Agent (PRD §5). Streams an educational answer in the voice of
an AI teaching persona, calling read-only tools for any current facts."""
from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator

from app.agents.common import dedupe_sources, detect_tickers, needs_current_data, safety_cue
from app.agents.tools import TOOL_NAMES, TOOL_SCHEMAS, run_tool
from app.config import get_settings
from app.models import ChildProfile, MasterPersona
from app.prompts import policies as P
from app.providers import registry
from app.providers.llm.base import LLMNotConfigured, LLMUnavailable, ToolCall

log = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 4


def build_system_prompt(persona: MasterPersona, profile: ChildProfile, language: str, extra: str | None = None) -> str:
    parts = [
        "PERSONA IDENTITY:\n" + persona.system_prompt,
        P.EDUCATIONAL_GOAL,
        P.age_block(profile.age_group, language),
        P.language_block(language),
        P.SOURCE_POLICY,
        P.INVESTMENT_ADVICE_POLICY,
        P.UNCERTAINTY_POLICY,
        P.CHILD_SAFETY_POLICY,
        P.STYLE_RULES,
        f"The student's nickname is {profile.nickname}. Tools available let you look up current market data; the student's "
        "own portfolio is simulated with virtual money.",
    ]
    if extra:
        parts.append(extra)
    return "\n\n".join(parts)


def _assistant_tool_msg(calls: list[ToolCall], content: str = "") -> dict:
    return {"role": "assistant", "content": content or "", "tool_calls": [
        {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.arguments, ensure_ascii=False)}}
        for c in calls]}


async def run_master_chat(persona: MasterPersona, profile: ChildProfile, language: str, history: list[dict],
                          user_message: str) -> AsyncIterator[dict]:
    """Yields events: {type: tool|token|sources|error|final}."""
    s = get_settings()
    llm = registry.llm_provider()
    system = build_system_prompt(persona, profile, language, safety_cue(user_message, language))
    messages: list[dict] = [{"role": "system", "content": system}, *history[-12:], {"role": "user", "content": user_message}]
    sources: list[dict] = []
    tool_log: list[dict] = []

    # Deterministic guard: questions about current facts for a detected ticker
    # always get fresh tool data, even if the model would not ask for it.
    if needs_current_data(user_message):
        pre_calls = [ToolCall(id=f"pre_{uuid.uuid4().hex[:8]}", name="get_quote", arguments={"ticker": t})
                     for t in detect_tickers(user_message)]
        if any(w in user_message.lower() for w in ("valuation", "估值", "p/e", "pe ", "市盈率", "市值", "market cap")):
            pre_calls += [ToolCall(id=f"pre_{uuid.uuid4().hex[:8]}", name="get_valuation_metrics", arguments={"ticker": c.arguments["ticker"]})
                          for c in list(pre_calls)]
        if any(w in user_message.lower() for w in ("revenue", "营收", "收入", "profit", "利润", "earnings", "财报", "quarter", "季度", "cash flow", "现金流")):
            pre_calls += [ToolCall(id=f"pre_{uuid.uuid4().hex[:8]}", name="get_financials", arguments={"ticker": c.arguments["ticker"]})
                          for c in list(pre_calls) if c.name == "get_quote"]
        if pre_calls:
            results = []
            for c in pre_calls:
                r = await run_tool(c.name, c.arguments, profile.id)
                if c.name == "get_quote" and not r.ok:
                    continue  # not a real ticker; skip silently
                results.append((c, r))
            if results:
                messages.append(_assistant_tool_msg([c for c, _ in results]))
                for c, r in results:
                    messages.append({"role": "tool", "tool_call_id": c.id, "content": r.to_message()})
                    sources += r.sources
                    tool_log.append({"name": c.name, "args": c.arguments, "ok": r.ok})
                    yield {"type": "tool", "name": c.name, "args": c.arguments, "ok": r.ok}

    final_text = ""
    try:
        from app.services import ai_config

        if s.llm_provider == "mock" or ai_config.load().native_tools:
            for round_ in range(MAX_TOOL_ROUNDS + 1):
                tools = TOOL_SCHEMAS if round_ < MAX_TOOL_ROUNDS else None
                calls: list[ToolCall] = []
                round_text = ""
                async for ev in llm.stream_chat(messages, tools=tools):
                    if ev.kind == "content":
                        round_text += ev.text
                        yield {"type": "token", "text": ev.text}
                    elif ev.kind == "notice":
                        yield {"type": "notice", "code": ev.text}
                    elif ev.kind == "tool_calls":
                        calls = [c for c in ev.tool_calls if c.name in TOOL_NAMES]
                if not calls:
                    final_text = round_text
                    break
                messages.append(_assistant_tool_msg(calls, round_text))
                for c in calls:
                    r = await run_tool(c.name, c.arguments, profile.id)
                    messages.append({"role": "tool", "tool_call_id": c.id, "content": r.to_message()})
                    sources += r.sources
                    tool_log.append({"name": c.name, "args": c.arguments, "ok": r.ok})
                    yield {"type": "tool", "name": c.name, "args": c.arguments, "ok": r.ok}
        else:
            planned = await _plan_tools(llm, messages)
            if planned:
                messages.append(_assistant_tool_msg(planned))
                for c in planned:
                    r = await run_tool(c.name, c.arguments, profile.id)
                    messages.append({"role": "tool", "tool_call_id": c.id, "content": r.to_message()})
                    sources += r.sources
                    tool_log.append({"name": c.name, "args": c.arguments, "ok": r.ok})
                    yield {"type": "tool", "name": c.name, "args": c.arguments, "ok": r.ok}
            async for ev in llm.stream_chat(messages):
                if ev.kind == "content":
                    final_text += ev.text
                    yield {"type": "token", "text": ev.text}
                elif ev.kind == "notice":
                    yield {"type": "notice", "code": ev.text}
    except LLMUnavailable as e:
        log.warning("LLM unavailable: %s", e)
        yield {"type": "error", "code": "AI_NOT_CONFIGURED" if isinstance(e, LLMNotConfigured) else "AI_UNAVAILABLE"}
        return

    srcs = dedupe_sources(sources)
    if srcs:
        yield {"type": "sources", "sources": srcs}
    yield {"type": "final", "content": final_text.strip(), "sources": srcs, "tool_calls": tool_log}


async def _plan_tools(llm, messages: list[dict]) -> list[ToolCall]:
    """JSON planning fallback for models/servers without native tool calling."""
    catalog = "\n".join(f"- {t['function']['name']}: {t['function']['description']} params={list(t['function']['parameters'].get('properties', {}))}"
                        for t in TOOL_SCHEMAS)
    plan_prompt = [
        {"role": "system", "content": "You decide which read-only data tools are needed to answer the student's last message. "
                                      "Current prices, financials and news always require tools. Reply ONLY with JSON: "
                                      '{"tools":[{"name":"...","args":{...}}]} (max 4, or an empty list).\nTools:\n' + catalog},
        {"role": "user", "content": messages[-1]["content"]},
    ]
    try:
        resp = await llm.chat(plan_prompt, json_mode=True, temperature=0)
        data = json.loads(resp.content[resp.content.find("{"): resp.content.rfind("}") + 1])
    except Exception:
        return []
    out = []
    for t in (data.get("tools") or [])[:4]:
        if t.get("name") in TOOL_NAMES:
            out.append(ToolCall(id=f"plan_{uuid.uuid4().hex[:8]}", name=t["name"], arguments=t.get("args") or {}))
    return out
