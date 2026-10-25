from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dev_auth import resolve_dev_user
from app.auth.models import AuthenticatedUser
from app.config import get_settings
from app.db.session import get_db


async def get_current_user(
    x_demo_user: str | None = Header(default=None, alias="X-Demo-User"),
) -> AuthenticatedUser:
    settings = get_settings()

    if settings.is_production and settings.auth_mode == "dev":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AUTH_MODE=dev must not be used with APP_ENV=production",
        )

    if settings.auth_mode == "dev":
        user = resolve_dev_user(x_demo_user)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unknown X-Demo-User '{x_demo_user}'",
            )
        return user

    # auth_mode == "oidc": no real identity provider is wired up in this
    # demo. Fail loudly instead of fabricating a successful login.
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "AUTH_MODE=oidc is not implemented in this demo - configure a real "
            "OIDC/JWT identity provider and replace app.auth.dependencies "
            "before using this mode."
        ),
    )


async def get_scoped_db(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AsyncSession:
    """A DB session with this request's tenant/customer scope applied as
    Postgres session variables, which the RLS policies on trips/
    trip_billing/trip_expenses (see
    alembic/versions/0002_customer_row_level_security.py) check directly -
    this is what makes RLS the real backstop rather than app code being
    the only thing standing between a bug and cross-customer data.

    Application code must still filter by user.tenant_id/customer_id
    itself (see app.repositories.*) - RLS is the last line of defense,
    not a replacement for correct queries.
    """
    customer_id_value = str(user.customer_id) if user.customer_id else ""
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, false)"),
        {"tenant_id": str(user.tenant_id)},
    )
    await session.execute(
        text("SELECT set_config('app.current_customer_id', :customer_id, false)"),
        {"customer_id": customer_id_value},
    )
    return session
