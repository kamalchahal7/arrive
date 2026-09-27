"""Household checklist, programs and item details (docs/REDESIGN.md sections 5 and 7)."""

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Path, Query, Request

from app.deps import require_db
from app.errors import AppError
from app.models.checklist import (
    ChecklistOut, ChecklistRowOut, ItemDetailOut, LocationOut, PersonRowOut, PhaseOut, ProgramOut, ProgramsOut,
    ProgressIn, ProgressOut, SourceOut,
)
from app.models.common import Lang
from app.ratelimit import PUBLIC, limiter
from app.services import checklist as engine
from app.services import profiles
from app.services.messages import messages
from app.services.translation import translate_records

router = APIRouter(tags=["checklist"])

ProfileRef = Path(min_length=12, max_length=40)
CHECKLIST_FIELDS = ("title", "summary", "documents", "steps", "notes")
PROGRAM_FIELDS = ("title", "summary", "eligibility", "how_to_apply")
PERSON_KEYS = (
    "person_you", "person_adult", "person_senior", "person_child", "person_household",
    "group_adult", "group_senior", "group_child",
)


async def _profile(pool: asyncpg.Pool, profile_id: str) -> dict[str, Any]:
    row = await profiles.get_profile(pool, profile_id)
    if not row:
        raise AppError("profile_not_found", 404)
    return row


def _data_guard() -> None:
    try:
        engine.checklist_items(), engine.programs(), engine.locations()
    except engine.ChecklistDataError as exc:
        raise AppError("checklist_unavailable", 503) from exc


def _checklist_record(item: dict[str, Any]) -> dict[str, Any]:
    # Conditional notes are translated with the item, in the same order as in the data file.
    return {**item, "notes": [n["note"] for n in item.get("conditional_notes") or []]}


def label_for(person: engine.Person, words: dict[str, str]) -> str:
    if person.kind == "self":
        return words["person_you"]  # the first name replaces this once onboarding stores it (R2)
    if person.kind == "household":
        return words["person_household"]
    if person.kind == "group":
        return words[f"group_{person.group}"]
    return words[f"person_{person.kind}"].replace("{n}", str(person.number))


async def _progress(pool: asyncpg.Pool, profile_uuid: Any) -> dict[tuple[str, str], dict[str, Any]]:
    rows = await pool.fetch(
        "SELECT item_id, person_key, status, completed_at FROM checklist_progress WHERE profile_id = $1", profile_uuid
    )
    return {(r["item_id"], r["person_key"]): dict(r) for r in rows}


@router.get("/checklist/{profile_id}", response_model=ChecklistOut)
@limiter.limit(PUBLIC)
async def get_checklist(
    request: Request, profile_id: str = ProfileRef, lang: Lang = Query("en"), pool: asyncpg.Pool = Depends(require_db)
) -> ChecklistOut:
    _data_guard()
    profile = await _profile(pool, profile_id)
    household = engine.Household.from_profile(profile)
    result = engine.build_checklist(household, await _progress(pool, profile["id"]))

    items = {i["id"]: i for i in engine.checklist_items()}
    used = [_checklist_record(items[i]) for i in dict.fromkeys(r.item_id for r in result.rows)]
    texts = await translate_records(pool, "checklist", used, CHECKLIST_FIELDS, lang)
    phase_keys = [f"phase_{p}" for p, _ in result.by_phase()]
    words = await messages([*PERSON_KEYS, *phase_keys, *result.notes], lang)
    await profiles.touch(pool, profile)

    phases = [
        PhaseOut(
            id=phase,
            label=words[f"phase_{phase}"],
            done=sum(1 for r in rows if r.status == "done"),
            total=len(rows),
            items=[
                ChecklistRowOut(
                    item_id=r.item_id, person_key=r.person.key, person_label=label_for(r.person, words),
                    title=texts[r.item_id]["title"], summary=texts[r.item_id]["summary"], essential=r.essential,
                    in_person=r.in_person, status=r.status, completed_at=r.completed_at,  # type: ignore[arg-type]
                )
                for r in rows
            ],
        )
        for phase, rows in result.by_phase()
    ]
    return ChecklistOut(
        profile_id=profile.get("public_id") or str(profile["id"]), language=lang, done=result.done,
        total=result.total, current_phase=result.current_phase, notes=[words[n] for n in result.notes], phases=phases,
    )


@router.patch("/checklist/{profile_id}/items", response_model=ProgressOut)
@limiter.limit(PUBLIC)
async def update_progress(
    request: Request, body: ProgressIn, profile_id: str = ProfileRef, pool: asyncpg.Pool = Depends(require_db)
) -> ProgressOut:
    _data_guard()
    profile = await _profile(pool, profile_id)
    household = engine.Household.from_profile(profile)
    valid = engine.build_checklist(household).keys()
    if any((i.item_id, i.person_key) not in valid for i in body.items):
        raise AppError("unknown_checklist_item", 422)
    async with pool.acquire() as conn, conn.transaction():
        for i in body.items:
            await conn.execute(
                """INSERT INTO checklist_progress (profile_id, item_id, person_key, status, completed_at, updated_at)
                   VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'done' THEN now() END, now())
                   ON CONFLICT (profile_id, item_id, person_key) DO UPDATE SET
                       status = EXCLUDED.status,
                       completed_at = CASE WHEN EXCLUDED.status = 'done'
                                           THEN COALESCE(checklist_progress.completed_at, now()) END,
                       updated_at = now()""",
                profile["id"], i.item_id, i.person_key, i.status,
            )
    result = engine.build_checklist(household, await _progress(pool, profile["id"]))
    return ProgressOut(updated=len(body.items), done=result.done, total=result.total)


@router.get("/programs/{profile_id}", response_model=ProgramsOut)
@limiter.limit(PUBLIC)
async def get_programs(
    request: Request, profile_id: str = ProfileRef, lang: Lang = Query("en"), pool: asyncpg.Pool = Depends(require_db)
) -> ProgramsOut:
    _data_guard()
    profile = await _profile(pool, profile_id)
    household = engine.Household.from_profile(profile)
    found = engine.matching_programs(household)
    texts = await translate_records(pool, "program", found, PROGRAM_FIELDS, lang)
    notes = engine.household_notes(household)
    words = await messages(notes, lang) if notes else {}
    return ProgramsOut(
        profile_id=profile.get("public_id") or str(profile["id"]),
        language=lang,
        notes=[words[n] for n in notes],
        programs=[
            ProgramOut(
                id=p["id"], group=p.get("group", "everyone"), level=p.get("level", "federal"),
                title=texts[p["id"]]["title"], summary=texts[p["id"]]["summary"],
                has_location=engine.visible_location(p, household) is not None,
            )
            for p in found
        ],
    )


@router.get("/items/{item_id}", response_model=ItemDetailOut)
@limiter.limit(PUBLIC)
async def get_item(
    request: Request,
    item_id: str = Path(min_length=2, max_length=60, pattern=r"^[a-z0-9_]+$"),
    lang: Lang = Query("en"),
    profile_id: str | None = Query(None, min_length=12, max_length=40),
    pool: asyncpg.Pool = Depends(require_db),
) -> ItemDetailOut:
    _data_guard()
    found = engine.find_entry(item_id)
    if not found:
        raise AppError("item_not_found", 404)
    kind, entry = found
    profile = await _profile(pool, profile_id) if profile_id else None
    household = engine.Household.from_profile(profile) if profile else None

    notes: list[str] = []
    rows: list[PersonRowOut] = []
    keys = ["disclaimer"]
    if kind == "checklist":
        record = _checklist_record(entry)
        text = (await translate_records(pool, "checklist", [record], CHECKLIST_FIELDS, lang))[item_id]
        if household is not None:
            facts = household.facts()
            notes = [t for t, n in zip(text["notes"], entry.get("conditional_notes") or [], strict=True) if facts.get(n["when"], False)]
        keys += [f"phase_{entry['phase']}", *PERSON_KEYS]
    else:
        text = (await translate_records(pool, "program", [entry], PROGRAM_FIELDS, lang))[item_id]
    location = engine.visible_location(entry, household)
    hidden = entry.get("location_id") and location is None and household is not None and not household.in_ottawa
    if hidden:
        keys.append("note_outside_ottawa")
    words = await messages(keys, lang)
    if hidden:
        notes.append(words["note_outside_ottawa"])

    if kind == "checklist" and household is not None and profile is not None:
        # Same rules as the checklist itself, so a detail page never shows rows the checklist doesn't.
        built = engine.build_checklist(household, await _progress(pool, profile["id"]))
        rows = [
            PersonRowOut(person_key=r.person.key, person_label=label_for(r.person, words), status=r.status)  # type: ignore[arg-type]
            for r in built.rows
            if r.item_id == item_id
        ]

    source = None
    if entry.get("source_url"):
        src = await pool.fetchrow("SELECT title, last_fetched_at FROM sources WHERE url = $1", entry["source_url"])
        source = SourceOut(
            url=entry["source_url"],
            title=src["title"] if src else None,
            last_checked=src["last_fetched_at"].date() if src and src["last_fetched_at"] else None,
        )

    return ItemDetailOut(
        id=item_id, kind=kind, language=lang, title=text["title"], summary=text["summary"],  # type: ignore[arg-type]
        level=entry.get("level", "federal"),
        phase=entry.get("phase"), phase_label=words.get(f"phase_{entry['phase']}") if kind == "checklist" else None,
        group=entry.get("group") if kind == "program" else None,
        essential=bool(entry.get("essential")), in_person=bool(entry.get("in_person")),
        documents=text.get("documents", []) if kind == "checklist" else [],
        steps=text.get("steps", []) if kind == "checklist" else [],
        eligibility=text.get("eligibility", []) if kind == "program" else [],
        how_to_apply=text.get("how_to_apply", []) if kind == "program" else [],
        notes=notes,
        location=LocationOut(**{k: v for k, v in location.items() if k in LocationOut.model_fields}) if location else None,
        source=source,
        # The staff card is for in-person essential steps (docs/REDESIGN.md 7.1).
        staff_card=kind == "checklist" and bool(entry.get("in_person")) and bool(entry.get("essential")),
        rows=rows,
        reviewed=bool(entry.get("reviewed")),
        disclaimer=words["disclaimer"],
    )
