import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../../auth/models.js";
import { SearchLogisticsDocumentsInput, SearchLogisticsDocumentsOutput } from "../../schemas/tools.js";
import { DocumentService } from "../../services/documentService.js";

export const TOOL_NAME = "search_logistics_documents";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: SearchLogisticsDocumentsInput,
): Promise<SearchLogisticsDocumentsOutput> {
  const service = new DocumentService(client);
  const { passages, retrievalMethod } = await service.search({
    tenantId: user.tenantId,
    query: input.query,
    documentType: input.documentType,
    jurisdiction: input.jurisdiction,
    effectiveDate: input.effectiveDate,
    limit: input.limit,
  });
  return {
    passages,
    appliedFilters: input,
    retrievalMethod,
    foundRelevantResults: passages.length > 0,
    completeness: passages.length > 0 ? "complete" : "unknown",
  };
}
