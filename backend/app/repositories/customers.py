from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer


class CustomerRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, *, tenant_id: UUID, customer_id: UUID) -> Customer | None:
        query = select(Customer).where(
            Customer.tenant_id == tenant_id, Customer.customer_id == customer_id
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def list_for_tenant(self, *, tenant_id: UUID) -> list[Customer]:
        query = select(Customer).where(Customer.tenant_id == tenant_id).order_by(Customer.customer_name)
        return list((await self.session.execute(query)).scalars().all())
