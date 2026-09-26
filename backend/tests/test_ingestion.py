import sys
from pathlib import Path

from app.config import Settings
from app.db.migrate import MIGRATIONS_DIR, NO_TX_MARKER, render, split_statements

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ingestion.chunker import chunk, extract  # noqa: E402

PAGE = """
<html><head><title>Apply for a SIN - Canada.ca</title></head><body>
<header><nav>Menu Jobs Taxes</nav></header>
<main>
  <h1>Apply for a SIN</h1>
  <p>A Social Insurance Number (SIN) is a 9-digit number.</p>
  <h2>Documents</h2>
  <ul><li>Primary document <p>nested paragraph</p></li><li>Proof of address</li></ul>
  <h2>How to apply</h2>
  <p>{long}</p>
  <section id="wb-dtmd">Date modified: 2026-01-01</section>
</main>
<footer>Contact us</footer>
</body></html>
""".replace("{long}", "Apply online or in person. " * 400)


def test_extract_keeps_headings_and_drops_chrome() -> None:
    title, blocks = extract(PAGE)
    assert title == "Apply for a SIN"
    text = " ".join(b.text for b in blocks)
    assert "Menu Jobs" not in text and "Contact us" not in text and "Date modified" not in text
    assert text.count("nested paragraph") == 1  # no duplicate from nested block elements
    assert any(b.heading_path == "Apply for a SIN > Documents" for b in blocks)


def test_chunks_respect_size_and_overlap() -> None:
    _, blocks = extract(PAGE)
    chunks = chunk(blocks)
    assert len(chunks) >= 2
    assert all(c.token_count <= 900 for c in chunks)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_migrations_render_and_split() -> None:
    s = Settings(embedding_dim=768, request_log_retention_days=365)
    core = render((MIGRATIONS_DIR / "002_core.sql").read_text("utf-8"), s)
    assert "vector(768)" in core and "{{" not in core
    aggregates = (MIGRATIONS_DIR / "004_aggregates.sql").read_text("utf-8")
    assert aggregates.startswith(NO_TX_MARKER)
    statements = split_statements(render(aggregates, s))
    assert len(statements) == 5
    assert "INTERVAL '365 days'" in statements[-1]
