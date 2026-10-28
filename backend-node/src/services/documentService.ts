import type { PoolClient } from "pg";
import { DocumentRepository } from "../repositories/documentRepository.js";
import type { DocumentPassage } from "../schemas/domain.js";

/** Document retrieval via PostgreSQL full-text search (plainto_tsquery /
 * ts_rank / ts_headline) - NOT embeddings. The OKF knowledge bundle
 * (../../knowledge/policies, loaded by src/knowledge) describes these
 * documents' structure/metadata for the planner; this service retrieves
 * the actual document CONTENT, which is a deliberately separate concern
 * from OKF per the project brief.
 */
export class DocumentService {
  private readonly documents: DocumentRepository;

  constructor(client: PoolClient) {
    this.documents = new DocumentRepository(client);
  }

  async search(opts: {
    tenantId: string;
    query: string;
    documentType?: string;
    jurisdiction?: string;
    effectiveDate?: string;
    limit: number;
  }): Promise<{ passages: DocumentPassage[]; retrievalMethod: string }> {
    const candidates = await this.documents.searchCandidates({
      tenantId: opts.tenantId,
      documentType: opts.documentType,
      jurisdiction: opts.jurisdiction,
      effectiveDate: opts.effectiveDate,
    });
    if (candidates.length === 0) {
      return { passages: [], retrievalMethod: "no_candidate_documents" };
    }

    const candidateIds = candidates.map((d) => d.document_id);
    const matches = await this.documents.search(candidateIds, opts.query, opts.limit);

    if (matches.length === 0) {
      // Full-text search found no lexical match - fall back to a plain
      // keyword-overlap scan over the candidates so a query phrased
      // differently from the document's exact wording doesn't come back
      // empty just because tsquery found no stem match.
      return { passages: this.keywordFallback(opts.query, candidates, opts.limit), retrievalMethod: "keyword_fallback" };
    }

    const passages: DocumentPassage[] = matches.map((doc) => ({
      documentId: doc.document_id,
      title: doc.title,
      documentType: doc.document_type as DocumentPassage["documentType"],
      jurisdiction: doc.jurisdiction,
      sourceReference: doc.source_reference,
      documentVersion: doc.document_version,
      effectiveFrom: doc.effective_from,
      effectiveTo: doc.effective_to,
      isDemoContent: doc.is_demo_content,
      excerpt: doc.excerpt,
      relevanceScore: doc.relevance,
    }));
    return { passages, retrievalMethod: "full_text_search" };
  }

  private keywordFallback(
    query: string,
    candidates: Array<{
      document_id: string;
      title: string;
      document_type: string;
      jurisdiction: string | null;
      source_reference: string | null;
      document_version: string;
      effective_from: string | null;
      effective_to: string | null;
      content: string;
      is_demo_content: boolean;
    }>,
    limit: number,
  ): DocumentPassage[] {
    const queryTokens = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const scored = candidates
      .map((doc) => {
        const docTokens = new Set((doc.title + " " + doc.content).toLowerCase().match(/[a-z0-9]+/g) ?? []);
        let overlap = 0;
        for (const t of queryTokens) if (docTokens.has(t)) overlap += 1;
        return { doc, overlap };
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, limit);

    return scored.map(({ doc }) => ({
      documentId: doc.document_id,
      title: doc.title,
      documentType: doc.document_type as DocumentPassage["documentType"],
      jurisdiction: doc.jurisdiction,
      sourceReference: doc.source_reference,
      documentVersion: doc.document_version,
      effectiveFrom: doc.effective_from,
      effectiveTo: doc.effective_to,
      isDemoContent: doc.is_demo_content,
      excerpt: doc.content.slice(0, 400),
      relevanceScore: null,
    }));
  }
}
