"""Scam check grounded in official fraud guidance (IRCC, CRA, Canadian Anti-Fraud Centre)."""

from dataclasses import dataclass, field
from typing import Literal

import asyncpg
from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini, request_log
from app.services.profiles import get_profile, region_of
from app.services.retrieval import Passage, format_passages, search
from app.services.topics import language_name


class ScamOut(BaseModel):
    verdict: Literal["likely_scam", "likely_real", "unsure"]
    reasons: list[str] = Field(default_factory=list)
    what_to_do: list[str] = Field(default_factory=list)
    government_never: list[str] = Field(default_factory=list)
    citations: list[int] = Field(default_factory=list)


@dataclass
class ScamResult:
    request_id: str | None
    verdict: str
    reasons: list[str]
    what_to_do: list[str]
    government_never: list[str]
    sources: list[Passage] = field(default_factory=list)
    report_url: str | None = None


async def report_url(pool: asyncpg.Pool) -> str | None:
    """The Canadian Anti-Fraud Centre reporting page, taken from our sources list (never hard-coded)."""
    return await pool.fetchval(
        """SELECT url FROM sources WHERE active AND url ILIKE '%antifraudcentre%'
           ORDER BY (url ILIKE '%report%' OR url ILIKE '%signalez%') DESC, id LIMIT 1"""
    )


async def check(
    pool: asyncpg.Pool, description: str, language: str, *, channel: str = "web", profile_id: str | None = None
) -> ScamResult:
    profile = await get_profile(pool, profile_id)
    # The embedding model is multilingual, so the description can be searched as written.
    passages = await search(pool, description, topics_only=["scams"], top_k=6, min_similarity=0.0)
    out = ScamOut(verdict="unsure")
    if passages:
        out = await gemini.get_gemini().generate_json(
            "scam_check",
            prompts.render(
                "scam", language=language_name(language), passages=format_passages(passages), description=description
            ),
            ScamOut,
            temperature=0,
        )
    by_id = {p.chunk_id: p for p in passages}
    cited = [by_id[c] for c in dict.fromkeys(out.citations) if c in by_id]
    if not cited:
        # Without official grounding we never call something real.
        out.verdict = "unsure" if out.verdict == "likely_real" else out.verdict
        out.government_never = []
    ref = await request_log.log_request(
        pool, channel=channel, kind="scam", language=language, topic="scams",
        status_category=(profile or {}).get("status"), region=region_of(profile),
        answered=bool(cited), scam_flag=out.verdict == "likely_scam", source_ids=[p.source_id for p in cited],
    )
    return ScamResult(
        request_id=str(ref.id) if ref else None,
        verdict=out.verdict,
        reasons=out.reasons[:4],
        what_to_do=out.what_to_do[:4],
        government_never=out.government_never[:4],
        sources=cited,
        report_url=await report_url(pool),
    )
