// Builds invoice PDFs in the browser and draws them for the preview. The
// fonts and the pdf.js worker are served by the app itself.
import latinBold from "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url";
import latinRegular from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import extBold from "@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url";
import extRegular from "@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url";

import type { FontFiles } from "./lib/invoice-pdf";
import type { Invoice, Profile } from "./lib/model";

let fonts: Promise<FontFiles> | undefined;

const fetchBytes = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const loadFonts = () =>
  (fonts ??= Promise.all(
    [latinRegular, extRegular, latinBold, extBold].map(fetchBytes),
  ).then(([a, b, c, d]) => ({ regular: [a, b], bold: [c, d] })));

export const invoicePdf = async (profile: Profile, invoice: Invoice) => {
  try {
    // pdf-lib and the font code are loaded only when the first PDF is made
    const [{ buildInvoicePdf }, files] = await Promise.all([
      import("./lib/invoice-pdf"),
      loadFonts(),
    ]);
    return await buildInvoicePdf({ profile, invoice, fonts: files });
  } catch (error) {
    fonts = undefined;
    throw error;
  }
};

/** A file name for an invoice: INV/2026-27/0001 -> INV-2026-27-0001.pdf */
export const pdfFileName = (invoice: Invoice) =>
  `${(invoice.number || "invoice").replace(/[^\w.-]+/g, "-")}.pdf`;

/** Draws every page of a PDF into canvases that fit `width` CSS pixels. */
export const renderPdf = async (bytes: Uint8Array, width: number) => {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: bytes.slice(), enableXfa: false });
  try {
    const doc = await task.promise;
    const canvases: HTMLCanvasElement[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
      canvas.setAttribute("role", "img");
      await page.render({ canvas, viewport, background: "#fff" }).promise;
      canvases.push(canvas);
    }
    return canvases;
  } finally {
    await task.destroy();
  }
};
