"""SQLAlchemy ORM models.

Money and quantities use Numeric (never float). Portfolio state is *derived* from
`ledger_entries`; nothing stores a mutable "portfolio total".
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

MONEY = Numeric(24, 6)
QTY = Numeric(24, 6)


def uid() -> str:
    return uuid.uuid4().hex


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | int | bool | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Family(Base):
    __tablename__ = "families"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(80), default="My Family")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class User(Base):
    """The parent/guardian. Olares already authenticates the device owner; the
    parent PIN separates parent mode from child mode inside the app."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    display_name: Mapped[str] = mapped_column(String(80), default="Parent")
    role: Mapped[str] = mapped_column(String(16), default="parent")
    pin_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class ChildProfile(Base):
    __tablename__ = "child_profiles"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    nickname: Mapped[str] = mapped_column(String(40))
    age_group: Mapped[str] = mapped_column(String(1), default="B")  # A: 10-12, B: 13-15, C: 16-18
    language: Mapped[str] = mapped_column(String(8), default="en-US")
    avatar: Mapped[str] = mapped_column(String(32), default="owl")
    starting_cash: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("1000000"))
    allow_etf: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_fractional: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_ai_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = unlimited
    daily_minutes_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    account: Mapped["SimulationAccount"] = relationship(back_populates="profile", uselist=False)


class SimulationAccount(Base):
    __tablename__ = "simulation_accounts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), unique=True)
    base_currency: Mapped[str] = mapped_column(String(3), default="USD")
    starting_cash: Mapped[Decimal] = mapped_column(MONEY)
    # Each reset starts a new epoch. Old ledger rows are kept (history is never
    # deleted) but only the current epoch is used to compute the portfolio.
    epoch: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_corporate_action_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped[ChildProfile] = relationship(back_populates="account")


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    epoch: Mapped[int] = mapped_column(Integer, default=1)
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(4))  # BUY | SELL
    quantity: Mapped[Decimal] = mapped_column(QTY)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_price: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    gross_value: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    fee: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    realized_pnl: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    source_price_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    price_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="PENDING")  # PENDING | EXECUTED | REJECTED
    reject_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    journal_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    research_id: Mapped[str | None] = mapped_column(String(32), nullable=True)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (UniqueConstraint("profile_id", "epoch", "reference_id", "type", name="uq_ledger_ref"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    epoch: Mapped[int] = mapped_column(Integer, default=1, index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)  # strict ordering within a profile
    type: Mapped[str] = mapped_column(String(32))
    symbol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(QTY, nullable=True)  # share delta
    price: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))  # cash delta
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    reference_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("profile_id", "symbol", name="uq_watch"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    symbol: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    trade_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    research_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    type: Mapped[str] = mapped_column(String(16))  # pre_trade | post_trade | free_note
    content: Mapped[str] = mapped_column(Text, default="")
    answers: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # guided questions
    context: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # price / portfolio snapshot
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MasterPersona(Base):
    __tablename__ = "master_personas"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name_en: Mapped[str] = mapped_column(String(80))
    name_zh: Mapped[str] = mapped_column(String(80))
    avatar: Mapped[str] = mapped_column(String(64))
    short_bio_en: Mapped[str] = mapped_column(Text)
    short_bio_zh: Mapped[str] = mapped_column(Text)
    philosophy_tags: Mapped[list] = mapped_column(JSON, default=list)
    system_prompt: Mapped[str] = mapped_column(Text)
    knowledge_base_ids: Mapped[list] = mapped_column(JSON, default=list)
    disclaimer: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    master_id: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class ResearchReport(Base):
    __tablename__ = "research_reports"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)  # follow-up chain
    symbol: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    query: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(8), default="quick")  # quick | deep | followup
    language: Mapped[str] = mapped_column(String(8))
    age_group: Mapped[str] = mapped_column(String(1), default="B")
    status: Mapped[str] = mapped_column(String(12), default="running")  # running | done | failed
    structured_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    content_markdown: Mapped[str] = mapped_column(Text, default="")
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    sources: Mapped[list["ResearchSource"]] = relationship(
        back_populates="report", cascade="all, delete-orphan", order_by="ResearchSource.ref"
    )


class ResearchSource(Base):
    __tablename__ = "research_sources"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    report_id: Mapped[str] = mapped_column(ForeignKey("research_reports.id", ondelete="CASCADE"), index=True)
    ref: Mapped[str] = mapped_column(String(8))  # S1, S2 ...
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(16), default="web")  # market | fundamentals | filing | news | web

    report: Mapped[ResearchReport] = relationship(back_populates="sources")


class MarketDataCache(Base):
    __tablename__ = "market_data_cache"
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[dict | list | None] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AIUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("profile_id", "day", name="uq_ai_usage_day"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    requests: Mapped[int] = mapped_column(Integer, default=0)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("profile_id", "card_id", name="uq_learning"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("child_profiles.id"), index=True)
    card_id: Mapped[str] = mapped_column(String(64))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
