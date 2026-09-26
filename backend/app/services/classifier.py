"""One structured Gemini call per question: language, topic, case-specific, urgency, scam signal, search query."""

from typing import Literal

from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini
from app.services.privacy import scrub
from app.services.topics import clean_topic, topic_ids


class Classification(BaseModel):
    language: str = Field(description="ISO 639-1 code")
    topic: str
    is_case_specific: bool
    case_specific_reason: str | None = None
    urgency: Literal["normal", "high", "emergency"] = "normal"
    possible_scam: bool = False
    search_query_en: str


async def classify(question: str, ui_language: str = "en") -> Classification:
    prompt = prompts.render(
        "classify", question=question, ui_language=ui_language, topics=", ".join(sorted(topic_ids()))
    )
    result = await gemini.get_gemini().generate_json("classify", prompt, Classification, temperature=0)
    result.topic = clean_topic(result.topic)
    result.language = (result.language or ui_language).lower()[:8]
    # The search query is sent to the embedding model only, but strip personal details anyway.
    result.search_query_en = (scrub(result.search_query_en) or question)[:300]
    return result
