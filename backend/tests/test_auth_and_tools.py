"""Staff endpoints reject missing/wrong roles; voice tools reject a missing or wrong secret."""

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import get_settings
from app.deps import require_db
from app.main import create_app
from tests.conftest import RecordingPool

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKS:
    class Key:
        key = PRIVATE_KEY.public_key()

    def get_signing_key_from_jwt(self, token: str) -> Any:
        return self.Key()


def make_token(roles: list[str] | None, key: Any = PRIVATE_KEY, audience: str | None = None, exp_in: int = 3600) -> str:
    s = get_settings()
    claims: dict[str, Any] = {
        "sub": "auth0|tester",
        "iss": f"https://{s.auth0_domain}/",
        "aud": audience or s.auth0_audience,
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_in,
    }
    if roles is not None:
        claims[s.auth0_roles_claim] = roles
    return jwt.encode(claims, key, algorithm="RS256")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(auth, "jwks_client", lambda domain: FakeJWKS())

    async def fake_list(pool: Any, status: str | None = None) -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr("app.services.handoff.list_handoffs", fake_list)
    app = create_app()
    app.dependency_overrides[require_db] = lambda: RecordingPool()
    return TestClient(app)


def test_worker_inbox_requires_token(client: TestClient) -> None:
    assert client.get("/api/worker/handoffs").status_code == 401


def test_worker_inbox_rejects_wrong_role(client: TestClient) -> None:
    res = client.get("/api/worker/handoffs", headers={"Authorization": f"Bearer {make_token(['gov_analyst'])}"})
    assert res.status_code == 403 and res.json() == {"error": "forbidden"}


def test_worker_inbox_rejects_no_roles(client: TestClient) -> None:
    res = client.get("/api/worker/handoffs", headers={"Authorization": f"Bearer {make_token(None)}"})
    assert res.status_code == 403


def test_worker_inbox_allows_worker(client: TestClient) -> None:
    res = client.get("/api/worker/handoffs", headers={"Authorization": f"Bearer {make_token(['settlement_worker'])}"})
    assert res.status_code == 200 and res.json() == []


def test_admin_passes_staff_checks(client: TestClient) -> None:
    res = client.get("/api/worker/handoffs", headers={"Authorization": f"Bearer {make_token(['admin'])}"})
    assert res.status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        make_token(["settlement_worker"], key=OTHER_KEY),  # bad signature
        make_token(["settlement_worker"], audience="https://someone-else"),  # wrong audience
        make_token(["settlement_worker"], exp_in=-60),  # expired
    ],
)
def test_worker_inbox_rejects_invalid_tokens(client: TestClient, token: str) -> None:
    assert client.get("/api/worker/handoffs", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_insights_rejects_worker_role(client: TestClient) -> None:
    res = client.get("/api/insights/overview", headers={"Authorization": f"Bearer {make_token(['settlement_worker'])}"})
    assert res.status_code == 403


def test_admin_ingest_requires_admin(client: TestClient) -> None:
    res = client.post("/api/admin/ingest", headers={"Authorization": f"Bearer {make_token(['gov_analyst'])}"})
    assert res.status_code == 403


@pytest.mark.parametrize("path", ["/api/voice/tools/ask", "/api/voice/tools/roadmap", "/api/voice/tools/handoff",
                                  "/api/voice/tools/scam-check"])
def test_voice_tools_reject_missing_secret(client: TestClient, path: str) -> None:
    assert client.post(path, json={}).status_code == 401


def test_voice_tools_reject_wrong_secret(client: TestClient) -> None:
    res = client.post("/api/voice/tools/ask", json={"question": "hello"}, headers={"X-Arrive-Secret": "nope"})
    assert res.status_code == 401


def test_voice_tool_accepts_right_secret(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.ask import AskResult

    async def fake_ask(pool: Any, question: str, **kw: Any) -> AskResult:
        assert kw["channel"] == "voice_web" and kw["style"] == "voice"
        return AskResult(request_id=None, status="answered", language="en", topic="sin", urgency="normal",
                         emergency=False, possible_scam=False, answer="You can apply online.")

    monkeypatch.setattr("app.routers.voice.ask", fake_ask)
    res = client.post("/api/voice/tools/ask", json={"question": "How do I get a SIN?", "channel": "voice_web"},
                      headers={"X-Arrive-Secret": "test-secret"})
    assert res.status_code == 200 and res.json()["text"] == "You can apply online."


def test_handoff_requires_consent(client: TestClient) -> None:
    res = client.post("/api/handoffs", json={"need": "help with rent", "contact_method": "phone",
                                             "contact_value": "613", "consent": False})
    assert res.status_code == 422 and res.json()["error"] == "consent_required"


def test_validation_errors_do_not_echo_input(client: TestClient) -> None:
    res = client.post("/api/ask", json={"question": "x" * 5000})
    assert res.status_code == 422
    assert "xxxx" not in res.text
