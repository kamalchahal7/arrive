"""Encryption at rest for the few personal details Arrive stores (first names, handoff contact details).

Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package. PII_ENCRYPTION_KEY holds one or more
comma-separated keys: the first encrypts, all of them decrypt, so a key can be rotated without losing data.
Generate a key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Without a key nothing personal is stored in plain text: callers get PIIUnavailable and decide what to skip.
"""

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.config import get_settings

logger = logging.getLogger("arrive.pii")

# Fernet tokens are url-safe base64 and always start with this version byte, encoded.
TOKEN_PREFIX = "gAAAAA"


class PIIUnavailable(Exception):
    """PII_ENCRYPTION_KEY is missing or invalid."""


@lru_cache
def _fernet() -> MultiFernet | None:
    raw = get_settings().pii_encryption_key
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    if not keys:
        return None
    try:
        return MultiFernet([Fernet(k.encode()) for k in keys])
    except (ValueError, TypeError):
        logger.error("PII_ENCRYPTION_KEY is not a valid Fernet key")
        return None


def available() -> bool:
    return _fernet() is not None


def encrypt(value: str) -> bytes:
    f = _fernet()
    if f is None:
        raise PIIUnavailable
    return f.encrypt(value.encode("utf-8"))


def decrypt(token: bytes | memoryview | str | None) -> str | None:
    """Decrypt a stored value. Returns None if there is nothing, no key, or the token is not readable."""
    if token is None:
        return None
    f = _fernet()
    if f is None:
        return None
    data = token.encode() if isinstance(token, str) else bytes(token)
    try:
        return f.decrypt(data).decode("utf-8")
    except InvalidToken:
        logger.warning("could not decrypt a stored value (wrong key?)")
        return None


def encrypt_text(value: str) -> str:
    """For text columns (handoffs.contact_value): the token as a string."""
    return encrypt(value).decode("ascii")


def decrypt_text(value: str | None) -> str | None:
    """Text columns may hold rows written before encryption: those are returned as they are."""
    if not value:
        return value
    if not value.startswith(TOKEN_PREFIX):
        return value
    return decrypt(value)
