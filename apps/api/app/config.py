"""Application settings, loaded from environment variables.

Every external dependency (LLM, market data, fundamentals, search) is chosen by
an environment variable so it can be swapped without touching business logic.
"""
from __future__ import annotations

from decimal import Decimal
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_default_language: str = "en-US"
    app_secret: str = "change-me-in-production"  # used to sign parent session tokens
    database_url: str = "sqlite:///./data/junior_investor.db"
    static_dir: str = "static"  # built frontend (Vite dist)
    log_level: str = "INFO"
    debug_log_chat: bool = False  # never log child chat text unless explicitly enabled

    # LLM
    llm_provider: str = "olares-local"  # olares-local | openai-compatible | mock
    llm_base_url: str = "http://localhost:8080/v1"
    llm_model: str = "qwen3.8-27b"
    llm_api_key: str = ""
    llm_temperature: float = 0.3
    llm_max_tokens: int = 4096
    llm_timeout: float = 300.0
    llm_retry_seconds: float = 150.0  # wait this long for a cold/swapping local model before failing
    llm_native_tools: bool = True  # use OpenAI "tools" field; falls back to JSON planning if unsupported

    # Data providers
    market_data_provider: str = "yahoo"  # yahoo | mock
    market_data_api_key: str = ""
    fundamentals_provider: str = "yahoo"  # yahoo | mock
    fundamentals_api_key: str = ""
    search_provider: str = "duckduckgo"  # duckduckgo | tavily | brave | mock
    search_api_key: str = ""
    sec_user_agent: str = "OlaresJuniorInvestor/1.0 (family-education-app; contact@example.com)"

    # Simulation
    default_starting_cash: Decimal = Decimal("1000000")
    default_currency: str = "USD"
    simulated_commission_bps: Decimal = Decimal("0")
    simulated_slippage_bps: Decimal = Decimal("0")
    allow_fractional_shares: bool = False
    max_quote_age_seconds: int = 7 * 24 * 3600  # refuse to trade on quotes older than this

    # Cache TTLs (seconds)
    cache_quote_ttl: int = 15
    cache_profile_ttl: int = 24 * 3600
    cache_fundamentals_ttl: int = 12 * 3600
    cache_history_intraday_ttl: int = 3600
    cache_history_daily_ttl: int = 24 * 3600
    cache_search_ttl: int = 1800


@lru_cache
def get_settings() -> Settings:
    return Settings()
