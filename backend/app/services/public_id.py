"""Readable profile IDs like ARV-7K3P-9QXM-2D4F.

12 random characters from Crockford's base32 alphabet (no I, L, O or U, so it reads aloud cleanly), about 60 bits.
The ID reopens a profile on another device, so it is treated like a password: random, rate-limited lookups.
"""

import re
import secrets

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
PREFIX = "ARV"
GROUPS = 3
GROUP_LEN = 4
PATTERN = re.compile(rf"^{PREFIX}(-[{re.escape(ALPHABET)}]{{{GROUP_LEN}}}){{{GROUPS}}}$")

# Crockford decoding: letters people confuse with digits map to the digit.
_LOOKALIKES = str.maketrans({"O": "0", "I": "1", "L": "1"})


def generate() -> str:
    chars = "".join(secrets.choice(ALPHABET) for _ in range(GROUPS * GROUP_LEN))
    return PREFIX + "".join(f"-{chars[i:i + GROUP_LEN]}" for i in range(0, len(chars), GROUP_LEN))


def normalize(value: str) -> str | None:
    """Accept what people type ('arv 7k3p 9qxm 2d4f', lookalike letters) and return the canonical ID, or None."""
    raw = re.sub(r"[\s\-_.]", "", value or "").upper()
    if raw.startswith(PREFIX):
        raw = raw[len(PREFIX):]
    raw = raw.translate(_LOOKALIKES)
    if len(raw) != GROUPS * GROUP_LEN or any(c not in ALPHABET for c in raw):
        return None
    candidate = PREFIX + "".join(f"-{raw[i:i + GROUP_LEN]}" for i in range(0, len(raw), GROUP_LEN))
    return candidate if PATTERN.match(candidate) else None


def is_valid(value: str) -> bool:
    return bool(PATTERN.match(value or ""))
