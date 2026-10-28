export type Role = "operator" | "customer";

/** Server-derived identity. tenantId (and, for a "customer" role,
 * customerId) are the ONLY source of truth for data scope - never
 * overridden by a client-supplied tenantId/customerId in a request body,
 * query string, or tool/plan argument. Mirrors
 * app.auth.models.AuthenticatedUser in the Python backend exactly.
 */
export interface AuthenticatedUser {
  userId: string;
  displayName: string;
  tenantId: string;
  tenantName: string;
  role: Role;
  customerId: string | null;
}

/** The customerId a query should actually filter by. For "customer",
 * ALWAYS user.customerId regardless of `requested` (a tool argument or
 * planner-filled value). For "operator", `requested` passes through
 * unchanged (undefined/null means "every customer in the tenant"). */
export function effectiveCustomerFilter(
  user: AuthenticatedUser,
  requested?: string | null,
): string | null {
  if (user.role === "customer") return user.customerId;
  return requested ?? null;
}
