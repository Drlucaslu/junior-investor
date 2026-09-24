"""OpenAI-compatible chat completion client. Works with the Olares llama.cpp /
llama-swap endpoint serving Qwen 3.8 27B, and with any other OpenAI-compatible
server (vLLM, Ollama /v1, LocalAI, hosted APIs)."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator, Callable

import httpx

from app.providers.llm.base import LLMNotConfigured, LLMProvider, LLMResponse, LLMUnavailable, StreamEvent, ToolCall

log = logging.getLogger(__name__)
THINK_RE = re.compile(r"<think>.*?</think>\s*", re.S)
RETRY_STATUS = {502, 503, 504}


class _Retryable(LLMUnavailable):
    """Model endpoint not ready yet (loading / swapping)."""


class _Adapted(LLMUnavailable):
    """Request rejected but adjusted for a provider quirk; retry immediately."""


def strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").lstrip()


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, api_key: str = "", temperature: float = 0.3, max_tokens: int = 4096,
                 timeout: float = 300.0, metrics_hook: Callable[[dict], None] | None = None, retry_seconds: float = 150.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.metrics_hook = metrics_hook
        self.retry_seconds = retry_seconds
        self.quirks: set[str] = set()  # learned API differences, e.g. {"max_completion_tokens", "no_temperature"}

    def _check_configured(self) -> None:
        if not self.base_url or not self.model:
            raise LLMNotConfigured("AI model not configured")

    def _adapt(self, body: dict, status: int, text: str) -> bool:
        """Adjust the request for provider differences after a 400 error.
        Returns True if the body changed and the request should be retried."""
        if status not in (400, 422):
            return False
        t = text.lower()
        changed = False
        if "max_tokens" in t and "max_tokens" in body and "max_completion_tokens" not in body:
            body["max_completion_tokens"] = body.pop("max_tokens")
            self.quirks.add("max_completion_tokens")
            changed = True
        if "temperature" in t and "temperature" in body:
            body.pop("temperature")
            self.quirks.add("no_temperature")
            changed = True
        if "stream_options" in t and "stream_options" in body:
            body.pop("stream_options")
            self.quirks.add("no_stream_options")
            changed = True
        if not changed and ("response_format" in body or "tools" in body) and ("response_format" in t or "tool" in t or "json" in t):
            body.pop("response_format", None)
            body.pop("tools", None)
            self.quirks.add("no_tools")
            changed = True
        return changed

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _body(self, messages, temperature, max_tokens, **extra) -> dict:
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if temperature is None else temperature,
            "max_tokens": max_tokens or self.max_tokens,
        }
        body.update({k: v for k, v in extra.items() if v is not None})
        if "max_completion_tokens" in self.quirks:
            body["max_completion_tokens"] = body.pop("max_tokens")
        if "no_temperature" in self.quirks:
            body.pop("temperature", None)
        if "no_stream_options" in self.quirks:
            body.pop("stream_options", None)
        if "no_tools" in self.quirks:
            body.pop("tools", None)
            body.pop("response_format", None)
        return body

    async def chat(self, messages, *, tools=None, temperature=None, max_tokens=None, json_mode=False) -> LLMResponse:
        self._check_configured()
        body = self._body(messages, temperature, max_tokens, tools=tools or None,
                          response_format={"type": "json_object"} if json_mode else None)
        t0 = time.monotonic()
        deadline = t0 + self.retry_seconds
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as c:
                while True:
                    try:
                        r = await c.post(f"{self.base_url}/chat/completions", headers=self._headers(), json=body)
                        retry = r.status_code in RETRY_STATUS or (r.status_code >= 500 and "loading" in r.text.lower())
                    except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ConnectTimeout):
                        retry = True
                        if time.monotonic() > deadline:
                            raise
                    if not retry or time.monotonic() > deadline:
                        break
                    await asyncio.sleep(3)
                for _ in range(3):  # adapt to provider quirks (e.g. max_completion_tokens)
                    if r.status_code < 400 or not self._adapt(body, r.status_code, r.text):
                        break
                    r = await c.post(f"{self.base_url}/chat/completions", headers=self._headers(), json=body)
                if r.status_code >= 400:
                    raise LLMUnavailable(f"HTTP {r.status_code}: {r.text[:300]}")
                data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            raise LLMUnavailable(str(e)) from e
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        calls = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(id=tc.get("id") or uuid.uuid4().hex[:12], name=fn.get("name", ""), arguments=args))
        usage = data.get("usage") or {}
        resp = LLMResponse(content=strip_think(msg.get("content") or ""), tool_calls=calls,
                           prompt_tokens=usage.get("prompt_tokens", 0), completion_tokens=usage.get("completion_tokens", 0),
                           model=data.get("model", self.model), finish_reason=choice.get("finish_reason"))
        self._metric("chat", t0, resp.prompt_tokens, resp.completion_tokens)
        return resp

    async def stream(self, messages, *, temperature=None, max_tokens=None) -> AsyncIterator[str]:
        async for ev in self.stream_chat(messages, temperature=temperature, max_tokens=max_tokens):
            if ev.kind == "content":
                yield ev.text

    async def stream_chat(self, messages, *, tools=None, temperature=None, max_tokens=None) -> AsyncIterator[StreamEvent]:
        """Stream with automatic retry while the local model is (re)loading.

        llama-swap / llama.cpp answer 502/503 or refuse connections while a model
        is being loaded into the GPU (cold start after TTL unload or a model swap).
        We retry for up to `retry_seconds` *before the first token* and emit a
        `notice` event so the UI can say "model is loading" instead of failing."""
        self._check_configured()
        deadline = time.monotonic() + self.retry_seconds
        noticed = False
        adaptations = 0
        while True:
            started = False
            try:
                async for ev in self._stream_once(messages, tools, temperature, max_tokens):
                    started = True
                    yield ev
                return
            except _Adapted as e:
                adaptations += 1
                if started or adaptations > 3:
                    raise LLMUnavailable(str(e)) from e
                continue
            except _Retryable as e:
                if started or time.monotonic() > deadline:
                    raise LLMUnavailable(str(e)) from e
                if not noticed:
                    noticed = True
                    log.info("LLM not ready (%s); waiting for model to load", e)
                    yield StreamEvent(kind="notice", text="MODEL_LOADING")
                await asyncio.sleep(3)

    async def _stream_once(self, messages, tools, temperature, max_tokens) -> AsyncIterator[StreamEvent]:
        body = self._body(messages, temperature, max_tokens, stream=True, stream_options={"include_usage": True},
                          tools=tools or None)
        t0 = time.monotonic()
        filt = _ThinkFilter()
        usage: dict = {}
        calls: dict[int, dict] = {}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as c:
                async with c.stream("POST", f"{self.base_url}/chat/completions", headers=self._headers(), json=body) as r:
                    if r.status_code >= 400:
                        await r.aread()
                        msg = f"HTTP {r.status_code}: {r.text[:300]}"
                        if r.status_code in RETRY_STATUS or "loading" in r.text.lower():
                            raise _Retryable(msg)
                        if self._adapt(body, r.status_code, r.text):
                            raise _Adapted(msg)
                        raise LLMUnavailable(msg)
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            data = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        usage = data.get("usage") or usage
                        for ch in data.get("choices") or []:
                            delta = ch.get("delta") or {}
                            for tc in delta.get("tool_calls") or []:
                                slot = calls.setdefault(tc.get("index", 0), {"id": None, "name": "", "args": ""})
                                slot["id"] = tc.get("id") or slot["id"]
                                fn = tc.get("function") or {}
                                slot["name"] += fn.get("name") or ""
                                slot["args"] += fn.get("arguments") or ""
                            piece = delta.get("content") or ""
                            if piece:
                                out = filt.feed(piece)
                                if out:
                                    yield StreamEvent(kind="content", text=out)
            tail = filt.flush()
            if tail:
                yield StreamEvent(kind="content", text=tail)
        except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ConnectTimeout) as e:
            raise _Retryable(str(e)) from e
        except httpx.HTTPError as e:
            raise LLMUnavailable(str(e)) from e
        if calls:
            parsed = []
            for _, slot in sorted(calls.items()):
                try:
                    args = json.loads(slot["args"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                parsed.append(ToolCall(id=slot["id"] or uuid.uuid4().hex[:12], name=slot["name"], arguments=args))
            yield StreamEvent(kind="tool_calls", tool_calls=parsed)
        yield StreamEvent(kind="usage", usage=usage)
        self._metric("stream", t0, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))

    def _metric(self, kind: str, t0: float, pt: int, ct: int) -> None:
        m = {"kind": kind, "model": self.model, "latency_ms": int((time.monotonic() - t0) * 1000), "prompt_tokens": pt,
             "completion_tokens": ct}
        log.info("llm_call %s", m)
        if self.metrics_hook:
            try:
                self.metrics_hook(m)
            except Exception:  # pragma: no cover
                pass


class _ThinkFilter:
    """Removes <think>...</think> spans from a token stream (tags may be split
    across chunks)."""

    def __init__(self):
        self.buf = ""
        self.in_think = False

    def feed(self, piece: str) -> str:
        self.buf += piece
        out = []
        while self.buf:
            if self.in_think:
                end = self.buf.find("</think>")
                if end < 0:
                    self.buf = self.buf[-8:]
                    break
                self.buf = self.buf[end + 8:].lstrip()
                self.in_think = False
            else:
                start = self.buf.find("<think>")
                if start < 0:
                    lt = self.buf.rfind("<")
                    safe = lt if (lt >= 0 and len(self.buf) - lt < 7) else len(self.buf)
                    out.append(self.buf[:safe])
                    self.buf = self.buf[safe:]
                    break
                out.append(self.buf[:start])
                self.buf = self.buf[start + 7:]
                self.in_think = True
        return "".join(out)

    def flush(self) -> str:
        tail = "" if self.in_think else self.buf
        self.buf = ""
        return tail
