import { describe, expect, it } from "vitest";

import { emptyLine, type Line } from "../src/lib/model";
import {
  computeTotals,
  formatRate,
  isInterState,
  lineAmounts,
  roundToRupee,
  sgstLabel,
} from "../src/lib/tax";

const line = (values: Partial<Line>): Line => ({ ...emptyLine(), ...values });

describe("intra-state or inter-state", () => {
  it("compares the supplier state with the place of supply", () => {
    expect(isInterState("29", "29")).toBe(false);
    expect(isInterState("29", "27")).toBe(true);
    expect(isInterState("29", "96")).toBe(true); // export
    expect(isInterState("29", "29", true)).toBe(true); // SEZ
  });

  it("names UTGST for union territories without a legislature", () => {
    expect(sgstLabel("29")).toBe("SGST");
    expect(sgstLabel("07")).toBe("SGST"); // Delhi has a legislature
    expect(sgstLabel("04")).toBe("UTGST"); // Chandigarh
    expect(sgstLabel("38")).toBe("UTGST"); // Ladakh
  });
});

describe("line amounts", () => {
  it("splits GST in half within a state", () => {
    const amounts = lineAmounts(line({ qty: 2, rate: 1000, gstRate: 18 }), true, false);
    expect(amounts.taxable).toBe(200000);
    expect(amounts.cgst).toBe(18000);
    expect(amounts.sgst).toBe(18000);
    expect(amounts.igst).toBe(0);
    expect(amounts.total).toBe(236000);
  });

  it("charges IGST between states", () => {
    const amounts = lineAmounts(line({ qty: 2, rate: 1000, gstRate: 18 }), true, true);
    expect(amounts.igst).toBe(36000);
    expect(amounts.cgst + amounts.sgst).toBe(0);
  });

  it("applies the discount before tax", () => {
    const amounts = lineAmounts(
      line({ qty: 3, rate: 333.33, discount: 10, gstRate: 5 }),
      true,
      false,
    );
    expect(amounts.gross).toBe(99999);
    expect(amounts.discount).toBe(10000);
    expect(amounts.taxable).toBe(89999);
    expect(amounts.cgst).toBe(2250); // 899.99 × 2.5% = 22.49975 -> 22.50
    expect(amounts.sgst).toBe(2250);
  });

  it("adds cess and handles small rates", () => {
    const amounts = lineAmounts(
      line({ qty: 1, rate: 100000, gstRate: 28, cessRate: 15 }),
      true,
      true,
    );
    expect(amounts.igst).toBe(2800000);
    expect(amounts.cess).toBe(1500000);
    const diamonds = lineAmounts(line({ qty: 1, rate: 999, gstRate: 0.25 }), true, false);
    expect(diamonds.cgst).toBe(125); // 999 × 0.125% = 1.24875 -> 1.25
  });

  it("charges no tax on a bill of supply", () => {
    const amounts = lineAmounts(line({ qty: 1, rate: 500, gstRate: 18 }), false, false);
    expect(amounts.cgst + amounts.sgst + amounts.igst + amounts.cess).toBe(0);
    expect(amounts.total).toBe(50000);
  });

  it("treats bad numbers as zero", () => {
    const amounts = lineAmounts(line({ qty: NaN, rate: 5 }), true, false);
    expect(amounts.total).toBe(0);
  });
});

describe("rounding off", () => {
  it("rounds to the nearest rupee", () => {
    expect(roundToRupee(12345650)).toBe(12345700);
    expect(roundToRupee(12345649)).toBe(12345600);
    expect(roundToRupee(12345600)).toBe(12345600);
    expect(roundToRupee(-150)).toBe(-200);
  });
});

describe("document totals", () => {
  const lines = [
    line({ name: "Design", hsn: "998391", qty: 1, rate: 12500, gstRate: 18 }),
    line({ name: "Paper", hsn: "4802", qty: 3, rate: 245.5, gstRate: 12 }),
    line({ name: "Prints", hsn: "4802", qty: 7, rate: 19.99, gstRate: 5, discount: 5 }),
  ];

  it("adds up an intra-state invoice", () => {
    const totals = computeTotals({
      type: "tax",
      lines,
      supplierState: "29",
      placeOfSupply: "29",
    });
    expect(totals.interState).toBe(false);
    expect(totals.taxable).toBe(1250000 + 73650 + 13293);
    // 12500 × 9% = 1125; 736.50 × 6% = 44.19; 132.93 × 2.5% = 3.32
    expect(totals.cgst).toBe(112500 + 4419 + 332);
    expect(totals.sgst).toBe(totals.cgst);
    expect(totals.igst).toBe(0);
    expect(totals.beforeRounding).toBe(1336943 + 2 * 117251);
    expect(totals.total).toBe(1571400);
    expect(totals.roundOff).toBe(-45);
    expect(totals.rates.map((group) => group.rate)).toEqual([5, 12, 18]);
    expect(totals.hsn.map((group) => group.key)).toEqual([
      "4802|5",
      "4802|12",
      "998391|18",
    ]);
  });

  it("adds up an inter-state invoice", () => {
    const totals = computeTotals({
      type: "tax",
      lines,
      supplierState: "29",
      placeOfSupply: "27",
    });
    expect(totals.interState).toBe(true);
    expect(totals.cgst + totals.sgst).toBe(0);
    expect(totals.igst).toBe(225000 + 8838 + 665);
    expect(totals.total).toBe(roundToRupee(1336943 + 234503));
  });

  it("can leave the total unrounded", () => {
    const totals = computeTotals({
      type: "tax",
      lines,
      supplierState: "29",
      placeOfSupply: "29",
      roundOff: false,
    });
    expect(totals.roundOff).toBe(0);
    expect(totals.total).toBe(totals.beforeRounding);
  });

  it("charges no tax on a bill of supply", () => {
    const totals = computeTotals({
      type: "supply",
      lines,
      supplierState: "29",
      placeOfSupply: "27",
    });
    expect(totals.taxed).toBe(false);
    expect(totals.interState).toBe(false);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(roundToRupee(1336943));
  });

  it("formats rates", () => {
    expect(formatRate(18)).toBe("18%");
    expect(formatRate(0.25)).toBe("0.25%");
    expect(formatRate(1.5)).toBe("1.5%");
  });
});
