"""ElevenLabs agent support: web session credentials and short, speakable tool responses."""

import logging
import re

import httpx

from app.config import get_settings

logger = logging.getLogger("arrive.voice")

API = "https://api.elevenlabs.io/v1/convai/conversation"
MAX_SPOKEN_WORDS = 70


class VoiceError(Exception):
    pass


async def session_credentials() -> dict[str, str]:
    """A WebRTC conversation token (preferred) or a WebSocket signed URL for the private agent."""
    s = get_settings()
    if not (s.elevenlabs_api_key and s.elevenlabs_agent_id):
        raise VoiceError("voice_not_configured")
    headers = {"xi-api-key": s.elevenlabs_api_key}
    params = {"agent_id": s.elevenlabs_agent_id}
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        res = await client.get(f"{API}/token", headers=headers, params=params)
        if res.status_code == 200 and res.json().get("token"):
            return {"agent_id": s.elevenlabs_agent_id, "conversation_token": res.json()["token"]}
        logger.warning("conversation token failed status=%s, trying signed url", res.status_code)
        res = await client.get(f"{API}/get-signed-url", headers=headers, params=params)
        if res.status_code == 200 and res.json().get("signed_url"):
            return {"agent_id": s.elevenlabs_agent_id, "signed_url": res.json()["signed_url"]}
    raise VoiceError("voice_session_failed")


def speakable(*parts: str | None) -> str:
    """Join parts into plain speech: no markdown, no URLs, capped length."""
    text = " ".join(p.strip() for p in parts if p and p.strip())
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[*_#`>\[\]]", "", text)
    words = text.split()
    if len(words) > MAX_SPOKEN_WORDS:
        text = " ".join(words[:MAX_SPOKEN_WORDS]).rstrip(",;:") + "..."
    return " ".join(text.split())
