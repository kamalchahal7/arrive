"""Speech support per language, and ElevenLabs speech-to-text (Scribe) for voice onboarding answers.

Keep SPEECH in step with frontend/src/config/languages.ts. Support comes from the ElevenLabs docs checked on
2026-09-26 (elevenlabs.io/docs/overview/capabilities/speech-to-text and elevenlabs.io/docs/models):
- Speech-to-text lists Arabic (ara), French (fra), English (eng), Pashto (pus) and Persian (fas). It does NOT list
  Dari or Tigrinya. Dari is not sent to the Persian model until a Dari speaker has tested it [VERIFY].
- eleven_multilingual_v2 speaks Arabic, French and English, not Pashto, Persian, Dari or Tigrinya. eleven_v3 adds
  Pashto and Persian. So Pashto read-aloud needs ELEVENLABS_TTS_MODEL_EXTENDED.

Audio is processed in memory only: it is never written to disk, the database or the logs, and neither is the text.
"""

import logging
import time
from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import get_settings

logger = logging.getLogger("arrive.speech")

API = "https://api.elevenlabs.io/v1"
MAX_AUDIO_BYTES = 5 * 1024 * 1024  # about 5 minutes of Opus; an answer is a few seconds
MIN_AUDIO_BYTES = 400

TTSModel = Literal["default", "extended"]


@dataclass(frozen=True)
class Speech:
    stt_code: str | None  # ISO 639-3 code sent to Scribe, None = no speech-to-text
    tts: TTSModel | None  # which configured TTS model speaks it, None = no read-aloud


SPEECH: dict[str, Speech] = {
    "en": Speech("eng", "default"),
    "fr": Speech("fra", "default"),
    "ar": Speech("ara", "default"),
    "ps": Speech("pus", "extended"),
    "prs": Speech(None, None),  # Dari: not in either list; Persian (fas) is [VERIFY with a Dari speaker]
    "ti": Speech(None, None),  # Tigrinya: not in either list
}

class SpeechError(Exception):
    pass


def speech_for(language: str) -> Speech:
    # Languages outside the redesign list (the older app's fa, es, uk...) keep the default read-aloud model and
    # have no speech-to-text.
    return SPEECH.get(language, Speech(None, "default"))


def tts_model_for(language: str) -> str | None:
    s = get_settings()
    tier = speech_for(language).tts
    if tier == "default":
        return s.elevenlabs_tts_model or None
    if tier == "extended":
        return s.elevenlabs_tts_model_extended or None
    return None


def sniff_audio(data: bytes) -> str | None:
    """The audio type from the file's first bytes (the browser's label is not trusted). None = not audio we accept."""
    head = data[:16]
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head[4:8] == b"ftyp":
        return "audio/mp4"
    if head.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if head[:2] in (b"\xff\xf1", b"\xff\xf9"):
        return "audio/aac"
    return None


async def transcribe(audio: bytes, content_type: str, language: str) -> str:
    """Speech to text with ElevenLabs Scribe. Returns the text (possibly empty)."""
    s = get_settings()
    code = speech_for(language).stt_code
    if code is None:
        raise SpeechError("stt_unsupported_language")
    if not (s.elevenlabs_api_key and s.elevenlabs_stt_model):
        raise SpeechError("stt_not_configured")
    extension = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav",
                 "audio/mpeg": "mp3", "audio/aac": "aac"}.get(content_type, "webm")
    params = {"enable_logging": "false"} if s.elevenlabs_zero_retention else None
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            res = await client.post(
                f"{API}/speech-to-text",
                params=params,
                headers={"xi-api-key": s.elevenlabs_api_key},
                data={"model_id": s.elevenlabs_stt_model, "language_code": code, "tag_audio_events": "false"},
                files={"file": (f"answer.{extension}", audio, content_type)},
            )
    except httpx.HTTPError as exc:
        logger.warning("stt request failed: %s", type(exc).__name__)
        raise SpeechError("stt_failed") from exc
    # Status, timing and size only. Never the audio or the text.
    logger.info("stt status=%s ms=%d bytes=%d", res.status_code, (time.perf_counter() - start) * 1000, len(audio))
    if res.status_code != 200:
        raise SpeechError("stt_failed")
    try:
        return " ".join(str(res.json().get("text") or "").split())
    except ValueError as exc:
        raise SpeechError("stt_failed") from exc
