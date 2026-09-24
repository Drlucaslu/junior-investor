"""Run an agent in a background task and relay its events over SSE.

The agent keeps running (and saves its result) even if the browser
disconnects — a child navigating away does not lose a Deep Research report.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi.responses import StreamingResponse

log = logging.getLogger(__name__)
_tasks: set[asyncio.Task] = set()


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


def run_detached(source: AsyncIterator[dict], on_event: Callable[[dict], Awaitable[None]] | None = None) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()

    async def pump():
        try:
            async for ev in source:
                if on_event:
                    try:
                        await on_event(ev)
                    except Exception as e:  # persistence errors must not kill the stream
                        log.exception("stream persistence failed: %s", e)
                await q.put(ev)
        except Exception as e:
            log.exception("agent stream failed: %s", e)
            err = {"type": "error", "code": "INTERNAL_ERROR"}
            if on_event:
                try:
                    await on_event(err)
                except Exception:
                    pass
            await q.put(err)
        finally:
            await q.put(None)

    t = asyncio.create_task(pump())
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return q


def sse_response(q: asyncio.Queue, first: dict | None = None) -> StreamingResponse:
    async def gen():
        if first:
            yield sse(first)
        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=10)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if ev is None:
                break
            yield sse(ev)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


async def collect(q: asyncio.Queue) -> list[dict]:
    out = []
    while True:
        ev = await q.get()
        if ev is None:
            return out
        out.append(ev)
