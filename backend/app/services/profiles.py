"""Anonymous profiles. Newcomers see a readable ID (ARV-XXXX-XXXX-XXXX); the uuid primary key stays internal."""

import uuid
from typing import Any

import asyncpg

from app.errors import AppError
from app.services import pii, public_id

PROFILE_FIELDS = (
    "status", "arrival_date", "city", "province", "has_children", "has_seniors", "languages",
    "preferred_language", "needs",
    # Household profile (docs/REDESIGN.md). first_name is stored encrypted as first_name_enc.
    "first_name_enc", "city_name", "country_of_origin", "gender", "self_age_group", "adults", "seniors", "children_0_5",
    "children_6_17", "disability_adult", "disability_senior", "disability_child", "other_languages",
    "analytics_consent",
)
HOUSEHOLD_FIELDS = ("self_age_group", "adults", "seniors", "children_0_5", "children_6_17")
# Fields a person may clear by sending null (e.g. "prefer not to say"). Others ignore null.
NULLABLE_FIELDS = (
    "arrival_date", "has_children", "has_seniors", "first_name_enc", "city_name", "country_of_origin", "gender",
    "disability_adult", "disability_senior", "disability_child",
)


def _encrypt_name(data: dict[str, Any]) -> dict[str, Any]:
    """Swap a plain first_name for its encrypted form. Without an encryption key the name is not stored at all
    (it stays on the person's phone only)."""
    if "first_name" not in data:
        return data
    data = dict(data)
    name = data.pop("first_name")
    if not name:
        data["first_name_enc"] = None
    elif pii.available():
        data["first_name_enc"] = pii.encrypt(name)
    return data


def readable(row: Any) -> dict[str, Any]:
    """A profile row with the first name decrypted and the ciphertext removed."""
    p = dict(row)
    p["first_name"] = pii.decrypt(p.pop("first_name_enc", None))
    return p


def region_of(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "unknown"
    if profile.get("city") == "ottawa":
        return "ottawa"
    if profile.get("province") == "ontario":
        return "ontario_other"
    return "unknown"


def check_household(p: dict[str, Any]) -> None:
    """The person themself is one of the adults or seniors, so that group can't be empty."""
    adults, seniors = int(p.get("adults", 1)), int(p.get("seniors", 0))
    group = p.get("self_age_group", "adult")
    if adults + seniors < 1 or (group == "adult" and adults < 1) or (group == "senior" and seniors < 1):
        raise AppError("invalid_household", 422)


async def get_profile(pool: asyncpg.Pool, profile_id: uuid.UUID | str | None) -> dict[str, Any] | None:
    """Look up by readable ID (what newcomers have) or by the internal uuid (older profiles)."""
    if not profile_id:
        return None
    readable_id = public_id.normalize(str(profile_id))
    if readable_id:
        row = await pool.fetchrow("SELECT * FROM profiles WHERE public_id = $1", readable_id)
        return readable(row) if row else None
    try:
        pid = uuid.UUID(str(profile_id))
    except ValueError:
        return None
    row = await pool.fetchrow("SELECT * FROM profiles WHERE id = $1", pid)
    return readable(row) if row else None


async def create_profile(pool: asyncpg.Pool, data: dict[str, Any]) -> dict[str, Any]:
    data = _encrypt_name(data)
    if any(f in data for f in HOUSEHOLD_FIELDS):
        check_household({"adults": 1, "seniors": 0, "self_age_group": "adult", **data})
    cols = [f for f in PROFILE_FIELDS if f in data] + ["public_id"]
    placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
    sql = f"INSERT INTO profiles ({', '.join(cols)}) VALUES ({placeholders}) RETURNING *"
    values = [data[c] for c in cols[:-1]]
    for _ in range(5):
        try:
            row = await pool.fetchrow(sql, *values, public_id.generate())
            return readable(row)
        except asyncpg.UniqueViolationError:
            continue  # a readable ID collision is astronomically rare; just draw another
    raise AppError("internal_error", 500)


async def update_profile(pool: asyncpg.Pool, profile: dict[str, Any], data: dict[str, Any]) -> dict[str, Any] | None:
    data = _encrypt_name(data)
    data = {k: v for k, v in data.items() if v is not None or k in NULLABLE_FIELDS}
    cols = [f for f in PROFILE_FIELDS if f in data]
    if not cols:
        return profile
    if any(f in data for f in HOUSEHOLD_FIELDS):
        check_household({**profile, **data})
    sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
    row = await pool.fetchrow(
        f"UPDATE profiles SET {sets} WHERE id = $1 RETURNING *", profile["id"], *[data[c] for c in cols]
    )
    return readable(row) if row else None


async def touch(pool: asyncpg.Pool, profile: dict[str, Any]) -> None:
    await pool.execute("UPDATE profiles SET last_seen_at = now() WHERE id = $1", profile["id"])


async def delete_profile(pool: asyncpg.Pool, profile: dict[str, Any]) -> bool:
    # Cascades to roadmap steps, checklist progress and reminders.
    status = await pool.execute("DELETE FROM profiles WHERE id = $1", profile["id"])
    return status.endswith(" 1")
