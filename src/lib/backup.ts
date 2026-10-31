// The app's data, and the JSON backup file format.
import { UserError } from "./errors";
import {
  emptyLine,
  emptyParty,
  emptyProfile,
  newId,
  type DocType,
  type Invoice,
  type Item,
  type Line,
  type Party,
  type Profile,
  DOC_TYPES,
} from "./model";

export interface AppData {
  profile: Profile;
  customers: Party[];
  items: Item[];
  invoices: Invoice[];
}

export const BACKUP_APP = "solvey-gst-invoice";
export const BACKUP_VERSION = 1;

export const emptyData = (): AppData => ({
  profile: emptyProfile(),
  customers: [],
  items: [],
  invoices: [],
});

export const backupJson = (data: AppData, now = new Date()) =>
  JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      ...data,
    },
    null,
    2,
  );

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;
const image = (value: unknown) =>
  typeof value === "string" && /^data:image\/(png|jpeg);base64,/.test(value) ? value : "";

const list = <T>(value: unknown, read: (entry: Loose) => T) =>
  Array.isArray(value) ? value.filter(isObject).map(read) : [];

export const readProfile = (value: unknown): Profile => {
  const input = isObject(value) ? value : {};
  const base = emptyProfile();
  const prefixes = isObject(input.prefixes) ? input.prefixes : {};
  return {
    name: str(input.name),
    address: str(input.address),
    stateCode: str(input.stateCode),
    gstin: str(input.gstin),
    phone: str(input.phone),
    email: str(input.email),
    logo: image(input.logo),
    bankName: str(input.bankName),
    accountName: str(input.accountName),
    accountNumber: str(input.accountNumber),
    ifsc: str(input.ifsc),
    branch: str(input.branch),
    upiId: str(input.upiId),
    upiQr: bool(input.upiQr, base.upiQr),
    terms: str(input.terms),
    signature: image(input.signature),
    prefixes: Object.fromEntries(
      DOC_TYPES.map((doc) => [doc.value, str(prefixes[doc.value], doc.prefix)]),
    ) as Record<DocType, string>,
    hsnSummary: bool(input.hsnSummary, base.hsnSummary),
    roundOff: bool(input.roundOff, base.roundOff),
  };
};

export const readParty = (input: Loose): Party => ({
  ...emptyParty(),
  id: str(input.id) || newId(),
  name: str(input.name),
  gstin: str(input.gstin),
  address: str(input.address),
  stateCode: str(input.stateCode),
  phone: str(input.phone),
  email: str(input.email),
});

export const readItem = (input: Loose): Item => ({
  id: str(input.id) || newId(),
  name: str(input.name),
  hsn: str(input.hsn),
  unit: str(input.unit),
  rate: num(input.rate),
  gstRate: num(input.gstRate),
  cessRate: num(input.cessRate),
});

const readLine = (input: Loose): Line => {
  const base = emptyLine();
  return {
    name: str(input.name),
    hsn: str(input.hsn),
    unit: str(input.unit, base.unit),
    qty: num(input.qty, base.qty),
    rate: num(input.rate),
    discount: num(input.discount),
    gstRate: num(input.gstRate),
    cessRate: num(input.cessRate),
  };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const readInvoice = (input: Loose): Invoice => {
  const type = DOC_TYPES.some((doc) => doc.value === input.type)
    ? (input.type as DocType)
    : "tax";
  const date = str(input.date);
  return {
    id: str(input.id) || newId(),
    type,
    number: str(input.number),
    date: DATE.test(date) ? date : "",
    dueDate: DATE.test(str(input.dueDate)) ? str(input.dueDate) : "",
    placeOfSupply: str(input.placeOfSupply),
    customer: readParty(isObject(input.customer) ? input.customer : {}),
    shipTo: str(input.shipTo),
    reverseCharge: bool(input.reverseCharge, false),
    forceIgst: bool(input.forceIgst, false),
    lines: list(input.lines, readLine),
    notes: str(input.notes),
    refNumber: str(input.refNumber),
    refDate: str(input.refDate),
    copies: Array.isArray(input.copies)
      ? input.copies.filter((n): n is number => n === 0 || n === 1 || n === 2)
      : [0],
    createdAt: str(input.createdAt),
    updatedAt: str(input.updatedAt),
  };
};

/** Reads a backup file made by this app, filling in anything missing. */
export const parseBackup = (text: string): AppData => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UserError("This file is not a backup from this app (it is not JSON).");
  }
  if (!isObject(json) || json.app !== BACKUP_APP) {
    throw new UserError("This file is not a backup from Solvey GST Invoice.");
  }
  if (num(json.version) > BACKUP_VERSION) {
    throw new UserError("This backup was made by a newer version of the app.");
  }
  return {
    profile: readProfile(json.profile),
    customers: list(json.customers, readParty),
    items: list(json.items, readItem),
    invoices: list(json.invoices, readInvoice),
  };
};
