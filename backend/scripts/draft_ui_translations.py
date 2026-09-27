"""Draft UI translations with Gemini for keys missing from frontend/messages/<locale>.json.

Usage (from backend/):
    python -m scripts.draft_ui_translations prs ps ti          # fill missing keys and keys still in English
    python -m scripts.draft_ui_translations ti --all           # redo every key

Drafts only: every file keeps "_review": "needs native speaker review" until a native speaker checks it
(docs/VERIFY.md). A translated string whose {placeholders} differ from the English is rejected and left in English.
The model is GEMINI_MODEL_FAST; set a different one in the environment to spread quota.
"""

import argparse
import asyncio
import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.services import gemini
from app.services.topics import language_name

MESSAGES = Path(__file__).resolve().parents[2] / "frontend" / "messages"
REVIEW = "needs native speaker review"
BATCH = 120

PROMPT = """Translate the user interface strings of Arrive, a web app that helps refugee families who just arrived in
Canada, into {language}. Many users have low literacy.

Rules:
- Plain, warm, very simple words (grade 3 to 6). Short sentences. Address the user directly and politely.
- Keep every {{placeholder}} exactly as written, for example {{name}}, {{count}}, {{language}}.
- Keep ICU plural syntax exactly: "{{count, plural, one {{...}} other {{...}}}}". Translate only the text inside the
  branches, keep "#" where it is, and keep the same branch names (one, other).
- Keep these as they are: Arrive, ARV, 911, OHIP, SIN, PR, COPR, ServiceOntario, Service Canada, OC Transpo.
- Keep typographic marks that belong to the meaning (quotes around {{text}}, the ellipsis "…").
- The key tells you where the text appears (for example Onboarding.household.more is a button).
- Return exactly {count} texts, in the same order.

Strings (JSON list of [key, English text]):
{items}
"""


class _Batch(BaseModel):
    texts: list[str]


def flatten(obj: dict[str, Any], prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in obj.items():
        if k == "_review":
            continue
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = str(v)
    return out


def unflatten_like(template: dict[str, Any], values: dict[str, str], prefix: str = "") -> dict[str, Any]:
    """Rebuild in the key order of en.json."""
    out: dict[str, Any] = {}
    for k, v in template.items():
        key = f"{prefix}.{k}" if prefix else k
        out[k] = unflatten_like(v, values, key) if isinstance(v, dict) else values[key]
    return out


ARG = re.compile(r"\{\s*([A-Za-z_]\w*)\s*[,}]")


def args(text: str) -> set[str]:
    return set(ARG.findall(text))


async def translate(items: list[tuple[str, str]], language: str) -> dict[str, str]:
    res = await gemini.get_gemini().generate_json(
        "draft_ui_translations",
        PROMPT.format(language=language_name(language), count=len(items), items=json.dumps(items, ensure_ascii=False)),
        _Batch,
        temperature=0.1,
        timeout=180,
    )
    if len(res.texts) != len(items):
        raise ValueError(f"expected {len(items)} texts, got {len(res.texts)}")
    out: dict[str, str] = {}
    for (key, english), text in zip(items, res.texts, strict=True):
        text = text.strip()
        if args(text) != args(english) or text.count("{") != text.count("}"):
            print(f"  kept English for {key} (placeholders changed)")
            continue
        out[key] = text
    return out


async def draft(locale: str, redo: bool) -> None:
    en_raw = json.loads((MESSAGES / "en.json").read_text(encoding="utf-8"))
    en = flatten(en_raw)
    path = MESSAGES / f"{locale}.json"
    current = flatten(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else {}
    # Missing keys, and keys still in English (a batch that failed earlier leaves English behind).
    todo = [(k, v) for k, v in en.items() if redo or k not in current or current[k] == v]
    print(f"{locale}: {len(todo)} string(s) to draft")
    values = {k: current.get(k, v) for k, v in en.items()}
    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        try:
            values.update(await translate(batch, locale))
        except Exception as exc:  # keep what worked; the rest stays English and is listed by check-messages
            print(f"  batch {i // BATCH + 1} failed: {type(exc).__name__}: {exc}")
    data = {"_review": REVIEW, **unflatten_like(en_raw, values)}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{locale}: wrote {path.name}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("locales", nargs="+")
    parser.add_argument("--all", action="store_true", help="retranslate every key, not only missing ones")
    a = parser.parse_args()
    for locale in a.locales:
        if locale == "en":
            continue
        await draft(locale, a.all)


if __name__ == "__main__":
    asyncio.run(main())
