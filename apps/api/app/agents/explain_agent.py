"""Explain Agent (PRD §11.1): age-adapted explanation of a finance term."""
from __future__ import annotations

from collections.abc import AsyncIterator

from app.data.glossary import GLOSSARY
from app.prompts import policies as P
from app.providers import registry
from app.providers.llm.base import LLMUnavailable

ALIASES = {
    "p/e": "pe", "pe ratio": "pe", "市盈率": "pe", "forward p/e": "forward_pe", "eps": "eps", "每股收益": "eps", "fcf": "fcf",
    "free cash flow": "fcf", "自由现金流": "fcf", "market cap": "market_cap", "市值": "market_cap", "gross margin": "gross_margin",
    "毛利率": "gross_margin", "operating margin": "operating_margin", "p/s": "ps", "市销率": "ps", "etf": "etf", "dividend": "dividend",
    "股息": "dividend", "分红": "dividend", "moat": "moat", "护城河": "moat", "roic": "roic", "beta": "beta", "fcf yield": "fcf_yield",
}


def lookup(term: str) -> tuple[str, dict] | None:
    key = term.strip().lower()
    key = ALIASES.get(key, key)
    if key in GLOSSARY:
        return key, GLOSSARY[key]
    for k, v in GLOSSARY.items():
        if key in (v["term_en"].lower(), v["term_zh"].lower()):
            return k, v
    return None


def glossary_entry(term: str, language: str) -> dict | None:
    hit = lookup(term)
    if not hit:
        return None
    k, v = hit
    zh = language.startswith("zh")
    return {"id": k, "term": v["term_zh"] if zh else v["term_en"], "definition": v["zh"] if zh else v["en"], "source": "glossary"}


async def explain_stream(term: str, context: str | None, age_group: str, language: str) -> AsyncIterator[str]:
    llm = registry.llm_provider()
    base = glossary_entry(term, language)
    messages = [
        {"role": "system", "content": "\n\n".join([
            "You explain ONE finance term to a young learner, clearly and correctly, in at most 120 words (Chinese: at most 200 characters). "
            "Give: a plain definition, a tiny everyday example, and one common misunderstanding. No investment advice, no current market numbers.",
            P.age_block(age_group, language), P.language_block(language)])},
        {"role": "user", "content": f"Term: {term}" + (f"\nWhere the student saw it: {context[:300]}" if context else "")
         + (f"\nReference definition: {base['definition']}" if base else "")},
    ]
    try:
        async for tok in llm.stream(messages, temperature=0.2, max_tokens=400):
            yield tok
    except LLMUnavailable:
        raise
