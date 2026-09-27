"""Translate human-written records (checklist items, programs) with Gemini and cache them per language.

Each record's text fields are flattened into a list of strings. Gemini must return exactly as many strings, in the
same order, so a translation can never add or drop a requirement, document or step. Anything that fails the check
falls back to English. Cached rows are keyed by a hash of the English text, so editing a data file re-translates it.
"""

import asyncio
import hashlib
import json
import logging
from typing import Any

import asyncpg
from pydantic import BaseModel

from app.services import gemini
from app.services.topics import language_name

logger = logging.getLogger("arrive.translation")

BATCH_SIZE = 8

PROMPT = """Translate these texts for newcomers to Canada into {language}.

Rules:
- Translate each text faithfully. Do NOT add, remove, merge, split or change any requirement, document, place,
  time or number.
- Return exactly the same number of texts for each record, in the same order.
- Plain words, grade 6 reading level, short sentences.
- For official names (programs, cards, forms, offices such as "Social Insurance Number", "ServiceOntario",
  "Canada Child Benefit", "RC66"), write the {language} explanation followed by the official English name in
  parentheses the first time, so the person can say it at an office.
- Keep anything in {{curly braces}} exactly as it is.

Records (JSON):
{records}
"""


class _Record(BaseModel):
    id: str
    texts: list[str]


class _Batch(BaseModel):
    records: list[_Record]


def flatten(record: dict[str, Any], fields: tuple[str, ...]) -> tuple[list[str], list[tuple[str, int | None]]]:
    """Strings to translate, plus a layout to rebuild the record: (field, None) for a string, (field, i) for list items."""
    texts: list[str] = []
    layout: list[tuple[str, int | None]] = []
    for f in fields:
        value = record.get(f)
        if isinstance(value, list):
            for i, v in enumerate(value):
                texts.append(str(v))
                layout.append((f, i))
        elif value:
            texts.append(str(value))
            layout.append((f, None))
    return texts, layout


def rebuild(record: dict[str, Any], fields: tuple[str, ...], texts: list[str]) -> dict[str, Any]:
    """Put translated texts back in the shape of the original record (lists stay lists, even when empty)."""
    _, layout = flatten(record, fields)
    out: dict[str, Any] = {f: [] if isinstance(record.get(f), list) else "" for f in fields}
    for text, (f, i) in zip(texts, layout, strict=True):
        if i is None:
            out[f] = text
        else:
            out[f].append(text)
    return out


def english(record: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return rebuild(record, fields, flatten(record, fields)[0])


def content_hash(record: dict[str, Any], fields: tuple[str, ...]) -> str:
    return hashlib.sha256(json.dumps(english(record, fields), sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


async def _translate_batch(records: list[dict[str, Any]], fields: tuple[str, ...], language: str) -> dict[str, list[str]]:
    payload = [{"id": r["id"], "texts": flatten(r, fields)[0]} for r in records]
    res = await gemini.get_gemini().generate_json(
        "translate_records",
        PROMPT.format(language=language_name(language), records=json.dumps(payload, ensure_ascii=False)),
        _Batch,
        temperature=0,
        timeout=60,
    )
    expected = {p["id"]: len(p["texts"]) for p in payload}
    out: dict[str, list[str]] = {}
    for rec in res.records:
        if rec.id in expected and len(rec.texts) == expected[rec.id]:
            out[rec.id] = [t.strip() for t in rec.texts]
        else:
            logger.warning("translation rejected for %s (count mismatch)", rec.id)
    return out


async def translate_records(
    pool: asyncpg.Pool, kind: str, records: list[dict[str, Any]], fields: tuple[str, ...], language: str
) -> dict[str, dict[str, Any]]:
    """Return {record id: translated fields}. English (or any failure) returns the original text."""
    out = {r["id"]: english(r, fields) for r in records}
    if language == "en" or not records:
        return out
    hashes = {r["id"]: content_hash(r, fields) for r in records}
    rows = await pool.fetch(
        """SELECT item_id, content, content_hash FROM content_translations
           WHERE kind = $1 AND language = $2 AND item_id = ANY($3::text[])""",
        kind, language, list(hashes),
    )
    missing = set(hashes)
    for row in rows:
        if row["content_hash"] == hashes[row["item_id"]]:
            out[row["item_id"]] = row["content"]
            missing.discard(row["item_id"])
    todo = [r for r in records if r["id"] in missing]
    if not todo:
        return out

    batches = [todo[i : i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
    results = await asyncio.gather(*(_translate_batch(b, fields, language) for b in batches), return_exceptions=True)
    by_id = {r["id"]: r for r in todo}
    for result in results:
        if isinstance(result, BaseException):
            logger.warning("translation batch failed for %s: %s", language, type(result).__name__)
            continue
        for rid, texts in result.items():
            content = rebuild(by_id[rid], fields, texts)
            out[rid] = content
            await pool.execute(
                """INSERT INTO content_translations (kind, item_id, language, content, content_hash)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (kind, item_id, language) DO UPDATE
                   SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash, created_at = now()""",
                kind, rid, language, content, hashes[rid],
            )
    return out
