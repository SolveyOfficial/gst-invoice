import fs from "node:fs";
import path from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { FontFiles } from "../src/lib/invoice-pdf";
import { emptyParty, emptyProfile, type Invoice, type Profile } from "../src/lib/model";

const fontFile = (name: string) =>
  new Uint8Array(
    fs.readFileSync(path.join("node_modules/@fontsource/noto-sans/files", name)),
  );

export const fonts: FontFiles = {
  regular: [
    fontFile("noto-sans-latin-400-normal.woff"),
    fontFile("noto-sans-latin-ext-400-normal.woff"),
  ],
  bold: [
    fontFile("noto-sans-latin-700-normal.woff"),
    fontFile("noto-sans-latin-ext-700-normal.woff"),
  ],
};

export const profile = (): Profile => ({
  ...emptyProfile(),
  name: "Kaveri Prints Pvt Ltd",
  address: "12, 4th Cross, Indiranagar\nBengaluru 560038",
  stateCode: "29",
  gstin: "29AAGCB7383J1Z4",
  phone: "+91 98450 12345",
  email: "accounts@kaveriprints.example",
  bankName: "State Bank of India",
  branch: "Indiranagar",
  accountName: "Kaveri Prints Pvt Ltd",
  accountNumber: "00000012345678901",
  ifsc: "SBIN0001234",
  upiId: "kaveriprints@sbi",
  terms: "Payment within 15 days.\nGoods once sold will not be taken back.",
});

export const invoice = (values: Partial<Invoice> = {}): Invoice => ({
  id: "1",
  type: "tax",
  number: "INV/2026-27/0001",
  date: "2026-10-31",
  dueDate: "2026-11-15",
  placeOfSupply: "29",
  customer: {
    ...emptyParty(),
    id: "c1",
    name: "Malnad Traders",
    gstin: "29AAGCB7383J1Z4",
    address: "MG Road, Shivamogga",
    stateCode: "29",
  },
  shipTo: "",
  reverseCharge: false,
  forceIgst: false,
  lines: [
    {
      name: "Visiting cards (box of 100)",
      hsn: "4911",
      unit: "BOX",
      qty: 10,
      rate: 350,
      discount: 0,
      gstRate: 18,
      cessRate: 0,
    },
    {
      name: "Design service",
      hsn: "998391",
      unit: "HRS",
      qty: 2.5,
      rate: 1200,
      discount: 10,
      gstRate: 18,
      cessRate: 0,
    },
  ],
  notes: "",
  refNumber: "",
  refDate: "",
  copies: [0],
  createdAt: "",
  updatedAt: "",
  ...values,
});

/** Text without any white space, to compare text split into several runs. */
export const squash = (text: string) => text.replace(/\s+/g, "");

/** The text of each page, with runs joined by spaces. */
export const pdfText = async (bytes: Uint8Array) => {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  await task.destroy();
  return pages;
};
