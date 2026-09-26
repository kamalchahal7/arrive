"""Fetch official pages, detect changes, chunk, embed with Gemini, and store in Tiger Data.

CLI:   cd ingestion && python ingest.py [--only URL_SUBSTRING] [--check-urls]
Also called by the backend scheduler (daily) and POST /api/admin/ingest.
"""

import argparse
import asyncio
import hashlib
import logging
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import yaml

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.services.embeddings import embed_documents, to_pgvector  # noqa: E402

try:  # works both as `python ingest.py` and as `ingestion.ingest`
    from ingestion.chunker import chunk, extract, page_text  # noqa: E402
except ImportError:
    from chunker import chunk, extract, page_text  # type: ignore[no-redef]  # noqa: E402

logger = logging.getLogger("arrive.ingest")

SOURCES_FILE = Path(__file__).resolve().parent / "sources.yaml"
USER_AGENT = "ArriveBot/0.1 (civic hackathon project; reads official pages for newcomers)"
REQUEST_INTERVAL = 1.0  # polite: one request per second


@dataclass
class Report:
    fetched: int = 0
    unchanged: int = 0
    changed: int = 0
    new: int = 0
    chunks_written: int = 0
    failed: list[dict[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()

    def print(self) -> None:
        print(f"Pages fetched: {self.fetched}  new: {self.new}  changed: {self.changed}  unchanged: {self.unchanged}")
        print(f"Chunks written: {self.chunks_written}")
        print(f"Failed: {len(self.failed)}")
        for f in self.failed:
            print(f"  FAILED {f['url']}  ({f['error']})")


def load_sources(path: Path = SOURCES_FILE) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return [s for s in data.get("sources", []) if s and s.get("url", "").startswith("http")]


async def fetch(client: httpx.AsyncClient, url: str, attempts: int = 3) -> str:
    delay = 2.0
    for attempt in range(1, attempts + 1):
        try:
            res = await client.get(url)
            if res.status_code in (429, 500, 502, 503, 504) and attempt < attempts:
                raise httpx.HTTPStatusError("retryable", request=res.request, response=res)
            res.raise_for_status()
            return res.text
        except (httpx.TransportError, httpx.HTTPStatusError):
            if attempt == attempts:
                raise
            await asyncio.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8"},
        timeout=httpx.Timeout(20.0),
        follow_redirects=True,
    )


async def upsert_sources(conn: Any, sources: list[dict[str, Any]]) -> dict[str, int]:
    ids: dict[str, int] = {}
    for s in sources:
        row = await conn.fetchrow(
            """INSERT INTO sources (url, title, jurisdiction, language, topics, active)
               VALUES ($1, $2, $3, $4, $5, true)
               ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, jurisdiction = EXCLUDED.jurisdiction,
                   language = EXCLUDED.language, topics = EXCLUDED.topics, active = true
               RETURNING id""",
            s["url"], s.get("title") or s["url"], s["jurisdiction"], s.get("language", "en"), s.get("topics", []),
        )
        ids[s["url"]] = row["id"]
    # Pages removed from sources.yaml stop being used for answers but keep their history.
    await conn.execute("UPDATE sources SET active = false WHERE NOT (url = ANY($1::text[]))", list(ids))
    return ids


async def ingest_one(conn: Any, client: httpx.AsyncClient, source: dict[str, Any], source_id: int, report: Report) -> None:
    url = source["url"]
    html = await fetch(client, url)
    report.fetched += 1
    page_title, blocks = extract(html)
    if not blocks:
        raise ValueError("no content extracted")
    content_hash = hashlib.sha256(page_text(blocks).encode("utf-8")).hexdigest()

    previous = await conn.fetchval("SELECT content_hash FROM sources WHERE id = $1", source_id)
    if previous == content_hash:
        await conn.execute("UPDATE sources SET last_fetched_at = now() WHERE id = $1", source_id)
        await conn.execute(
            "INSERT INTO source_snapshots (source_id, content_hash, changed) VALUES ($1, $2, false)", source_id, content_hash
        )
        report.unchanged += 1
        return

    chunks = chunk(blocks)
    title = source.get("title") or page_title or url
    vectors = await embed_documents(
        [f"{title}\n{c.heading_path}\n{c.text}" if c.heading_path else f"{title}\n{c.text}" for c in chunks],
        title=title,
    )
    async with conn.transaction():
        await conn.execute("DELETE FROM source_chunks WHERE source_id = $1", source_id)
        await conn.executemany(
            """INSERT INTO source_chunks (source_id, chunk_index, heading_path, text, language, embedding, token_count)
               VALUES ($1, $2, $3, $4, $5, $6::vector, $7)""",
            [
                (source_id, c.index, c.heading_path, c.text, source.get("language", "en"), to_pgvector(v), c.token_count)
                for c, v in zip(chunks, vectors, strict=True)
            ],
        )
        await conn.execute(
            """UPDATE sources SET content_hash = $2, last_fetched_at = now(), last_changed_at = now() WHERE id = $1""",
            source_id, content_hash,
        )
        # A first fetch is recorded as changed=true too: the content is new to us.
        await conn.execute(
            "INSERT INTO source_snapshots (source_id, content_hash, changed) VALUES ($1, $2, true)", source_id, content_hash
        )
    report.chunks_written += len(chunks)
    if previous is None:
        report.new += 1
    else:
        report.changed += 1


async def run_ingestion(pool: Any = None, only: str | None = None) -> Report:
    """Ingest every source in sources.yaml. Uses the given asyncpg pool, or opens a connection."""
    import asyncpg

    from app.db.pool import ssl_context

    if pool is not None:
        async with pool.acquire() as conn:
            return await _run(conn, only)
    settings = get_settings()
    conn = await asyncpg.connect(settings.database_url, ssl=ssl_context(settings.database_url), timeout=30)
    try:
        return await _run(conn, only)
    finally:
        await conn.close()


async def _run(conn: Any, only: str | None) -> Report:
    all_sources = load_sources()
    sources = [s for s in all_sources if only in s["url"]] if only else all_sources
    report = Report()
    ids = await upsert_sources(conn, all_sources)
    async with http_client() as client:
        for i, source in enumerate(sources):
            if i:
                await asyncio.sleep(REQUEST_INTERVAL)
            try:
                await ingest_one(conn, client, source, ids[source["url"]], report)
                logger.info("ingested %s", source["url"])
            except Exception as exc:
                detail = f"{type(exc).__name__}: {exc}"[:200]
                report.failed.append({"url": source["url"], "error": detail})
                logger.warning("failed %s (%s)", source["url"], detail)
    return report


async def check_urls() -> int:
    """Fetch every URL without touching the database. Prints status and how much content was extracted."""
    failures = 0
    async with http_client() as client:
        for i, s in enumerate(load_sources()):
            if i:
                await asyncio.sleep(REQUEST_INTERVAL)
            try:
                html = await fetch(client, s["url"])
                title, blocks = extract(html)
                chunks = chunk(blocks)
                print(f"OK    {len(chunks):>2} chunks  {s['url']}  [{title[:60]}]")
            except Exception as exc:
                failures += 1
                print(f"FAIL  {s['url']}  ({type(exc).__name__}: {str(exc)[:80]})")
    print(f"{failures} failed")
    return failures


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="only ingest URLs containing this text")
    parser.add_argument("--check-urls", action="store_true", help="fetch and parse every URL, no database")
    args = parser.parse_args()
    start = time.perf_counter()
    if args.check_urls:
        sys.exit(1 if asyncio.run(check_urls()) else 0)
    report = asyncio.run(run_ingestion(only=args.only))
    report.print()
    print(f"Done in {time.perf_counter() - start:.0f}s")


if __name__ == "__main__":
    main()
