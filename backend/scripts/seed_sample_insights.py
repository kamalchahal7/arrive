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
from app.services import pii

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


# Redesign analytics (docs/REDESIGN.md section 9): sample session events and survey answers.
SAMPLE_LANGUAGES = {"ar": 40, "prs": 25, "ps": 15, "ti": 12, "en": 5, "fr": 3}
SAMPLE_COUNTRIES = {"ar": "SY", "prs": "AF", "ps": "AF", "ti": "ER", "en": "SD", "fr": "CD"}
SAMPLE_PROGRAMS = {"linc": 30, "canada_child_benefit": 22, "healthy_smiles": 14, "earlyon": 10, "equipass": 9,
                   "odb": 6, "cdcp": 8, "child_care_subsidy": 7}
SAMPLE_ITEMS = {"sin": 0.8, "health_card": 0.75, "bank_account": 0.7, "school_registration": 0.55, "housing": 0.35,
                "ccb": 0.5, "language_assessment": 0.45, "tax_return": 0.2, "family_doctor": 0.25}
SAMPLE_MISSING = [
    "Help finding a family doctor who speaks my language", "Help finding a family doctor who speaks my language",
    "Reminders for appointments", "Reminders for appointments", "Reminders for appointments",
    "More information about jobs", "More information about jobs", "Show where the mosque and halal food are",
    "Explain winter clothing help", "Explain winter clothing help", "Translate letters from the school",
]


def build_events(rng: random.Random) -> tuple[list[tuple], list[tuple]]:
    now = datetime.now(timezone.utc)
    events: list[tuple] = []
    surveys: list[tuple] = []
    households = ["family_children", "family_children", "single_adult", "family_children_seniors", "adults_only"]
    for person in range(160):
        lang = pick(SAMPLE_LANGUAGES, rng)
        ref = f"sample{person:04d}"
        session = uuid.uuid4().hex
        start = now - timedelta(days=rng.randint(1, 80), hours=rng.randint(0, 23))
        consent = rng.random() < 0.6
        country = SAMPLE_COUNTRIES[lang] if consent else None
        house = rng.choice(households)
        row = lambda t, event, target: (t, session, ref, event, target, lang, country, house, "ottawa", True)  # noqa: E731
        for item, done_rate in SAMPLE_ITEMS.items():
            if rng.random() < 0.7:
                t = start + timedelta(hours=rng.randint(1, 72))
                events.append(row(t, "view_item", item))
                if rng.random() < done_rate:
                    events.append(row(t + timedelta(days=rng.randint(1, 20)), "item_done", item))
        for program, weight in SAMPLE_PROGRAMS.items():
            if rng.random() < weight / 40:
                t = start + timedelta(hours=rng.randint(1, 200))
                events.append(row(t, "view_program", program))
                if rng.random() < 0.6:
                    events.append(row(t, "program_interest", program))
        if rng.random() < 0.5:
            missing = rng.choice(SAMPLE_MISSING) if rng.random() < 0.5 else None
            surveys.append((start + timedelta(hours=2), session, ref, rng.choice([3, 4, 4, 5, 5, 2]), missing, lang, True))
    return [e for e in events if e[0] < now], surveys


async def refresh(conn: asyncpg.Connection) -> None:
    for view in ("program_interest_weekly", "item_activity_weekly"):
        try:
            await conn.execute(f"CALL refresh_continuous_aggregate('{view}', NULL, NULL)")
        except asyncpg.UndefinedTableError:
            pass  # migration 006 not applied yet
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
        await conn.execute("DELETE FROM session_events WHERE is_sample")
        await conn.execute("DELETE FROM survey_responses WHERE is_sample")
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
                h["household"], h["status_category"], h["contact_method"],
                # Sample numbers are fake (555), but are encrypted like real ones when a key is set.
                pii.encrypt_text(h["contact_value"]) if h["contact_value"] and pii.available() else h["contact_value"],
                h["preferred_time"],
                h["urgency"], deadline,
            )
        sample_events, sample_surveys = build_events(random.Random(7))
        await conn.copy_records_to_table(
            "session_events", records=sample_events,
            columns=["time", "session_id", "profile_ref", "event", "target_id", "language", "country_of_origin",
                     "household_type", "city", "is_sample"],
        )
        await conn.copy_records_to_table(
            "survey_responses", records=sample_surveys,
            columns=["time", "session_id", "profile_ref", "satisfaction", "missing_features", "language", "is_sample"],
        )
        await refresh(conn)
        print(f"Inserted {len(rows)} sample request_log rows, {len(SAMPLE_HANDOFFS)} sample handoffs, "
              f"{len(sample_events)} session events and {len(sample_surveys)} survey answers.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
