import uuid
from datetime import datetime, timezone
from typing import Any

import pytest

from app.services import ask as ask_module
from app.services.answer import generate_answer
from app.services.retrieval import Passage
from tests.conftest import RecordingPool


def passage(chunk_id: int, source_id: int = 1) -> Passage:
    return Passage(
        chunk_id=chunk_id, source_id=source_id, text="OHIP pays for many health services.", heading_path="Who qualifies",
        title="Apply for OHIP and get a health card", url="https://www.ontario.ca/page/apply-ohip-and-get-health-card",
        jurisdiction="ontario", last_fetched_at=datetime.now(timezone.utc), similarity=0.8,
    )


def classification(**overrides: Any) -> dict[str, Any]:
    base = {
        "language": "en", "topic": "health_card", "is_case_specific": False, "case_specific_reason": None,
        "urgency": "normal", "possible_scam": False, "search_query_en": "apply for Ontario health card",
    }
    return {**base, **overrides}


def log_pool() -> RecordingPool:
    return RecordingPool(fetchrow=lambda sql, args: {"id": uuid.uuid4(), "time": datetime.now(timezone.utc)})


# ---------- answer service ----------

async def test_answer_not_found_when_model_says_so(fake_gemini) -> None:
    fake_gemini({"answer": {"not_found": True, "answer": "", "citations": []}})
    res = await generate_answer("What is the weather?", [passage(11)], "en")
    assert res.found is False


async def test_answer_drops_invalid_citations(fake_gemini) -> None:
    fake_gemini({"answer": {"not_found": False, "answer": "Apply at ServiceOntario.", "citations": [11, 999]}})
    res = await generate_answer("How do I get a health card?", [passage(11), passage(12)], "en")
    assert res.found is True
    assert [p.chunk_id for p in res.cited] == [11]


async def test_answer_with_only_invalid_citations_is_not_found(fake_gemini) -> None:
    fake_gemini({"answer": {"not_found": False, "answer": "Made-up answer.", "citations": [999]}})
    res = await generate_answer("How do I get a health card?", [passage(11)], "en")
    assert res.found is False


async def test_answer_with_no_passages_never_calls_model(fake_gemini) -> None:
    fake = fake_gemini({})
    res = await generate_answer("anything", [], "en")
    assert res.found is False and fake.calls == []


# ---------- ask pipeline routing ----------

@pytest.fixture
def no_search(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    called: list[str] = []

    async def fake_search(pool: Any, query: str, **_: Any) -> list[Passage]:
        called.append(query)
        return []

    monkeypatch.setattr(ask_module, "search", fake_search)
    return called


async def test_case_specific_question_goes_to_handoff(fake_gemini, no_search) -> None:
    fake_gemini({"classify": classification(topic="sponsorship", is_case_specific=True, case_specific_reason="own case")})
    res = await ask_module.ask(log_pool(), "Should I sponsor my brother or wait until I am a citizen?")
    assert res.status == "handoff_suggested"
    assert res.handoff_suggested and res.handoff_reason == "case_specific"
    assert res.answer is None
    assert no_search == []  # never tries to answer a personal immigration decision


async def test_emergency_tells_person_to_call_911(fake_gemini, no_search) -> None:
    fake_gemini({"classify": classification(urgency="emergency", topic="emergency")})
    res = await ask_module.ask(log_pool(), "Someone is hurting me at home")
    assert res.emergency and "911" in (res.emergency_message or "")


async def test_unrelated_question_is_not_found(fake_gemini, no_search, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_gemini({"classify": classification(topic="other"), "gap_summary": {"summary": "off-topic question"}})
    spawned: list[Any] = []
    monkeypatch.setattr(ask_module, "_spawn", lambda coro: (spawned.append(coro), coro.close()))
    res = await ask_module.ask(log_pool(), "Who won the hockey game last night?")
    assert res.status == "not_found" and res.handoff_suggested
    assert len(spawned) == 1  # gap summary recorded in the background


# ---------- privacy of the request log ----------

async def test_request_log_never_stores_question_or_pii(fake_gemini, monkeypatch: pytest.MonkeyPatch) -> None:
    question = "My name is Amira Haddad, call me at 613-555-0199 or amira.h@example.com about my health card"
    fake_gemini({
        "classify": classification(),
        "answer": {"not_found": False, "answer": "Apply at ServiceOntario.", "citations": [11]},
    })

    async def fake_search(pool: Any, query: str, **_: Any) -> list[Passage]:
        return [passage(11)]

    monkeypatch.setattr(ask_module, "search", fake_search)
    pool = log_pool()
    res = await ask_module.ask(pool, question)
    assert res.status == "answered"
    logged = pool.all_args_text()
    for secret in ("Amira", "Haddad", "613-555-0199", "amira.h@example.com", question):
        assert secret not in logged
    insert_sql = [sql for sql, _ in pool.queries if "INSERT INTO request_log" in sql]
    assert len(insert_sql) == 1


async def test_gap_summary_is_scrubbed_after_the_model(fake_gemini) -> None:
    from app.services.request_log import LogRef, record_gap

    # Even if the model leaks details, the regex layer removes them before storage.
    fake_gemini({"gap_summary": {"summary": "call 613-555-0199 or amira@example.com about SIN 123 456 789"}})
    pool = RecordingPool()
    await record_gap(pool, LogRef(uuid.uuid4(), datetime.now(timezone.utc)), "question", "sin")
    stored = pool.all_args_text()
    assert "613-555-0199" not in stored and "amira@example.com" not in stored and "123 456 789" not in stored
