from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class AuthenticatedUser:
    """Server-derived identity. tenant_id (and, for a "customer" role,
    customer_id) here are the ONLY source of truth for data scope - never
    overridden by a client-supplied tenant_id/customer_id in a request
    body, query string, or tool/plan argument.

    role is either "operator" (sees every customer within the tenant) or
    "customer" (sees only trips/invoices/expenses for customer_id within
    the tenant). customer_id is None for operators and required for
    customers - see app.auth.dev_auth for the demo identities.
    """

    user_id: str
    display_name: str
    tenant_id: UUID
    tenant_name: str
    role: str
    customer_id: UUID | None = None

    def effective_customer_filter(self, requested: UUID | None = None) -> UUID | None:
        """The customer_id a query should actually filter by. For a
        "customer" role, this is ALWAYS self.customer_id, regardless of
        `requested` (a tool argument or planner-filled value) - the same
        "never trust a client/LLM-supplied scope" rule applied to
        tenant_id. For "operator", `requested` passes through unchanged
        (None means "every customer in the tenant").
        """
        if self.role == "customer":
            return self.customer_id
        return requested
