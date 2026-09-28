"""Asset classification for the learning-path unlocks."""
from __future__ import annotations

from app.providers.types import ProviderError
from app.services import market_data

# Well-known US bond ETFs. Anything else whose fund name mentions bonds/treasuries also counts.
BOND_ETFS = {
    "BND", "AGG", "TLT", "IEF", "SHY", "BIL", "SGOV", "GOVT", "VGSH", "VGIT", "VGLT", "LQD", "HYG", "TIP", "SCHZ", "MUB",
    "BSV", "BIV", "BLV", "VCIT", "VCSH", "JNK", "EMB", "IGSB", "SPTL", "SPTS", "SPTI", "SCHO", "SCHR", "TLH", "IEI", "BNDX",
    "VTIP", "STIP", "USFR", "TFLO", "SCHP", "VTEB", "FLOT", "MINT", "JPST", "SPAB", "IUSB", "FBND",
}
_BOND_WORDS = ("bond", "treasury", "treasuries", "fixed income", "t-bill", "aggregate", "municipal", "tips")

ASSET_CLASSES = ("cash", "cd", "bond_etf", "equity_etf", "stock", "options")


def classify(symbol: str) -> str | None:
    """Return 'stock' | 'equity_etf' | 'bond_etf', or None if unsupported. Best effort:
    if the profile is unavailable we fall back to the ticker list, then 'stock'."""
    sym = market_data.norm(symbol)
    if sym in BOND_ETFS:
        return "bond_etf"
    try:
        prof = market_data.get_company_profile(sym)
    except ProviderError:
        return "stock"
    qt = (prof.quote_type or "").upper()
    if qt == "ETF":
        name = (prof.name or "").lower()
        return "bond_etf" if any(w in name for w in _BOND_WORDS) else "equity_etf"
    if qt in ("", "EQUITY"):
        return "stock"
    return None
