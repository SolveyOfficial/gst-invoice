// Draws an invoice as an A4 PDF with pdf-lib. Text uses Noto Sans, which is
// embedded (only the characters used), so the rupee sign prints everywhere.
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { create as createQr } from "qrcode";

import { stateLabel } from "./gst";
import { COPY_LABELS, docTitle, type Invoice, type Profile } from "./model";
import { amountInWords, formatInr, formatNumber, formatPaise, toPaise } from "./money";
import { formatDate } from "./numbering";
import { computeTotals, formatRate, sgstLabel, type TaxGroup, type Totals } from "./tax";

/** Each style is a list of font files; a character is drawn with the first that has it. */
export interface FontFiles {
  regular: Uint8Array[];
  bold: Uint8Array[];
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM = PAGE_HEIGHT - 40;

const INK = rgb(0.1, 0.1, 0.13);
const MUTED = rgb(0.38, 0.38, 0.44);
const ACCENT = rgb(0.24, 0.21, 0.78);
const RULE = rgb(0.82, 0.82, 0.87);
const FILL = rgb(0.95, 0.94, 0.99);

/** A typeface made of several font files (Noto Sans comes split by script). */
class Face {
  private sets: Set<number>[];

  constructor(private fonts: PDFFont[]) {
    this.sets = fonts.map((font) => new Set(font.getCharacterSet()));
  }

  runs(text: string) {
    const runs: { font: PDFFont; text: string }[] = [];
    for (const char of text.replace(/[\t\r\n]/g, " ")) {
      const code = char.codePointAt(0)!;
      const index = this.sets.findIndex((set) => set.has(code));
      const font = this.fonts[Math.max(0, index)];
      const glyph = index < 0 ? "?" : char;
      const last = runs.at(-1);
      if (last?.font === font) {
        last.text += glyph;
      } else {
        runs.push({ font, text: glyph });
      }
    }
    return runs;
  }

  width(text: string, size: number) {
    return this.runs(text).reduce(
      (total, run) => total + run.font.widthOfTextAtSize(run.text, size),
      0,
    );
  }
}

interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: "left" | "right" | "center";
  /** For right and centre alignment: the width of the box. */
  width?: number;
}

interface Column {
  title: string;
  width: number;
  align?: "left" | "right" | "center";
}

export interface InvoicePdfInput {
  profile: Profile;
  invoice: Invoice;
  fonts: FontFiles;
}

const dataUrlBytes = (url: string) => {
  const base64 = url.slice(url.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/** The UPI payment link encoded in the QR code. */
export const upiLink = (options: {
  upiId: string;
  payee: string;
  paise: number;
  note: string;
}) => {
  const params = [
    `pa=${encodeURIComponent(options.upiId.trim())}`,
    `pn=${encodeURIComponent(options.payee.trim())}`,
    `am=${(options.paise / 100).toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent(options.note)}`,
  ];
  return `upi://pay?${params.join("&")}`;
};

/** Which copies to print: labels for the copies, or one unlabelled copy. */
const copyLabels = (invoice: Invoice) => {
  if (!["tax", "supply", "credit"].includes(invoice.type)) {
    return [""];
  }
  const labels = [...new Set(invoice.copies)]
    .sort()
    .map((index) => COPY_LABELS[index])
    .filter(Boolean);
  return labels.length ? labels : [""];
};

export const buildInvoicePdf = async ({
  profile,
  invoice,
  fonts,
}: InvoicePdfInput): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embed = (files: Uint8Array[]) =>
    Promise.all(files.map((bytes) => pdf.embedFont(bytes, { subset: true })));
  const regular = new Face(await embed(fonts.regular));
  const bold = new Face(await embed(fonts.bold));

  const embedImage = async (url: string): Promise<PDFImage | undefined> => {
    if (!url) {
      return undefined;
    }
    const bytes = dataUrlBytes(url);
    return url.startsWith("data:image/png") ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
  };
  const logo = await embedImage(profile.logo);
  const signature = await embedImage(profile.signature);

  const title = docTitle(invoice.type);
  const totals = computeTotals({
    type: invoice.type,
    lines: invoice.lines,
    supplierState: profile.stateCode,
    placeOfSupply: invoice.placeOfSupply,
    forceIgst: invoice.forceIgst,
    roundOff: profile.roundOff,
  });

  pdf.setTitle(`${title} ${invoice.number}`.trim());
  pdf.setAuthor(profile.name);
  pdf.setSubject(`${title} for ${invoice.customer.name}`);
  pdf.setCreator("Solvey GST Invoice");
  pdf.setProducer("Solvey GST Invoice (pdf-lib)");
  if (invoice.date) {
    const [y, m, d] = invoice.date.split("-").map(Number);
    pdf.setCreationDate(new Date(y, m - 1, d, 12));
  }

  for (const copy of copyLabels(invoice)) {
    const pages = drawCopy({
      pdf,
      regular,
      bold,
      logo,
      signature,
      profile,
      invoice,
      totals,
      title,
      copy,
    });
    pages.forEach((page, index) => {
      const footer = (text: string, x: number, align: TextOptions["align"]) =>
        drawText(page, regular, text, x, PAGE_HEIGHT - 22, {
          size: 7,
          color: MUTED,
          align,
          width: CONTENT,
        });
      footer("This is a computer-generated document.", MARGIN, "left");
      footer(invoice.number, MARGIN, "center");
      footer(`Page ${index + 1} of ${pages.length}`, MARGIN, "right");
    });
  }
  return pdf.save();
};

/** Draws text with its baseline `y` points from the top of the page. */
const drawText = (
  page: PDFPage,
  face: Face,
  text: string,
  x: number,
  y: number,
  options: TextOptions = {},
) => {
  const size = options.size ?? 9;
  const width = face.width(text, size);
  let left = x;
  if (options.align === "right") {
    left = x + (options.width ?? 0) - width;
  } else if (options.align === "center") {
    left = x + ((options.width ?? 0) - width) / 2;
  }
  for (const run of face.runs(text)) {
    page.drawText(run.text, {
      x: left,
      y: PAGE_HEIGHT - y,
      size,
      font: run.font,
      color: options.color ?? INK,
    });
    left += run.font.widthOfTextAtSize(run.text, size);
  }
};

/** Splits text into lines that fit a width, keeping the line breaks in it. */
const wrap = (face: Face, text: string, width: number, size: number) => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (face.width(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
      }
      // a word longer than the line is broken up
      line = "";
      for (const char of word) {
        if (face.width(line + char, size) > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
};

interface CopyContext {
  pdf: PDFDocument;
  regular: Face;
  bold: Face;
  logo?: PDFImage;
  signature?: PDFImage;
  profile: Profile;
  invoice: Invoice;
  totals: Totals;
  title: string;
  copy: string;
}

const fit = (image: PDFImage, maxWidth: number, maxHeight: number) => {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
};

const drawCopy = (context: CopyContext): PDFPage[] => {
  const { pdf, regular, bold, profile, invoice, totals, title, copy } = context;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const text = (value: string, x: number, top: number, options: TextOptions = {}) =>
    drawText(page, options.bold ? bold : regular, value, x, top, options);
  const rule = (top: number, x = MARGIN, width = CONTENT, color = RULE) =>
    page.drawLine({
      start: { x, y: PAGE_HEIGHT - top },
      end: { x: x + width, y: PAGE_HEIGHT - top },
      thickness: 0.6,
      color,
    });
  const box = (x: number, top: number, width: number, height: number, fill?: RGB) =>
    page.drawRectangle({
      x,
      y: PAGE_HEIGHT - top - height,
      width,
      height,
      color: fill,
      borderColor: fill ? undefined : RULE,
      borderWidth: fill ? 0 : 0.6,
    });

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = MARGIN;
    if (pages.length > 1) {
      text(`${title} ${invoice.number} (continued)`, MARGIN, y + 9, {
        size: 9,
        bold: true,
        color: MUTED,
      });
      if (copy) {
        text(copy, MARGIN, y + 9, {
          size: 8,
          color: MUTED,
          align: "right",
          width: CONTENT,
        });
      }
      y += 20;
    }
  };
  /** Starts a new page unless `height` points still fit on this one. */
  const ensure = (height: number) => {
    if (y + height > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  };

  newPage();

  // Header: seller on the left, document title on the right
  const titleWidth = 170;
  let left = MARGIN;
  if (context.logo) {
    const size = fit(context.logo, 72, 56);
    page.drawImage(context.logo, {
      x: MARGIN,
      y: PAGE_HEIGHT - y - size.height,
      ...size,
    });
    left += size.width + 12;
  }
  const sellerWidth = MARGIN + CONTENT - titleWidth - 12 - left;
  let top = y + 13;
  for (const line of wrap(bold, profile.name || "Your business name", sellerWidth, 14)) {
    text(line, left, top, { size: 14, bold: true });
    top += 17;
  }
  top -= 3;
  const sellerLines = [
    ...wrap(regular, profile.address, sellerWidth, 8.5),
    profile.stateCode ? `State: ${stateLabel(profile.stateCode)}` : "",
    [
      profile.gstin && `GSTIN: ${profile.gstin}`,
      profile.gstin && `PAN: ${profile.gstin.slice(2, 12)}`,
    ]
      .filter(Boolean)
      .join("   "),
    [
      profile.phone && `Phone: ${profile.phone}`,
      profile.email && `Email: ${profile.email}`,
    ]
      .filter(Boolean)
      .join("   "),
  ].filter(Boolean);
  for (const line of sellerLines.flatMap((l) => wrap(regular, l, sellerWidth, 8.5))) {
    text(line, left, top, { size: 8.5, color: line.startsWith("GSTIN") ? INK : MUTED });
    top += 11.5;
  }
  const titleX = MARGIN + CONTENT - titleWidth;
  text(title.toUpperCase(), titleX, y + 15, {
    size: 15,
    bold: true,
    color: ACCENT,
    align: "right",
    width: titleWidth,
  });
  let titleBottom = y + 22;
  if (copy) {
    const copyWidth = regular.width(copy, 7.5) + 12;
    box(titleX + titleWidth - copyWidth, y + 22, copyWidth, 14);
    text(copy, titleX, y + 32, {
      size: 7.5,
      color: MUTED,
      align: "right",
      width: titleWidth - 6,
    });
    titleBottom = y + 40;
  }
  if (invoice.reverseCharge && totals.taxed) {
    text("Tax payable on reverse charge", titleX, titleBottom + 10, {
      size: 7.5,
      bold: true,
      align: "right",
      width: titleWidth,
    });
    titleBottom += 14;
  }
  y = Math.max(top, titleBottom, context.logo ? y + 56 : 0) + 8;
  rule(y, MARGIN, CONTENT, ACCENT);
  y += 12;

  // Parties and document details
  const customer = invoice.customer;
  const details: [string, string][] = [
    [`${invoice.type === "quotation" ? "Quotation" : title} no.`, invoice.number],
    ["Date", formatDate(invoice.date)],
    ...(invoice.dueDate
      ? [
          [
            invoice.type === "quotation" ? "Valid until" : "Due date",
            formatDate(invoice.dueDate),
          ] as [string, string],
        ]
      : []),
    ...(invoice.type === "credit" && invoice.refNumber
      ? [
          ["Against invoice", invoice.refNumber] as [string, string],
          ...(invoice.refDate
            ? [["Invoice date", formatDate(invoice.refDate)] as [string, string]]
            : []),
        ]
      : []),
    ["Place of supply", stateLabel(invoice.placeOfSupply) || "-"],
    ...(totals.taxed
      ? [["Reverse charge", invoice.reverseCharge ? "Yes" : "No"] as [string, string]]
      : []),
  ];
  const partyLines = (party: {
    name: string;
    address: string;
    gstin: string;
    stateCode: string;
    phone: string;
    email: string;
  }) => [
    ...(party.address ? [party.address] : []),
    ...(party.gstin ? [`GSTIN: ${party.gstin}`] : []),
    ...(party.stateCode ? [`State: ${stateLabel(party.stateCode)}`] : []),
    ...[
      party.phone && `Phone: ${party.phone}`,
      party.email && `Email: ${party.email}`,
    ].filter((line): line is string => !!line),
  ];
  const detailsWidth = 190;
  const partyCount = invoice.shipTo.trim() ? 2 : 1;
  const partyWidth = (CONTENT - detailsWidth - 12 * partyCount) / partyCount;
  const blocks: { label: string; name: string; lines: string[] }[] = [
    { label: "Bill to", name: customer.name || "Customer", lines: partyLines(customer) },
  ];
  if (partyCount === 2) {
    const [first, ...rest] = invoice.shipTo.trim().split(/\r?\n/);
    blocks.push({
      label: "Ship to",
      name: first,
      lines: rest.length ? [rest.join("\n")] : [],
    });
  }
  const blockTop = y;
  let blockBottom = y;
  blocks.forEach((block, index) => {
    const x = MARGIN + index * (partyWidth + 12);
    let line = blockTop + 9;
    text(block.label.toUpperCase(), x, line, { size: 7, bold: true, color: ACCENT });
    line += 13;
    for (const name of wrap(bold, block.name, partyWidth, 10)) {
      text(name, x, line, { size: 10, bold: true });
      line += 13;
    }
    for (const entry of block.lines.flatMap((l) => wrap(regular, l, partyWidth, 8.5))) {
      text(entry, x, line, { size: 8.5, color: entry.startsWith("GSTIN") ? INK : MUTED });
      line += 11.5;
    }
    blockBottom = Math.max(blockBottom, line);
  });
  {
    const x = MARGIN + CONTENT - detailsWidth;
    let line = blockTop;
    box(x, line, detailsWidth, details.length * 15 + 8, FILL);
    line += 15;
    for (const [label, value] of details) {
      text(label, x + 8, line, { size: 8, color: MUTED });
      const valueLines = wrap(bold, value, detailsWidth - 96, 8.5);
      text(valueLines[0] ?? "", x + 88, line, {
        size: 8.5,
        bold: true,
        align: "right",
        width: detailsWidth - 96,
      });
      line += 15;
    }
    blockBottom = Math.max(blockBottom, line);
  }
  y = blockBottom + 10;

  // Items
  const hasDiscount = invoice.lines.some((line) => line.discount > 0);
  const columns: Column[] = [
    { title: "#", width: 18, align: "center" },
    { title: "Item", width: 0 },
    { title: "HSN/SAC", width: 50 },
    { title: "Qty", width: 52, align: "right" },
    { title: "Rate (₹)", width: 60, align: "right" },
    ...(hasDiscount ? [{ title: "Disc.", width: 34, align: "right" } as Column] : []),
    ...(totals.taxed
      ? [
          { title: "Taxable (₹)", width: 66, align: "right" } as Column,
          { title: "GST", width: 36, align: "right" } as Column,
        ]
      : []),
    { title: "Amount (₹)", width: 70, align: "right" },
  ];
  columns[1].width = CONTENT - columns.reduce((sum, column) => sum + column.width, 0);

  const drawRow = (
    cells: string[][],
    options: { bold?: boolean; size?: number; fill?: RGB; color?: RGB },
  ) => {
    const size = options.size ?? 8.5;
    const lineHeight = size + 3;
    const height = Math.max(...cells.map((cell) => cell.length)) * lineHeight + 8;
    if (options.fill) {
      box(MARGIN, y, CONTENT, height, options.fill);
    }
    let x = MARGIN;
    columns.forEach((column, index) => {
      cells[index]?.forEach((value, lineIndex) => {
        text(value, x + 4, y + 4 + size + lineIndex * lineHeight, {
          size,
          bold: options.bold,
          color: options.color,
          align: column.align,
          width: column.width - 8,
        });
      });
      x += column.width;
    });
    y += height;
    return height;
  };
  const tableHeader = () =>
    drawRow(
      columns.map((column) => [column.title]),
      { bold: true, size: 7.5, fill: FILL, color: ACCENT },
    );

  tableHeader();
  totals.lines.forEach((amounts, index) => {
    const line = amounts.line;
    const cells = [
      [String(index + 1)],
      wrap(regular, line.name || "-", columns[1].width - 8, 8.5),
      wrap(regular, line.hsn, columns[2].width - 8, 8.5),
      [`${formatNumber(line.qty)} ${line.unit}`.trim()],
      [formatPaise(toPaise(line.rate))],
      ...(hasDiscount
        ? [[line.discount ? `${formatNumber(line.discount, 2)}%` : ""]]
        : []),
      ...(totals.taxed
        ? [[formatPaise(amounts.taxable)], [formatRate(line.gstRate)]]
        : []),
      [formatPaise(amounts.total)],
    ];
    const height = Math.max(...cells.map((cell) => cell.length)) * 11.5 + 8;
    if (ensure(height)) {
      tableHeader();
    }
    drawRow(cells, {});
    rule(y);
  });
  y += 10;

  // Totals on the right, amount in words on the left
  const sgst = sgstLabel(profile.stateCode);
  const totalRows: [string, string][] = [];
  if (totals.taxed) {
    totalRows.push(["Taxable value", formatPaise(totals.taxable)]);
    if (totals.interState) {
      totalRows.push(["IGST", formatPaise(totals.igst)]);
    } else {
      totalRows.push(
        ["CGST", formatPaise(totals.cgst)],
        [sgst, formatPaise(totals.sgst)],
      );
    }
    if (totals.cess) {
      totalRows.push(["Cess", formatPaise(totals.cess)]);
    }
  } else {
    totalRows.push(["Subtotal", formatPaise(totals.taxable)]);
  }
  if (totals.roundOff) {
    totalRows.push([
      "Round off",
      `${totals.roundOff > 0 ? "+" : ""}${formatPaise(totals.roundOff)}`,
    ]);
  }
  const totalsWidth = 210;
  const wordsWidth = CONTENT - totalsWidth - 20;
  const words = wrap(bold, amountInWords(totals.total), wordsWidth, 9);
  const totalsHeight = totalRows.length * 15 + 26;
  ensure(Math.max(totalsHeight, words.length * 12 + 20));
  {
    const x = MARGIN + CONTENT - totalsWidth;
    let line = y + 10;
    for (const [label, value] of totalRows) {
      text(label, x + 8, line, { size: 8.5, color: MUTED });
      text(value, x, line, { size: 8.5, align: "right", width: totalsWidth - 8 });
      line += 15;
    }
    box(x, line - 6, totalsWidth, 24, ACCENT);
    const totalLabel = invoice.type === "credit" ? "Credit amount" : "Total";
    text(totalLabel, x + 8, line + 10, { size: 10, bold: true, color: rgb(1, 1, 1) });
    text(formatInr(totals.total), x, line + 10, {
      size: 11,
      bold: true,
      color: rgb(1, 1, 1),
      align: "right",
      width: totalsWidth - 8,
    });

    let wordsLine = y + 10;
    text("AMOUNT IN WORDS", MARGIN, wordsLine, { size: 7, bold: true, color: ACCENT });
    wordsLine += 13;
    for (const entry of words) {
      text(entry, MARGIN, wordsLine, { size: 9, bold: true });
      wordsLine += 12;
    }
    if (totals.taxed && totals.tax) {
      wordsLine += 4;
      const taxWords = `Tax amount: ${amountInWords(totals.tax)}`;
      for (const entry of wrap(regular, taxWords, wordsWidth, 7.5)) {
        text(entry, MARGIN, wordsLine, { size: 7.5, color: MUTED });
        wordsLine += 10;
      }
    }
    y = Math.max(line + 24, wordsLine) + 14;
  }

  // Tax summaries
  const summary = (
    titleText: string,
    groups: (TaxGroup & { hsn?: string })[],
    withHsn: boolean,
  ) => {
    const cols: Column[] = [
      ...(withHsn ? [{ title: "HSN/SAC", width: 60 } as Column] : []),
      { title: "GST rate", width: 50, align: "right" },
      { title: "Taxable (₹)", width: 0, align: "right" },
      ...(totals.interState
        ? [
            { title: "IGST rate", width: 54, align: "right" } as Column,
            { title: "IGST (₹)", width: 72, align: "right" } as Column,
          ]
        : [
            { title: "CGST rate", width: 54, align: "right" } as Column,
            { title: "CGST (₹)", width: 64, align: "right" } as Column,
            { title: `${sgst} rate`, width: 54, align: "right" } as Column,
            { title: `${sgst} (₹)`, width: 64, align: "right" } as Column,
          ]),
      ...(totals.cess
        ? [{ title: "Cess (₹)", width: 54, align: "right" } as Column]
        : []),
      { title: "Total tax (₹)", width: 72, align: "right" },
    ];
    const flexible = cols.find((column) => column.width === 0)!;
    flexible.width = CONTENT - cols.reduce((sum, column) => sum + column.width, 0);
    const row = (group: TaxGroup & { hsn?: string }, label?: string) => [
      ...(withHsn ? [label ?? group.hsn ?? ""] : []),
      withHsn && label ? "" : (label ?? formatRate(group.rate)),
      formatPaise(group.taxable),
      ...(totals.interState
        ? [label ? "" : formatRate(group.rate), formatPaise(group.igst)]
        : [
            label ? "" : formatRate(group.rate / 2),
            formatPaise(group.cgst),
            label ? "" : formatRate(group.rate / 2),
            formatPaise(group.sgst),
          ]),
      ...(totals.cess ? [formatPaise(group.cess)] : []),
      formatPaise(group.cgst + group.sgst + group.igst + group.cess),
    ];
    const rows = groups.map((group) => row(group));
    rows.push(
      row(
        {
          key: "total",
          rate: 0,
          taxable: totals.taxable,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          cess: totals.cess,
        },
        "Total",
      ),
    );
    const rowHeight = 15;
    ensure(22 + Math.min(rows.length, 4) * rowHeight + 18);
    text(titleText.toUpperCase(), MARGIN, y + 8, { size: 7, bold: true, color: ACCENT });
    y += 14;
    const header = () => {
      box(MARGIN, y, CONTENT, 16, FILL);
      let x = MARGIN;
      for (const column of cols) {
        text(column.title, x + 4, y + 11, {
          size: 7,
          bold: true,
          color: ACCENT,
          align: column.align,
          width: column.width - 8,
        });
        x += column.width;
      }
      y += 16;
    };
    header();
    rows.forEach((cells, index) => {
      if (ensure(rowHeight)) {
        header();
      }
      const last = index === rows.length - 1;
      let x = MARGIN;
      cols.forEach((column, columnIndex) => {
        text(cells[columnIndex], x + 4, y + 10.5, {
          size: 8,
          bold: last,
          align: column.align,
          width: column.width - 8,
        });
        x += column.width;
      });
      y += rowHeight;
      rule(y);
    });
    y += 14;
  };
  if (totals.taxed && totals.lines.length) {
    summary("Tax summary", totals.rates, false);
    if (profile.hsnSummary) {
      summary("HSN/SAC summary", totals.hsn, true);
    }
  }

  // Payment details and signature
  const bankLines = [
    profile.bankName &&
      `Bank: ${profile.bankName}${profile.branch ? `, ${profile.branch}` : ""}`,
    profile.accountName && `Account name: ${profile.accountName}`,
    profile.accountNumber && `Account no.: ${profile.accountNumber}`,
    profile.ifsc && `IFSC: ${profile.ifsc}`,
    profile.upiId && `UPI: ${profile.upiId}`,
  ].filter((line): line is string => !!line);
  const showQr =
    profile.upiQr &&
    !!profile.upiId &&
    totals.total > 0 &&
    ["tax", "supply", "proforma"].includes(invoice.type);
  const qrSize = 78;
  const signatureWidth = 180;
  const leftWidth = CONTENT - signatureWidth - 20;
  const paymentHeight = Math.max(
    bankLines.length ? bankLines.length * 11.5 + 18 : 0,
    showQr ? qrSize + 10 : 0,
    96,
  );
  ensure(paymentHeight);
  const paymentTop = y;
  if (bankLines.length || showQr) {
    let x = MARGIN;
    if (showQr) {
      const qr = createQr(
        upiLink({
          upiId: profile.upiId,
          payee: profile.name,
          paise: totals.total,
          note: `${title} ${invoice.number}`,
        }),
        { errorCorrectionLevel: "M" },
      );
      const count = qr.modules.size;
      const cell = qrSize / (count + 2);
      // quiet zone of one module, then dark modules drawn as runs per row
      box(MARGIN, y, qrSize, qrSize, rgb(1, 1, 1));
      for (let row = 0; row < count; row++) {
        let start = -1;
        for (let col = 0; col <= count; col++) {
          const dark = col < count && qr.modules.get(row, col);
          if (dark && start < 0) {
            start = col;
          } else if (!dark && start >= 0) {
            page.drawRectangle({
              x: MARGIN + cell * (start + 1),
              y: PAGE_HEIGHT - y - cell * (row + 2),
              width: cell * (col - start),
              height: cell,
              color: rgb(0, 0, 0),
            });
            start = -1;
          }
        }
      }
      x += qrSize + 12;
    }
    let line = y + 9;
    text("PAYMENT DETAILS", x, line, { size: 7, bold: true, color: ACCENT });
    line += 13;
    for (const entry of bankLines.flatMap((l) =>
      wrap(regular, l, leftWidth - (x - MARGIN), 8.5),
    )) {
      text(entry, x, line, { size: 8.5 });
      line += 11.5;
    }
    if (showQr) {
      text(`Scan to pay ${formatInr(totals.total)} with any UPI app`, x, line + 2, {
        size: 7.5,
        color: MUTED,
      });
    }
  }
  {
    const x = MARGIN + CONTENT - signatureWidth;
    text(`For ${profile.name || "your business"}`, x, y + 9, {
      size: 8.5,
      bold: true,
      align: "right",
      width: signatureWidth,
    });
    if (context.signature) {
      const size = fit(context.signature, 150, 52);
      page.drawImage(context.signature, {
        x: x + signatureWidth - size.width,
        y: PAGE_HEIGHT - (y + 16) - size.height,
        ...size,
      });
    }
    rule(y + 76, x + 30, signatureWidth - 30);
    text("Authorised signatory", x, y + 87, {
      size: 8,
      color: MUTED,
      align: "right",
      width: signatureWidth,
    });
  }
  y = paymentTop + paymentHeight + 8;

  // Notes and terms
  for (const [label, body] of [
    ["Notes", invoice.notes],
    ["Terms and conditions", profile.terms],
  ]) {
    if (!body.trim()) {
      continue;
    }
    const lines = wrap(regular, body.trim(), CONTENT, 8);
    ensure(Math.min(lines.length, 3) * 10.5 + 18);
    text(label.toUpperCase(), MARGIN, y + 9, { size: 7, bold: true, color: ACCENT });
    y += 21;
    for (const entry of lines) {
      ensure(10.5);
      text(entry, MARGIN, y, { size: 8, color: MUTED });
      y += 10.5;
    }
    y += 6;
  }
  return pages;
};
