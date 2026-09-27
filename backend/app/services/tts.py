"""Read-aloud audio from ElevenLabs, cached by hash of text + voice + model.

The model depends on the language (services/speech.py): languages the default model does not speak use
ELEVENLABS_TTS_MODEL_EXTENDED, and languages no model speaks get no audio. The cache is skipped when the database
is down, so read-aloud (for example of onboarding questions) still works.
"""

import hashlib
import logging
import time

import asyncpg
import httpx

from app.config import get_settings
from app.services.speech import speech_for, tts_model_for

logger = logging.getLogger("arrive.tts")

MAX_CHARS = 1500
API = "https://api.elevenlabs.io/v1"


class TTSError(Exception):
    pass


def cache_key(text: str, voice_id: str, model: str) -> str:
    return hashlib.sha256(f"{model}|{voice_id}|{text}".encode()).hexdigest()


async def _cached(pool: asyncpg.Pool | None, key: str) -> bytes | None:
    if pool is None:
        return None
    try:
        value = await pool.fetchval("SELECT audio FROM tts_cache WHERE key = $1", key)
    except Exception as exc:
        logger.warning("tts cache read failed: %s", type(exc).__name__)
        return None
    return bytes(value) if value else None


async def _store(pool: asyncpg.Pool | None, key: str, audio: bytes) -> None:
    if pool is None:
        return
    try:
        await pool.execute("INSERT INTO tts_cache (key, audio) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", key, audio)
    except Exception as exc:
        logger.warning("tts cache write failed: %s", type(exc).__name__)


async def synthesize(pool: asyncpg.Pool | None, text: str, language: str = "en") -> bytes:
    s = get_settings()
    if speech_for(language).tts is None:
        raise TTSError("tts_unsupported_language")
    model = tts_model_for(language)
    if not (s.elevenlabs_api_key and s.elevenlabs_voice_id_default and model):
        raise TTSError("tts_not_configured")
    text = " ".join(text.split())[:MAX_CHARS]
    key = cache_key(text, s.elevenlabs_voice_id_default, model)
    cached = await _cached(pool, key)
    if cached:
        return cached

    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0)) as client:
            res = await client.post(
                f"{API}/text-to-speech/{s.elevenlabs_voice_id_default}",
                params={"output_format": "mp3_44100_64"},  # small files for slow connections
                headers={"xi-api-key": s.elevenlabs_api_key, "Accept": "audio/mpeg"},
                json={"text": text, "model_id": model},
            )
    except httpx.HTTPError as exc:
        logger.warning("tts request failed: %s", type(exc).__name__)
        raise TTSError("tts_failed") from exc
    logger.info("tts status=%s ms=%d chars=%d", res.status_code, (time.perf_counter() - start) * 1000, len(text))
    if res.status_code != 200:
        raise TTSError("tts_failed")
    audio = res.content
    await _store(pool, key, audio)
    return audio
