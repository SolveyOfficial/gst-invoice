import { describe, expect, it } from "vitest";

import {
  gstinCheckChar,
  gstinError,
  isValidEmail,
  isValidGstin,
  isValidIfsc,
  isValidPan,
  isValidUpiId,
  panFromGstin,
  STATES,
  stateFromGstin,
  stateLabel,
} from "../src/lib/gst";

// Published GSTINs of well-known companies
const VALID = [
  "27AAPFU0939F1ZV",
  "27AAACR5055K1Z7",
  "24AAACC1206D1ZM",
  "29AAGCB7383J1Z4",
];

describe("GSTIN", () => {
  it("accepts valid GSTINs", () => {
    for (const gstin of VALID) {
      expect(gstinError(gstin)).toBe("");
      expect(isValidGstin(gstin)).toBe(true);
    }
  });

  it("works out the check character", () => {
    for (const gstin of VALID) {
      expect(gstinCheckChar(gstin.slice(0, 14))).toBe(gstin[14]);
    }
  });

  it("ignores case and spaces", () => {
    expect(isValidGstin(" 27aapfu0939f1zv ")).toBe(true);
    expect(isValidGstin("27 AAPFU 0939 F1ZV")).toBe(true);
  });

  it("rejects a wrong check character", () => {
    expect(gstinError("27AAPFU0939F1ZW")).toMatch(/check digit/);
    expect(isValidGstin("27AAACR5055K1Z8")).toBe(false);
  });

  it("rejects a single changed character", () => {
    // swapping one digit changes the check character
    expect(isValidGstin("27AAPFU0938F1ZV")).toBe(false);
    expect(isValidGstin("29AAPFU0939F1ZV")).toBe(false);
  });

  it("rejects bad formats and lengths", () => {
    expect(gstinError("")).toMatch(/15 characters/);
    expect(gstinError("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(gstinError("27AAPFU0939F1AV")).toMatch(/format/);
    expect(gstinError("2AAAPFU0939F1ZV")).toMatch(/format/);
    expect(gstinError("27AAPFU0939F0ZV")).toMatch(/format/);
  });

  it("rejects unknown state codes", () => {
    const first14 = "40AAPFU0939F1Z";
    expect(gstinError(first14 + gstinCheckChar(first14))).toMatch(/state code/);
  });

  it("gives the PAN and state", () => {
    expect(panFromGstin("27AAPFU0939F1ZV")).toBe("AAPFU0939F");
    expect(stateFromGstin("29AAGCB7383J1Z4")).toBe("29");
    expect(panFromGstin("27AAPFU0939F1ZW")).toBe("");
  });
});

describe("states", () => {
  it("lists every state and union territory once", () => {
    const codes = STATES.map((state) => state.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("38"); // Ladakh
    expect(codes).toContain("26"); // Dadra and Nagar Haveli and Daman and Diu
    expect(codes).toContain("36"); // Telangana
    expect(STATES.length).toBe(37);
  });

  it("labels states", () => {
    expect(stateLabel("29")).toBe("Karnataka (29)");
    expect(stateLabel("96")).toBe("Outside India (export) (96)");
  });
});

describe("other codes", () => {
  it("checks PAN", () => {
    expect(isValidPan("AAPFU0939F")).toBe(true);
    expect(isValidPan("AAPFU0939")).toBe(false);
  });

  it("checks IFSC", () => {
    expect(isValidIfsc("SBIN0001234")).toBe(true);
    expect(isValidIfsc("hdfc0abc123")).toBe(true);
    expect(isValidIfsc("SBIN1001234")).toBe(false);
    expect(isValidIfsc("SBI0001234")).toBe(false);
  });

  it("checks UPI IDs", () => {
    expect(isValidUpiId("shop.name@okhdfcbank")).toBe(true);
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    expect(isValidUpiId("no-at-sign")).toBe(false);
    expect(isValidUpiId("a@1bank")).toBe(false);
  });

  it("checks email addresses", () => {
    expect(isValidEmail("accounts@example.in")).toBe(true);
    expect(isValidEmail("accounts@example")).toBe(false);
  });
});
