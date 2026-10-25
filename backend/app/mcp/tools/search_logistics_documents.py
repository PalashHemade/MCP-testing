from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import SearchLogisticsDocumentsInput, SearchLogisticsDocumentsOutput
from app.services.document_service import DocumentService

TOOL_NAME = "search_logistics_documents"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: SearchLogisticsDocumentsInput
) -> SearchLogisticsDocumentsOutput:
    service = DocumentService(session)
    passages, method = await service.search(
        tenant_id=user.tenant_id,
        query=input_data.query,
        document_type=input_data.document_type,
        jurisdiction=input_data.jurisdiction,
        effective_date=input_data.effective_date,
        limit=input_data.limit,
    )
    return SearchLogisticsDocumentsOutput(
        passages=passages,
        applied_filters=input_data.model_dump(exclude={"limit"}, exclude_none=True),
        retrieval_method=method,
        found_relevant_results=len(passages) > 0,
        completeness=CompletenessStatus.COMPLETE if passages else CompletenessStatus.UNKNOWN,
    )
