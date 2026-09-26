"""Per-IP rate limits for public endpoints. Behind Caddy, uvicorn's --proxy-headers sets the real client IP."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

PUBLIC = "30/minute"
STRICT = "10/minute"  # letters, TTS, anything expensive
