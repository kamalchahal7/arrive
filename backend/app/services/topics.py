"""Fixed topic taxonomy (app/data/topics.json) so aggregates stay clean."""

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "topics.json"


@lru_cache
def topics() -> list[dict[str, str]]:
    return json.loads(DATA.read_text(encoding="utf-8"))["topics"]


@lru_cache
def topic_ids() -> frozenset[str]:
    return frozenset(t["id"] for t in topics())


def clean_topic(value: str | None) -> str:
    return value if value in topic_ids() else "other"


def topic_label(topic_id: str, language: str = "en") -> str:
    for t in topics():
        if t["id"] == topic_id:
            return t.get(language) or t["en"]
    return topic_id


# Language codes to English names, for prompts. Unknown codes are passed through as-is.
LANGUAGE_NAMES = {
    "en": "English", "fr": "French", "ar": "Arabic", "fa": "Farsi (Persian)", "es": "Spanish",
    "uk": "Ukrainian", "ti": "Tigrinya", "zh": "Chinese (Simplified)", "pa": "Punjabi", "ur": "Urdu",
    "so": "Somali", "ps": "Pashto", "prs": "Dari (Afghan Persian)", "tr": "Turkish", "ru": "Russian", "pt": "Portuguese", "hi": "Hindi",
    "tl": "Tagalog", "am": "Amharic", "sw": "Swahili", "ku": "Kurdish",
}


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, code)
