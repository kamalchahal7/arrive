"""Rules engine: which items apply, per-person rows, phases and order.

The first part uses a small synthetic dataset so every rule is tested precisely. The second part runs the three
acceptance households from docs/REDESIGN.md section 12 (R1) against the real data files.
"""

from collections import Counter

import pytest

from app.services import checklist as engine
from app.services.checklist import Household

SYNTHETIC_ITEMS = (
    {"id": "orientation", "phase": "first_3_days", "priority": 10, "essential": False, "level": "federal", "people": "household", "applies_to": {}},
    {"id": "sin", "phase": "first_2_weeks", "priority": 20, "essential": True, "level": "federal", "people": "adults_seniors", "applies_to": {}},
    {"id": "health", "phase": "first_2_weeks", "priority": 30, "essential": True, "level": "ontario", "people": "everyone", "applies_to": {}},
    {"id": "transit", "phase": "first_2_weeks", "priority": 5, "essential": False, "level": "ottawa", "people": "adults_seniors", "applies_to": {}},
    {"id": "bank", "phase": "first_2_weeks", "priority": 40, "essential": True, "level": "federal", "people": "self", "applies_to": {}},
    {"id": "school", "phase": "first_2_weeks", "priority": 50, "essential": True, "level": "ottawa", "people": "children_6_17", "applies_to": {},
     "conditional_notes": [{"when": "has_children_0_5", "note": "kindergarten note"}]},
    {"id": "benefit", "phase": "first_month", "priority": 10, "essential": True, "level": "federal", "people": "household",
     "applies_to": {"any": ["has_children_0_5", "has_children_6_17"]}},
    {"id": "vaccines", "phase": "first_month", "priority": 20, "essential": False, "level": "ottawa", "people": "children", "applies_to": {}},
    {"id": "senior_drugs", "phase": "first_month", "priority": 30, "essential": False, "level": "ontario", "people": "seniors", "applies_to": {}},
    {"id": "dtc", "phase": "first_year", "priority": 10, "essential": False, "level": "federal", "people": "disability_groups",
     "applies_to": {"any": ["disability_adult", "disability_senior", "disability_child"]}},
    {"id": "tax", "phase": "first_year", "priority": 5, "essential": True, "level": "federal", "people": "adults_seniors", "applies_to": {}},
)


@pytest.fixture
def synthetic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine, "checklist_items", lambda: SYNTHETIC_ITEMS)


def rows_of(h: Household) -> list[tuple[str, str]]:
    return [(r.item_id, r.person.key) for r in engine.build_checklist(h).rows]


# ---------- people and per-person expansion ----------

def test_people_numbering_self_is_adult_1() -> None:
    p = engine.people_of(Household(adults=2, seniors=1, children_0_5=1, children_6_17=2))
    assert [x.key for x in p["self"] + p["adults"] + p["seniors"]] == ["self", "adult-2", "senior-1"]
    # Children are numbered older first: two 6-17, then the 0-5.
    assert [(c.key, c.age_band) for c in p["children"]] == [("child-1", "6_17"), ("child-2", "6_17"), ("child-3", "0_5")]


def test_people_numbering_self_is_senior_1() -> None:
    p = engine.people_of(Household(adults=1, seniors=2, self_age_group="senior"))
    assert [x.key for x in p["self"] + p["adults"] + p["seniors"]] == ["self", "adult-1", "senior-2"]


def test_seniors_items_include_self_when_self_is_senior(synthetic: None) -> None:
    rows = rows_of(Household(adults=0, seniors=1, self_age_group="senior"))
    assert ("senior_drugs", "self") in rows and ("sin", "self") in rows


def test_disability_expands_per_group_not_per_person(synthetic: None) -> None:
    h = Household(adults=2, children_6_17=2, disability_adult=True, disability_child=True, disability_senior=True)
    dtc = [key for item, key in rows_of(h) if item == "dtc"]
    # No seniors in this household, so the senior flag is ignored.
    assert dtc == ["group-adult", "group-child"]


def test_prefer_not_to_say_disability_adds_nothing(synthetic: None) -> None:
    assert not [r for r in rows_of(Household(disability_child=None, children_0_5=1)) if r[0] == "dtc"]


# ---------- sorting and phases ----------

def test_rows_sorted_by_phase_then_essential_then_priority(synthetic: None) -> None:
    result = engine.build_checklist(Household(adults=1))
    phases = [r.phase for r in result.rows]
    assert phases == sorted(phases, key=engine.PHASES.index)
    two_weeks = [r.item_id for r in result.rows if r.phase == "first_2_weeks"]
    # transit has the lowest priority number but is not essential, so the essentials come first.
    assert two_weeks == ["sin", "health", "bank", "transit"]


def test_current_phase_moves_on_when_a_phase_is_done(synthetic: None) -> None:
    h = Household(adults=1)
    assert engine.build_checklist(h).current_phase == "first_3_days"
    done = engine.build_checklist(h, {("orientation", "household"): {"status": "done"}})
    assert done.current_phase == "first_2_weeks" and done.done == 1


# ---------- city and province ----------

def test_outside_ottawa_hides_ottawa_items_and_adds_note(synthetic: None) -> None:
    result = engine.build_checklist(Household(city="other", province="ontario", children_6_17=1))
    ids = {r.item_id for r in result.rows}
    assert "transit" not in ids and "school" not in ids and "vaccines" not in ids
    assert "health" in ids and "sin" in ids
    assert result.notes == ["note_outside_ottawa"]


def test_outside_ontario_shows_only_federal(synthetic: None) -> None:
    result = engine.build_checklist(Household(city="other", province="other", seniors=1))
    assert {r.level for r in result.rows} == {"federal"}
    assert result.notes == ["note_outside_ontario"]


def test_unknown_city_is_treated_as_ottawa(synthetic: None) -> None:
    assert "transit" in {r.item_id for r in engine.build_checklist(Household(city="unknown")).rows}


def test_conditional_notes_follow_household_facts(synthetic: None) -> None:
    school = next(i for i in SYNTHETIC_ITEMS if i["id"] == "school")
    assert engine.active_notes(school, Household(children_0_5=1, children_6_17=1)) == ["kindergarten note"]
    assert engine.active_notes(school, Household(children_6_17=1)) == []


# ---------- acceptance households on the real data (docs/REDESIGN.md R1) ----------

HOUSEHOLD_ITEMS = {
    "rap_orientation", "phone_number", "ifhp", "housing", "address_ircc", "settlement_services", "family_doctor",
    "library_card", "immigration_loan", "drivers_licence", "dental_cdcp",
}


def real_rows(h: Household) -> Counter:
    return Counter((r.item_id, r.person.key) for r in engine.build_checklist(h).rows)


def expected(per_person: dict[str, list[str]], extra_household: set[str] = frozenset()) -> Counter:
    rows = Counter((i, "household") for i in HOUSEHOLD_ITEMS | set(extra_household))
    for item, people in per_person.items():
        rows.update((item, p) for p in people)
    return rows


def test_single_adult() -> None:
    h = Household(adults=1, city="ottawa", province="ontario")
    assert real_rows(h) == expected({
        "sin": ["self"], "health_card": ["self"], "bank_account": ["self"], "language_assessment": ["self"],
        "transit": ["self"], "photo_id": ["self"], "tax_return": ["self"],
    })
    assert engine.build_checklist(h).total == 18


def test_family_with_two_children() -> None:
    h = Household(adults=2, children_0_5=1, children_6_17=1, city="ottawa", province="ontario")
    assert real_rows(h) == expected(
        {
            "sin": ["self", "adult-2"], "health_card": ["self", "adult-2", "child-1", "child-2"],
            "bank_account": ["self"], "language_assessment": ["self", "adult-2"], "transit": ["self", "adult-2"],
            "photo_id": ["self", "adult-2"], "tax_return": ["self", "adult-2"],
            "school_registration": ["child-1"],  # only the 6-17 child
            "immunization_records": ["child-1", "child-2"], "sin_child": ["child-1", "child-2"],
        },
        {"ccb"},
    )


def test_family_with_senior_and_child_with_disability() -> None:
    h = Household(adults=1, seniors=1, children_6_17=1, disability_child=True, city="ottawa", province="ontario")
    assert real_rows(h) == expected(
        {
            "sin": ["self", "senior-1"], "health_card": ["self", "senior-1", "child-1"], "bank_account": ["self"],
            "language_assessment": ["self", "senior-1"], "transit": ["self", "senior-1"],
            "photo_id": ["self", "senior-1"], "tax_return": ["self", "senior-1"],
            "school_registration": ["child-1"], "immunization_records": ["child-1"], "sin_child": ["child-1"],
            "senior_drug_benefit": ["senior-1"], "senior_dental": ["senior-1"], "dtc": ["group-child"],
        },
        {"ccb"},
    )


@pytest.mark.parametrize(
    "h",
    [
        Household(adults=1, city="ottawa", province="ontario"),
        Household(adults=2, children_0_5=1, children_6_17=1, city="ottawa", province="ontario"),
        Household(adults=1, seniors=1, children_6_17=1, disability_child=True, city="ottawa", province="ontario"),
    ],
)
def test_real_phases_in_order_with_essentials_first(h: Household) -> None:
    result = engine.build_checklist(h)
    order = [engine.PHASES.index(r.phase) for r in result.rows]
    assert order == sorted(order)
    for _, rows in result.by_phase():
        flags = [r.essential for r in rows]
        assert flags == sorted(flags, reverse=True), "essential items must come first within a phase"
    assert result.rows[0].phase == "first_3_days"
