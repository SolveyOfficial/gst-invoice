// Checks on what the user typed, and search. Each check returns a list of
// [field, message] problems; an empty list means all is well.
import {
  gstinError,
  isValidEmail,
  isValidIfsc,
  isValidUpiId,
  stateFromGstin,
} from "./gst";
import { docTitle, type Invoice, type Party, type Profile } from "./model";
import { formatDate } from "./numbering";

/** Checks the business details. Returns [input, message] pairs for problems. */
export const profileProblems = (profile: Profile) => {
  const problems: [keyof Profile, string][] = [];
  if (!profile.name.trim()) {
    problems.push(["name", "Enter your business name."]);
  }
  if (!profile.stateCode) {
    problems.push(["stateCode", "Choose your state. It decides CGST/SGST or IGST."]);
  }
  if (profile.gstin) {
    const error = gstinError(profile.gstin);
    if (error) {
      problems.push(["gstin", error]);
    } else if (profile.stateCode && stateFromGstin(profile.gstin) !== profile.stateCode) {
      problems.push(["gstin", "The GSTIN starts with a different state code."]);
    }
  }
  if (profile.email && !isValidEmail(profile.email)) {
    problems.push(["email", "This email address does not look right."]);
  }
  if (profile.ifsc && !isValidIfsc(profile.ifsc)) {
    problems.push([
      "ifsc",
      "An IFSC is 11 characters: 4 letters, 0, then 6 letters or digits.",
    ]);
  }
  if (profile.upiId && !isValidUpiId(profile.upiId)) {
    problems.push(["upiId", "A UPI ID looks like name@bank."]);
  }
  return problems;
};

/** Checks a customer. Returns [field, message] pairs for problems. */
export const partyProblems = (party: Party) => {
  const problems: [keyof Party, string][] = [];
  if (!party.name.trim()) {
    problems.push(["name", "Enter the customer's name."]);
  }
  if (party.gstin) {
    const error = gstinError(party.gstin);
    if (error) {
      problems.push(["gstin", error]);
    } else if (party.stateCode && stateFromGstin(party.gstin) !== party.stateCode) {
      problems.push(["gstin", "The GSTIN starts with a different state code."]);
    }
  }
  if (party.email && !isValidEmail(party.email)) {
    problems.push(["email", "This email address does not look right."]);
  }
  return problems;
};

/** Finds problems that stop an invoice being saved. */
export const invoiceProblems = (invoice: Invoice, others: Invoice[]) => {
  const problems: { field: string; message: string }[] = [];
  if (!invoice.number.trim()) {
    problems.push({ field: "number", message: "Enter a number." });
  } else if (
    others.some(
      (other) => other.id !== invoice.id && other.number === invoice.number.trim(),
    )
  ) {
    problems.push({
      field: "number",
      message: "Another document already has this number.",
    });
  } else if (invoice.number.trim().length > 16 && invoice.type !== "quotation") {
    problems.push({ field: "number", message: "GST allows at most 16 characters." });
  }
  if (!invoice.date) {
    problems.push({ field: "date", message: "Choose a date." });
  }
  if (invoice.dueDate && invoice.date && invoice.dueDate < invoice.date) {
    problems.push({
      field: "dueDate",
      message: "This is before the date of the document.",
    });
  }
  if (invoice.type !== "supply" && !invoice.placeOfSupply) {
    problems.push({ field: "placeOfSupply", message: "Choose the place of supply." });
  }
  if (!invoice.lines.some((line) => line.name.trim())) {
    problems.push({ field: "lines", message: "Add at least one item." });
  }
  invoice.lines.forEach((line, index) => {
    if (line.name.trim() && !(line.qty > 0)) {
      problems.push({ field: `qty-${index}`, message: "Enter a quantity." });
    }
  });
  return problems;
};

/** True when every word of the search appears in the invoice's number, customer, type or date. */
export const matchesSearch = (invoice: Invoice, query: string) => {
  const haystack = [
    invoice.number,
    invoice.customer.name,
    invoice.customer.gstin,
    docTitle(invoice.type),
    formatDate(invoice.date),
    invoice.date,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};
