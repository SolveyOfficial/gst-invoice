import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildInvoicePdf, upiLink } from "../src/lib/invoice-pdf";
import { fonts, invoice, pdfText, profile, squash } from "./helpers";

describe("invoice PDF", () => {
  it("prints an intra-state tax invoice with CGST and SGST", async () => {
    const bytes = await buildInvoicePdf({
      profile: profile(),
      invoice: invoice(),
      fonts,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Tax Invoice INV/2026-27/0001");
    const [width, height] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);

    const [text] = await pdfText(bytes);
    // 10 × 350 = 3,500 and 2.5 × 1,200 less 10% = 2,700; 18% GST split in half
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("Original for Recipient");
    expect(text).toContain("6,200.00");
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
    expect(text).toContain("558.00");
    expect(squash(text)).toContain("Total₹7,316.00");
    expect(text).toContain("Rupees Seven Thousand Three Hundred Sixteen Only");
    expect(text).toContain("PAN: AAGCB7383J");
    expect(text).toContain("Karnataka (29)");
    expect(text).toContain("Scan to pay");
  });

  it("prints an inter-state invoice with IGST", async () => {
    const bytes = await buildInvoicePdf({
      profile: profile(),
      invoice: invoice({ placeOfSupply: "27", copies: [0, 1, 2] }),
      fonts,
    });
    const pages = await pdfText(bytes);
    expect(pages).toHaveLength(3);
    expect(pages[1]).toContain("Duplicate for Transporter");
    expect(pages[2]).toContain("Triplicate for Supplier");
    expect(pages[0]).toContain("IGST");
    expect(pages[0]).not.toContain("CGST");
    expect(pages[0]).toContain("1,116.00");
    expect(pages[0]).toContain("Maharashtra (27)");
  });

  it("prints a bill of supply without tax", async () => {
    const bytes = await buildInvoicePdf({
      profile: profile(),
      invoice: invoice({ type: "supply", number: "BOS/2026-27/0001" }),
      fonts,
    });
    const [text] = await pdfText(bytes);
    expect(text).toContain("BILL OF SUPPLY");
    expect(text).not.toContain("GST rate");
    expect(squash(text)).toContain("Total₹6,200.00");
  });

  it("flows long invoices onto more pages", async () => {
    const line = invoice().lines[0];
    const lines = Array.from({ length: 60 }, (_, i) => ({
      ...line,
      name: `Item ${i + 1}`,
    }));
    const bytes = await buildInvoicePdf({
      profile: { ...profile(), hsnSummary: true },
      invoice: invoice({ lines, notes: "Deliver to the back gate." }),
      fonts,
    });
    const pages = await pdfText(bytes);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain("Page 1 of");
    expect(pages.join(" ")).toContain("Item 60");
    expect(pages[1]).toContain("(continued)");
    expect(pages.join(" ")).toContain("HSN/SAC SUMMARY");
  });

  it("does not fail on characters the font lacks", async () => {
    const bytes = await buildInvoicePdf({
      profile: profile(),
      invoice: invoice({
        customer: { ...invoice().customer, name: "Café Łódź मुंबई 😀" },
      }),
      fonts,
    });
    const [text] = await pdfText(bytes);
    expect(squash(text)).toContain("CaféŁódź");
  });

  it("builds the UPI payment link", () => {
    expect(
      upiLink({
        upiId: "shop@sbi",
        payee: "Kaveri & Co",
        paise: 731600,
        note: "INV/2026-27/0001",
      }),
    ).toBe(
      "upi://pay?pa=shop%40sbi&pn=Kaveri%20%26%20Co&am=7316.00&cu=INR&tn=INV%2F2026-27%2F0001",
    );
  });
});
