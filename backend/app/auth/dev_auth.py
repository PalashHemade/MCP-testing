"""Development-only identity resolution.

THIS IS NOT PRODUCTION AUTHENTICATION. It exists so the demo can run
without a real identity provider: the caller sends an `X-Demo-User`
header naming one of a small, server-side fixed set of demo users, each
pinned to a specific tenant below. There is no password, token
verification, or session - anyone who can reach the API can claim any
listed demo identity. It must be disabled (see app.auth.dependencies)
whenever APP_ENV=production.

Swap this module out for a real OIDC/JWT verification flow before any
non-demo deployment.
"""
from uuid import UUID

from app.auth.models import AuthenticatedUser
from app.seed_ids import deterministic_id

# Matches the deterministic tenant/user IDs created by
# app.scripts.seed_demo - keep these two in sync.
TENANT_PRIMARY = UUID("11111111-1111-1111-1111-111111111111")
TENANT_SECONDARY = UUID("22222222-2222-2222-2222-222222222222")

# Must match the customer_id values app.scripts.seed_demo computes for
# these same natural keys (customer_id=deterministic_id("customer",
# "primary", "acme") etc.) - there is no DB lookup here by design: demo
# identity resolution must not depend on the database being reachable.
CUSTOMER_ACME = deterministic_id("customer", "primary", "acme")
CUSTOMER_BHARAT = deterministic_id("customer", "primary", "bharat")
CUSTOMER_OCEANIC = deterministic_id("customer", "primary", "oceanic")

DEV_USERS: dict[str, AuthenticatedUser] = {
    "demo-ops-primary": AuthenticatedUser(
        user_id="demo-ops-primary",
        display_name="Primary Tenant Ops User",
        tenant_id=TENANT_PRIMARY,
        tenant_name="Primary Logistics Co",
        role="operator",
    ),
    "demo-ops-secondary": AuthenticatedUser(
        user_id="demo-ops-secondary",
        display_name="Secondary Tenant Ops User",
        tenant_id=TENANT_SECONDARY,
        tenant_name="Secondary Freight Co",
        role="operator",
    ),
    # Customer-portal identities: each sees only ITS OWN trips/invoices/
    # expenses within the primary tenant, enforced by RLS (see
    # alembic/versions/0002_customer_row_level_security.py) in addition to
    # application-level filtering - see app.auth.models.AuthenticatedUser.
    "demo-customer-acme": AuthenticatedUser(
        user_id="demo-customer-acme",
        display_name="Acme Traders (Customer A)",
        tenant_id=TENANT_PRIMARY,
        tenant_name="Primary Logistics Co",
        role="customer",
        customer_id=CUSTOMER_ACME,
    ),
    "demo-customer-bharat": AuthenticatedUser(
        user_id="demo-customer-bharat",
        display_name="Bharat Textiles (Customer B)",
        tenant_id=TENANT_PRIMARY,
        tenant_name="Primary Logistics Co",
        role="customer",
        customer_id=CUSTOMER_BHARAT,
    ),
    "demo-customer-oceanic": AuthenticatedUser(
        user_id="demo-customer-oceanic",
        display_name="Oceanic Imports (Customer C)",
        tenant_id=TENANT_PRIMARY,
        tenant_name="Primary Logistics Co",
        role="customer",
        customer_id=CUSTOMER_OCEANIC,
    ),
}

DEFAULT_DEV_USER_KEY = "demo-ops-primary"


def resolve_dev_user(header_value: str | None) -> AuthenticatedUser | None:
    key = header_value or DEFAULT_DEV_USER_KEY
    return DEV_USERS.get(key)
