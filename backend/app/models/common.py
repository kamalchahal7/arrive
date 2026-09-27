from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.services.retrieval import Passage

Channel = Literal["web", "voice_web"]
Lang = Annotated[str, Field(min_length=2, max_length=8, pattern=r"^[a-zA-Z-]+$")]
# A readable profile ID (ARV-XXXX-XXXX-XXXX, services/public_id.py) or, for older profiles, the internal uuid.
ProfileRef = Annotated[str, Field(min_length=12, max_length=40, pattern=r"^[A-Za-z0-9 _.-]+$")]


class SourceRef(BaseModel):
    id: int = Field(description="chunk id")
    source_id: int
    title: str
    url: str
    section: str | None = None
    last_checked: date | None = None

    @classmethod
    def from_passage(cls, p: Passage) -> "SourceRef":
        return cls(
            id=p.chunk_id,
            source_id=p.source_id,
            title=p.title,
            url=p.url,
            section=p.heading_path or None,
            last_checked=p.last_fetched_at.date() if p.last_fetched_at else None,
        )


def dedupe_sources(passages: list[Passage]) -> list[SourceRef]:
    """One entry per official page, in citation order."""
    seen: set[int] = set()
    out: list[SourceRef] = []
    for p in passages:
        if p.source_id not in seen:
            seen.add(p.source_id)
            out.append(SourceRef.from_passage(p))
    return out
