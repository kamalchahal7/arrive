"""Grounded answer generation: only from retrieved official passages, with validated citations."""

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini
from app.services.retrieval import Passage, format_passages
from app.services.topics import language_name

VOICE_STYLE = (
    "This answer will be spoken aloud on a phone call. Use at most 60 words, no lists, no URLs. "
    "Put the steps into the answer as short sentences and leave steps empty. Name the official source briefly."
)


class AnswerOut(BaseModel):
    not_found: bool
    answer: str = ""
    steps: list[str] = Field(default_factory=list)
    citations: list[int] = Field(default_factory=list)
    follow_ups: list[str] = Field(default_factory=list)


@dataclass
class GroundedAnswer:
    found: bool
    answer: str = ""
    steps: list[str] = field(default_factory=list)
    cited: list[Passage] = field(default_factory=list)
    follow_ups: list[str] = field(default_factory=list)


def situation_text(profile: dict | None) -> str:
    if not profile:
        return "unknown"
    parts = [
        f"status: {profile.get('status') or 'unknown'}",
        f"province: {profile.get('province') or 'unknown'}",
        f"city: {profile.get('city') or 'unknown'}",
    ]
    if profile.get("has_children") or (profile.get("children_0_5") or 0) + (profile.get("children_6_17") or 0) > 0:
        parts.append("has children")
    if profile.get("has_seniors") or (profile.get("seniors") or 0) > (1 if profile.get("self_age_group") == "senior" else 0):
        parts.append("lives with seniors")
    if profile.get("self_age_group") == "senior":
        parts.append("is 65 or older")
    return ", ".join(parts)


async def generate_answer(
    question: str,
    passages: list[Passage],
    language: str,
    profile: dict | None = None,
    style: Literal["text", "voice"] = "text",
) -> GroundedAnswer:
    if not passages:
        return GroundedAnswer(found=False)
    prompt = prompts.render(
        "answer",
        language=language_name(language),
        style=VOICE_STYLE if style == "voice" else "",
        passages=format_passages(passages),
        situation=situation_text(profile),
        question=question,
    )
    out = await gemini.get_gemini().generate_json("answer", prompt, AnswerOut, temperature=0.1)

    # Keep only citations that point at passages we actually gave the model.
    by_id = {p.chunk_id: p for p in passages}
    cited: list[Passage] = []
    for cid in out.citations:
        if cid in by_id and by_id[cid] not in cited:
            cited.append(by_id[cid])
    if out.not_found or not cited or not out.answer.strip():
        return GroundedAnswer(found=False)
    return GroundedAnswer(
        found=True,
        answer=out.answer.strip(),
        steps=[s.strip() for s in out.steps if s.strip()][: (0 if style == "voice" else 3)],
        cited=cited,
        follow_ups=[f.strip() for f in out.follow_ups if f.strip()][:3],
    )
