import { describe, expect, it } from "vitest";
import {
  expenseBreakdown,
  grossBilledAmount,
  isOverdue,
  outstandingBalance,
  profitPerKm,
  sumExpenses,
  sumIncludedInvoices,
  tripProfit,
  type ExpenseRow,
  type InvoiceRow,
} from "../../src/services/financials.js";

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    freightCharge: "1000",
    additionalCharges: "0",
    taxAmount: "0",
    amountPaid: "0",
    paymentStatus: "unpaid",
    dueDate: null,
    ...overrides,
  };
}

describe("grossBilledAmount", () => {
  it("sums freight + additional + tax", () => {
    const inv = invoice({ freightCharge: "100", additionalCharges: "20", taxAmount: "5" });
    expect(grossBilledAmount(inv).toFixed(2)).toBe("125.00");
  });
});

describe("outstandingBalance", () => {
  it("subtracts amountPaid from gross", () => {
    const inv = invoice({ freightCharge: "100", amountPaid: "40" });
    expect(outstandingBalance(inv).toFixed(2)).toBe("60.00");
  });
});

describe("sumIncludedInvoices", () => {
  it("excludes draft and cancelled invoices", () => {
    const included = invoice({ freightCharge: "100", amountPaid: "100", paymentStatus: "paid" });
    const draft = invoice({ freightCharge: "999", paymentStatus: "draft" });
    const cancelled = invoice({ freightCharge: "999", paymentStatus: "cancelled" });
    const [gross, paid, outstanding] = sumIncludedInvoices([included, draft, cancelled]);
    expect(gross).toBe("100.00");
    expect(paid).toBe("100.00");
    expect(outstanding).toBe("0.00");
  });

  it("aggregates multiple invoices without double counting", () => {
    const a = invoice({ freightCharge: "100", amountPaid: "100", paymentStatus: "paid" });
    const b = invoice({ freightCharge: "50", amountPaid: "0", paymentStatus: "unpaid" });
    const [gross, paid, outstanding] = sumIncludedInvoices([a, b]);
    expect(gross).toBe("150.00");
    expect(paid).toBe("100.00");
    expect(outstanding).toBe("50.00");
  });
});

describe("isOverdue", () => {
  const today = "2026-10-24";
  it("is true only when due date passed and balance remains", () => {
    const overdue = invoice({ freightCharge: "100", amountPaid: "0", dueDate: "2026-10-01" });
    const notDueYet = invoice({ freightCharge: "100", amountPaid: "0", dueDate: "2026-11-01" });
    const paidOff = invoice({
      freightCharge: "100",
      amountPaid: "100",
      dueDate: "2026-10-01",
      paymentStatus: "paid",
    });
    expect(isOverdue(overdue, today)).toBe(true);
    expect(isOverdue(notDueYet, today)).toBe(false);
    expect(isOverdue(paidOff, today)).toBe(false);
  });
});

describe("sumExpenses / expenseBreakdown", () => {
  it("sums all categories and breaks them down", () => {
    const expenses: ExpenseRow[] = [
      { amount: "100", expenseCategory: "fuel" },
      { amount: "50", expenseCategory: "toll" },
      { amount: "25", expenseCategory: "fuel" },
    ];
    expect(sumExpenses(expenses)).toBe("175.00");
    expect(expenseBreakdown(expenses)).toEqual({ fuel: "125.00", toll: "50.00" });
  });
});

describe("tripProfit", () => {
  it("can be negative", () => {
    expect(tripProfit("100", "150")).toBe("-50.00");
  });
});

describe("profitPerKm", () => {
  it("is null when distance missing or non-positive", () => {
    expect(profitPerKm("100", null)).toBeNull();
    expect(profitPerKm("100", "0")).toBeNull();
    expect(profitPerKm(null, "10")).toBeNull();
  });

  it("computes the ratio", () => {
    expect(profitPerKm("100", "10")).toBe("10.00");
  });
});
