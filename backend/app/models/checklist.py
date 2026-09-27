from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

EntryId = Annotated[str, Field(min_length=2, max_length=60, pattern=r"^[a-z0-9_]+$")]
PersonKey = Annotated[str, Field(min_length=4, max_length=20, pattern=r"^[a-z0-9-]+$")]


class ChecklistRowOut(BaseModel):
    item_id: str
    person_key: str
    person_label: str
    title: str
    summary: str
    essential: bool
    in_person: bool
    status: Literal["todo", "done"]
    completed_at: datetime | None = None


class PhaseOut(BaseModel):
    id: str
    label: str
    done: int
    total: int
    items: list[ChecklistRowOut]


class ChecklistOut(BaseModel):
    profile_id: str
    language: str
    done: int
    total: int
    current_phase: str | None
    notes: list[str]
    phases: list[PhaseOut]


class ProgressItem(BaseModel):
    item_id: EntryId
    person_key: PersonKey
    status: Literal["todo", "done"]


class ProgressIn(BaseModel):
    items: list[ProgressItem] = Field(min_length=1, max_length=60)


class ProgressOut(BaseModel):
    updated: int
    done: int
    total: int


class ProgramOut(BaseModel):
    id: str
    group: str
    level: str
    title: str
    summary: str
    has_location: bool


class ProgramsOut(BaseModel):
    profile_id: str
    language: str
    notes: list[str]
    programs: list[ProgramOut]


class LocationOut(BaseModel):
    name: str
    institution: str | None = None
    address: str | None = None
    phone: str | None = None
    hours: str | None = None
    lat: float | None = None
    lon: float | None = None
    map_query: str | None = None
    photo: str | None = None
    verified: bool = False


class SourceOut(BaseModel):
    url: str
    title: str | None = None
    last_checked: date | None = None


class PersonRowOut(BaseModel):
    person_key: str
    person_label: str
    status: Literal["todo", "done"]


class ItemDetailOut(BaseModel):
    id: str
    kind: Literal["checklist", "program"]
    language: str
    title: str
    summary: str
    level: str
    phase: str | None = None
    phase_label: str | None = None
    group: str | None = None
    essential: bool = False
    in_person: bool = False
    documents: list[str] = []
    steps: list[str] = []
    eligibility: list[str] = []
    how_to_apply: list[str] = []
    notes: list[str] = []
    location: LocationOut | None = None
    source: SourceOut | None = None
    staff_card: bool = False
    rows: list[PersonRowOut] = []
    reviewed: bool = False
    disclaimer: str
