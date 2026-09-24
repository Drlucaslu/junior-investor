"""Helpers shared by agents: ticker detection, safety cues, usage limits."""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AIUsage, ChildProfile

# Popular company names -> tickers (helps kids who type names, incl. Chinese).
NAME_ALIASES = {
    "苹果": "AAPL", "apple": "AAPL", "特斯拉": "TSLA", "tesla": "TSLA", "英伟达": "NVDA", "辉达": "NVDA", "nvidia": "NVDA",
    "微软": "MSFT", "microsoft": "MSFT", "谷歌": "GOOGL", "google": "GOOGL", "alphabet": "GOOGL", "亚马逊": "AMZN",
    "amazon": "AMZN", "可口可乐": "KO", "coca-cola": "KO", "coca cola": "KO", "好市多": "COST", "开市客": "COST", "costco": "COST",
    "脸书": "META", "meta": "META", "奈飞": "NFLX", "网飞": "NFLX", "netflix": "NFLX", "迪士尼": "DIS", "disney": "DIS",
    "耐克": "NKE", "nike": "NKE", "麦当劳": "MCD", "mcdonald": "MCD", "星巴克": "SBUX", "starbucks": "SBUX",
    "伯克希尔": "BRK-B", "berkshire": "BRK-B", "台积电": "TSM", "tsmc": "TSM", "amd": "AMD", "英特尔": "INTC", "intel": "INTC",
    "沃尔玛": "WMT", "walmart": "WMT", "百事": "PEP", "pepsi": "PEP", "强生": "JNJ", "摩根大通": "JPM", "visa": "V",
    "标普500": "SPY", "s&p 500": "SPY", "纳斯达克100": "QQQ", "nasdaq 100": "QQQ", "博通": "AVGO", "broadcom": "AVGO",
    "甲骨文": "ORCL", "oracle": "ORCL", "奥多比": "ADBE", "adobe": "ADBE", "赛富时": "CRM", "salesforce": "CRM", "palantir": "PLTR",
    "uber": "UBER", "爱彼迎": "ABNB", "airbnb": "ABNB", "阿里巴巴": "BABA", "alibaba": "BABA", "拼多多": "PDD",
}

STOPWORDS = {
    "I", "A", "AN", "THE", "AND", "OR", "OF", "TO", "IN", "IS", "IT", "PE", "EPS", "FCF", "ROIC", "ROE", "ROA", "ETF", "ETFS", "CEO",
    "CFO", "AI", "US", "USA", "USD", "OK", "GDP", "IPO", "DCF", "CAGR", "P", "E", "S", "B", "PB", "PS", "EV", "EBIT", "EBITDA",
    "YOY", "QOQ", "TTM", "FY", "Q", "WHAT", "WHY", "HOW", "WHO", "DO", "DOES", "MY", "ME", "YOU", "IF", "VS", "SEC", "NYSE",
    "NASDAQ", "PEG", "PC", "TV", "APP", "CPI", "FED", "IRA", "BUY", "SELL", "HOLD", "UP", "DOWN", "ON", "AT", "BE", "AM", "AS",
}

DATA_WORDS = re.compile(
    r"(price|trading at|worth|cost|revenue|sales|profit|earnings|income|eps|valuation|p/?e|market cap|margin|cash flow|fcf|debt|"
    r"growth|recent|latest|today|now|news|quarter|guidance|dividend|股价|价格|多少钱|现价|营收|收入|利润|盈利|每股收益|估值|市盈率|"
    r"市值|毛利|现金流|负债|增长|最近|最新|今天|现在|新闻|季度|财报|分红|股息|涨|跌)",
    re.I,
)

RISKY = re.compile(
    r"(double|翻倍|get rich|暴富|快速赚|一个月.*(赚|变成)|all[- ]?in|梭哈|leverage|杠杆|margin loan|借钱|贷款|borrow|options?|期权|"
    r"futures|期货|crypto|加密|比特币|bitcoin|guarantee|保证.*(涨|赚)|一定会涨|稳赚|100%|short sell|做空|real account|真实账户|开户|"
    r"加仓回本|average down|win it back)",
    re.I,
)


def detect_tickers(text: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    low = text.lower()
    for name, sym in NAME_ALIASES.items():
        if name in low and sym not in found:
            found.append(sym)
    for m in re.finditer(r"\$?\b([A-Z]{1,5}(?:-[A-Z])?)\b", text):
        tok = m.group(1)
        if (m.group(0).startswith("$") or tok not in STOPWORDS) and tok not in found and (len(tok) >= 2 or m.group(0).startswith("$")):
            found.append(tok)
    return found[:limit]


def needs_current_data(text: str) -> bool:
    return bool(DATA_WORDS.search(text))


def safety_cue(text: str, language: str) -> str | None:
    if not RISKY.search(text):
        return None
    if language.startswith("zh"):
        return ("本轮安全提示：学生的问题涉及快速致富、杠杆、借钱、保证收益、衍生品或真实账户等高风险话题。"
                "请温和地解释高收益通常伴随高风险，讲解波动、回撤和保护本金的重要性，不提供任何操作方法，并引导回到学习。")
    return ("SAFETY CUE FOR THIS TURN: The student asked about getting rich quick, leverage, borrowing, guaranteed returns, "
            "derivatives or real accounts. Gently explain that high returns come with high risk, discuss volatility, drawdowns and "
            "protecting capital, give no how-to steps, and steer back to learning.")


class UsageLimitExceeded(Exception):
    pass


def check_and_count_usage(db: Session, profile: ChildProfile) -> None:
    today = date.today()
    row = db.scalar(select(AIUsage).where(AIUsage.profile_id == profile.id, AIUsage.day == today))
    if row is None:
        row = AIUsage(profile_id=profile.id, day=today, requests=0)
        db.add(row)
    if profile.daily_ai_limit is not None and row.requests >= profile.daily_ai_limit:
        raise UsageLimitExceeded()
    row.requests += 1
    db.commit()


def dedupe_sources(sources: list[dict]) -> list[dict]:
    seen, out = set(), []
    for s in sources:
        key = s.get("url") or s.get("title")
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out
