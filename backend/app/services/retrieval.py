"""pgvector search over official passages, filtered to the person's jurisdictions."""

from dataclasses import dataclass
from datetime import datetime

import asyncpg

from app.config import get_settings
from app.services.embeddings import embed_query, to_pgvector

TOPIC_BOOST = 0.03


@dataclass
class Passage:
    chunk_id: int
    source_id: int
    text: str
    heading_path: str
    title: str
    url: str
    jurisdiction: str
    last_fetched_at: datetime | None
    similarity: float


def jurisdictions_for(province: str | None, city: str | None) -> list[str]:
    """Federal always; the province and city only when we know them (MVP: Ontario and Ottawa)."""
    out = ["federal"]
    if (province or "").lower() in ("ontario", "on", "unknown", ""):
        out.append("ontario")
    if (city or "").lower() in ("ottawa", "unknown", ""):
        out.append("ottawa")
    return out


async def search(
    pool: asyncpg.Pool,
    query: str,
    *,
    province: str | None = None,
    city: str | None = None,
    topic: str | None = None,
    topics_only: list[str] | None = None,
    top_k: int | None = None,
    min_similarity: float | None = None,
) -> list[Passage]:
    settings = get_settings()
    top_k = top_k or settings.retrieval_top_k
    threshold = settings.retrieval_min_similarity if min_similarity is None else min_similarity
    vector = to_pgvector(await embed_query(query))
    rows = await pool.fetch(
        """SELECT c.id, c.source_id, c.text, c.heading_path, s.title, s.url, s.jurisdiction, s.last_fetched_at,
                  s.topics, 1 - (c.embedding <=> $1::vector) AS similarity
           FROM source_chunks c
           JOIN sources s ON s.id = c.source_id
           WHERE s.active AND s.jurisdiction = ANY($2::text[])
             AND ($4::text[] IS NULL OR s.topics && $4::text[])
           ORDER BY c.embedding <=> $1::vector
           LIMIT $3""",
        vector,
        jurisdictions_for(province, city),
        top_k * 2,
        topics_only,
    )
    passages = []
    for r in rows:
        score = float(r["similarity"])
        if topic and topic in (r["topics"] or []):
            score += TOPIC_BOOST
        if score < threshold:
            continue
        passages.append(
            Passage(
                r["id"], r["source_id"], r["text"], r["heading_path"], r["title"], r["url"], r["jurisdiction"],
                r["last_fetched_at"], score,
            )
        )
    passages.sort(key=lambda p: p.similarity, reverse=True)
    return passages[:top_k]


def format_passages(passages: list[Passage]) -> str:
    parts = []
    for p in passages:
        section = f" > {p.heading_path}" if p.heading_path else ""
        parts.append(f"[id: {p.chunk_id}] {p.title}{section}\nURL: {p.url}\n{p.text}")
    return "\n\n---\n\n".join(parts)
