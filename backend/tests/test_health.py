from typing import Any

from fastapi.testclient import TestClient

from app.deps import db_pool
from app.main import create_app


class FakePool:
    def __init__(self, result: Any = 1, fail: bool = False) -> None:
        self.result = result
        self.fail = fail

    async def fetchval(self, query: str) -> Any:
        if self.fail:
            raise ConnectionError("db down")
        return self.result


def client_with(pool: Any) -> TestClient:
    app = create_app()
    app.dependency_overrides[db_pool] = lambda: pool
    return TestClient(app)


def test_health_ok() -> None:
    res = client_with(FakePool()).get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "db": "ok"}


def test_health_db_error() -> None:
    res = client_with(FakePool(fail=True)).get("/api/health")
    assert res.status_code == 503
    assert res.json()["db"] == "unavailable"


def test_health_no_pool() -> None:
    res = client_with(None).get("/api/health")
    assert res.status_code == 503
