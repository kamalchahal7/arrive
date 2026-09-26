from typing import Any

from app.services import insights
from tests.conftest import RecordingPool


def test_suppress_small_groups() -> None:
    assert insights.suppress(4) == "<5"
    assert insights.suppress(0) == "<5"
    assert insights.suppress(5) == 5


def test_rates_and_changes_need_enough_records() -> None:
    assert insights.rate(2, 4) is None
    assert insights.rate(3, 10) == 0.3
    assert insights.pct_change(10, 3) is None
    assert insights.pct_change(20, 10) == 100.0


async def test_overview_suppresses_every_small_group() -> None:
    def fetchrow(sql: str, args: Any) -> dict[str, int]:
        return {"this_week": 40, "last_week": 30, "answered": 30, "handed_off": 3, "scam_flags": 2}

    def fetch(sql: str, args: Any) -> list[dict[str, Any]]:
        if "GROUP BY topic" in sql:
            return [
                {"topic": "housing", "this_week": 25, "last_week": 8},
                {"topic": "citizenship", "this_week": 2, "last_week": 1},
            ]
        if "GROUP BY language" in sql:
            return [{"language": "ar", "n": 20}, {"language": "ti", "n": 3}]
        if "GROUP BY channel" in sql:
            return [{"channel": "web", "n": 36}, {"channel": "phone", "n": 4}]
        return []

    out = await insights.overview(RecordingPool(fetchrow=fetchrow, fetch=fetch, fetchval=True))
    assert out["has_sample_data"] is True
    assert out["cards"]["handoffs"] == "<5" and out["cards"]["scam_flags"] == "<5"
    assert out["cards"]["total_this_week"] == 40
    topics = {t["topic"]: t for t in out["top_topics"]}
    assert topics["housing"]["spike"] is True and topics["housing"]["change_pct"] == 212.5
    assert topics["citizenship"]["this_week"] == "<5" and topics["citizenship"]["change_pct"] is None
    assert {"language": "ti", "count": "<5"} in out["languages_this_week"]
    assert {"channel": "phone", "count": "<5"} in out["channel_mix"]


async def test_gap_examples_hidden_for_small_themes(fake_gemini) -> None:
    fake_gemini({"cluster_gaps": {"themes": [
        {"theme": "Refugee child health coverage", "members": [0, 1]},
        {"theme": "Rare question", "members": [2]},
    ]}})

    def fetch(sql: str, args: Any) -> list[dict[str, Any]]:
        return [
            {"gap_summary": "health card coverage for refugee children", "topic": "health_card", "n": 6},
            {"gap_summary": "IFHP dental coverage for children", "topic": "health_card", "n": 3},
            {"gap_summary": "very specific rare question", "topic": "other", "n": 1},
        ]

    out = await insights.knowledge_gaps(RecordingPool(fetch=fetch, fetchval=lambda s, a: None if "app_cache" in s else True))
    themes = {t["theme"]: t for t in out["themes"]}
    assert themes["Refugee child health coverage"]["count"] == 9
    assert themes["Rare question"]["count"] == "<5" and themes["Rare question"]["examples"] == []
