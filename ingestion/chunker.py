"""Turn an official page into clean text blocks, then into overlapping chunks that keep their heading path."""

from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

# Rough token estimate: about 4 characters per token for English/French text.
CHARS_PER_TOKEN = 4
TARGET_TOKENS = 650
MAX_TOKENS = 800
OVERLAP_TOKENS = 80  # about 12% of the target

DROP_TAGS = ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "iframe", "svg", "button"]
# Page furniture on canada.ca / ontario.ca / ottawa.ca that is not content.
DROP_SELECTORS = [
    "#wb-lng", "#wb-bc", "#wb-dtmd", ".pagedetails", ".gc-pg-hlpfl", "#gc-pft", ".wb-share",
    "[role=navigation]", "[role=banner]", "[role=contentinfo]", ".breadcrumb", ".skip-link",
    "#skip-link", ".visually-hidden", ".wb-inv", ".sr-only",
]
BLOCK_TAGS = ["h1", "h2", "h3", "h4", "p", "li", "dt", "dd", "td", "th", "blockquote", "pre"]
CONTAINER_TAGS = {"li", "p", "dd", "td", "th", "blockquote", "pre"}


@dataclass
class Block:
    heading_path: str
    text: str


@dataclass
class Chunk:
    index: int
    heading_path: str
    text: str
    token_count: int


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def _clean(text: str) -> str:
    return " ".join(text.split())


def extract(html: str) -> tuple[str, list[Block]]:
    """Return the page title and its content blocks, with navigation and page furniture removed."""
    soup = BeautifulSoup(html, "html.parser")
    title = _clean(soup.title.get_text()) if soup.title else ""
    for tag in soup(DROP_TAGS):
        tag.decompose()
    for selector in DROP_SELECTORS:
        for tag in soup.select(selector):
            tag.decompose()

    root = soup.find("main") or soup.find(attrs={"role": "main"}) or soup.body or soup
    headings: dict[int, str] = {}
    blocks: list[Block] = []
    for el in root.find_all(BLOCK_TAGS):
        if not isinstance(el, Tag):
            continue
        # Skip elements nested in another block (e.g. <p> inside <li>) to avoid duplicate text.
        if any(parent.name in CONTAINER_TAGS for parent in el.parents if parent is not root):
            continue
        text = _clean(el.get_text(" "))
        if not text:
            continue
        if el.name in ("h1", "h2", "h3", "h4"):
            level = int(el.name[1])
            headings = {k: v for k, v in headings.items() if k < level}
            headings[level] = text
            continue
        prefix = "• " if el.name == "li" else ""
        path = " > ".join(headings[k] for k in sorted(headings))
        blocks.append(Block(path, prefix + text))

    h1 = root.find("h1")
    if h1:
        title = _clean(h1.get_text(" ")) or title
    return title, blocks


def page_text(blocks: list[Block]) -> str:
    """Canonical text used for change detection (ignores markup and page chrome changes)."""
    return "\n".join(f"{b.heading_path}\n{b.text}" for b in blocks)


def _split_long(text: str) -> list[str]:
    """Split a single block that is longer than MAX_TOKENS on sentence boundaries."""
    limit = MAX_TOKENS * CHARS_PER_TOKEN
    if len(text) <= limit:
        return [text]
    parts, current = [], ""
    for sentence in text.replace("? ", "?|").replace("! ", "!|").replace(". ", ".|").split("|"):
        if current and len(current) + len(sentence) > limit:
            parts.append(current.strip())
            current = ""
        current += sentence + " "
    if current.strip():
        parts.append(current.strip())
    return parts


def chunk(blocks: list[Block]) -> list[Chunk]:
    """Group blocks into ~650-token chunks. Sections (headings) start a new chunk when the current one is
    already reasonably full, so chunks rarely mix unrelated sections. Consecutive chunks overlap by ~80 tokens."""
    pieces: list[Block] = []
    for b in blocks:
        pieces.extend(Block(b.heading_path, t) for t in _split_long(b.text))

    chunks: list[Chunk] = []
    current: list[Block] = []

    def size(items: list[Block]) -> int:
        return sum(estimate_tokens(i.text) for i in items)

    def flush() -> None:
        nonlocal current
        if not current:
            return
        path = current[0].heading_path or current[-1].heading_path
        lines: list[str] = []
        last_path = None
        for item in current:
            if item.heading_path and item.heading_path != last_path:
                lines.append(f"## {item.heading_path.split(' > ')[-1]}")
                last_path = item.heading_path
            lines.append(item.text)
        text = "\n".join(lines)
        chunks.append(Chunk(len(chunks), path, text, estimate_tokens(text)))
        # Carry the tail of this chunk into the next one as overlap.
        overlap: list[Block] = []
        for item in reversed(current):
            if size(overlap) + estimate_tokens(item.text) > OVERLAP_TOKENS:
                break
            overlap.insert(0, item)
        current = overlap if len(overlap) < len(current) else []

    for piece in pieces:
        new_section = bool(current) and piece.heading_path != current[-1].heading_path
        if current and (
            size(current) + estimate_tokens(piece.text) > MAX_TOKENS
            or (new_section and size(current) >= TARGET_TOKENS * 0.6)
        ):
            flush()
        current.append(piece)
    # Last chunk: only flush if it adds something beyond the overlap already written.
    if current and (not chunks or any(item.text not in chunks[-1].text for item in current)):
        flush()
    return chunks
