import type { ExecutionPlan } from "./schemas.js";

export interface ToolCandidate {
  name: string;
  purpose: string;
  description: string;
  inputSchema: Record<string, unknown>;
  limitations: string;
  exampleQuestions: string[];
}

export interface PlannerClient {
  createPlan(opts: { question: string; candidateTools: ToolCandidate[]; today: string }): Promise<ExecutionPlan>;
}
