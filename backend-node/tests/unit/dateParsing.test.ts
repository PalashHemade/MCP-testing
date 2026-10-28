import { describe, expect, it } from "vitest";
import { parseRelativeDateRange } from "../../src/planner/dateParsing.js";

describe("parseRelativeDateRange", () => {
  it("handles last month crossing a year boundary", () => {
    const [start, end] = parseRelativeDateRange("show trips from last month", new Date("2026-01-15"));
    expect(start).toBe("2025-12-01");
    expect(end).toBe("2025-12-31");
  });

  it("handles this month", () => {
    const [start, end] = parseRelativeDateRange("this month", new Date("2026-10-24"));
    expect(start).toBe("2026-10-01");
    expect(end).toBe("2026-10-31");
  });

  it("handles this quarter", () => {
    const [start, end] = parseRelativeDateRange("this quarter", new Date("2026-10-24"));
    expect(start).toBe("2026-10-01");
    expect(end).toBe("2026-12-31");
  });

  it("handles last quarter crossing a year boundary", () => {
    const [start, end] = parseRelativeDateRange("last quarter", new Date("2026-01-10"));
    expect(start).toBe("2025-10-01");
    expect(end).toBe("2025-12-31");
  });

  it("handles explicit ISO dates", () => {
    const [start, end] = parseRelativeDateRange("between 2026-01-01 and 2026-01-31", new Date("2026-10-24"));
    expect(start).toBe("2026-01-01");
    expect(end).toBe("2026-01-31");
  });

  it("returns [null, null] for unrecognized phrases", () => {
    const [start, end] = parseRelativeDateRange("sometime recently", new Date("2026-10-24"));
    expect(start).toBeNull();
    expect(end).toBeNull();
  });
});
