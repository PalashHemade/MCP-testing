import { z } from "zod";

/** Whether a result set is known to be the full answer - mirrors
 * app.schemas.common.CompletenessStatus in the Python backend exactly.
 * PARTIAL: more records exist (pagination) or inputs were unresolved.
 * UNKNOWN: completeness could not be determined (ambiguous match, no
 * relevant documents found, upstream failure).
 */
export const CompletenessStatus = z.enum(["complete", "partial", "unknown"]);
export type CompletenessStatus = z.infer<typeof CompletenessStatus>;

export const PageInfoSchema = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  returnedCount: z.number().int(),
  totalCount: z.number().int().nullable(),
  hasMore: z.boolean(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

export const PaginationInputSchema = z.object({
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});

/** Shared date-range validator, matching the Python backend's
 * model_validator: start_date must not be after end_date. */
export function validateDateRange<T extends { startDate?: string; endDate?: string }>(
  data: T,
  ctx: z.RefinementCtx,
): void {
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    ctx.addIssue({
      code: "custom",
      message: "startDate must not be after endDate",
      path: ["startDate"],
    });
  }
}
