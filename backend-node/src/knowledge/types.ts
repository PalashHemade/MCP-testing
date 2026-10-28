export interface ConceptFile {
  /** Path within the bundle, without .md - the OKF "concept ID". */
  conceptId: string;
  absolutePath: string;
  frontmatter: Record<string, unknown>;
  type: string;
  body: string;
  links: string[];
}

export interface IndexFile {
  conceptId: string;
  absolutePath: string;
  /** Only the bundle root's index.md may carry this. */
  okfVersion?: string;
  body: string;
}

export interface KnowledgeBundle {
  root: string;
  concepts: Map<string, ConceptFile>;
  indexes: Map<string, IndexFile>;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}
