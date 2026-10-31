import { describe, expect, it } from "vitest";

import { backupJson, emptyData, parseBackup } from "../src/lib/backup";
import { invoice, profile } from "./helpers";

describe("backup", () => {
  const data = {
    profile: { ...profile(), logo: "data:image/png;base64,iVBORw0KGgo=" },
    customers: [invoice().customer],
    items: [
      {
        id: "i1",
        name: "Paper",
        hsn: "4802",
        unit: "PCS",
        rate: 245.5,
        gstRate: 12,
        cessRate: 0,
      },
    ],
    invoices: [
      invoice(),
      invoice({ id: "2", type: "credit", number: "CN/2026-27/0001" }),
    ],
  };

  it("round-trips all data", () => {
    const text = backupJson(data, new Date("2026-10-31T10:00:00Z"));
    expect(JSON.parse(text).exportedAt).toBe("2026-10-31T10:00:00.000Z");
    expect(parseBackup(text)).toEqual(data);
  });

  it("refuses other files", () => {
    expect(() => parseBackup("not json")).toThrow(/not JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not a backup/);
    expect(() => parseBackup('{"app":"solvey-gst-invoice","version":99}')).toThrow(
      /newer version/,
    );
  });

  it("fills in missing and wrong values", () => {
    const restored = parseBackup(
      JSON.stringify({
        app: "solvey-gst-invoice",
        version: 1,
        profile: { name: "Shop", logo: "javascript:alert(1)", roundOff: "yes" },
        customers: [{ name: "A" }, null, 5],
        items: [{ name: "B", rate: "12" }],
        invoices: [
          { type: "weird", date: "31-10-2026", lines: [{ name: "C" }], copies: [0, 7] },
        ],
      }),
    );
    expect(restored.profile.name).toBe("Shop");
    expect(restored.profile.logo).toBe("");
    expect(restored.profile.roundOff).toBe(true);
    expect(restored.profile.prefixes.tax).toBe("INV");
    expect(restored.customers).toHaveLength(1);
    expect(restored.customers[0].id).not.toBe("");
    expect(restored.items[0].rate).toBe(0);
    expect(restored.invoices[0].type).toBe("tax");
    expect(restored.invoices[0].date).toBe("");
    expect(restored.invoices[0].lines[0]).toMatchObject({
      name: "C",
      qty: 1,
      unit: "NOS",
    });
    expect(restored.invoices[0].copies).toEqual([0]);
  });

  it("restores an empty backup", () => {
    expect(parseBackup(backupJson(emptyData()))).toEqual(emptyData());
  });
});
