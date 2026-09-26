import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.services.roadmap import TEMPLATES_FILE, due_date_for, load_templates_file, matches, order_key

TODAY = date(2026, 9, 26)
REPO = Path(__file__).resolve().parents[2]


def tpl(id: str, statuses: list[str], **cond: object) -> dict:
    return {"id": id, "order_hint": 10, "conditions": {"statuses": statuses, **cond}, "timing": {}}


def profile(status: str, **kw: object) -> dict:
    return {"status": status, "city": "ottawa", "province": "ontario", "arrival_date": TODAY - timedelta(weeks=3), **kw}


def test_status_filters() -> None:
    both = tpl("sin", ["refugee_pr", "international_student"])
    student = tpl("work_hours", ["international_student"])
    refugee = tpl("ifhp", ["refugee_pr"])
    assert matches(both, profile("refugee_pr"), TODAY) and matches(both, profile("international_student"), TODAY)
    assert matches(student, profile("international_student"), TODAY)
    assert not matches(student, profile("refugee_pr"), TODAY)
    assert not matches(refugee, profile("international_student"), TODAY)


def test_unknown_status_only_gets_shared_steps() -> None:
    assert matches(tpl("sin", ["refugee_pr", "international_student"]), profile("unknown"), TODAY)
    assert not matches(tpl("ifhp", ["refugee_pr"]), profile("unknown"), TODAY)


def test_children_condition_respects_not_sure() -> None:
    school = tpl("school", ["refugee_pr"], requires_children=True)
    assert matches(school, profile("refugee_pr", has_children=True), TODAY)
    assert matches(school, profile("refugee_pr", has_children=None), TODAY)  # "I'm not sure" keeps it visible
    assert not matches(school, profile("refugee_pr", has_children=False), TODAY)


def test_min_weeks_since_arrival() -> None:
    tax = tpl("tax", ["refugee_pr"], min_weeks_since_arrival=8)
    assert not matches(tax, profile("refugee_pr"), TODAY)
    assert matches(tax, profile("refugee_pr", arrival_date=TODAY - timedelta(weeks=10)), TODAY)


def test_due_dates() -> None:
    arrival = date(2026, 9, 5)
    assert due_date_for({"timing": {"kind": "after_arrival", "days": 14}}, arrival) == date(2026, 9, 19)
    assert due_date_for({"timing": {"kind": "annual_deadline", "month": 4, "day": 30}}, arrival) == date(2027, 4, 30)
    assert due_date_for({"timing": {"kind": "none"}}, arrival) is None
    assert due_date_for({"timing": {"kind": "after_arrival", "days": 14}}, None) is None


# ---------- the real, human-written templates ----------

templates = load_templates_file()
needs_templates = pytest.mark.skipif(not templates, reason="step_templates.json not written yet")


def sources_urls() -> set[str]:
    import yaml

    data = yaml.safe_load((REPO / "ingestion" / "sources.yaml").read_text(encoding="utf-8"))
    return {s["url"] for s in data.get("sources", []) if s}


@needs_templates
def test_templates_are_well_formed() -> None:
    ids = [t["id"] for t in templates]
    assert len(ids) == len(set(ids)), "duplicate template ids"
    topics = {t["id"] for t in json.loads((TEMPLATES_FILE.parent / "topics.json").read_text("utf-8"))["topics"]}
    urls = sources_urls()
    for t in templates:
        assert t["reviewed"] is False, t["id"]
        assert t["topic"] in topics, t["id"]
        assert t["source_url"] in urls, f"{t['id']} source_url is not in sources.yaml"
        for u in t.get("unlocks") or []:
            assert u in ids, f"{t['id']} unlocks unknown step {u}"
        timing = t.get("timing") or {}
        if timing.get("kind") == "after_arrival" and not timing.get("official"):
            assert timing.get("label_en", "").startswith("Suggested"), t["id"]


@needs_templates
@pytest.mark.parametrize("status", ["refugee_pr", "international_student"])
def test_each_mvp_status_gets_a_full_ordered_roadmap(status: str) -> None:
    p = profile(status, has_children=True, has_seniors=False, arrival_date=TODAY - timedelta(weeks=12))
    matched = [t for t in templates if matches(t, p, TODAY)]
    assert 8 <= len(matched) <= 16, [t["id"] for t in matched]
    ordered = sorted(matched, key=lambda t: order_key(t, due_date_for(t, p["arrival_date"])))
    hints = [int(t["order_hint"]) for t in ordered]
    assert hints == sorted(hints)


@needs_templates
def test_the_two_statuses_get_different_roadmaps() -> None:
    a = {t["id"] for t in templates if matches(t, profile("refugee_pr", has_children=True), TODAY)}
    b = {t["id"] for t in templates if matches(t, profile("international_student", has_children=False), TODAY)}
    assert a != b and a & b  # some shared steps (e.g. SIN), some different
