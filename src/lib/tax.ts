// Works out line amounts, GST and totals for a document. All amounts are in
// paise (whole numbers) so they add up exactly.
import { FOREIGN } from "./gst";
import type { DocType, Line } from "./model";
import { toPaise } from "./money";

/** Union territories without a legislature charge UTGST instead of SGST. */
const UTGST_CODES = new Set(["04", "26", "31", "35", "38", "97"]);

export const sgstLabel = (supplierState: string) =>
  UTGST_CODES.has(supplierState) ? "UTGST" : "SGST";

/**
 * A supply is inter-state (IGST) when the supplier's state and the place of
 * supply differ, for exports, and when marked as such (for example SEZ units).
 */
export const isInterState = (
  supplierState: string,
  placeOfSupply: string,
  forceIgst = false,
) =>
  forceIgst ||
  placeOfSupply === FOREIGN.code ||
  (!!supplierState && !!placeOfSupply && supplierState !== placeOfSupply);

export interface LineAmounts {
  line: Line;
  /** qty × rate */
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  /** taxable + taxes */
  total: number;
}

export interface TaxGroup {
  key: string;
  /** GST rate in per cent */
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface HsnGroup extends TaxGroup {
  hsn: string;
}

export interface Totals {
  taxed: boolean;
  interState: boolean;
  lines: LineAmounts[];
  /** One row per GST rate */
  rates: TaxGroup[];
  /** One row per HSN/SAC code and rate */
  hsn: HsnGroup[];
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  tax: number;
  beforeRounding: number;
  roundOff: number;
  total: number;
}

const safe = (value: number) => (Number.isFinite(value) ? value : 0);

/** Amounts for one line. Each tax is rounded to the paisa on its own line. */
export const lineAmounts = (line: Line, taxed: boolean, interState: boolean) => {
  const gross = toPaise(safe(line.qty) * safe(line.rate));
  const discount = toPaise(
    (gross * Math.min(100, Math.max(0, safe(line.discount)))) / 10000,
  );
  const taxable = gross - discount;
  const rate = taxed ? safe(line.gstRate) : 0;
  const cessRate = taxed ? safe(line.cessRate) : 0;
  const igst = interState ? toPaise((taxable * rate) / 10000) : 0;
  // CGST and SGST are each half the rate, so they are always equal
  const half = interState ? 0 : toPaise((taxable * rate) / 20000);
  const cess = toPaise((taxable * cessRate) / 10000);
  return {
    line,
    gross,
    discount,
    taxable,
    cgst: half,
    sgst: half,
    igst,
    cess,
    total: taxable + 2 * half + igst + cess,
  } satisfies LineAmounts;
};

const addTo = <T extends TaxGroup>(map: Map<string, T>, key: string, make: () => T) => {
  let group = map.get(key);
  if (!group) {
    group = make();
    map.set(key, group);
  }
  return group;
};

export const documentIsTaxed = (type: DocType) => type !== "supply";

export const computeTotals = (options: {
  type: DocType;
  lines: Line[];
  supplierState: string;
  placeOfSupply: string;
  forceIgst?: boolean;
  roundOff?: boolean;
}): Totals => {
  const taxed = documentIsTaxed(options.type);
  const interState =
    taxed &&
    isInterState(options.supplierState, options.placeOfSupply, options.forceIgst);
  const lines = options.lines.map((line) => lineAmounts(line, taxed, interState));

  const rates = new Map<string, TaxGroup>();
  const hsn = new Map<string, HsnGroup>();
  for (const amounts of lines) {
    const rate = taxed ? safe(amounts.line.gstRate) : 0;
    const code = amounts.line.hsn.trim();
    const groups = [
      addTo(rates, String(rate), () => ({
        key: String(rate),
        rate,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
      })),
      addTo(hsn, `${code}|${rate}`, () => ({
        key: `${code}|${rate}`,
        hsn: code,
        rate,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
      })),
    ];
    for (const group of groups) {
      group.taxable += amounts.taxable;
      group.cgst += amounts.cgst;
      group.sgst += amounts.sgst;
      group.igst += amounts.igst;
      group.cess += amounts.cess;
    }
  }

  const sum = (pick: (amounts: LineAmounts) => number) =>
    lines.reduce((total, amounts) => total + pick(amounts), 0);
  const gross = sum((a) => a.gross);
  const discount = sum((a) => a.discount);
  const taxable = sum((a) => a.taxable);
  const cgst = sum((a) => a.cgst);
  const sgst = sum((a) => a.sgst);
  const igst = sum((a) => a.igst);
  const cess = sum((a) => a.cess);
  const tax = cgst + sgst + igst + cess;
  const beforeRounding = taxable + tax;
  const total =
    options.roundOff === false ? beforeRounding : roundToRupee(beforeRounding);

  return {
    taxed,
    interState,
    lines,
    rates: [...rates.values()].sort((a, b) => a.rate - b.rate),
    hsn: [...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
    gross,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    cess,
    tax,
    beforeRounding,
    roundOff: total - beforeRounding,
    total,
  };
};

/** Rounds paise to the nearest whole rupee; 50 paise rounds up. */
export const roundToRupee = (paise: number) =>
  paise < 0 ? -Math.round(-paise / 100) * 100 : Math.round(paise / 100) * 100;

/** "18%" or "0.25%" */
export const formatRate = (rate: number) => `${Number(rate.toFixed(3))}%`;
