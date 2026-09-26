"""Prompt templates live next to this file as .md. Placeholders look like {name}."""

from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).parent


@lru_cache
def _load(name: str) -> str:
    return (DIR / f"{name}.md").read_text(encoding="utf-8")


def render(name: str, **values: str) -> str:
    # Plain replacement (not str.format) so braces inside passages or JSON never break a prompt.
    text = _load(name)
    for key, value in values.items():
        text = text.replace("{" + key + "}", value)
    return text
