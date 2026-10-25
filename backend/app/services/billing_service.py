from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PaymentStatus
from app.repositories.billing import BillingRepository
from app.schemas.common import CompletenessStatus, PageInfo
from app.schemas.tools import UnpaidInvoiceRow
from app.services.financials import gross_billed_amount, is_overdue, outstanding_balance


class BillingService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.billing = BillingRepository(session)

    async def list_unpaid_invoices(
        self,
        *,
        tenant_id: UUID,
        start_date: date | None,
        end_date: date | None,
        payment_status: PaymentStatus | None,
        limit: int,
        offset: int,
        as_of: date,
        customer_scope: UUID | None = None,
    ) -> tuple[list[UnpaidInvoiceRow], PageInfo, CompletenessStatus]:
        rows, total_count = await self.billing.list_unpaid_invoices(
            tenant_id=tenant_id,
            start_date=start_date,
            end_date=end_date,
            payment_status=payment_status,
            customer_id=customer_scope,
            limit=limit,
            offset=offset,
        )
        results = []
        for invoice, trip_number, customer_id, customer_name in rows:
            results.append(
                UnpaidInvoiceRow(
                    billing_id=invoice.billing_id,
                    invoice_number=invoice.invoice_number,
                    trip_id=invoice.trip_id,
                    trip_number=trip_number,
                    customer_id=customer_id,
                    customer_name=customer_name,
                    gross_billed_amount=gross_billed_amount(invoice),
                    amount_paid=invoice.amount_paid,
                    outstanding_balance=outstanding_balance(invoice),
                    due_date=invoice.due_date,
                    payment_status=invoice.payment_status,
                    is_overdue=is_overdue(invoice, as_of=as_of),
                )
            )
        has_more = offset + len(results) < total_count
        page_info = PageInfo(
            limit=limit, offset=offset, returned_count=len(results),
            total_count=total_count, has_more=has_more,
        )
        completeness = CompletenessStatus.PARTIAL if has_more else CompletenessStatus.COMPLETE
        return results, page_info, completeness
