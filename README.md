# Solvey GST Invoice

A free GST invoice maker for India that runs entirely in your browser.

Live: https://solveyofficial.github.io/gst-invoice/

- **Documents**: tax invoices, bills of supply (no tax), proforma invoices,
  quotations and credit notes, as clean A4 PDFs with a live preview
- **Tax worked out**: CGST and SGST (or UTGST) within a state, IGST between
  states, for exports and for SEZ supplies; per-rate tax summary and an
  optional HSN/SAC-wise summary; optional cess; round-off to the nearest rupee
- **Indian formats**: amounts grouped as 1,23,456.50 and written in words with
  lakh and crore; numbers such as INV/2026-27/0001 that start again each
  financial year (1 April)
- **Checks**: GSTIN format, state code and check digit (the PAN is read from
  it), IFSC and UPI ID formats
- **Your business**: address, state, GSTIN, bank details, logo, signature or
  stamp, terms, and an optional UPI QR code for the amount due
- **Saved for reuse**: customers, items with HSN/SAC, unit, price and GST rate
  (any rate can be typed, as rates change), and every document, with search,
  duplicate and delete
- **Copies**: Original for Recipient, Duplicate for Transporter and
  Triplicate for Supplier in one PDF
- **Backup**: export everything as a JSON file and restore it in another
  browser

This tool helps you prepare invoices. It is not tax or legal advice: check
GST rates, the place of supply and the figures with your accountant.

## Private by design

Your data is saved only in this browser (IndexedDB) and is never uploaded.
The app has no analytics or tracking, and it serves its own fonts and PDF
renderer, so it loads nothing from other sites. Use the Backup page to keep a
copy of your data.

Built with [pdf-lib](https://pdf-lib.js.org), fontkit, the Noto Sans font
(embedded in the PDFs, so the ₹ sign prints everywhere),
[node-qrcode](https://github.com/soldair/node-qrcode) and Mozilla's
[pdf.js](https://mozilla.github.io/pdf.js/) for the preview.

## Development

You need Node.js 22.13 or later.

```sh
npm install
npm run dev        # development server
npm run lint       # Prettier and ESLint
npm run typecheck  # TypeScript
npm test           # unit tests
npm run build      # production build in dist/
```

Set `BASE_PATH` (for example `BASE_PATH=/gst-invoice/`) when the app is served
from a sub-path. The build also writes `THIRD_PARTY_NOTICES.md`, listing every
bundled package and font with its licence; the app links to it as "Licences".

When the repository is public, every push to `main` is published to GitHub
Pages.

## Licence

MIT, see LICENSE.
