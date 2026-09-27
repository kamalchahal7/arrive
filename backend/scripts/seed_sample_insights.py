"""Seed about 8 weeks of realistic, synthetic request_log rows (is_sample = true) and 4 sample handoffs.

Usage (from backend/):
    python -m scripts.seed_sample_insights           # add sample data
    python -m scripts.seed_sample_insights --clear   # remove all sample data

All rows are synthetic. The dashboard shows a "Sample data" badge while any sample row exists.
"""

import argparse
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg

from app.config import get_settings
from app.db.pool import connect

WEEKS = 8
SEED = 42

TOPIC_WEIGHTS = {
    "health_card": 14, "housing": 12, "sin": 8, "taxes_benefits": 9, "child_benefit": 7, "banking": 6,
    "school_registration": 6, "language_classes": 7, "employment": 9, "credentials": 4, "drivers_licence": 4,
    "transit": 3, "immigration_status": 6, "work_permit": 4, "study_permit": 5, "sponsorship": 4,
    "citizenship": 2, "legal_rights": 3, "scams": 4, "other": 3,
}
LANGUAGE_WEIGHTS = {"ar": 30, "en": 14, "fr": 9, "fa": 12, "ti": 8, "es": 10, "uk": 10, "so": 4, "zh": 3}
CHANNEL_WEIGHTS = {"web": 70, "voice_web": 30}
STATUS_WEIGHTS = {"refugee_pr": 55, "international_student": 30, "unknown": 15}
# Generic, de-identified gap descriptions (what a real gap_summary looks like).
GAPS = {
    "housing": ["paying first and last month rent upfront", "landlord asking for many months of rent in advance",
                "finding subsidized housing waitlist in Ottawa", "rent deposit rules for newcomers without credit"],
    "health_card": ["health card coverage for refugee children", "dental coverage under interim federal health",
                    "eye exam coverage for seniors without OHIP yet"],
    "taxes_benefits": ["filing taxes with no income in first year", "benefits for sponsored seniors"],
    "employment": ["foreign engineering degree recognition steps", "working while waiting for a work permit"],
    "study_permit": ["changing schools on a study permit", "working more hours during school breaks"],
    "child_benefit": ["child benefit when one parent is still abroad"],
    "other": ["off-topic question"],
}
SAMPLE_HANDOFFS = [
    dict(language="ar", topic="sponsorship", urgency="normal", status_category="refugee_pr",
         summary="Wants to know how to sponsor her brother who is still in Lebanon. Asked if her own status affects it.",
         summary_native="تريد أن تعرف كيف تكفل أخاها الموجود في لبنان، وهل يؤثر وضعها على ذلك.",
         already_done="Read the family sponsorship page on canada.ca.", household="Family with children",
         contact_method="whatsapp", contact_value="(613) 555-0142", preferred_time="Weekday mornings", hours_ago=26),
    dict(language="ti", topic="housing", urgency="high", status_category="refugee_pr",
         summary="Landlord is asking for three months of rent upfront. Needs to move by the end of the month.",
         summary_native=None,  # no reliable Tigrinya translation available; worker sees the English note
         already_done="Called two apartments on the list from the resettlement agency.", household="Family with children",
         contact_method="phone", contact_value="(613) 555-0178", preferred_time="After 3 pm", hours_ago=5, deadline_days=9),
    dict(language="es", topic="work_permit", urgency="high", status_category="international_student",
         summary="Study permit and work permit expire next month. Unsure which application applies after graduation.",
         summary_native="Su permiso de estudio y de trabajo vencen el próximo mes. No sabe qué solicitud aplica.",
         already_done=None, household=None,
         contact_method="email", contact_value="student.sample@example.com", preferred_time="Evenings", hours_ago=50,
         deadline_days=28),
    dict(language="fa", topic="health_card", urgency="normal", status_category="refugee_pr",
         summary="Senior family member needs help booking a ServiceOntario appointment for a health card.",
         summary_native="یکی از اعضای مسن خانواده برای گرفتن وقت کارت سلامت کمک می‌خواهد.",
         already_done="Has the permanent resident confirmation document.", household="Family with seniors",
         contact_method="in_person", contact_value=None, preferred_time="Any weekday", hours_ago=75),
]


def pick(weights: dict[str, int], rng: random.Random) -> str:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def build_rows(source_ids_by_topic: dict[str, list[int]], confusing_source: int | None) -> list[tuple]:
    rng = random.Random(SEED)
    now = datetime.now(timezone.utc)
    rows = []
    for day in range(WEEKS * 7, 0, -1):
        date = now - timedelta(days=day)
        weeks_ago = day // 7
        base = 55 + (WEEKS - weeks_ago) * 6  # slow growth as word spreads
        weekday_factor = 0.7 if date.weekday() >= 5 else 1.0
        n = int(rng.gauss(base * weekday_factor, 6))
        for _ in range(max(n, 10)):
            topic = pick(TOPIC_WEIGHTS, rng)
            if day <= 7 and rng.random() < 0.18:
                topic = "housing"  # the visible spike: rent-upfront questions in the last week
            answered = rng.random() < (0.55 if topic in ("housing", "sponsorship") else 0.8)
            handed_off = (not answered and rng.random() < 0.3) or rng.random() < 0.03
            scam = topic == "scams" and rng.random() < 0.6
            clarity = None
            ids: list[int] = []
            if answered:
                pool = source_ids_by_topic.get(topic) or []
                ids = rng.sample(pool, k=min(len(pool), rng.randint(1, 2))) if pool else []
                if rng.random() < 0.3:
                    unclear_odds = 0.55 if confusing_source in ids else 0.15
                    clarity = -1 if rng.random() < unclear_odds else 1
            gap = None
            if not answered and rng.random() < 0.7:
                options = GAPS.get(topic) or GAPS["other"]
                if topic == "housing" and day <= 7:
                    options = GAPS["housing"][:2]
                gap = rng.choice(options)
            ts = date.replace(hour=rng.randint(7, 22), minute=rng.randint(0, 59), second=rng.randint(0, 59))
            rows.append((
                ts, uuid.uuid4(), pick(CHANNEL_WEIGHTS, rng), "ask", pick(LANGUAGE_WEIGHTS, rng), topic,
                pick(STATUS_WEIGHTS, rng), "ottawa" if rng.random() < 0.86 else "ontario_other",
                answered, handed_off, scam, clarity, ids, gap, True,
            ))
    return rows


async def refresh(conn: asyncpg.Connection) -> None:
    for view in ("request_log_daily", "request_log_weekly"):
        await conn.execute(f"CALL refresh_continuous_aggregate('{view}', NULL, NULL)")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clear", action="store_true", help="remove all sample rows and sample handoffs")
    args = parser.parse_args()
    s = get_settings()
    conn = await connect(s)
    try:
        await conn.execute("DELETE FROM request_log WHERE is_sample")
        await conn.execute("DELETE FROM handoffs WHERE is_sample")
        await conn.execute("DELETE FROM app_cache WHERE key LIKE 'gaps:%'")
        if args.clear:
            await refresh(conn)
            print("Sample data removed.")
            return

        sources = await conn.fetch("SELECT id, topics, url FROM sources WHERE active")
        by_topic: dict[str, list[int]] = {}
        for r in sources:
            for t in r["topics"] or []:
                by_topic.setdefault(t, []).append(r["id"])
        confusing = next((r["id"] for r in sources if "ohip" in r["url"].lower()), sources[0]["id"] if sources else None)

        rows = build_rows(by_topic, confusing)
        await conn.copy_records_to_table(
            "request_log",
            records=rows,
            columns=["time", "id", "channel", "kind", "language", "topic", "status_category", "region", "answered",
                     "handed_off", "scam_flag", "clarity", "source_ids", "gap_summary", "is_sample"],
        )
        now = datetime.now(timezone.utc)
        for h in SAMPLE_HANDOFFS:
            created = now - timedelta(hours=h["hours_ago"])
            deadline = (now + timedelta(days=h["deadline_days"])).date() if h.get("deadline_days") else None
            await conn.execute(
                """INSERT INTO handoffs (created_at, updated_at, language, topic, summary, summary_native, already_done,
                       household, status_category, contact_method, contact_value, preferred_time, consent, urgency,
                       deadline, channel, is_sample)
                   VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, 'web', true)""",
                created, h["language"], h["topic"], h["summary"], h["summary_native"], h["already_done"],
                h["household"], h["status_category"], h["contact_method"], h["contact_value"], h["preferred_time"],
                h["urgency"], deadline,
            )
        await refresh(conn)
        print(f"Inserted {len(rows)} sample request_log rows and {len(SAMPLE_HANDOFFS)} sample handoffs.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
