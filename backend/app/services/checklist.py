"""Household checklist and programs (docs/REDESIGN.md section 5 and 7.3).

Checklist items, programs and locations are human-written data files (app/data/*.json). This module decides which
apply to a household, expands per-person items into one row per family member, and sorts them by phase. It never
creates or changes requirements; Gemini is only used (in services/translation.py) to translate the wording.
"""

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

PHASES = ("first_3_days", "first_2_weeks", "first_month", "first_3_months", "first_year")
FACTS = (
    "has_children_0_5", "has_children_6_17", "has_seniors", "has_adults",
    "disability_adult", "disability_senior", "disability_child", "city_ottawa",
)
PEOPLE = (
    "household", "self", "everyone", "adults_seniors", "adults", "seniors",
    "children", "children_6_17", "children_0_5", "disability_groups",
)
SHARED_PEOPLE = ("household", "self")  # items that do not repeat per person
LEVELS = ("federal", "ontario", "ottawa")
PROGRAM_GROUPS = ("disability_children", "disability", "children", "seniors", "everyone")  # display order


class ChecklistDataError(Exception):
    pass


# ---------- data files ----------

def _load(name: str, key: str) -> list[dict[str, Any]]:
    path = DATA_DIR / name
    if not path.exists():
        raise ChecklistDataError(f"{name} is missing")
    return json.loads(path.read_text(encoding="utf-8"))[key]


@lru_cache
def checklist_items() -> tuple[dict[str, Any], ...]:
    return tuple(_load("checklist_items.json", "items"))


@lru_cache
def programs() -> tuple[dict[str, Any], ...]:
    return tuple(_load("programs.json", "programs"))


@lru_cache
def locations() -> dict[str, dict[str, Any]]:
    return {loc["id"]: loc for loc in _load("locations.json", "locations")}


def find_entry(entry_id: str) -> tuple[str, dict[str, Any]] | None:
    """Look up a checklist item or program by id. Returns ('checklist' | 'program', entry)."""
    for item in checklist_items():
        if item["id"] == entry_id:
            return "checklist", item
    for program in programs():
        if program["id"] == entry_id:
            return "program", program
    return None


def validate_rules(entry: dict[str, Any]) -> list[str]:
    """Structural problems in one entry's rules (used by the data tests)."""
    problems = []
    rules = entry.get("applies_to") or {}
    for key in rules:
        if key not in ("all", "any"):
            problems.append(f"{entry['id']}: applies_to has unknown key {key!r}")
    for fact in [*rules.get("all", []), *rules.get("any", [])]:
        if fact not in FACTS:
            problems.append(f"{entry['id']}: unknown fact {fact!r}")
    if entry.get("level") not in LEVELS:
        problems.append(f"{entry['id']}: level must be one of {LEVELS}")
    return problems


# ---------- households and people ----------

@dataclass(frozen=True)
class Household:
    adults: int = 1
    seniors: int = 0
    children_0_5: int = 0
    children_6_17: int = 0
    self_age_group: str = "adult"
    disability_adult: bool | None = None
    disability_senior: bool | None = None
    disability_child: bool | None = None
    city: str = "unknown"
    province: str = "unknown"

    @classmethod
    def from_profile(cls, p: dict[str, Any]) -> "Household":
        return cls(
            adults=int(p.get("adults") or 0),
            seniors=int(p.get("seniors") or 0),
            children_0_5=int(p.get("children_0_5") or 0),
            children_6_17=int(p.get("children_6_17") or 0),
            self_age_group=p.get("self_age_group") or "adult",
            disability_adult=p.get("disability_adult"),
            disability_senior=p.get("disability_senior"),
            disability_child=p.get("disability_child"),
            city=p.get("city") or "unknown",
            province=p.get("province") or "unknown",
        )

    @property
    def in_ottawa(self) -> bool:
        # Unknown city is treated as Ottawa (the MVP city), like retrieval.jurisdictions_for.
        return self.city in ("ottawa", "unknown")

    @property
    def in_ontario(self) -> bool:
        return self.in_ottawa or self.province in ("ontario", "unknown")

    def facts(self) -> dict[str, bool]:
        return {
            "has_adults": self.adults > 0,
            "has_seniors": self.seniors > 0,
            "has_children_0_5": self.children_0_5 > 0,
            "has_children_6_17": self.children_6_17 > 0,
            "disability_adult": self.disability_adult is True and self.adults > 0,
            "disability_senior": self.disability_senior is True and self.seniors > 0,
            "disability_child": self.disability_child is True and (self.children_0_5 + self.children_6_17) > 0,
            "city_ottawa": self.in_ottawa,
        }


@dataclass(frozen=True)
class Person:
    key: str  # stable: self, adult-2, senior-1, child-1, group-child, household
    kind: str  # self | adult | senior | child | group | household
    number: int | None = None
    age_band: str | None = None  # 0_5 | 6_17 for children
    group: str | None = None  # adult | senior | child for self and disability groups


def people_of(h: Household) -> dict[str, list[Person]]:
    """Everyone in the household, numbered the same way every time. The person themself is Adult 1 or Senior 1."""
    self_person = Person("self", "self", number=1, group=h.self_age_group)
    others_adult_start = 2 if h.self_age_group == "adult" else 1
    other_adults_count = h.adults - (1 if h.self_age_group == "adult" else 0)
    others_senior_start = 2 if h.self_age_group == "senior" else 1
    other_seniors_count = h.seniors - (1 if h.self_age_group == "senior" else 0)

    adults = [Person(f"adult-{n}", "adult", number=n) for n in range(others_adult_start, others_adult_start + max(0, other_adults_count))]
    seniors = [Person(f"senior-{n}", "senior", number=n) for n in range(others_senior_start, others_senior_start + max(0, other_seniors_count))]
    # Children are numbered older first: 6-17, then 0-5.
    children = [Person(f"child-{n}", "child", number=n, age_band="6_17") for n in range(1, h.children_6_17 + 1)]
    children += [
        Person(f"child-{n}", "child", number=n, age_band="0_5")
        for n in range(h.children_6_17 + 1, h.children_6_17 + h.children_0_5 + 1)
    ]
    return {"self": [self_person], "adults": adults, "seniors": seniors, "children": children}


def expand(entry: dict[str, Any], h: Household) -> list[Person]:
    """The rows one checklist item produces for this household (empty list = does not apply)."""
    p = people_of(h)
    me = p["self"]
    target = entry.get("people", "household")
    if target == "household":
        return [Person("household", "household")]
    if target == "self":
        return me
    if target == "everyone":
        return me + p["adults"] + p["seniors"] + p["children"]
    if target == "adults_seniors":
        return me + p["adults"] + p["seniors"]
    if target == "adults":
        return (me if h.self_age_group == "adult" else []) + p["adults"]
    if target == "seniors":
        return (me if h.self_age_group == "senior" else []) + p["seniors"]
    if target == "children":
        return p["children"]
    if target == "children_6_17":
        return [c for c in p["children"] if c.age_band == "6_17"]
    if target == "children_0_5":
        return [c for c in p["children"] if c.age_band == "0_5"]
    if target == "disability_groups":
        facts = h.facts()
        return [
            Person(f"group-{g}", "group", group=g)
            for g in ("adult", "senior", "child")
            if facts[f"disability_{g}"]
        ]
    raise ChecklistDataError(f"{entry['id']}: unknown people value {target!r}")


def rules_match(entry: dict[str, Any], facts: dict[str, bool]) -> bool:
    rules = entry.get("applies_to") or {}
    if not all(facts[f] for f in rules.get("all", [])):
        return False
    any_of = rules.get("any", [])
    return not any_of or any(facts[f] for f in any_of)


def level_visible(entry: dict[str, Any], h: Household) -> bool:
    """Outside Ontario only federal entries show; outside Ottawa, Ottawa-level entries hide."""
    level = entry.get("level", "federal")
    if level == "ottawa":
        return h.in_ottawa
    if level == "ontario":
        return h.in_ontario
    return True


def household_notes(h: Household) -> list[str]:
    """Message keys to show with the checklist (translated by services/messages.py)."""
    if not h.in_ontario:
        return ["note_outside_ontario"]
    if not h.in_ottawa:
        return ["note_outside_ottawa"]
    return []


# ---------- checklist ----------

@dataclass
class Row:
    item_id: str
    person: Person
    phase: str
    priority: int
    essential: bool
    in_person: bool
    level: str
    status: str = "todo"
    completed_at: Any = None
    family_order: int = 0  # position of the person within this item's rows


@dataclass
class Checklist:
    rows: list[Row] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def done(self) -> int:
        return sum(1 for r in self.rows if r.status == "done")

    @property
    def total(self) -> int:
        return len(self.rows)

    @property
    def current_phase(self) -> str | None:
        for phase in PHASES:
            if any(r.phase == phase and r.status != "done" for r in self.rows):
                return phase
        return PHASES[-1] if self.rows else None

    def by_phase(self) -> list[tuple[str, list[Row]]]:
        return [(phase, [r for r in self.rows if r.phase == phase]) for phase in PHASES if any(r.phase == phase for r in self.rows)]

    def keys(self) -> set[tuple[str, str]]:
        return {(r.item_id, r.person.key) for r in self.rows}


def build_checklist(h: Household, progress: dict[tuple[str, str], dict[str, Any]] | None = None) -> Checklist:
    facts = h.facts()
    rows: list[Row] = []
    order = {phase: i for i, phase in enumerate(PHASES)}
    for item in checklist_items():
        if not rules_match(item, facts) or not level_visible(item, h):
            continue
        for index, person in enumerate(expand(item, h)):
            saved = (progress or {}).get((item["id"], person.key)) or {}
            rows.append(
                Row(
                    item_id=item["id"], person=person, phase=item["phase"], priority=int(item.get("priority", 100)),
                    essential=bool(item.get("essential")), in_person=bool(item.get("in_person")),
                    level=item.get("level", "federal"), status=saved.get("status", "todo"),
                    completed_at=saved.get("completed_at"), family_order=index,
                )
            )
    # Phase, then essentials first, then priority, then family order within an item.
    rows.sort(key=lambda r: (order[r.phase], not r.essential, r.priority, r.item_id, r.family_order))
    return Checklist(rows=rows, notes=household_notes(h))


def matching_programs(h: Household) -> list[dict[str, Any]]:
    facts = h.facts()
    found = [p for p in programs() if rules_match(p, facts) and level_visible(p, h)]
    rank = {g: i for i, g in enumerate(PROGRAM_GROUPS)}
    # Programs for the family's specific needs first, general programs last; data order within a group.
    return sorted(found, key=lambda p: rank.get(p.get("group", "everyone"), len(rank)))


def visible_location(entry: dict[str, Any], h: Household | None) -> dict[str, Any] | None:
    """Ottawa offices are only shown to people in Ottawa (or when no profile is given)."""
    loc_id = entry.get("location_id")
    if not loc_id:
        return None
    loc = locations().get(loc_id)
    if loc is None:
        return None
    if h is not None and loc.get("city") == "ottawa" and not h.in_ottawa:
        return None
    return loc


def active_notes(entry: dict[str, Any], h: Household | None) -> list[str]:
    """Conditional notes (e.g. kindergarten) whose fact is true for this household."""
    if h is None:
        return []
    facts = h.facts()
    return [n["note"] for n in entry.get("conditional_notes") or [] if facts.get(n.get("when", ""), False)]
