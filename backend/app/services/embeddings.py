"""Embedding helpers shared by ingestion and retrieval."""

import math

from app.services import gemini


def normalize(vec: list[float]) -> list[float]:
    # Reduced-dimension Gemini embeddings are not unit length; normalizing keeps cosine scores comparable.
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def to_pgvector(vec: list[float]) -> str:
    """pgvector text format, used with a ::vector cast (no extra driver dependency)."""
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


async def embed_documents(texts: list[str], title: str | None = None) -> list[list[float]]:
    vecs = await gemini.get_gemini().embed(texts, "RETRIEVAL_DOCUMENT", title=title)
    return [normalize(v) for v in vecs]


async def embed_query(text: str) -> list[float]:
    vecs = await gemini.get_gemini().embed([text], "RETRIEVAL_QUERY")
    return normalize(vecs[0])
