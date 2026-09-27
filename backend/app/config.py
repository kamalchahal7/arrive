"""All backend settings, loaded from environment variables (and backend/.env in development)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, found the same way whether we run from backend/, ingestion/ or the repo root.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Database (Tiger Cloud). TLS follows the DSN's sslmode (libpq rules, see app/db/tls.py).
    database_url: str = ""
    # Optional CA certificate file for sslmode=verify-ca / verify-full.
    db_ssl_root_cert: str = ""

    # Gemini. Model names always come from env, never hard-coded.
    gemini_api_key: str = ""
    gemini_model_fast: str = ""
    gemini_model_vision: str = ""
    gemini_embedding_model: str = ""
    embedding_dim: int = 768

    # Retrieval
    retrieval_top_k: int = 8
    retrieval_min_similarity: float = 0.6

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_tts_model: str = ""
    elevenlabs_voice_id_default: str = ""
    # Optional second TTS model for languages the default model does not speak (for example Pashto needs a model
    # with wider language support). Empty = those languages have no read-aloud.
    elevenlabs_tts_model_extended: str = ""
    # Speech-to-text (Scribe) model for voice onboarding answers.
    elevenlabs_stt_model: str = ""
    # Zero retention mode for speech-to-text (ElevenLabs enterprise accounts only; other accounts must leave it off).
    elevenlabs_zero_retention: bool = False
    voice_tool_secret: str = ""

    # Auth0
    auth0_domain: str = ""
    auth0_audience: str = ""
    auth0_roles_claim: str = "https://arrive.app/roles"

    # HTTP
    cors_origins: str = "http://localhost:3000"
    public_base_url: str = ""

    # Privacy
    # Fernet key(s) for first names and handoff contact details, comma-separated; the first one encrypts.
    pii_encryption_key: str = ""
    # Salt for the hashed profile reference in session events (any long random string).
    analytics_salt: str = ""
    insights_min_group_size: int = 5
    request_log_retention_days: int = 365

    # Scheduler (daily re-ingest). Disable in tests or when running several replicas.
    scheduler_enabled: bool = True
    ingest_hour_utc: int = 7

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
