import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { ListUnpaidInvoicesInput, ListUnpaidInvoicesOutput } from "../../schemas/tools.js";
import { BillingService } from "../../services/billingService.js";

export const TOOL_NAME = "list_unpaid_invoices";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: ListUnpaidInvoicesInput,
): Promise<ListUnpaidInvoicesOutput> {
  const service = new BillingService(client);
  const { invoices, pageInfo, completeness } = await service.listUnpaidInvoices({
    tenantId: user.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    paymentStatus: input.paymentStatus,
    customerScope: effectiveCustomerFilter(user),
    limit: input.limit,
    offset: input.offset,
    asOf: new Date().toISOString().slice(0, 10),
  });
  const { limit, offset, ...appliedFilters } = input;
  return { invoices, appliedFilters, pageInfo, completeness };
}
