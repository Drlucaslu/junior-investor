"""AI model configuration chosen by the parent in Settings.

The app speaks the OpenAI-compatible Chat Completions protocol, so one
implementation covers the Olares local model and most cloud providers.
The saved config (stored locally in app_settings) overrides environment
variables. API keys never leave the server: the UI only sees a masked hint.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from app.config import get_settings
from app.db import SessionLocal
from app.models import AppSetting

KEY = "llm_config"

# Base URLs of well-known OpenAI-compatible endpoints. Model names change often,
# so the UI fetches them live from {base_url}/models instead of hardcoding.
PRESETS: list[dict] = [
    {"id": "olares", "cloud": False, "base_url": "", "needs_key": False},
    {"id": "openai", "cloud": True, "base_url": "https://api.openai.com/v1", "needs_key": True},
    {"id": "anthropic", "cloud": True, "base_url": "https://api.anthropic.com/v1", "needs_key": True},
    {"id": "gemini", "cloud": True, "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "needs_key": True},
    {"id": "deepseek", "cloud": True, "base_url": "https://api.deepseek.com/v1", "needs_key": True},
    {"id": "openrouter", "cloud": True, "base_url": "https://openrouter.ai/api/v1", "needs_key": True},
    {"id": "dashscope", "cloud": True, "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "needs_key": True},
    {"id": "custom", "cloud": True, "base_url": "", "needs_key": False},
]
PRESET_IDS = {p["id"] for p in PRESETS}


@dataclass
class AIConfig:
    preset: str = "olares"
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    temperature: float = 0.3
    native_tools: bool = True
    source: str = "env"  # env | settings

    def public(self) -> dict:
        d = asdict(self)
        key = d.pop("api_key")
        d["has_api_key"] = bool(key)
        d["api_key_hint"] = f"••••{key[-4:]}" if len(key) >= 8 else ("••••" if key else "")
        d["configured"] = bool(self.base_url and self.model)
        d["cloud"] = next((p["cloud"] for p in PRESETS if p["id"] == self.preset), True)
        return d


def _env_config() -> AIConfig:
    s = get_settings()
    return AIConfig(preset="olares" if s.llm_provider in ("olares-local", "") else "custom", base_url=s.llm_base_url or "",
                    model=s.llm_model or "", api_key=s.llm_api_key or "", temperature=s.llm_temperature,
                    native_tools=s.llm_native_tools, source="env")


def load() -> AIConfig:
    """Effective config: saved settings if present, otherwise environment."""
    try:
        with SessionLocal() as db:
            row = db.get(AppSetting, KEY)
            if row and isinstance(row.value, dict) and row.value.get("base_url"):
                v = row.value
                return AIConfig(preset=v.get("preset", "custom"), base_url=v.get("base_url", ""), model=v.get("model", ""),
                                api_key=v.get("api_key", ""), temperature=float(v.get("temperature", 0.3)),
                                native_tools=bool(v.get("native_tools", True)), source="settings")
    except Exception:  # table may not exist during very early startup
        pass
    return _env_config()


def save(preset: str, base_url: str, model: str, api_key: str | None, temperature: float, native_tools: bool,
         keep_existing_key: bool = True) -> AIConfig:
    current = load()
    key = api_key if api_key else (current.api_key if keep_existing_key and current.base_url.rstrip("/") == base_url.rstrip("/") else "")
    value = {"preset": preset, "base_url": base_url.strip().rstrip("/"), "model": model.strip(), "api_key": (key or "").strip(),
             "temperature": temperature, "native_tools": native_tools}
    with SessionLocal() as db:
        row = db.get(AppSetting, KEY)
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=KEY, value=value))
        db.commit()
    return load()


def reset_to_env() -> AIConfig:
    with SessionLocal() as db:
        row = db.get(AppSetting, KEY)
        if row:
            db.delete(row)
            db.commit()
    return load()


def is_cloud(c: AIConfig) -> bool:
    return next((p["cloud"] for p in PRESETS if p["id"] == c.preset), True)
