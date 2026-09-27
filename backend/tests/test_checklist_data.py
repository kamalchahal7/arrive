"""The human-written data files follow the rules in docs/REDESIGN.md and CLAUDE.md."""

import re
from pathlib import Path

import pytest
import yaml

from app.services import checklist as engine
from app.services.checklist import FACTS, LEVELS, PEOPLE, PHASES, SHARED_PEOPLE
from app.services.topics import topic_ids

REPO = Path(__file__).resolve().parents[2]
SPEC_ESSENTIALS = {"sin", "health_card", "bank_account", "housing", "school_registration", "ccb", "tax_return"}
SPEC_ITEMS = {
    "rap_orientation", "phone_number", "sin", "health_card", "ifhp", "bank_account", "housing", "address_ircc",
    "school_registration", "immunization_records", "ccb", "settlement_services", "language_assessment",
    "family_doctor", "library_card", "transit", "photo_id", "immigration_loan", "drivers_licence", "sin_child",
    "tax_return", "dental_cdcp", "senior_drug_benefit", "senior_dental", "dtc",
}
VERIFY = re.compile(r"\[VERIFY")
USER_FACING = ("title", "summary", "documents", "steps", "eligibility", "how_to_apply")


def source_urls() -> set[str]:
    data = yaml.safe_load((REPO / "ingestion" / "sources.yaml").read_text(encoding="utf-8"))
    return {s["url"] for s in data.get("sources", []) if s}


def all_entries() -> list[dict]:
    return [*engine.checklist_items(), *engine.programs()]


def test_checklist_has_exactly_the_spec_items() -> None:
    assert {i["id"] for i in engine.checklist_items()} == SPEC_ITEMS


def test_ids_are_unique_across_items_and_programs() -> None:
    ids = [e["id"] for e in all_entries()]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r"[a-z0-9_]+", i) for i in ids)


def test_essential_set_matches_the_spec() -> None:
    assert {i["id"] for i in engine.checklist_items() if i.get("essential")} == SPEC_ESSENTIALS


@pytest.mark.parametrize("item", engine.checklist_items(), ids=lambda i: i["id"])
def test_checklist_item_is_well_formed(item: dict) -> None:
    assert item["phase"] in PHASES
    assert item["people"] in PEOPLE
    assert item["per_person"] is (item["people"] not in SHARED_PEOPLE)
    assert isinstance(item["priority"], int)
    assert isinstance(item["in_person"], bool)
    assert isinstance(item["documents"], list) and isinstance(item["steps"], list)
    for note in item.get("conditional_notes") or []:
        assert note["when"] in FACTS and note["note"].strip()


@pytest.mark.parametrize("entry", all_entries(), ids=lambda e: e["id"])
def test_entry_rules_sources_and_review_state(entry: dict) -> None:
    assert engine.validate_rules(entry) == []
    assert entry["level"] in LEVELS
    assert entry["reviewed"] is False, "only a person can mark content as reviewed"
    # Every source is an official page listed in sources.yaml, or missing with a note saying what to find.
    if entry.get("source_url"):
        assert entry["source_url"] in source_urls(), f"{entry['id']}: source_url not in sources.yaml"
    else:
        assert any(VERIFY.search(n) for n in entry.get("verify_notes") or []), f"{entry['id']}: no source and no [VERIFY] note"
    if entry.get("location_id"):
        assert entry["location_id"] in engine.locations()
    # [VERIFY] markers belong in verify_notes, never in text shown to newcomers.
    for f in USER_FACING:
        values = entry.get(f) or []
        for v in values if isinstance(values, list) else [values]:
            assert not VERIFY.search(v), f"{entry['id']}.{f} shows a [VERIFY] marker to users"


@pytest.mark.parametrize("program", engine.programs(), ids=lambda p: p["id"])
def test_program_groups(program: dict) -> None:
    assert program["group"] in engine.PROGRAM_GROUPS


@pytest.mark.parametrize("loc", list(engine.locations().values()), ids=lambda loc: loc["id"])
def test_locations_never_invent_contact_details(loc: dict) -> None:
    assert loc["verified"] is False and loc.get("photo") is None
    # Address, phone and hours come from an official page, or stay empty with a note.
    if loc.get("address") or loc.get("phone") or loc.get("hours"):
        assert loc.get("source_url") in source_urls(), f"{loc['id']}: contact details without an official source"
    else:
        assert any(VERIFY.search(n) for n in loc.get("verify_notes") or [])


def test_new_sources_use_known_topics_and_jurisdictions() -> None:
    data = yaml.safe_load((REPO / "ingestion" / "sources.yaml").read_text(encoding="utf-8"))
    for s in data["sources"]:
        assert s["jurisdiction"] in ("federal", "ontario", "ottawa"), s["url"]
        assert set(s["topics"]) <= topic_ids(), s["url"]
        assert s["verified"] is False
