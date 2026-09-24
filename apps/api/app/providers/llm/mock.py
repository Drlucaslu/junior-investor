"""Scripted LLM for tests and offline development."""
from __future__ import annotations

from collections.abc import AsyncIterator, Callable

from app.providers.llm.base import LLMProvider, LLMResponse, LLMUnavailable, StreamEvent


def _default_script(messages: list[dict], tools: list[dict] | None) -> LLMResponse:
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
    zh = "简体中文" in system
    body = "（离线模拟回答）这是一个教育性的解释。" if zh else "(Offline mock answer) Here is an educational explanation."
    return LLMResponse(content=f"{body}\n\n> {last_user[:120]}", model="mock-llm")


class MockLLMProvider(LLMProvider):
    model = "mock-llm"

    def __init__(self, script: Callable[[list[dict], list[dict] | None], LLMResponse] | None = None):
        self.script = script or _default_script
        self.calls: list[dict] = []
        self.unavailable = False

    async def chat(self, messages, *, tools=None, temperature=None, max_tokens=None, json_mode=False) -> LLMResponse:
        if self.unavailable:
            raise LLMUnavailable("mock LLM offline")
        self.calls.append({"messages": messages, "tools": tools, "json_mode": json_mode})
        return self.script(messages, tools)

    async def stream(self, messages, *, temperature=None, max_tokens=None) -> AsyncIterator[str]:
        if self.unavailable:
            raise LLMUnavailable("mock LLM offline")
        self.calls.append({"messages": messages, "stream": True})
        text = self.script(messages, None).content
        for i in range(0, len(text), 12):
            yield text[i:i + 12]

    async def stream_chat(self, messages, *, tools=None, temperature=None, max_tokens=None):
        if self.unavailable:
            raise LLMUnavailable("mock LLM offline")
        self.calls.append({"messages": messages, "tools": tools, "stream": True})
        resp = self.script(messages, tools)
        if resp.tool_calls:
            yield StreamEvent(kind="tool_calls", tool_calls=resp.tool_calls)
            return
        for i in range(0, len(resp.content), 12):
            yield StreamEvent(kind="content", text=resp.content[i:i + 12])
        yield StreamEvent(kind="usage", usage={})
