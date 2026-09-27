import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.common import Lang

Status = Literal[
    "refugee_pr", "international_student", "asylum_claimant", "economic_pr", "family_class", "temporary_worker",
    "unknown",
]
Need = Annotated[str, Field(max_length=40, pattern=r"^[a-z_]+$")]
Count = Annotated[int, Field(ge=0, le=20)]
Gender = Literal["woman", "man", "another", "prefer_not_to_say"]


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
    # Household profile (docs/REDESIGN.md section 4). The person themself is one of the adults or seniors.
    # first_name is stored encrypted (services/pii.py) and never appears in analytics.
    first_name: str | None = Field(default=None, max_length=40)
    city_name: str | None = Field(default=None, max_length=80)
    country_of_origin: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$")
    gender: Gender | None = None
    self_age_group: Literal["adult", "senior"] | None = None
    adults: Count | None = None
    seniors: Count | None = None
    children_0_5: Count | None = None
    children_6_17: Count | None = None
    disability_adult: bool | None = None
    disability_senior: bool | None = None
    disability_child: bool | None = None
    other_languages: list[Lang] | None = Field(default=None, max_length=10)
    analytics_consent: bool | None = None

    @field_validator("country_of_origin")
    @classmethod
    def upper_country(cls, v: str | None) -> str | None:
        return v.upper() if v else v

    @field_validator("first_name", "city_name")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        # Blank means "not given". Control characters are dropped.
        if v is None:
            return None
        v = " ".join("".join(c for c in v if c.isprintable()).split())
        return v or None


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
    public_id: str | None = None
    first_name: str | None = None
    city_name: str | None = None
    country_of_origin: str | None = None
    gender: str | None = None
    self_age_group: str = "adult"
    adults: int = 1
    seniors: int = 0
    children_0_5: int = 0
    children_6_17: int = 0
    disability_adult: bool | None = None
    disability_senior: bool | None = None
    disability_child: bool | None = None
    other_languages: list[str] = []
    analytics_consent: bool = False


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
