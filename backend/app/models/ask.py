import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.models.common import Lang, ProfileRef, SourceRef


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    language: Lang = "en"
    profile_id: ProfileRef | None = None


class AskResponse(BaseModel):
    request_id: str | None
    status: Literal["answered", "not_found", "handoff_suggested"]
    language: str
    topic: str
    urgency: Literal["normal", "high", "emergency"]
    emergency: bool
    emergency_message: str | None = None
    possible_scam: bool
    answer: str | None = None
    steps: list[str] = []
    sources: list[SourceRef] = []
    follow_ups: list[str] = []
    message: str | None = None
    handoff_suggested: bool = False
    handoff_reason: Literal["case_specific", "not_found", "urgent"] | None = None
    disclaimer: str | None = None


class FeedbackRequest(BaseModel):
    request_id: uuid.UUID
    clarity: Literal[1, -1]
