// Dates, financial years (April to March) and invoice numbers.

/** Today's date as YYYY-MM-DD in local time. */
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

/** Adds days to a YYYY-MM-DD date. */
export const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
};

/** "2027-03-31" -> "31/03/2027" */
export const formatDate = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

/** The financial year a date falls in: "2026-04-01" -> "2026-27", "2026-03-31" -> "2025-26". */
export const financialYear = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

/** "INV/2026-27/0001" */
export const invoiceNumber = (prefix: string, fy: string, seq: number) =>
  `${prefix ? `${prefix}/` : ""}${fy}/${String(seq).padStart(4, "0")}`;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The sequence number in an invoice number with this prefix and year, or 0. */
export const sequenceOf = (number: string, prefix: string, fy: string) => {
  const pattern = new RegExp(
    `^${prefix ? `${escape(prefix)}/` : ""}${escape(fy)}/(\\d+)$`,
  );
  const match = pattern.exec(number.trim());
  return match ? Number(match[1]) : 0;
};

/**
 * The next number in a series. Each prefix (document type) has its own
 * series, which starts again at 1 every financial year.
 */
export const nextNumber = (
  existing: { number: string }[],
  prefix: string,
  date: string,
) => {
  const fy = financialYear(date);
  const last = Math.max(0, ...existing.map((doc) => sequenceOf(doc.number, prefix, fy)));
  return invoiceNumber(prefix, fy, last + 1);
};
