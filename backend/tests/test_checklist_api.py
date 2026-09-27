"""Checklist, programs and item endpoints; readable profile IDs; translation safety."""

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import require_db
from app.main import create_app
from app.services import checklist as engine
from app.services import public_id
from app.services.translation import translate_records
from tests.conftest import RecordingPool
from tests.test_checklist_rules import SYNTHETIC_ITEMS

PROGRAMS = (
    {"id": "linc", "group": "everyone", "level": "federal", "applies_to": {}, "title": "Language classes", "summary": "s",
     "eligibility": ["e"], "how_to_apply": ["h"], "location_id": None},
    {"id": "child_dental", "group": "children", "level": "ontario", "applies_to": {"any": ["has_children_0_5", "has_children_6_17"]},
     "title": "Child dental", "summary": "s", "eligibility": [], "how_to_apply": [], "location_id": None},
    {"id": "para", "group": "disability", "level": "ottawa", "applies_to": {"any": ["disability_adult", "disability_senior", "disability_child"]},
     "title": "Para", "summary": "s", "eligibility": [], "how_to_apply": [], "location_id": "office"},
)
LOCATIONS = {"office": {"id": "office", "name": "Service Office", "city": "ottawa", "address": None, "verified": False}}
PID = "ARV-7K3P-9QXM-2D4F"


def with_text(items: tuple[dict, ...]) -> tuple[dict, ...]:
    return tuple({"title": i["id"].title(), "summary": f"About {i['id']}", "documents": ["Passport"], "steps": ["Go"],
                  "in_person": True, "location_id": "office", "source_url": None, **i} for i in items)


@pytest.fixture
def data(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine, "checklist_items", lambda: with_text(SYNTHETIC_ITEMS))
    monkeypatch.setattr(engine, "programs", lambda: PROGRAMS)
    monkeypatch.setattr(engine, "locations", lambda: LOCATIONS)


def profile_row(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": uuid.uuid4(), "public_id": PID, "adults": 2, "seniors": 0, "children_0_5": 1, "children_6_17": 1,
        "self_age_group": "adult", "disability_adult": None, "disability_senior": None, "disability_child": None,
        "city": "ottawa", "province": "ontario",
    }
    return {**base, **overrides}


def client_for(pool: RecordingPool) -> TestClient:
    app = create_app()
    app.dependency_overrides[require_db] = lambda: pool
    return TestClient(app)


def pool_for(profile: dict[str, Any] | None, progress: list[dict[str, Any]] | None = None) -> RecordingPool:
    def fetch(sql: str, args: Any) -> list[dict[str, Any]]:
        return progress or [] if "checklist_progress" in sql else []

    return RecordingPool(fetchrow=lambda sql, args: profile if "FROM profiles" in sql else None, fetch=fetch)


# ---------- readable IDs ----------

def test_public_id_format_and_randomness() -> None:
    ids = {public_id.generate() for _ in range(2000)}
    assert len(ids) == 2000
    assert all(public_id.is_valid(i) for i in ids)
    assert not any(c in i[4:] for i in ids for c in "ILOU")


def test_public_id_normalizes_what_people_type() -> None:
    assert public_id.normalize("arv 7k3p 9qxm 2d4f") == PID
    assert public_id.normalize("7K3P-9QXM-2D4F") == PID
    # Letters that look like digits are read as the digit (Crockford base32).
    assert public_id.normalize("ARV-7K3P-9QXM-2D4O") == "ARV-7K3P-9QXM-2D40"
    assert public_id.normalize("ARV-1234") is None and public_id.normalize("not an id") is None


# ---------- checklist ----------

def test_get_checklist_shape_and_labels(data: None) -> None:
    res = client_for(pool_for(profile_row())).get(f"/api/checklist/{PID}")
    assert res.status_code == 200
    body = res.json()
    assert body["profile_id"] == PID and body["current_phase"] == "first_3_days"
    assert [p["id"] for p in body["phases"]] == ["first_3_days", "first_2_weeks", "first_month", "first_year"]
    assert body["phases"][0]["label"] == "First 3 days"
    labels = {(r["item_id"], r["person_label"]) for p in body["phases"] for r in p["items"]}
    assert {("sin", "You"), ("sin", "Adult 2"), ("health", "Child 2"), ("school", "Child 1"), ("benefit", "Your family")} <= labels
    assert body["total"] == sum(p["total"] for p in body["phases"])


def test_checklist_accepts_lowercase_typed_id(data: None) -> None:
    pool = pool_for(profile_row())
    assert client_for(pool).get("/api/checklist/arv-7k3p-9qxm-2d4f").status_code == 200
    assert any(args == (PID,) for sql, args in pool.queries if "public_id" in sql)


def test_checklist_merges_saved_progress(data: None) -> None:
    progress = [{"item_id": "sin", "person_key": "self", "status": "done", "completed_at": datetime.now(timezone.utc)}]
    body = client_for(pool_for(profile_row(), progress)).get(f"/api/checklist/{PID}").json()
    sin_self = next(r for p in body["phases"] for r in p["items"] if r["item_id"] == "sin" and r["person_key"] == "self")
    assert sin_self["status"] == "done" and body["done"] == 1


def test_unknown_profile_is_404(data: None) -> None:
    assert client_for(pool_for(None)).get(f"/api/checklist/{PID}").status_code == 404


def test_patch_rejects_items_not_in_this_household(data: None) -> None:
    client = client_for(pool_for(profile_row(seniors=0)))
    # No senior in the household, so a senior row does not exist.
    res = client.patch(f"/api/checklist/{PID}/items", json={"items": [{"item_id": "senior_drugs", "person_key": "self", "status": "done"}]})
    assert res.status_code == 422 and res.json()["error"] == "unknown_checklist_item"
    res = client.patch(f"/api/checklist/{PID}/items", json={"items": [{"item_id": "sin", "person_key": "adult-9", "status": "done"}]})
    assert res.status_code == 422


def test_patch_saves_progress(data: None) -> None:
    pool = pool_for(profile_row())
    res = client_for(pool).patch(
        f"/api/checklist/{PID}/items",
        json={"items": [{"item_id": "sin", "person_key": "adult-2", "status": "done"}, {"item_id": "health", "person_key": "child-2", "status": "done"}]},
    )
    assert res.status_code == 200 and res.json()["updated"] == 2
    upserts = [args for sql, args in pool.queries if "INSERT INTO checklist_progress" in sql]
    assert [(a[1], a[2], a[3]) for a in upserts] == [("sin", "adult-2", "done"), ("health", "child-2", "done")]


# ---------- programs ----------

def test_programs_filtered_by_household(data: None) -> None:
    body = client_for(pool_for(profile_row())).get(f"/api/programs/{PID}").json()
    assert [p["id"] for p in body["programs"]] == ["child_dental", "linc"]  # family-specific first
    body = client_for(pool_for(profile_row(children_0_5=0, children_6_17=0, disability_adult=True))).get(f"/api/programs/{PID}").json()
    assert [p["id"] for p in body["programs"]] == ["para", "linc"]


def test_programs_outside_ontario_are_federal_only(data: None) -> None:
    row = profile_row(city="other", province="other", disability_adult=True)
    body = client_for(pool_for(row)).get(f"/api/programs/{PID}").json()
    assert [p["id"] for p in body["programs"]] == ["linc"] and body["notes"]


# ---------- item detail ----------

def test_item_detail_with_profile(data: None) -> None:
    body = client_for(pool_for(profile_row())).get(f"/api/items/school?profile_id={PID}").json()
    assert body["kind"] == "checklist" and body["essential"] and body["staff_card"]
    assert body["location"]["name"] == "Service Office"
    assert [r["person_key"] for r in body["rows"]] == ["child-1"]
    assert body["notes"] == ["kindergarten note"]  # family has a child aged 0-5
    assert body["disclaimer"]


def test_item_detail_hides_ottawa_office_outside_ottawa(data: None) -> None:
    row = profile_row(city="other", province="ontario")
    body = client_for(pool_for(row)).get(f"/api/items/sin?profile_id={PID}").json()
    assert body["location"] is None
    assert "Local offices for your city are not available yet." in body["notes"]


def test_program_detail_and_404(data: None) -> None:
    client = client_for(pool_for(None))
    body = client.get("/api/items/linc").json()
    assert body["kind"] == "program" and body["eligibility"] == ["e"] and not body["staff_card"]
    assert client.get("/api/items/nope").status_code == 404


# ---------- profiles ----------

def test_profile_create_assigns_readable_id() -> None:
    created = {}

    def fetchrow(sql: str, args: Any) -> dict[str, Any]:
        created["sql"], created["args"] = sql, args
        return {"id": uuid.uuid4(), "status": "unknown", "arrival_date": None, "city": "ottawa", "province": "ontario",
                "has_children": None, "has_seniors": None, "languages": [], "preferred_language": "ar", "needs": [],
                "created_at": datetime.now(timezone.utc), "public_id": args[-1], "adults": 2, "seniors": 0,
                "children_0_5": 0, "children_6_17": 2, "self_age_group": "adult", "other_languages": [],
                "analytics_consent": False, "first_name_enc": b"secret"}

    res = client_for(RecordingPool(fetchrow=fetchrow)).post(
        "/api/profile", json={"preferred_language": "ar", "city": "ottawa", "province": "ontario", "adults": 2, "children_6_17": 2}
    )
    assert res.status_code == 201
    assert public_id.is_valid(res.json()["public_id"])
    assert "first_name_enc" not in res.json()  # encrypted fields never leave the server


def test_profile_rejects_household_without_the_person() -> None:
    res = client_for(RecordingPool()).post("/api/profile", json={"adults": 0, "seniors": 0})
    assert res.status_code == 422 and res.json()["error"] == "invalid_household"
    res = client_for(RecordingPool()).post("/api/profile", json={"adults": 2, "seniors": 0, "self_age_group": "senior"})
    assert res.status_code == 422


# ---------- translation safety ----------

async def test_translation_used_when_counts_match(fake_gemini) -> None:
    fake_gemini({"translate_records": {"records": [{"id": "sin", "texts": ["عنوان", "ملخص", "جواز السفر", "اذهب"]}]}})
    record = {"id": "sin", "title": "Title", "summary": "Summary", "documents": ["Passport"], "steps": ["Go"]}
    out = await translate_records(RecordingPool(), "checklist", [record], ("title", "summary", "documents", "steps"), "ar")
    assert out["sin"] == {"title": "عنوان", "summary": "ملخص", "documents": ["جواز السفر"], "steps": ["اذهب"]}


async def test_translation_that_drops_a_document_is_rejected(fake_gemini) -> None:
    fake_gemini({"translate_records": {"records": [{"id": "sin", "texts": ["عنوان", "ملخص", "اذهب"]}]}})
    record = {"id": "sin", "title": "Title", "summary": "Summary", "documents": ["Passport"], "steps": ["Go"]}
    pool = RecordingPool()
    out = await translate_records(pool, "checklist", [record], ("title", "summary", "documents", "steps"), "ar")
    assert out["sin"]["documents"] == ["Passport"] and out["sin"]["title"] == "Title"  # English fallback
    assert not any("INSERT INTO content_translations" in sql for sql, _ in pool.queries)


async def test_dari_labels_are_translated_in_one_call(fake_gemini) -> None:
    from app.services import messages as m

    m._cache.clear()
    fake = fake_gemini({"translate_message": lambda contents: {"texts": [f"prs:{i}" for i in range(contents.count("\n") - 1)]}})
    out = await m.messages(["person_you", "person_adult", "phase_first_month"], "prs")
    assert len(fake.calls) == 1 and set(out) == {"person_you", "person_adult", "phase_first_month"}
