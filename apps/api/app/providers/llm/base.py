"""LLM provider abstraction (PRD §14.2). Business logic depends only on this
interface; the Olares local Qwen model is one implementation."""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""
    finish_reason: str | None = None


class LLMUnavailable(Exception):
    pass


class LLMNotConfigured(LLMUnavailable):
    """No AI model has been set up yet (Settings > AI model)."""


class LLMProvider(ABC):
    model: str = ""

    @abstractmethod
    async def chat(self, messages: list[dict], *, tools: list[dict] | None = None, temperature: float | None = None,
                   max_tokens: int | None = None, json_mode: bool = False) -> LLMResponse: ...

    @abstractmethod
    def stream(self, messages: list[dict], *, temperature: float | None = None,
               max_tokens: int | None = None) -> AsyncIterator[str]: ...

    def stream_chat(self, messages: list[dict], *, tools: list[dict] | None = None, temperature: float | None = None,
                    max_tokens: int | None = None) -> AsyncIterator["StreamEvent"]:
        """Stream content tokens; if the model decides to call tools, yield a
        final StreamEvent(kind="tool_calls"). Default: non-streaming fallback."""
        return _fallback_stream_chat(self, messages, tools, temperature, max_tokens)


@dataclass
class StreamEvent:
    kind: str  # "content" | "tool_calls" | "usage"
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict = field(default_factory=dict)


async def _fallback_stream_chat(llm: "LLMProvider", messages, tools, temperature, max_tokens):
    resp = await llm.chat(messages, tools=tools, temperature=temperature, max_tokens=max_tokens)
    if resp.tool_calls:
        yield StreamEvent(kind="tool_calls", tool_calls=resp.tool_calls, text=resp.content)
        return
    text = resp.content
    for i in range(0, len(text), 16):
        yield StreamEvent(kind="content", text=text[i:i + 16])
    yield StreamEvent(kind="usage", usage={"prompt_tokens": resp.prompt_tokens, "completion_tokens": resp.completion_tokens})
