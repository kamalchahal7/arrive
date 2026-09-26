"""The single place that talks to Gemini: retries, timeouts, and latency logging (never content)."""

import asyncio
import logging
import time
from functools import lru_cache
from typing import Any, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger("arrive.gemini")

T = TypeVar("T", bound=BaseModel)

RETRYABLE_CODES = {408, 429, 500, 502, 503, 504}


class GeminiError(Exception):
    pass


class Gemini:
    def __init__(self, api_key: str, model_fast: str, model_vision: str, embedding_model: str, embedding_dim: int):
        self.client = genai.Client(api_key=api_key)
        self.model_fast = model_fast
        self.model_vision = model_vision or model_fast
        self.embedding_model = embedding_model
        self.embedding_dim = embedding_dim

    async def _call(self, task: str, fn: Any, timeout: float, attempts: int = 3) -> Any:
        delay = 1.0
        for attempt in range(1, attempts + 1):
            start = time.perf_counter()
            try:
                async with asyncio.timeout(timeout):
                    result = await fn()
                logger.info("gemini task=%s ok ms=%d attempt=%d", task, (time.perf_counter() - start) * 1000, attempt)
                return result
            except (TimeoutError, errors.APIError) as exc:
                code = getattr(exc, "code", None)
                retryable = isinstance(exc, TimeoutError) or code in RETRYABLE_CODES
                logger.warning("gemini task=%s failed code=%s attempt=%d", task, code, attempt)
                if not retryable or attempt == attempts:
                    raise GeminiError(task) from exc
                await asyncio.sleep(delay)
                delay *= 2
        raise GeminiError(task)

    def _config(self, temperature: float, schema: type[BaseModel] | None) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            temperature=temperature,
            response_mime_type="application/json" if schema else None,
            response_schema=schema,
            # Factual, short tasks: no thinking tokens keeps latency low on Flash models.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

    async def generate_json(
        self,
        task: str,
        contents: Any,
        schema: type[T],
        *,
        temperature: float = 0.2,
        vision: bool = False,
        timeout: float = 30,
    ) -> T:
        model = self.model_vision if vision else self.model_fast

        async def fn() -> T:
            res = await self.client.aio.models.generate_content(
                model=model, contents=contents, config=self._config(temperature, schema)
            )
            if isinstance(res.parsed, schema):
                return res.parsed
            if res.text:
                return schema.model_validate_json(res.text)
            raise GeminiError(f"{task}: empty response")

        return await self._call(task, fn, timeout)

    async def generate_text(self, task: str, contents: Any, *, temperature: float = 0.3, timeout: float = 30) -> str:
        async def fn() -> str:
            res = await self.client.aio.models.generate_content(
                model=self.model_fast, contents=contents, config=self._config(temperature, None)
            )
            return (res.text or "").strip()

        return await self._call(task, fn, timeout)

    async def embed(self, texts: list[str], task_type: str, title: str | None = None) -> list[list[float]]:
        """task_type: RETRIEVAL_DOCUMENT for ingestion, RETRIEVAL_QUERY for questions."""
        out: list[list[float]] = []
        for i in range(0, len(texts), 50):
            batch = texts[i : i + 50]

            async def fn(batch: list[str] = batch) -> list[list[float]]:
                res = await self.client.aio.models.embed_content(
                    model=self.embedding_model,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=self.embedding_dim,
                        title=title if task_type == "RETRIEVAL_DOCUMENT" else None,
                    ),
                )
                return [list(e.values or []) for e in (res.embeddings or [])]

            out.extend(await self._call("embed", fn, timeout=60))
        return out


@lru_cache
def get_gemini() -> Gemini:
    s = get_settings()
    if not s.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not set")
    return Gemini(s.gemini_api_key, s.gemini_model_fast, s.gemini_model_vision, s.gemini_embedding_model, s.embedding_dim)
