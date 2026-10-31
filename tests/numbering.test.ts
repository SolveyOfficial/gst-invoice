import { describe, expect, it } from "vitest";

import {
  addDays,
  financialYear,
  formatDate,
  invoiceNumber,
  nextNumber,
  sequenceOf,
  today,
} from "../src/lib/numbering";

describe("financial year", () => {
  it("runs from April to March", () => {
    expect(financialYear("2027-03-31")).toBe("2026-27");
    expect(financialYear("2027-04-01")).toBe("2027-28");
    expect(financialYear("2026-04-01")).toBe("2026-27");
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2026-12-31")).toBe("2026-27");
    expect(financialYear("2027-01-01")).toBe("2026-27");
    expect(financialYear("1999-04-01")).toBe("1999-00");
  });
});

describe("invoice numbers", () => {
  it("formats numbers", () => {
    expect(invoiceNumber("INV", "2026-27", 1)).toBe("INV/2026-27/0001");
    expect(invoiceNumber("INV", "2026-27", 12345)).toBe("INV/2026-27/12345");
    expect(invoiceNumber("", "2026-27", 7)).toBe("2026-27/0007");
    // GST allows at most 16 characters
    expect(invoiceNumber("INV", "2026-27", 1).length).toBeLessThanOrEqual(16);
  });

  it("reads the sequence back", () => {
    expect(sequenceOf("INV/2026-27/0042", "INV", "2026-27")).toBe(42);
    expect(sequenceOf("INV/2025-26/0042", "INV", "2026-27")).toBe(0);
    expect(sequenceOf("CN/2026-27/0042", "INV", "2026-27")).toBe(0);
    expect(sequenceOf("A.B/2026-27/0003", "A.B", "2026-27")).toBe(3);
    expect(sequenceOf("AxB/2026-27/0003", "A.B", "2026-27")).toBe(0);
  });

  it("continues the series within a financial year", () => {
    const existing = [
      { number: "INV/2026-27/0001" },
      { number: "INV/2026-27/0007" },
      { number: "CN/2026-27/0020" },
      { number: "INV/2025-26/0099" },
    ];
    expect(nextNumber(existing, "INV", "2026-10-31")).toBe("INV/2026-27/0008");
    expect(nextNumber(existing, "CN", "2026-10-31")).toBe("CN/2026-27/0021");
    expect(nextNumber(existing, "BOS", "2026-10-31")).toBe("BOS/2026-27/0001");
  });

  it("starts again on 1 April", () => {
    const existing = [{ number: "INV/2026-27/0150" }, { number: "INV/2025-26/0300" }];
    expect(nextNumber(existing, "INV", "2027-03-31")).toBe("INV/2026-27/0151");
    expect(nextNumber(existing, "INV", "2027-04-01")).toBe("INV/2027-28/0001");
    expect(nextNumber(existing, "INV", "2026-03-31")).toBe("INV/2025-26/0301");
    expect(nextNumber(existing, "INV", "2026-04-01")).toBe("INV/2026-27/0151");
  });
});

describe("dates", () => {
  it("formats and adds days", () => {
    expect(formatDate("2026-04-01")).toBe("01/04/2026");
    expect(addDays("2027-03-17", 15)).toBe("2027-04-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(today(new Date(2026, 9, 5))).toBe("2026-10-05");
  });
});
