"""The ask pipeline: classify -> route (emergency / case-specific) -> retrieve -> grounded answer -> log."""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Literal

import asyncpg

from app.services import request_log
from app.services.answer import generate_answer
from app.services.classifier import Classification, classify
from app.services.messages import message
from app.services.profiles import get_profile, region_of
from app.services.retrieval import Passage, search

logger = logging.getLogger("arrive.ask")

Status = Literal["answered", "not_found", "handoff_suggested"]


@dataclass
class AskResult:
    request_id: str | None
    status: Status
    language: str
    topic: str
    urgency: str
    emergency: bool
    possible_scam: bool
    answer: str | None = None
    steps: list[str] = field(default_factory=list)
    sources: list[Passage] = field(default_factory=list)
    follow_ups: list[str] = field(default_factory=list)
    message: str | None = None
    emergency_message: str | None = None
    handoff_suggested: bool = False
    handoff_reason: str | None = None


# Keep references to background tasks so they are not garbage-collected mid-flight.
_background: set[asyncio.Task] = set()


def _spawn(coro) -> None:  # type: ignore[no-untyped-def]
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


async def ask(
    pool: asyncpg.Pool,
    question: str,
    *,
    ui_language: str = "en",
    profile_id: str | None = None,
    channel: str = "web",
    style: Literal["text", "voice"] = "text",
    topics_only: list[str] | None = None,
) -> AskResult:
    profile = await get_profile(pool, profile_id)
    cls: Classification = await classify(question, ui_language)
    # Answer in the language the person wrote in; fall back to the UI language.
    language = cls.language if cls.language and cls.language != "unknown" else ui_language
    emergency = cls.urgency == "emergency"

    result = AskResult(
        request_id=None, status="answered", language=language, topic=cls.topic, urgency=cls.urgency,
        emergency=emergency, possible_scam=cls.possible_scam,
    )
    if emergency:
        result.emergency_message = await message("emergency", language)
        result.handoff_suggested = True
        result.handoff_reason = "urgent"

    log_common = dict(
        channel=channel, kind="ask", language=language, topic=cls.topic,
        status_category=(profile or {}).get("status"), region=region_of(profile), scam_flag=cls.possible_scam,
    )

    if cls.is_case_specific:
        result.status = "handoff_suggested"
        result.handoff_suggested = True
        result.handoff_reason = result.handoff_reason or "case_specific"
        result.message = await message("case_specific", language)
        ref = await request_log.log_request(pool, answered=False, **log_common)
        result.request_id = str(ref.id) if ref else None
        return result

    passages = await search(
        pool, cls.search_query_en,
        province=(profile or {}).get("province"), city=(profile or {}).get("city"),
        topic=cls.topic, topics_only=topics_only,
    )
    grounded = await generate_answer(question, passages, language, profile, style)

    if not grounded.found:
        result.status = "not_found"
        result.handoff_suggested = True
        result.handoff_reason = result.handoff_reason or "not_found"
        result.message = await message("not_found", language)
        ref = await request_log.log_request(pool, answered=False, **log_common)
        if ref:
            result.request_id = str(ref.id)
            # The generic gap description is written in the background so the person isn't kept waiting.
            _spawn(request_log.record_gap(pool, ref, question, cls.topic))
        return result

    result.answer = grounded.answer
    result.steps = grounded.steps
    result.sources = grounded.cited
    result.follow_ups = grounded.follow_ups
    ref = await request_log.log_request(
        pool, answered=True, source_ids=sorted({p.source_id for p in grounded.cited}), **log_common
    )
    result.request_id = str(ref.id) if ref else None
    return result
