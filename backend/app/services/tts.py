"""Read-aloud audio from ElevenLabs (multilingual model), cached by hash of text + voice + model."""

import hashlib
import logging
import time

import asyncpg
import httpx

from app.config import get_settings

logger = logging.getLogger("arrive.tts")

MAX_CHARS = 1500
API = "https://api.elevenlabs.io/v1"


class TTSError(Exception):
    pass


def cache_key(text: str, voice_id: str, model: str) -> str:
    return hashlib.sha256(f"{model}|{voice_id}|{text}".encode()).hexdigest()


async def synthesize(pool: asyncpg.Pool, text: str) -> bytes:
    s = get_settings()
    if not (s.elevenlabs_api_key and s.elevenlabs_voice_id_default and s.elevenlabs_tts_model):
        raise TTSError("tts_not_configured")
    text = " ".join(text.split())[:MAX_CHARS]
    key = cache_key(text, s.elevenlabs_voice_id_default, s.elevenlabs_tts_model)
    cached = await pool.fetchval("SELECT audio FROM tts_cache WHERE key = $1", key)
    if cached:
        return bytes(cached)

    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0)) as client:
        res = await client.post(
            f"{API}/text-to-speech/{s.elevenlabs_voice_id_default}",
            params={"output_format": "mp3_44100_64"},  # small files for slow connections
            headers={"xi-api-key": s.elevenlabs_api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": s.elevenlabs_tts_model},
        )
    logger.info("tts status=%s ms=%d chars=%d", res.status_code, (time.perf_counter() - start) * 1000, len(text))
    if res.status_code != 200:
        raise TTSError("tts_failed")
    audio = res.content
    await pool.execute(
        "INSERT INTO tts_cache (key, audio) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", key, audio
    )
    return audio
