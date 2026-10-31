// GST state codes, and checks for GSTIN, PAN, IFSC and UPI IDs.

export interface State {
  code: string;
  name: string;
}

/** States and union territories with their GST state codes. */
export const STATES: State[] = [
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "18", name: "Assam" },
  { code: "10", name: "Bihar" },
  { code: "04", name: "Chandigarh" },
  { code: "22", name: "Chhattisgarh" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "07", name: "Delhi" },
  { code: "30", name: "Goa" },
  { code: "24", name: "Gujarat" },
  { code: "06", name: "Haryana" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "20", name: "Jharkhand" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "38", name: "Ladakh" },
  { code: "31", name: "Lakshadweep" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "27", name: "Maharashtra" },
  { code: "14", name: "Manipur" },
  { code: "17", name: "Meghalaya" },
  { code: "15", name: "Mizoram" },
  { code: "13", name: "Nagaland" },
  { code: "21", name: "Odisha" },
  { code: "34", name: "Puducherry" },
  { code: "03", name: "Punjab" },
  { code: "08", name: "Rajasthan" },
  { code: "11", name: "Sikkim" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "16", name: "Tripura" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "05", name: "Uttarakhand" },
  { code: "19", name: "West Bengal" },
  { code: "97", name: "Other Territory" },
];

/** Place of supply for exports. Always taxed as inter-state (IGST). */
export const FOREIGN: State = { code: "96", name: "Outside India (export)" };

/** State codes a GSTIN may start with, including older and special ones. */
const GSTIN_STATE_CODES = new Set([
  ...STATES.map((state) => state.code),
  "25", // Daman and Diu, before the 2020 merger
  "28", // Andhra Pradesh, before 2014
  "99", // Centre jurisdiction
]);

export const stateName = (code: string) =>
  [...STATES, FOREIGN].find((state) => state.code === code)?.name ?? "";

/** "Karnataka (29)" */
export const stateLabel = (code: string) => {
  const name = stateName(code);
  return name ? `${name} (${code})` : code;
};

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Works out the 15th (check) character of a GSTIN from the first 14. */
export const gstinCheckChar = (first14: string) => {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(first14[i]);
    if (value < 0) {
      throw new Error(`Invalid character in GSTIN: ${first14[i]}`);
    }
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normaliseCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/**
 * Checks a GSTIN: its format, state code and check character. Returns an
 * error message, or "" when it is valid.
 */
export const gstinError = (input: string): string => {
  const value = normaliseCode(input);
  if (value.length !== 15) {
    return "A GSTIN has 15 characters.";
  }
  if (!GSTIN_PATTERN.test(value)) {
    return "This is not in the GSTIN format (for example 29ABCDE1234F1Z5).";
  }
  if (!GSTIN_STATE_CODES.has(value.slice(0, 2))) {
    return `${value.slice(0, 2)} is not a GST state code.`;
  }
  if (gstinCheckChar(value.slice(0, 14)) !== value[14]) {
    return "The last character (check digit) does not match. Check for a typing mistake.";
  }
  return "";
};

export const isValidGstin = (input: string) => gstinError(input) === "";

/** The PAN inside a GSTIN (characters 3 to 12). */
export const panFromGstin = (input: string) => {
  const value = normaliseCode(input);
  return isValidGstin(value) ? value.slice(2, 12) : "";
};

/** The state code a GSTIN starts with. */
export const stateFromGstin = (input: string) => {
  const value = normaliseCode(input);
  return isValidGstin(value) ? value.slice(0, 2) : "";
};

export const isValidPan = (input: string) =>
  /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normaliseCode(input));

/** IFSC: 4 letters (bank), a zero, then 6 letters or digits (branch). */
export const isValidIfsc = (input: string) =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normaliseCode(input));

/** UPI ID (virtual payment address), such as name@bank. */
export const isValidUpiId = (input: string) =>
  /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(input.trim());

export const isValidEmail = (input: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

/** Common GST rates. Others can be typed in, as rates change from time to time. */
export const COMMON_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

export const isValidGstRate = (rate: number) =>
  Number.isFinite(rate) && rate >= 0 && rate <= 100;
