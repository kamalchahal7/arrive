import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.models.common import Lang

Status = Literal[
    "refugee_pr", "international_student", "asylum_claimant", "economic_pr", "family_class", "temporary_worker",
    "unknown",
]
Need = Annotated[str, Field(max_length=40, pattern=r"^[a-z_]+$")]


class ProfileIn(BaseModel):
    status: Status | None = None
    arrival_date: date | None = None
    city: Literal["ottawa", "other", "unknown"] | None = None
    province: Literal["ontario", "other", "unknown"] | None = None
    has_children: bool | None = None
    has_seniors: bool | None = None
    languages: list[Lang] | None = Field(default=None, max_length=10)
    preferred_language: Lang | None = None
    needs: list[Need] | None = Field(default=None, max_length=12)


class ProfileOut(BaseModel):
    id: uuid.UUID
    status: str
    arrival_date: date | None
    city: str
    province: str
    has_children: bool | None
    has_seniors: bool | None
    languages: list[str]
    preferred_language: str
    needs: list[str]
    created_at: datetime


class StepSource(BaseModel):
    url: str
    title: str | None
    last_checked: date | None


class StepOut(BaseModel):
    id: str
    template_id: str | None
    custom: bool
    title: str
    summary: str
    documents: list[str]
    where: str
    timing_label: str
    due_date: date | None
    status: Literal["todo", "done", "skipped"]
    is_now: bool
    topic: str
    source: StepSource | None
    unlocks: list[dict[str, str]]
    reviewed: bool
    rule_may_have_changed: bool


class RoadmapOut(BaseModel):
    profile_id: str
    language: str
    weeks_since_arrival: int | None
    done: int
    total: int
    steps: list[StepOut]


class StepPatch(BaseModel):
    status: Literal["todo", "done", "skipped"]


class CustomStepIn(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=500)
