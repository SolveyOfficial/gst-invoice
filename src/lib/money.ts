// Money in paise (whole numbers), Indian digit grouping and amounts in words.

/** Rounds rupees to whole paise, halves away from zero. */
export const toPaise = (rupees: number) => {
  const scaled = Math.abs(rupees) * 100;
  // tiny nudge so 1.005 (stored as 1.00499...) rounds the way people expect
  const rounded = Math.round(scaled + 1e-7);
  return rupees < 0 ? -rounded : rounded;
};

/** Groups the digits of a whole number the Indian way: 12345678 -> 1,23,45,678. */
export const groupIndian = (digits: string) => {
  if (digits.length <= 3) {
    return digits;
  }
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+$)/g, ",")},${last3}`;
};

/** Formats paise as rupees with Indian grouping: 12345650 -> "1,23,456.50". */
export const formatPaise = (paise: number) => {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${groupIndian(String(rupees))}.${fraction}`;
};

/** Formats rupees with Indian grouping and two decimals. */
export const formatRupees = (rupees: number) => formatPaise(toPaise(rupees));

/** "₹1,23,456.50" */
export const formatInr = (paise: number) =>
  paise < 0 ? `-₹${formatPaise(-paise)}` : `₹${formatPaise(paise)}`;

/** Formats a quantity or rate with up to `max` decimals, no grouping of fractions. */
export const formatNumber = (value: number, max = 3) => {
  const factor = 10 ** max;
  const rounded = Math.round(Math.abs(value) * factor + 1e-7) / factor;
  const fixed = rounded.toFixed(max).replace(/\.?0+$/, "");
  const [whole, fraction] = fixed.replace("-", "").split(".");
  return `${value < 0 ? "-" : ""}${groupIndian(whole)}${fraction ? `.${fraction}` : ""}`;
};

/** Parses a number typed by a person, allowing commas: "1,23,456.5" -> 123456.5. */
export const parseAmount = (input: string) => {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (cleaned === "") {
    return 0;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

/** 0 to 99 in words: 45 -> "Forty-Five". */
const twoDigits = (n: number) => {
  if (n < 20) {
    return ONES[n];
  }
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 ? `${tens}-${ONES[n % 10]}` : tens;
};

/** 1 to 999 in words. */
const threeDigits = (n: number) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds && `${ONES[hundreds]} Hundred`, rest && twoDigits(rest)]
    .filter(Boolean)
    .join(" ");
};

/**
 * A whole number in words with the Indian system:
 * 12345678 -> "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight".
 */
export const numberToWords = (value: number): string => {
  const n = Math.floor(Math.abs(value));
  if (n === 0) {
    return "Zero";
  }
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) {
    // 100 crore and above: "One Hundred Twenty-Three Crore"
    parts.push(`${numberToWords(crore)} Crore`);
  }
  if (lakh) {
    parts.push(`${twoDigits(lakh)} Lakh`);
  }
  if (thousand) {
    parts.push(`${twoDigits(thousand)} Thousand`);
  }
  if (rest) {
    parts.push(threeDigits(rest));
  }
  return parts.join(" ");
};

/**
 * An amount in words for an invoice:
 * 12345650 paise -> "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only".
 */
export const amountInWords = (paise: number) => {
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const minus = paise < 0 ? "Minus " : "";
  if (rupees === 0 && fraction > 0) {
    return `${minus}${twoDigits(fraction)} Paise Only`;
  }
  const words = `${minus}Rupees ${numberToWords(rupees)}`;
  return fraction ? `${words} and ${twoDigits(fraction)} Paise Only` : `${words} Only`;
};
