from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Language = Literal["zh-CN", "en-US"]
AgeGroup = Literal["A", "B", "C"]


class SetupIn(BaseModel):
    language: Language = "en-US"
    family_name: str = Field("My Family", max_length=80)
    parent_name: str = Field("Parent", max_length=80)
    pin: str = Field(min_length=4, max_length=12)

    @field_validator("pin")
    @classmethod
    def digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must be digits")
        return v


class PinIn(BaseModel):
    pin: str


class PinChangeIn(BaseModel):
    old_pin: str
    new_pin: str = Field(min_length=4, max_length=12)


class ProfileIn(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)
    age_group: AgeGroup = "B"
    language: Language = "en-US"
    avatar: str = Field("owl", max_length=32)
    starting_cash: Decimal = Field(Decimal("1000000"), gt=0, le=Decimal("1000000000"))
    allow_etf: bool = True
    allow_fractional: bool = False
    daily_ai_limit: int | None = Field(None, ge=0, le=10000)
    daily_minutes_limit: int | None = Field(None, ge=0, le=1440)


class ProfilePatch(BaseModel):
    nickname: str | None = Field(None, min_length=1, max_length=40)
    age_group: AgeGroup | None = None
    language: Language | None = None
    avatar: str | None = Field(None, max_length=32)
    allow_etf: bool | None = None
    allow_fractional: bool | None = None
    daily_ai_limit: int | None = Field(None, ge=0, le=10000)
    daily_minutes_limit: int | None = Field(None, ge=0, le=1440)
    clear_ai_limit: bool = False
    clear_minutes_limit: bool = False


CHILD_EDITABLE = {"language", "avatar"}


class ResetIn(BaseModel):
    starting_cash: Decimal | None = Field(None, gt=0, le=Decimal("1000000000"))


class TradeIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    side: Literal["BUY", "SELL", "buy", "sell"]
    quantity: Decimal = Field(gt=0)
    journal_content: str | None = Field(None, max_length=5000)
    journal_answers: dict[str, str] | None = None
    research_id: str | None = None


class WatchIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    note: str | None = Field(None, max_length=1000)


class JournalIn(BaseModel):
    symbol: str | None = Field(None, max_length=16)
    trade_id: str | None = None
    research_id: str | None = None
    type: Literal["pre_trade", "post_trade", "free_note"] = "free_note"
    content: str = Field("", max_length=10000)
    answers: dict[str, str] | None = None


class ResearchIn(BaseModel):
    profile_id: str
    query: str = Field(min_length=1, max_length=500)
    mode: Literal["quick", "deep"] = "quick"
    language: Language | None = None


class FollowupIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    language: Language | None = None


class ResearchPatch(BaseModel):
    favorite: bool | None = None


class ChatIn(BaseModel):
    profile_id: str
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    language: Language | None = None


class ExplainIn(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    context: str | None = Field(None, max_length=1000)
    profile_id: str | None = None
    language: Language | None = None


class SettingsPatch(BaseModel):
    default_language: Language | None = None
    family_name: str | None = Field(None, max_length=80)


class AIConfigIn(BaseModel):
    preset: str = Field("custom", max_length=32)
    base_url: str = Field(..., min_length=8, max_length=500)
    model: str = Field("", max_length=200)
    api_key: str | None = Field(None, max_length=500)  # empty/None keeps the saved key for the same URL
    temperature: float = Field(0.3, ge=0, le=2)
    native_tools: bool = True

    @field_validator("base_url")
    @classmethod
    def http_url(cls, v: str) -> str:
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v.rstrip("/")
