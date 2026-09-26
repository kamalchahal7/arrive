"""'Show this to staff' card: the step in an official language (large, for the office worker) and in the
person's language below. Content comes only from the human-written template."""

import uuid
from dataclasses import dataclass
from typing import Any

import asyncpg
from pydantic import BaseModel

from app.services import gemini
from app.services.roadmap import translate_templates
from app.services.topics import language_name

PHRASES_EN = {
    "greeting": "Hello. I am a newcomer to Canada.",
    "purpose": "I would like to:",
    "documents": "I have these documents:",
    "language": "My language is {language}. Please speak slowly. I may need an interpreter.",
    "thanks": "Thank you for your help.",
}
PHRASES_FR = {
    "greeting": "Bonjour. Je suis nouvel arrivant au Canada.",
    "purpose": "J'aimerais :",
    "documents": "J'ai ces documents :",
    "language": "Ma langue est : {language}. Veuillez parler lentement. J'aurai peut-être besoin d'un interprète.",
    "thanks": "Merci de votre aide.",
}

_phrase_cache: dict[str, dict[str, str]] = {"en": PHRASES_EN, "fr": PHRASES_FR}


class _Phrases(BaseModel):
    greeting: str
    purpose: str
    documents: str
    language: str
    thanks: str


async def phrases(pool: asyncpg.Pool, language: str) -> dict[str, str]:
    if language in _phrase_cache:
        return _phrase_cache[language]
    cached = await pool.fetchval("SELECT value FROM app_cache WHERE key = $1", f"staff_phrases:{language}")
    if cached:
        _phrase_cache[language] = cached
        return cached
    res = await gemini.get_gemini().generate_json(
        "staff_phrases",
        f"Translate each value into {language_name(language)}. Keep the {{language}} placeholder exactly as is.\n"
        f"{PHRASES_EN}",
        _Phrases,
        temperature=0,
    )
    value = res.model_dump()
    await pool.execute(
        "INSERT INTO app_cache (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        f"staff_phrases:{language}", value,
    )
    _phrase_cache[language] = value
    return value


@dataclass
class CardSide:
    language: str
    greeting: str
    purpose_label: str
    purpose: str
    documents_label: str
    documents: list[str]
    language_note: str
    thanks: str


async def _side(pool: asyncpg.Pool, template: dict[str, Any], language: str, person_language: str) -> CardSide:
    text = (await translate_templates(pool, [template], language))[template["id"]]
    p = await phrases(pool, language)
    lang_label = language_name(person_language) if language in ("en", "fr") else language_name(language)
    return CardSide(
        language=language,
        greeting=p["greeting"],
        purpose_label=p["purpose"],
        purpose=text["title"],
        documents_label=p["documents"],
        documents=text["documents"],
        language_note=p["language"].replace("{language}", lang_label),
        thanks=p["thanks"],
    )


async def build_card(
    pool: asyncpg.Pool, *, step_id: uuid.UUID | None, template_id: str | None, language: str, official: str
) -> tuple[CardSide, CardSide] | None:
    if step_id:
        template_id = await pool.fetchval("SELECT template_id FROM user_steps WHERE id = $1", step_id)
    if not template_id:
        return None
    row = await pool.fetchrow("SELECT * FROM step_templates WHERE id = $1", template_id)
    if not row:
        return None
    template = dict(row)
    official = official if official in ("en", "fr") else "en"
    return await _side(pool, template, official, language), await _side(pool, template, language, language)
