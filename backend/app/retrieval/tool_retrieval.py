"""Embedding-based (+ deterministic keyword fallback/supplement) tool
discovery. Vector similarity alone is never trusted as a complete
capability check - see app.planner.planner.Planner._validate for the real
gate (schema validation of the plan's chosen tools/arguments).
"""
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.registry import TOOL_SPECS, ToolSpec
from app.models.tool_metadata import ToolMetadata
from app.planner.base import ToolCandidate
from app.retrieval.embeddings import EmbeddingUnavailableError, get_embedding_service
from app.retrieval.schema_simplify import simplify_input_schema

_WORD_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> set[str]:
    return set(_WORD_RE.findall(text.lower()))


def _to_candidate(spec: ToolSpec) -> ToolCandidate:
    return ToolCandidate(
        name=spec.name,
        purpose=spec.purpose,
        description=spec.description,
        input_schema=simplify_input_schema(spec.input_model),
        limitations=spec.limitations,
        example_questions=spec.example_questions,
    )


def _keyword_rank(query: str, specs: list[ToolSpec]) -> list[ToolSpec]:
    query_tokens = _tokenize(query)
    scored = []
    for spec in specs:
        corpus = _tokenize(
            " ".join([spec.name, spec.purpose, spec.description, " ".join(spec.example_questions)])
        )
        score = len(query_tokens & corpus)
        scored.append((score, spec))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [spec for _score, spec in scored]


class ToolRetrievalService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.embeddings = get_embedding_service()

    async def get_candidates(
        self, *, query: str, role: str, top_k: int = 6
    ) -> tuple[list[ToolCandidate], str]:
        """role gates which tools can even be OFFERED as candidates (e.g. a
        "customer" caller never sees get_vehicle_utilization) - independent
        of, and prior to, the hard per-call check in
        app.planner.planner.Planner._validate.
        """
        role_specs = [s for s in TOOL_SPECS if role in s.allowed_roles]

        keyword_ranked = _keyword_rank(query, role_specs)
        keyword_top = keyword_ranked[: max(3, top_k // 2)]

        try:
            query_embedding = await self.embeddings.embed_text(query, task_type="RETRIEVAL_QUERY")
        except EmbeddingUnavailableError:
            # Deterministic fallback: keyword ranking only, clearly labeled.
            return [_to_candidate(s) for s in keyword_ranked[:top_k]], "keyword_only"

        role_allowed_names = {s.name for s in role_specs}
        stmt = (
            select(ToolMetadata)
            .where(ToolMetadata.embedding.is_not(None), ToolMetadata.tool_name.in_(role_allowed_names))
            .order_by(ToolMetadata.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        if not rows:
            # tool_metadata embeddings were never built - do not claim vector
            # retrieval worked; fall back and say so.
            return [_to_candidate(s) for s in keyword_ranked[:top_k]], "keyword_fallback_no_embeddings"

        vector_names = {row.tool_name for row in rows}
        combined_names: list[str] = list(vector_names)
        for spec in keyword_top:
            if spec.name not in vector_names:
                combined_names.append(spec.name)

        from app.mcp.registry import TOOL_REGISTRY

        candidates = [_to_candidate(TOOL_REGISTRY[name]) for name in combined_names if name in TOOL_REGISTRY]
        return candidates[:top_k], "vector_plus_keyword"
