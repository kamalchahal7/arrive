"""Session events and survey: fixed categories only, country only with consent, no profile IDs."""

import uuid

import pytest

from app.config import get_settings
from app.services import events
from tests.conftest import RecordingPool
from tests.test_checklist_api import data  # noqa: F401  (fixture used below)

PROFILE = {"id": uuid.uuid4(), "public_id": "ARV-7K3P-9QXM-2D4F", "country_of_origin": "SY", "city": "ottawa",
           "adults": 2, "seniors": 0, "children_0_5": 1, "children_6_17": 0, "analytics_consent": False}


@pytest.fixture(autouse=True)
def salt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYTICS_SALT", "test-salt")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def test_event_without_consent_has_no_country_and_no_id() -> None:
    pool = RecordingPool()
    assert await events.log_event(pool, session_id="sess-12345", event="program_interest", language="ar",
                                  profile=PROFILE, target_id="linc")
    args = pool.queries[0][1]
    assert args[5] is None  # country_of_origin
    assert args[6] == "family_children" and args[7] == "ottawa"
    assert PROFILE["public_id"] not in pool.all_args_text() and str(PROFILE["id"]) not in pool.all_args_text()


async def test_event_with_consent_keeps_country() -> None:
    pool = RecordingPool()
    await events.log_event(pool, session_id="sess-12345", event="view_item", language="ar",
                           profile={**PROFILE, "analytics_consent": True}, target_id="sin")
    assert pool.queries[0][1][5] == "SY"


async def test_unknown_event_or_bad_target_is_not_stored() -> None:
    pool = RecordingPool()
    assert not await events.log_event(pool, session_id="sess-12345", event="read_mind", language="en", profile=None)
    await events.log_event(pool, session_id="sess-12345", event="view_item", language="en", profile=None,
                           target_id="Amira's file")
    assert pool.queries[0][1][3] is None


async def test_survey_text_is_scrubbed() -> None:
    pool = RecordingPool()
    await events.save_survey(pool, session_id="sess-12345", language="en", profile=PROFILE, satisfaction=4,
                             missing_features="Call me at 613-555-0142, my name is Amira Haddad")
    text = pool.all_args_text()
    assert "613-555-0142" not in text and "Amira" not in text


async def test_delete_unlinks_events() -> None:
    pool = RecordingPool()
    await events.unlink_profile(pool, PROFILE)
    assert all("SET profile_ref = NULL" in sql for sql, _ in pool.queries) and len(pool.queries) == 2


# ---- agent tools for the household checklist ----

def _tool_client(pool):
    from fastapi.testclient import TestClient

    from app.deps import require_db
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[require_db] = lambda: pool
    return TestClient(app)


def test_agent_get_checklist_and_mark_done(data, monkeypatch) -> None:
    from tests.test_checklist_api import PID, pool_for, profile_row

    pool = pool_for(profile_row())
    c = _tool_client(pool)
    h = {"X-Arrive-Secret": "test-secret"}
    res = c.post("/api/voice/tools/get-checklist", json={"profile_id": PID, "language": "en"}, headers=h)
    assert res.status_code == 200 and "0 of" in res.json()["text"] and "Next: 1." in res.json()["text"]
    res = c.post("/api/voice/tools/mark-item-done", json={"profile_id": PID, "item_id": "sin", "confirmed": False}, headers=h)
    assert "confirm" in res.json()["text"]
    assert not any("checklist_progress (profile_id" in sql for sql, _ in pool.queries)
