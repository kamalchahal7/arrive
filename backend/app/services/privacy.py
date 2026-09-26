"""PII scrubbing. A second layer after the model: anything that looks personal is removed before storage."""

import re

REMOVED = "[removed]"

_PATTERNS = [
    # Email addresses
    re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+"),
    # URLs can carry names or ids
    re.compile(r"https?://\S+"),
    # Phone numbers: +1 (613) 555-0123, 613-555-0123, 613 555 0123, 6135550123
    re.compile(r"(?<!\w)(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)"),
    # Canadian postal codes: K1A 0B1
    re.compile(r"\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b", re.IGNORECASE),
    # Dates like 1987-03-14, 14/03/1987, 3/14/87
    re.compile(r"\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b"),
    re.compile(r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b"),
    # Document numbers: SIN (123 456 789), UCI, passport, file numbers, card numbers (6+ digits, maybe spaced)
    re.compile(r"\b(?:\d[ -]?){6,}\b"),
    re.compile(r"\b[A-Z]{1,3}\d{6,}\b"),
    # Street addresses: "123 Rideau Street", "45 Bank St"
    re.compile(
        r"\b\d{1,5}\s+(?:[A-Z][\w'-]*\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|crescent|cres|"
        r"court|ct|lane|ln|way|place|pl|terrace|parkway|pkwy|rue|chemin)\b\.?",
        re.IGNORECASE,
    ),
]

# "my name is X", "je m'appelle X", "اسمي X": drop the name that follows.
_NAME_INTRO = re.compile(
    r"(my name is|i am called|i'm called|je m'appelle|mon nom est|me llamo|اسمي|اسمى)\s+[^\s,.;:!?]+(\s+[^\s,.;:!?]+)?",
    re.IGNORECASE,
)


def scrub(text: str | None) -> str | None:
    if not text:
        return text
    out = _NAME_INTRO.sub(lambda m: f"{m.group(1)} {REMOVED}", text)
    for pattern in _PATTERNS:
        out = pattern.sub(REMOVED, out)
    out = re.sub(r"(\[removed\]\s*){2,}", REMOVED + " ", out)
    return " ".join(out.split())


def looks_personal(text: str) -> bool:
    return scrub(text) != " ".join(text.split())
