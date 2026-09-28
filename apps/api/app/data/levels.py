"""Learning path (v0.4): five levels. Each level unlocks a new asset class in the
learning portfolio and adds virtual cash. Requirements are lessons (cards with a
quick check question) and historical "time machine" scenarios.

Design rule (from family feedback): reward learning and reasoning, never trading
frequency or short-term returns.
"""
from __future__ import annotations

from decimal import Decimal

LEARNING_START_CASH = Decimal("10000")

LEVELS: list[dict] = [
    {"level": 1, "id": "saver", "assets": ["cash", "cd"], "bonus": Decimal("0"),
     "cards": [], "scenarios": [],
     "title_en": "Saver", "title_zh": "储蓄者",
     "desc_en": "Start with $10,000 of virtual cash. Learn how savings grow with interest and lock money in a CD (Certificate of Deposit).",
     "desc_zh": "从 1 万美元虚拟现金开始。学习储蓄如何靠利息增长，并尝试把钱存成定期存单（Certificate of Deposit, CD）。"},
    {"level": 2, "id": "lender", "assets": ["cash", "cd", "bond_etf"], "bonus": Decimal("10000"),
     "cards": ["compounding", "cd_savings", "risk_return", "inflation"], "scenarios": [],
     "title_en": "Lender", "title_zh": "债权人",
     "desc_en": "Unlock bond funds (bond ETFs): lend money to governments and companies and earn interest. +$10,000 virtual cash.",
     "desc_zh": "解锁债券基金（债券 ETF）：把钱借给政府和公司，赚取利息。奖励 1 万美元虚拟现金。"},
    {"level": 3, "id": "indexer", "assets": ["cash", "cd", "bond_etf", "equity_etf"], "bonus": Decimal("30000"),
     "cards": ["bonds_basics", "rates_bonds", "diversification", "etf"], "scenarios": ["rate_shock_2022"],
     "title_en": "Index Investor", "title_zh": "指数投资者",
     "desc_en": "Unlock stock index funds (equity ETFs) such as S&P 500 funds: own hundreds of companies at once. +$30,000 virtual cash.",
     "desc_zh": "解锁股票指数基金（股票 ETF），例如标普 500 基金：一次拥有几百家公司。奖励 3 万美元虚拟现金。"},
    {"level": 4, "id": "stock_picker", "assets": ["cash", "cd", "bond_etf", "equity_etf", "stock"], "bonus": Decimal("50000"),
     "cards": ["what_is_stock", "revenue_vs_profit", "pe", "speculation_vs_investing"], "scenarios": ["dotcom_2000"],
     "title_en": "Stock Picker", "title_zh": "选股者",
     "desc_en": "Unlock individual stocks. Research a business before you buy it and write down your reasons. +$50,000 virtual cash.",
     "desc_zh": "解锁个股。买之前先研究这家公司，并写下你的理由。奖励 5 万美元虚拟现金。"},
    {"level": 5, "id": "options", "assets": ["cash", "cd", "bond_etf", "equity_etf", "stock", "options"], "bonus": Decimal("100000"),
     "cards": ["options_basics", "covered_call", "protective_put", "leverage_margin"], "scenarios": ["crisis_2008", "smartphone_2007"],
     "title_en": "Options Apprentice", "title_zh": "期权学徒",
     "desc_en": "Unlock two beginner option strategies on shares you already own: covered calls and protective puts. Margin (borrowing) stays a lesson only. +$100,000 virtual cash.",
     "desc_zh": "解锁两种针对已持有股票的入门期权策略：备兑看涨（Covered Call）和保护性看跌（Protective Put）。融资借钱（保证金交易, Margin）只作为课程学习，不开放。奖励 10 万美元虚拟现金。"},
]
MAX_LEVEL = LEVELS[-1]["level"]

# Learning points (学习积分). Deliberately nothing for number of trades or profits.
XP = {
    "card": 10,             # passed a lesson check
    "scenario": 40,         # finished a time-machine scenario (first time)
    "scenario_reason": 5,   # per decision with a written reason (first completion)
    "journal": 5,           # a trade or note with a written reason (max 3 per day)
    "research": 10,         # a finished research report (max 2 per day)
    "level_up": 50,
    "patience": 20,         # held a position for 30+ days
}
DAILY_CAPS = {"journal": 3, "research": 2}
REASON_MIN_CHARS = 20
FREQUENT_TRADES_7D = 5  # coach notice threshold

BADGES: list[dict] = [
    {"id": "first_cd", "icon": "piggy-bank", "title_en": "First CD", "title_zh": "第一张定期存单",
     "desc_en": "Opened a Certificate of Deposit.", "desc_zh": "开了第一张定期存单（CD）。"},
    {"id": "lender", "icon": "landmark", "title_en": "Lender", "title_zh": "债权人",
     "desc_en": "Owned a bond fund.", "desc_zh": "持有过债券基金。"},
    {"id": "diversified", "icon": "layers", "title_en": "Diversified", "title_zh": "分散投资",
     "desc_en": "Held 3 or more kinds of assets at once.", "desc_zh": "同时持有 3 类或以上资产。"},
    {"id": "patient", "icon": "hourglass", "title_en": "Patient Investor", "title_zh": "耐心投资者",
     "desc_en": "Held a position for 90 days or more.", "desc_zh": "一个持仓拿满 90 天以上。"},
    {"id": "time_traveler", "icon": "history", "title_en": "Time Traveler", "title_zh": "时光旅行者",
     "desc_en": "Finished a historical scenario.", "desc_zh": "完成了一个历史情景。"},
    {"id": "historian", "icon": "scroll", "title_en": "Market Historian", "title_zh": "市场历史学家",
     "desc_en": "Finished every historical scenario.", "desc_zh": "完成了全部历史情景。"},
    {"id": "reflective", "icon": "notebook-pen", "title_en": "Reflective Thinker", "title_zh": "反思者",
     "desc_en": "Wrote 10 journal entries with reasons.", "desc_zh": "写了 10 篇带理由的投资日志。"},
    {"id": "graduate", "icon": "graduation-cap", "title_en": "Graduate", "title_zh": "毕业生",
     "desc_en": "Reached the top level.", "desc_zh": "达到最高等级。"},
]
