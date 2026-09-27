"""Voice onboarding answers, speech support per language, PII encryption of names and handoff contacts."""

import uuid
from typing import Any

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import get_settings
from app.deps import require_db
from app.main import create_app
from app.services import onboarding, pii, profiles, speech, tts
from tests.conftest import RecordingPool

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 2000  # EBML header, then padding: enough to pass the audio sniff


@pytest.fixture
def pii_key(monkeypatch: pytest.MonkeyPatch) -> str:
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("PII_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    pii._fernet.cache_clear()
    yield key
    get_settings.cache_clear()
    pii._fernet.cache_clear()


@pytest.fixture
def no_pii_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PII_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    pii._fernet.cache_clear()
    yield
    get_settings.cache_clear()
    pii._fernet.cache_clear()


@pytest.fixture
def stt(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, str, str]]:
    """Fake speech-to-text: records (audio size, type, language) and returns a fixed transcript."""
    calls: list[tuple[int, str, str]] = []

    async def fake(audio: bytes, content_type: str, language: str) -> str:
        calls.append((len(audio), content_type, language))
        return "I came with my wife and our two children, they are 3 and 9"

    monkeypatch.setattr(speech, "transcribe", fake)
    return calls


def client() -> TestClient:
    return TestClient(create_app())


def answer(**overrides: Any) -> dict[str, Any]:
    base = {"understood": True, "declined": False, "confirmation": "You came with your wife and 2 children. Is that right?"}
    return {**base, **overrides}


# ---------- POST /api/onboarding/answer ----------

def test_voice_answer_is_transcribed_and_understood(fake_gemini, stt) -> None:
    fake = fake_gemini({"onboarding_answer": answer(other_adults_18_64=1, children_0_5=1, children_6_17=1)})
    res = client().post(
        "/api/onboarding/answer",
        data={"question_key": "household", "language": "ar"},
        files={"audio": ("a.webm", WEBM, "audio/webm;codecs=opus")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["understood"] and not body["declined"]
    assert body["value"] == {"other_adults": 1, "other_seniors": 0, "children_0_5": 1, "children_6_17": 1, "children_age_unknown": 0}
    assert body["heard"].startswith("I came with")
    # The sniffed type is sent, not the browser's label; the question and language reach the prompt.
    assert stt == [(len(WEBM), "audio/webm", "ar")]
    prompt = fake.calls[0][1]
    assert "Who arrived in Canada with you?" in prompt and "Arabic" in prompt and "I came with my wife" in prompt


def test_typed_answer_needs_no_audio(fake_gemini, stt) -> None:
    fake_gemini({"onboarding_answer": answer(first_name="  Amira. ")})
    res = client().post("/api/onboarding/answer", data={"question_key": "first_name", "language": "en", "text": "Amira"})
    assert res.status_code == 200
    assert res.json()["value"] == {"first_name": "Amira"}
    assert stt == []


def test_answer_needs_audio_or_text() -> None:
    res = client().post("/api/onboarding/answer", data={"question_key": "city", "language": "en"})
    assert res.status_code == 422 and res.json()["error"] == "answer_required"


def test_unknown_question_is_rejected() -> None:
    res = client().post("/api/onboarding/answer", data={"question_key": "passport_number", "text": "x"})
    assert res.status_code == 422


def test_non_audio_upload_is_rejected(stt) -> None:
    res = client().post(
        "/api/onboarding/answer", data={"question_key": "city"}, files={"audio": ("a.webm", b"<html>" * 200, "audio/webm")}
    )
    assert res.status_code == 415 and stt == []


def test_language_without_speech_to_text_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.setenv("ELEVENLABS_STT_MODEL", "m")
    get_settings.cache_clear()
    try:
        res = client().post(
            "/api/onboarding/answer", data={"question_key": "city", "language": "ti"}, files={"audio": ("a.webm", WEBM, "audio/webm")}
        )
    finally:
        get_settings.cache_clear()
    assert res.status_code == 422 and res.json()["error"] == "stt_unsupported_language"


def test_onboarding_answer_never_touches_the_database(fake_gemini, stt) -> None:
    fake_gemini({"onboarding_answer": answer(lives_in_ottawa=True)})
    pool = RecordingPool()
    app = create_app()
    app.dependency_overrides[require_db] = lambda: pool
    res = TestClient(app).post(
        "/api/onboarding/answer", data={"question_key": "city", "language": "en"}, files={"audio": ("a.webm", WEBM, "audio/webm")}
    )
    assert res.status_code == 200
    assert res.json()["value"] == {"city": "ottawa", "city_name": None, "province": "ontario"}
    assert pool.queries == []  # no audio, no transcript, nothing stored


def test_not_understood_uses_the_fixed_message(fake_gemini) -> None:
    fake_gemini({"onboarding_answer": answer(understood=False, confirmation="whatever")})
    res = client().post("/api/onboarding/answer", data={"question_key": "self_age", "language": "en", "text": "banana"})
    body = res.json()
    assert not body["understood"] and body["value"] == {}
    assert body["confirmation"].startswith("Sorry, I did not understand")


# ---------- validating what Gemini returns ----------

@pytest.mark.parametrize(
    ("key", "fields", "value", "ok"),
    [
        ("city", {"lives_in_ottawa": False, "city_name": "Toronto"}, {"city": "other", "city_name": "Toronto"}, True),
        ("province", {"in_ontario": True}, {"province": "ontario"}, True),
        ("province", {"in_ontario": None}, {}, False),
        ("country_of_origin", {"country_code": "sy"}, {"country_of_origin": "SY"}, True),
        ("country_of_origin", {"country_code": "ZZ"}, {}, False),  # not a real country: not understood
        ("gender", {"gender": "woman"}, {"gender": "woman"}, True),
        ("self_age", {"is_65_or_older": True}, {"self_age_group": "senior"}, True),
        ("self_age", {"is_65_or_older": False}, {"self_age_group": "adult"}, True),
        ("disability", {"nobody": True}, {"disability_adult": False, "disability_senior": False, "disability_child": False}, True),
        ("disability", {"senior": True}, {"disability_adult": False, "disability_senior": True, "disability_child": False}, True),
        ("disability", {}, {}, False),
        ("languages_spoken", {"languages": ["en", "ar", "fa", "en"]}, {"other_languages": ["en", "fa"]}, True),
    ],
)
def test_values_are_validated(key: str, fields: dict[str, Any], value: dict[str, Any], ok: bool) -> None:
    parsed = onboarding.QUESTIONS[key].schema.model_validate(answer(**fields))
    assert onboarding.to_value(key, parsed, "ar") == (value, ok)


def test_household_counts_are_clamped() -> None:
    parsed = onboarding.QUESTIONS["household"].schema.model_validate(answer(other_adults_18_64=500, children_0_5=-3))
    value, ok = onboarding.to_value("household", parsed, "en")
    assert ok and value["other_adults"] == 20 and value["children_0_5"] == 0


async def test_declining_an_optional_question(fake_gemini) -> None:
    fake_gemini({"onboarding_answer": answer(declined=True, confirmation="That is fine.")})
    r = await onboarding.understand("gender", "I'd rather not say", "en")
    assert r.understood and r.declined and r.value == {"gender": "prefer_not_to_say"}
    r = await onboarding.understand("disability", "private", "en")
    assert r.value == {"disability_adult": None, "disability_senior": None, "disability_child": None}


async def test_declining_a_required_question_is_not_an_answer(fake_gemini) -> None:
    fake_gemini({"onboarding_answer": answer(declined=True)})
    r = await onboarding.understand("household", "skip", "en")
    assert not r.understood and r.value == {}


def test_every_question_has_a_schema_and_meaning() -> None:
    assert set(onboarding.QUESTIONS) == set(onboarding.QuestionKey.__args__)  # type: ignore[attr-defined]
    assert len(onboarding.COUNTRY_CODES) == 250


# ---------- speech support per language ----------

def test_speech_table_matches_the_docs() -> None:
    assert {k: v.stt_code for k, v in speech.SPEECH.items()} == {
        "en": "eng", "fr": "fra", "ar": "ara", "ps": "pus", "prs": None, "ti": None,
    }
    assert speech.SPEECH["ps"].tts == "extended" and speech.SPEECH["ti"].tts is None


def test_sniff_audio() -> None:
    assert speech.sniff_audio(WEBM) == "audio/webm"
    assert speech.sniff_audio(b"OggS" + b"\x00" * 20) == "audio/ogg"
    assert speech.sniff_audio(b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 20) == "audio/mp4"
    assert speech.sniff_audio(b"RIFF\x00\x00\x00\x00WAVEfmt ") == "audio/wav"
    assert speech.sniff_audio(b"%PDF-1.7" + b"\x00" * 20) is None


async def test_tts_picks_the_model_by_language(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "default-model")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL_EXTENDED", "")
    get_settings.cache_clear()
    try:
        assert speech.tts_model_for("ar") == "default-model"
        assert speech.tts_model_for("ps") is None  # no extended model configured: no Pashto read-aloud
        assert speech.tts_model_for("es") == "default-model"  # older app languages keep the default
        with pytest.raises(tts.TTSError, match="tts_unsupported_language"):
            await tts.synthesize(None, "ሰላም", "ti")
    finally:
        get_settings.cache_clear()


def test_tts_endpoint_reports_unsupported_language() -> None:
    res = client().post("/api/tts", json={"text": "ሰላም", "language": "ti"})
    assert res.status_code == 422 and res.json()["error"] == "tts_unsupported_language"


# ---------- encryption at rest ----------

def test_pii_round_trip_and_rotation(pii_key: str, monkeypatch: pytest.MonkeyPatch) -> None:
    token = pii.encrypt("Amira")
    assert b"Amira" not in token and pii.decrypt(token) == "Amira"
    # Rotate: a new key first, the old one still decrypts.
    monkeypatch.setenv("PII_ENCRYPTION_KEY", f"{Fernet.generate_key().decode()},{pii_key}")
    get_settings.cache_clear()
    pii._fernet.cache_clear()
    assert pii.decrypt(token) == "Amira"
    assert pii.decrypt_text("(613) 555-0100") == "(613) 555-0100"  # rows from before encryption


def test_no_key_means_nothing_is_encrypted(no_pii_key: None) -> None:
    assert not pii.available()
    with pytest.raises(pii.PIIUnavailable):
        pii.encrypt("Amira")


def _profile_pool() -> RecordingPool:
    def fetchrow(sql: str, args: Any) -> dict[str, Any] | None:
        if sql.startswith("INSERT INTO profiles") or sql.startswith("UPDATE profiles"):
            cols = sql.split("(")[1].split(")")[0].split(", ") if sql.startswith("INSERT") else []
            row = {"id": uuid.uuid4(), "public_id": args[-1] if sql.startswith("INSERT") else "ARV-AAAA-BBBB-CCCC"}
            row.update(dict(zip(cols, args, strict=False)))
            return row
        return None

    return RecordingPool(fetchrow=fetchrow)


async def test_first_name_is_stored_encrypted(pii_key: str) -> None:
    pool = _profile_pool()
    created = await profiles.create_profile(pool, {"first_name": "Amira", "adults": 1})
    assert "Amira" not in pool.all_args_text()
    assert created["first_name"] == "Amira" and "first_name_enc" not in created
    sql, args = pool.queries[0]
    assert "first_name_enc" in sql and "first_name," not in sql


async def test_first_name_is_dropped_without_a_key(no_pii_key: None) -> None:
    pool = _profile_pool()
    created = await profiles.create_profile(pool, {"first_name": "Amira", "adults": 1})
    assert "Amira" not in pool.all_args_text() and "first_name_enc" not in pool.queries[0][0]
    assert created["first_name"] is None


def test_profile_api_returns_the_first_name(pii_key: str) -> None:
    token = pii.encrypt("Amira")
    row = {"id": uuid.uuid4(), "public_id": "ARV-7K3P-9QXM-2D4F", "first_name_enc": token, "status": "unknown",
           "arrival_date": None, "city": "ottawa", "province": "ontario", "has_children": None, "has_seniors": None,
           "languages": [], "preferred_language": "ar", "needs": [], "created_at": "2026-09-26T10:00:00Z"}
    pool = RecordingPool(fetchrow=lambda sql, args: row)
    app = create_app()
    app.dependency_overrides[require_db] = lambda: pool
    body = TestClient(app).get("/api/profile/ARV-7K3P-9QXM-2D4F").json()
    assert body["first_name"] == "Amira" and "first_name_enc" not in body


async def test_handoff_contact_is_encrypted(pii_key: str, fake_gemini) -> None:
    from app.services import handoff

    fake_gemini({
        "classify": {"language": "en", "topic": "housing", "is_case_specific": False, "urgency": "normal",
                     "possible_scam": False, "search_query_en": "housing help"},
        "handoff_summary": {"summary_en": "Needs help with housing.", "summary_native": "Needs help with housing."},
    })
    pool = RecordingPool(fetchrow=lambda sql, args: {"id": uuid.uuid4()} if "INSERT INTO handoffs" in sql else None)
    await handoff.create_handoff(
        pool, need="I need housing help", language="en", contact_method="phone", contact_value="613-555-0142",
        preferred_time=None, consent=True,
    )
    insert = next(args for sql, args in pool.queries if "INSERT INTO handoffs" in sql)
    stored = insert[8]
    assert "613-555-0142" not in pool.all_args_text()
    assert stored.startswith(pii.TOKEN_PREFIX) and pii.decrypt_text(stored) == "613-555-0142"


async def test_handoff_with_contact_refuses_without_a_key(no_pii_key: None) -> None:
    from app.services import handoff

    with pytest.raises(pii.PIIUnavailable):
        await handoff.create_handoff(
            RecordingPool(), need="help", language="en", contact_method="phone", contact_value="613-555-0142",
            preferred_time=None, consent=True,
        )


def test_readable_ids_work_on_older_endpoints(fake_gemini) -> None:
    # The device now stores ARV-... ids; ask/scam/handoff must accept them instead of failing uuid validation.
    res = client().post("/api/ask", json={"question": "hi there", "profile_id": "ARV-7K3P-9QXM-2D4F"})
    assert res.status_code != 422
