// The data the app keeps, and defaults for it.

export type DocType = "tax" | "supply" | "proforma" | "quotation" | "credit";

export const DOC_TYPES: {
  value: DocType;
  label: string;
  title: string;
  prefix: string;
}[] = [
  { value: "tax", label: "Tax invoice", title: "Tax Invoice", prefix: "INV" },
  {
    value: "supply",
    label: "Bill of supply (no tax)",
    title: "Bill of Supply",
    prefix: "BOS",
  },
  {
    value: "proforma",
    label: "Proforma invoice",
    title: "Proforma Invoice",
    prefix: "PRO",
  },
  { value: "quotation", label: "Quotation", title: "Quotation", prefix: "QTN" },
  { value: "credit", label: "Credit note", title: "Credit Note", prefix: "CN" },
];

export const docTitle = (type: DocType) =>
  DOC_TYPES.find((doc) => doc.value === type)?.title ?? "Invoice";

export const COPY_LABELS = [
  "Original for Recipient",
  "Duplicate for Transporter",
  "Triplicate for Supplier",
] as const;

export interface Profile {
  name: string;
  address: string;
  stateCode: string;
  gstin: string;
  phone: string;
  email: string;
  /** Data URL of a PNG or JPEG image. */
  logo: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upiId: string;
  /** Print a UPI QR code for the amount due on tax invoices and bills of supply. */
  upiQr: boolean;
  terms: string;
  /** Data URL of a PNG or JPEG image. */
  signature: string;
  prefixes: Record<DocType, string>;
  hsnSummary: boolean;
  roundOff: boolean;
}

export interface Party {
  id: string;
  name: string;
  gstin: string;
  address: string;
  stateCode: string;
  phone: string;
  email: string;
}

export interface Item {
  id: string;
  name: string;
  hsn: string;
  unit: string;
  /** Price per unit in rupees, before tax. */
  rate: number;
  /** GST rate in per cent. */
  gstRate: number;
  /** Compensation cess in per cent of the taxable value. */
  cessRate: number;
}

export interface Line {
  name: string;
  hsn: string;
  unit: string;
  qty: number;
  /** Price per unit in rupees, before tax. */
  rate: number;
  /** Discount in per cent. */
  discount: number;
  gstRate: number;
  cessRate: number;
}

export interface Invoice {
  id: string;
  type: DocType;
  number: string;
  /** YYYY-MM-DD */
  date: string;
  dueDate: string;
  placeOfSupply: string;
  customer: Party;
  shipTo: string;
  reverseCharge: boolean;
  /** Supply to an SEZ or other supply that is inter-state whatever the states. */
  forceIgst: boolean;
  lines: Line[];
  notes: string;
  /** For credit notes: the original invoice. */
  refNumber: string;
  refDate: string;
  copies: number[];
  createdAt: string;
  updatedAt: string;
}

export const emptyProfile = (): Profile => ({
  name: "",
  address: "",
  stateCode: "",
  gstin: "",
  phone: "",
  email: "",
  logo: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
  branch: "",
  upiId: "",
  upiQr: true,
  terms: "",
  signature: "",
  prefixes: Object.fromEntries(DOC_TYPES.map((doc) => [doc.value, doc.prefix])) as Record<
    DocType,
    string
  >,
  hsnSummary: false,
  roundOff: true,
});

export const emptyParty = (): Party => ({
  id: "",
  name: "",
  gstin: "",
  address: "",
  stateCode: "",
  phone: "",
  email: "",
});

export const emptyLine = (): Line => ({
  name: "",
  hsn: "",
  unit: "NOS",
  qty: 1,
  rate: 0,
  discount: 0,
  gstRate: 18,
  cessRate: 0,
});

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const UNITS = [
  "NOS",
  "PCS",
  "BOX",
  "SET",
  "KGS",
  "GMS",
  "LTR",
  "MTR",
  "SQM",
  "HRS",
  "DAY",
  "MON",
];
