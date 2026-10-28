import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ToolExecutionSummary {
  stepId: string;
  toolName: string;
  status: "success" | "error";
  durationMs: number;
  error: string | null;
  output: Record<string, unknown> | null;
}

export interface ChatResponse {
  requestId: string;
  answer: string;
  intent: string;
  toolExecutions: ToolExecutionSummary[];
  isFullyComplete: boolean;
  validationNotes: string[];
  unsupportedReason: string | null;
  clarificationRequired: boolean;
}
