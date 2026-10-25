from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.tools import ListUnpaidInvoicesInput, ListUnpaidInvoicesOutput
from app.services.billing_service import BillingService

TOOL_NAME = "list_unpaid_invoices"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: ListUnpaidInvoicesInput
) -> ListUnpaidInvoicesOutput:
    service = BillingService(session)
    invoices, page_info, completeness = await service.list_unpaid_invoices(
        tenant_id=user.tenant_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
        payment_status=input_data.payment_status,
        limit=input_data.limit,
        offset=input_data.offset,
        as_of=datetime.now(timezone.utc).date(),
        customer_scope=user.effective_customer_filter(),
    )
    return ListUnpaidInvoicesOutput(
        invoices=invoices,
        applied_filters=input_data.model_dump(exclude={"limit", "offset"}, exclude_none=True),
        page_info=page_info,
        completeness=completeness,
    )
