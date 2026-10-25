"""Embedding generation for both document chunks and tool-metadata
discovery, backed by Gemini's embedding model when a GEMINI_API_KEY is
configured.

There is no local fallback that pretends to produce semantically useful
vectors: when Gemini is unavailable, EmbeddingUnavailableError is raised
and callers must fall back to a deterministic non-embedding strategy
(keyword/metadata filtering) and say so explicitly in their output,
rather than silently returning meaningless vectors as if retrieval
worked normally.
"""
from google import genai
from google.genai import types

from app.config import get_settings
from app.utils.gemini_retry import call_with_retry


GEMINI_HTTP_TIMEOUT_MS = 20_000  # see app.planner.gemini_client for why this
# is set explicitly - HttpOptions.timeout defaults to None (no timeout at
# all), which lets a slow/queued response during a Google-side "high
# demand" incident hang indefinitely instead of failing predictably.


class EmbeddingUnavailableError(RuntimeError):
    pass


class EmbeddingService:
    def __init__(self):
        self.settings = get_settings()
        self._client: genai.Client | None = None

    @property
    def available(self) -> bool:
        return self.settings.gemini_available

    def _get_client(self) -> genai.Client:
        if self._client is None:
            if not self.settings.gemini_available:
                raise EmbeddingUnavailableError("GEMINI_API_KEY is not configured")
            self._client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=GEMINI_HTTP_TIMEOUT_MS),
            )
        return self._client

    async def embed_text(self, text: str, *, task_type: str | None = None) -> list[float]:
        """task_type should be "RETRIEVAL_DOCUMENT" when indexing (tool
        descriptions, document chunks) and "RETRIEVAL_QUERY" when embedding
        an incoming user question - Gemini's retrieval-tuned embedding
        models produce asymmetric vectors for the two roles, so mixing them
        up quietly degrades ranking quality rather than erroring.

        output_dimensionality is always requested explicitly at
        settings.gemini_embedding_dimensions, so switching
        GEMINI_EMBEDDING_MODEL to one with a different native size (e.g.
        gemini-embedding-001 defaults to 3072) still fits the schema's
        fixed-width pgvector columns without a migration.
        """
        if not self.settings.gemini_available:
            raise EmbeddingUnavailableError("GEMINI_API_KEY is not configured")
        client = self._get_client()
        try:
            response = await call_with_retry(
                lambda: client.models.embed_content(
                    model=self.settings.gemini_embedding_model,
                    contents=text,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=self.settings.gemini_embedding_dimensions,
                    ),
                )
            )
        except Exception as exc:  # network/model errors - never fabricate a vector
            raise EmbeddingUnavailableError(f"Gemini embedding call failed: {exc}") from exc

        embedding = response.embeddings[0].values
        if len(embedding) != self.settings.gemini_embedding_dimensions:
            raise EmbeddingUnavailableError(
                f"Embedding dimensionality mismatch: got {len(embedding)}, "
                f"expected {self.settings.gemini_embedding_dimensions}. Check "
                "GEMINI_EMBEDDING_MODEL / GEMINI_EMBEDDING_DIMENSIONS configuration."
            )
        return embedding

    async def embed_many(self, texts: list[str], *, task_type: str | None = None) -> list[list[float]]:
        return [await self.embed_text(t, task_type=task_type) for t in texts]


_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
