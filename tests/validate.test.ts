import { describe, expect, it } from "vitest";

import { emptyParty } from "../src/lib/model";
import {
  invoiceProblems,
  matchesSearch,
  partyProblems,
  profileProblems,
} from "../src/lib/validate";
import { invoice, profile } from "./helpers";

const fields = (problems: [string, string][]) => problems.map(([field]) => field);

describe("business details", () => {
  it("accepts a complete profile", () => {
    expect(profileProblems(profile())).toEqual([]);
  });

  it("needs a name and state", () => {
    const problems = profileProblems({ ...profile(), name: " ", stateCode: "" });
    expect(fields(problems)).toEqual(["name", "stateCode"]);
  });

  it("checks GSTIN, its state, email, IFSC and UPI ID", () => {
    expect(fields(profileProblems({ ...profile(), gstin: "29AAGCB7383J1Z5" }))).toEqual([
      "gstin",
    ]);
    expect(profileProblems({ ...profile(), stateCode: "27" })[0][1]).toMatch(
      /different state/,
    );
    expect(
      fields(
        profileProblems({ ...profile(), email: "x@", ifsc: "SBIN123", upiId: "nobody" }),
      ),
    ).toEqual(["email", "ifsc", "upiId"]);
    // all optional
    expect(
      profileProblems({ ...profile(), gstin: "", email: "", ifsc: "", upiId: "" }),
    ).toEqual([]);
  });
});

describe("customers", () => {
  it("needs a name and a valid GSTIN when given", () => {
    expect(fields(partyProblems(emptyParty()))).toEqual(["name"]);
    expect(
      partyProblems({
        ...emptyParty(),
        name: "A",
        gstin: "27AAACR5055K1Z7",
        stateCode: "27",
      }),
    ).toEqual([]);
    expect(
      fields(
        partyProblems({
          ...emptyParty(),
          name: "A",
          gstin: "27AAACR5055K1Z7",
          stateCode: "29",
        }),
      ),
    ).toEqual(["gstin"]);
  });
});

describe("invoices", () => {
  const ids = (problems: { field: string }[]) => problems.map((p) => p.field);

  it("accepts a complete invoice", () => {
    expect(invoiceProblems(invoice(), [])).toEqual([]);
  });

  it("refuses a number used by another document", () => {
    const other = invoice({ id: "2" });
    expect(ids(invoiceProblems(invoice(), [other]))).toEqual(["number"]);
    // saving the same invoice again is fine
    expect(invoiceProblems(invoice(), [invoice()])).toEqual([]);
  });

  it("checks number length, dates, place of supply and lines", () => {
    const problems = invoiceProblems(
      invoice({
        number: "INVOICE/2026-27/00001",
        dueDate: "2026-10-01",
        placeOfSupply: "",
        lines: [{ ...invoice().lines[0], name: "" }],
      }),
      [],
    );
    expect(ids(problems)).toEqual(["number", "dueDate", "placeOfSupply", "lines"]);
    expect(ids(invoiceProblems(invoice({ number: "", date: "" }), []))).toEqual([
      "number",
      "date",
    ]);
    expect(
      ids(invoiceProblems(invoice({ lines: [{ ...invoice().lines[0], qty: 0 }] }), [])),
    ).toEqual(["qty-0"]);
  });

  it("does not need a place of supply on a bill of supply", () => {
    expect(invoiceProblems(invoice({ type: "supply", placeOfSupply: "" }), [])).toEqual(
      [],
    );
  });
});

describe("search", () => {
  it("matches every word against number, customer, type and date", () => {
    const doc = invoice();
    expect(matchesSearch(doc, "")).toBe(true);
    expect(matchesSearch(doc, "malnad")).toBe(true);
    expect(matchesSearch(doc, "0001 malnad")).toBe(true);
    expect(matchesSearch(doc, "31/10/2026")).toBe(true);
    expect(matchesSearch(doc, "tax invoice")).toBe(true);
    expect(matchesSearch(doc, "credit")).toBe(false);
    expect(matchesSearch(doc, "malnad 0002")).toBe(false);
  });
});
