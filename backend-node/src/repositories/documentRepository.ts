import type { PoolClient } from "pg";
import type { LogisticsDocumentRow } from "../db/types.js";

/** Tenant isolation rule: a row is visible if tenant_id IS NULL (global
 * demo content) OR tenant_id matches the caller's tenant - never
 * returns another tenant's private documents.
 *
 * search() uses PostgreSQL full-text search (plainto_tsquery over the
 * generated content_tsv column) rather than embeddings/vector search -
 * the brief for this backend explicitly excludes embeddings; see Tool 10
 * in docs/tools.md.
 */
export class DocumentRepository {
  constructor(private readonly client: PoolClient) {}

  async searchCandidates(opts: {
    tenantId: string;
    documentType?: string;
    jurisdiction?: string;
    effectiveDate?: string;
  }): Promise<LogisticsDocumentRow[]> {
    const conditions = ["(tenant_id IS NULL OR tenant_id = $1)"];
    const params: unknown[] = [opts.tenantId];

    if (opts.documentType) {
      params.push(opts.documentType);
      conditions.push(`document_type = $${params.length}`);
    }
    if (opts.jurisdiction) {
      params.push(`%${opts.jurisdiction}%`);
      conditions.push(`jurisdiction ILIKE $${params.length}`);
    }
    if (opts.effectiveDate) {
      params.push(opts.effectiveDate);
      const p = params.length;
      conditions.push(`(effective_from IS NULL OR effective_from <= $${p})`);
      conditions.push(`(effective_to IS NULL OR effective_to >= $${p})`);
    }

    const result = await this.client.query<LogisticsDocumentRow>(
      `SELECT * FROM logistics_documents WHERE ${conditions.join(" AND ")}`,
      params,
    );
    return result.rows;
  }

  /** Full-text search over a candidate set, ranked by ts_rank. Returns
   * each matching document with a relevance score and a short excerpt
   * (ts_headline) - the full-text equivalent of a "chunk". */
  async search(
    candidateIds: string[],
    query: string,
    limit: number,
  ): Promise<Array<LogisticsDocumentRow & { relevance: number; excerpt: string }>> {
    if (candidateIds.length === 0) return [];
    const result = await this.client.query<LogisticsDocumentRow & { relevance: number; excerpt: string }>(
      `
      SELECT *,
        ts_rank(content_tsv, plainto_tsquery('english', $2)) AS relevance,
        ts_headline('english', content, plainto_tsquery('english', $2),
          'MaxFragments=1, MaxWords=60, MinWords=20') AS excerpt
      FROM logistics_documents
      WHERE document_id = ANY($1) AND content_tsv @@ plainto_tsquery('english', $2)
      ORDER BY relevance DESC
      LIMIT $3
      `,
      [candidateIds, query, limit],
    );
    return result.rows;
  }
}
