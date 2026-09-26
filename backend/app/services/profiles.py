"""Anonymous profiles. The id is an unguessable uuid kept on the person's device."""

import uuid
from typing import Any

import asyncpg

PROFILE_FIELDS = (
    "status", "arrival_date", "city", "province", "has_children", "has_seniors", "languages",
    "preferred_language", "needs",
)


def region_of(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "unknown"
    if profile.get("city") == "ottawa":
        return "ottawa"
    if profile.get("province") == "ontario":
        return "ontario_other"
    return "unknown"


async def get_profile(pool: asyncpg.Pool, profile_id: uuid.UUID | str | None) -> dict[str, Any] | None:
    if not profile_id:
        return None
    try:
        pid = uuid.UUID(str(profile_id))
    except ValueError:
        return None
    row = await pool.fetchrow("SELECT * FROM profiles WHERE id = $1", pid)
    return dict(row) if row else None


async def create_profile(pool: asyncpg.Pool, data: dict[str, Any]) -> dict[str, Any]:
    cols = [f for f in PROFILE_FIELDS if f in data]
    placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
    sql = (
        f"INSERT INTO profiles ({', '.join(cols)}) VALUES ({placeholders}) RETURNING *"
        if cols
        else "INSERT INTO profiles DEFAULT VALUES RETURNING *"
    )
    row = await pool.fetchrow(sql, *[data[c] for c in cols])
    return dict(row)


async def update_profile(pool: asyncpg.Pool, profile_id: uuid.UUID, data: dict[str, Any]) -> dict[str, Any] | None:
    cols = [f for f in PROFILE_FIELDS if f in data]
    if not cols:
        return await get_profile(pool, profile_id)
    sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
    row = await pool.fetchrow(f"UPDATE profiles SET {sets} WHERE id = $1 RETURNING *", profile_id, *[data[c] for c in cols])
    return dict(row) if row else None


async def delete_profile(pool: asyncpg.Pool, profile_id: uuid.UUID) -> bool:
    status = await pool.execute("DELETE FROM profiles WHERE id = $1", profile_id)
    return status.endswith(" 1")
