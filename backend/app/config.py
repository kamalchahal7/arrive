"""All backend settings, loaded from environment variables (and backend/.env in development)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database (Tiger Cloud)
    database_url: str = ""

    # Gemini. Model names always come from env, never hard-coded.
    gemini_api_key: str = ""
    gemini_model_fast: str = ""
    gemini_model_vision: str = ""
    gemini_embedding_model: str = ""
    embedding_dim: int = 768

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_tts_model: str = ""
    elevenlabs_voice_id_default: str = ""
    voice_tool_secret: str = ""

    # Auth0
    auth0_domain: str = ""
    auth0_audience: str = ""
    auth0_roles_claim: str = "https://arrive.app/roles"

    # HTTP
    cors_origins: str = "http://localhost:3000"
    public_base_url: str = ""

    # Privacy
    insights_min_group_size: int = 5
    request_log_retention_days: int = 365

    # Twilio (optional, reminders only)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
