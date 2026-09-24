"""Agent behaviour tests (PRD §24.3) with a scripted LLM."""
import json

from app.providers.llm.base import LLMResponse, ToolCall

API = "/api/v1"


def sse_events(resp):
    out = []
    for block in resp.text.split("\n\n"):
        if block.startswith("data:"):
            out.append(json.loads(block[5:]))
    return out


def system_of(call):
    return call["messages"][0]["content"]


def test_masters_seeded(client):
    ms = client.get(f"{API}/masters").json()
    assert [m["id"] for m in ms] == ["buffett", "lynch", "graham", "munger"]
    assert "Not the real person" in ms[0]["disclaimer_en"]
    assert "并非本人" in ms[0]["disclaimer_zh"]


def test_chat_streams_and_persists(client, profile):
    r = client.post(f"{API}/masters/buffett/chat/stream", json={"profile_id": profile["id"], "message": "What is a moat?"})
    ev = sse_events(r)
    assert ev[0]["type"] == "started"
    assert any(e["type"] == "token" for e in ev)
    assert ev[-1]["type"] == "final"
    sid = ev[0]["session_id"]
    msgs = client.get(f"{API}/chat-sessions/{sid}/messages").json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]


def test_language_and_age_in_prompt(client, parent, providers):
    kid = client.post(f"{API}/profiles", headers=parent, json={"nickname": "Xiao", "age_group": "A", "language": "zh-CN"}).json()
    teen = client.post(f"{API}/profiles", headers=parent, json={"nickname": "Sam", "age_group": "C", "language": "en-US"}).json()
    llm = providers["llm"]
    r = client.post(f"{API}/masters/lynch/chat", json={"profile_id": kid["id"], "message": "什么是复利？"})
    assert r.status_code == 200
    sys_zh = system_of(llm.calls[-1])
    assert "简体中文" in sys_zh and "10–12" in sys_zh
    assert "离线模拟回答" in r.json()["content"]  # Chinese in -> Chinese out (mock follows prompt language)
    client.post(f"{API}/masters/lynch/chat", json={"profile_id": teen["id"], "message": "Explain ROIC"})
    sys_en = system_of(llm.calls[-1])
    assert "Reply in English" in sys_en and "16-18" in sys_en and "valuation frameworks" in sys_en


def test_current_price_question_calls_quote_tool(client, profile, providers):
    r = client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "What is the current price of AAPL?"})
    body = r.json()
    assert any(t["name"] == "get_quote" and t["args"]["ticker"] == "AAPL" for t in body["tool_calls"])
    # tool data was provided to the model
    msgs = providers["llm"].calls[-1]["messages"]
    assert any(m["role"] == "tool" and '"price": 200' in m["content"] for m in msgs)
    assert body["sources"]


def test_revenue_question_calls_financials(client, profile):
    r = client.post(f"{API}/masters/graham/chat", json={"profile_id": profile["id"], "message": "苹果最近的营收是多少？"})
    names = {t["name"] for t in r.json()["tool_calls"]}
    assert {"get_quote", "get_financials"} <= names


def test_model_initiated_tool_call_loop(client, profile, providers):
    state = {"n": 0}

    def script(messages, tools):
        state["n"] += 1
        if state["n"] == 1:
            assert tools, "tools must be offered"
            return LLMResponse(tool_calls=[ToolCall(id="c1", name="get_valuation_metrics", arguments={"ticker": "MSFT"})])
        assert messages[-1]["role"] == "tool"
        return LLMResponse(content="Based on the retrieved data [Yahoo], P/E is 28.5.")

    providers["llm"].script = script
    r = client.post(f"{API}/masters/munger/chat", json={"profile_id": profile["id"], "message": "How should I think about Microsoft?"})
    body = r.json()
    assert body["tool_calls"][0]["name"] == "get_valuation_metrics"
    assert "28.5" in body["content"]


def test_no_execute_trade_tool_exposed():
    from app.agents.tools import TOOL_NAMES
    assert not any("trade" in n or "order" in n for n in TOOL_NAMES)


def test_guarantee_question_gets_safety_cue(client, profile, providers):
    client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "Tell me a stock that will definitely go up, guarantee 100%"})
    assert "SAFETY CUE" in system_of(providers["llm"].calls[-1])
    client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "我怎样一个月把 100 万变成 200 万？"})
    assert "SAFETY CUE" in system_of(providers["llm"].calls[-1]) or "安全提示" in system_of(providers["llm"].calls[-1])


def test_ai_unavailable_trading_still_works(client, profile, providers):
    providers["llm"].unavailable = True
    r = client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "hi"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "AI_UNAVAILABLE"
    r = client.post(f"{API}/profiles/{profile['id']}/trades/execute", json={"symbol": "AAPL", "side": "BUY", "quantity": 1})
    assert r.status_code == 200


def test_daily_ai_limit(client, parent, profile):
    client.patch(f"{API}/profiles/{profile['id']}", headers=parent, json={"daily_ai_limit": 1})
    assert client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "hi"}).status_code == 200
    r = client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "hi again"})
    assert r.status_code == 429


# ------------------------------------------------------------------ research

def research_script(messages, tools):
    sys = messages[0]["content"]
    if "Extract the public companies" in sys:
        return LLMResponse(content='{"companies": ["NVIDIA"], "tickers": []}')
    heads = [l for l in sys.splitlines() if l.startswith("## ")]
    body = "\n\n".join(f"{h}\n- **Fact** Revenue grew [S3]. Bogus cite [S99]." for h in heads)
    return LLMResponse(content=body)


def test_quick_research_by_ticker(client, profile, providers):
    providers["llm"].script = research_script
    r = client.post(f"{API}/research", json={"profile_id": profile["id"], "query": "AAPL", "mode": "quick"})
    rep = r.json()
    assert rep["status"] == "done" and rep["symbol"] == "AAPL"
    md = rep["content_markdown"]
    assert "## 1. Company in One Minute" in md and "5 Important Facts" in md
    assert "[S99]" not in md  # invalid citations are stripped
    assert "## 6. Sources" in md
    assert rep["sources"] and all(s["ref"].startswith("S") for s in rep["sources"])
    comp = rep["structured_json"]["companies"][0]
    assert comp["financials"]["periods"] and comp["valuation"]["pe_ttm"] == 28.5  # numbers come from data, not the LLM
    lst = client.get(f"{API}/profiles/{profile['id']}/research").json()
    assert lst[0]["id"] == rep["id"]


def test_deep_research_natural_language_zh(client, parent, providers):
    kid = client.post(f"{API}/profiles", headers=parent, json={"nickname": "Lin", "age_group": "B", "language": "zh-CN"}).json()
    providers["llm"].script = research_script
    r = client.post(f"{API}/research", json={"profile_id": kid["id"], "query": "帮我研究一下 Nvidia 为什么赚钱", "mode": "deep"})
    rep = r.json()
    assert rep["status"] == "done" and rep["symbol"] == "NVDA"
    assert "一分钟了解公司（Company in One Minute）" in rep["content_markdown"]
    assert "来源（Sources）" in rep["content_markdown"]
    assert len(rep["structured_json"]["sections"]) == 10


def test_research_data_unavailable_no_hallucination(client, profile, providers):
    providers["llm"].script = research_script
    providers["quote"].fail = True
    providers["fundamentals"].fail = True
    r = client.post(f"{API}/research", json={"profile_id": profile["id"], "query": "AAPL", "mode": "quick"})
    rep = r.json()
    assert rep["status"] == "failed" and rep["error"] in ("DATA_UNAVAILABLE",)
    # the LLM was never asked to write a report without data
    assert not any("FACTS PACK" in c["messages"][-1]["content"] for c in providers["llm"].calls)


def test_research_stream_and_followup(client, profile, providers):
    providers["llm"].script = research_script
    r = client.post(f"{API}/research/stream", json={"profile_id": profile["id"], "query": "MSFT", "mode": "quick"})
    ev = sse_events(r)
    types = [e["type"] for e in ev]
    assert types[0] == "started" and "data" in types and "token" in types and types[-1] == "final"
    rid = ev[0]["report_id"]
    providers["llm"].script = lambda m, t: LLMResponse(content="Good question — look at the margins.")
    fu = client.post(f"{API}/research/{rid}/followup", json={"question": "Why are margins high?"}).json()
    assert fu["status"] == "done" and fu["parent_id"] == rid
    full = client.get(f"{API}/research/{rid}").json()
    assert full["followups"][0]["content_markdown"].startswith("Good question")


def test_compare_two_companies(client, profile, providers):
    providers["llm"].script = research_script
    rep = client.post(f"{API}/research", json={"profile_id": profile["id"], "query": "Compare MSFT and GOOGL cloud", "mode": "quick"}).json()
    assert rep["structured_json"]["symbols"] == ["MSFT", "GOOGL"]


def test_explain_glossary_and_stream(client, profile):
    g = client.get(f"{API}/glossary?term=P%2FE&language=zh-CN").json()
    assert "市盈率" in g["term"]
    ev = sse_events(client.post(f"{API}/explain/stream", json={"term": "FCF", "profile_id": profile["id"]}))
    assert ev[0]["type"] == "glossary" and ev[-1]["type"] == "final"


def test_learn_cards_and_progress(client, profile):
    cards = client.get(f"{API}/learn/cards").json()
    assert len(cards) >= 20
    client.post(f"{API}/profiles/{profile['id']}/learn/{cards[0]['id']}/complete")
    assert client.get(f"{API}/profiles/{profile['id']}/learn/progress").json()[0]["card_id"] == cards[0]["id"]


def test_parent_overview(client, parent, profile):
    client.post(f"{API}/profiles/{profile['id']}/trades/execute", json={"symbol": "AAPL", "side": "BUY", "quantity": 1})
    ov = client.get(f"{API}/parent/overview", headers=parent).json()
    assert ov["profiles"][0]["stats"]["trades"] == 1
    assert client.get(f"{API}/parent/overview").status_code == 401


def test_health(client):
    assert client.get("/healthz").json()["status"] == "ok"
    assert client.get(f"{API}/health").json()["database"] == "ok"


def test_llm_cold_start_retry(monkeypatch):
    """502/connection-refused while the model loads -> notice + retry, then success."""
    import asyncio
    import httpx
    from app.providers.llm.openai_compat import OpenAICompatibleProvider

    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(502, text="proxy error: dial tcp [::1]:9100: connect: connection refused")
        body = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    import app.providers.llm.openai_compat as oc
    async def fast_sleep(_):
        return None
    monkeypatch.setattr(oc.asyncio, "sleep", fast_sleep)
    llm = OpenAICompatibleProvider("http://llm/v1", "m", retry_seconds=60)

    async def run():
        return [(e.kind, e.text) async for e in llm.stream_chat([{"role": "user", "content": "hi"}])]
    evs = asyncio.run(run())
    assert ("notice", "MODEL_LOADING") in evs and ("content", "Hello") in evs and calls["n"] == 3


def test_ai_settings_cloud_provider(client, parent, monkeypatch):
    from app.providers import registry
    from app.config import get_settings
    r = client.get(f"{API}/settings/ai")
    assert r.status_code == 401
    presets = client.get(f"{API}/settings/ai", headers=parent).json()["presets"]
    assert any(p["id"] == "openai" for p in presets)
    body = {"preset": "openai", "base_url": "https://api.openai.com/v1/", "model": "gpt-test", "api_key": "sk-test-12345678"}
    cfg = client.put(f"{API}/settings/ai", headers=parent, json=body).json()["config"]
    assert cfg["base_url"] == "https://api.openai.com/v1" and cfg["has_api_key"] and cfg["api_key_hint"] == "••••5678"
    assert "sk-test" not in json.dumps(cfg)  # key never returned
    # saving again without a key keeps the stored key
    cfg = client.put(f"{API}/settings/ai", headers=parent, json={**body, "api_key": None, "model": "gpt-other"}).json()["config"]
    assert cfg["has_api_key"] and cfg["model"] == "gpt-other"
    assert client.get(f"{API}/settings").json()["llm"] == {"provider": "openai", "model": "gpt-other", "configured": True, "cloud": True}
    # provider is rebuilt from saved settings (when not in mock mode)
    monkeypatch.setattr(get_settings(), "llm_provider", "olares-local")
    registry.reset_llm()
    llm = registry.llm_provider()
    assert llm.base_url == "https://api.openai.com/v1" and llm.model == "gpt-other" and llm.api_key == "sk-test-12345678"
    client.delete(f"{API}/settings/ai", headers=parent)
    registry.reset_llm()
    assert client.put(f"{API}/settings/ai", headers=parent, json={**body, "base_url": "ftp://x"}).status_code == 422


def test_not_configured_error_code(client, profile, monkeypatch):
    from app.providers import registry
    from app.providers.llm.openai_compat import OpenAICompatibleProvider
    registry.override("llm", OpenAICompatibleProvider("", "", ""))
    r = client.post(f"{API}/masters/buffett/chat", json={"profile_id": profile["id"], "message": "hi"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "AI_NOT_CONFIGURED"


def test_quirk_adaptation_max_completion_tokens(monkeypatch):
    import asyncio
    import httpx
    from app.providers.llm.openai_compat import OpenAICompatibleProvider
    seen = []

    def handler(request):
        b = json.loads(request.content)
        seen.append(b)
        if "max_tokens" in b:
            return httpx.Response(400, json={"error": {"message": "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}], "model": "m"})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    llm = OpenAICompatibleProvider("https://api.example.com/v1", "m", "k")
    r = asyncio.run(llm.chat([{"role": "user", "content": "hi"}]))
    assert r.content == "OK" and "max_completion_tokens" in seen[-1] and "max_completion_tokens" in llm.quirks
