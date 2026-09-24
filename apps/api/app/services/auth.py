"""Parent PIN + short-lived signed parent tokens.

Olares already authenticates the device owner before any request reaches the
app (authLevel: private). The PIN separates *parent mode* from *child mode*.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException

from app.config import get_settings

TOKEN_TTL = 30 * 60  # 30 minutes


def hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 200_000)
    return f"pbkdf2${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_pin(pin: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, s, h = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), base64.b64decode(s), 200_000)
        return hmac.compare_digest(dk, base64.b64decode(h))
    except Exception:
        return False


def _sign(payload: bytes) -> str:
    return base64.urlsafe_b64encode(hmac.new(_secret(), payload, hashlib.sha256).digest()).decode().rstrip("=")


def _secret() -> bytes:
    s = get_settings().app_secret
    return s.encode()


def issue_parent_token(user_id: str) -> tuple[str, int]:
    exp = int(time.time()) + TOKEN_TTL
    payload = base64.urlsafe_b64encode(json.dumps({"uid": user_id, "exp": exp}).encode()).decode().rstrip("=")
    return f"{payload}.{_sign(payload.encode())}", exp


def check_parent_token(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload.encode()), sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception:
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data.get("uid")


def require_parent(x_parent_token: str | None = Header(default=None)) -> str:
    uid = check_parent_token(x_parent_token)
    if not uid:
        raise HTTPException(status_code=401, detail={"code": "PARENT_AUTH_REQUIRED"})
    return uid
