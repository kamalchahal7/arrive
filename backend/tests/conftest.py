import os

# Tests never touch real services: no database, no scheduler, fake keys.
os.environ["DATABASE_URL"] = ""
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["GEMINI_API_KEY"] = "test"
os.environ["VOICE_TOOL_SECRET"] = "test-secret"
os.environ["AUTH0_DOMAIN"] = "arrive-test.auth0.com"
os.environ["AUTH0_AUDIENCE"] = "https://api.arrive.test"
os.environ["INSIGHTS_MIN_GROUP_SIZE"] = "5"

from collections.abc import Callable  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

get_settings.cache_clear()
limiter.enabled = False


class FakeGemini:
    """Returns scripted results per task name and records every prompt it was sent."""

    def __init__(self, responses: dict[str, Any]):
        self.responses = responses
        self.calls: list[tuple[str, Any]] = []

    async def generate_json(self, task: str, contents: Any, schema: type, **_: Any) -> Any:
        self.calls.append((task, contents))
        value = self.responses[task]
        value = value(contents) if callable(value) else value
        return value if isinstance(value, schema) else schema.model_validate(value)

    async def generate_text(self, task: str, contents: Any, **_: Any) -> str:
        self.calls.append((task, contents))
        return self.responses[task]

    async def embed(self, texts: list[str], task_type: str, title: str | None = None) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]


@pytest.fixture
def fake_gemini(monkeypatch: pytest.MonkeyPatch) -> Callable[[dict[str, Any]], FakeGemini]:
    def install(responses: dict[str, Any]) -> FakeGemini:
        fake = FakeGemini(responses)
        monkeypatch.setattr("app.services.gemini.get_gemini", lambda: fake)
        return fake

    return install


class RecordingPool:
    """Minimal asyncpg.Pool stand-in that records every query and its arguments."""

    def __init__(self, fetchrow: Any = None, fetch: Any = None, fetchval: Any = None):
        self.queries: list[tuple[str, tuple[Any, ...]]] = []
        self._fetchrow = fetchrow
        self._fetch = fetch or []
        self._fetchval = fetchval

    async def fetchrow(self, sql: str, *args: Any) -> Any:
        self.queries.append((sql, args))
        return self._fetchrow(sql, args) if callable(self._fetchrow) else self._fetchrow

    async def fetch(self, sql: str, *args: Any) -> Any:
        self.queries.append((sql, args))
        return self._fetch(sql, args) if callable(self._fetch) else self._fetch

    async def fetchval(self, sql: str, *args: Any) -> Any:
        self.queries.append((sql, args))
        return self._fetchval(sql, args) if callable(self._fetchval) else self._fetchval

    async def execute(self, sql: str, *args: Any) -> str:
        self.queries.append((sql, args))
        return "UPDATE 1"

    def all_args_text(self) -> str:
        return " ".join(str(a) for _, args in self.queries for a in args)

    # pool.acquire() and conn.transaction() both hand back this recorder, so queries inside them are recorded too.
    def acquire(self) -> "_Passthrough":
        return _Passthrough(self)

    def transaction(self) -> "_Passthrough":
        return _Passthrough(self)


class _Passthrough:
    def __init__(self, target: Any) -> None:
        self.target = target

    async def __aenter__(self) -> Any:
        return self.target

    async def __aexit__(self, *exc: Any) -> None:
        return None
