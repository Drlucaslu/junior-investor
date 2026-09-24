"""Lightweight in-process metrics (PRD §23). Metadata only — never chat text."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_latency: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))
_counters: dict[str, int] = defaultdict(int)
_tokens = {"prompt": 0, "completion": 0}
_started = time.time()


def record_latency(name: str, ms: float) -> None:
    with _lock:
        _latency[name].append(ms)


def incr(name: str, n: int = 1) -> None:
    with _lock:
        _counters[name] += n


def record_llm_metric(m: dict) -> None:
    with _lock:
        _latency[f"llm.{m['kind']}"].append(m["latency_ms"])
        _tokens["prompt"] += m.get("prompt_tokens", 0) or 0
        _tokens["completion"] += m.get("completion_tokens", 0) or 0
        _counters["llm.calls"] += 1


def snapshot() -> dict:
    with _lock:
        lat = {}
        for k, v in _latency.items():
            if v:
                s = sorted(v)
                lat[k] = {"count": len(s), "p50_ms": round(s[len(s) // 2], 1), "p95_ms": round(s[int(len(s) * 0.95) - 1 if len(s) > 1 else 0], 1)}
        return {"uptime_s": int(time.time() - _started), "latency": lat, "counters": dict(_counters), "llm_tokens": dict(_tokens)}


class timed:
    def __init__(self, name: str):
        self.name = name

    def __enter__(self):
        self.t0 = time.monotonic()
        return self

    def __exit__(self, exc_type, *_):
        record_latency(self.name, (time.monotonic() - self.t0) * 1000)
        if exc_type:
            incr(f"{self.name}.errors")
        return False
