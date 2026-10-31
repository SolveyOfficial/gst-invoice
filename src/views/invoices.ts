import { app, save } from "../app";
import { textInput } from "../forms";
import { download } from "../lib/files";
import { docTitle, type Invoice } from "../lib/model";
import { formatInr } from "../lib/money";
import { formatDate } from "../lib/numbering";
import { computeTotals } from "../lib/tax";
import { invoicePdf, pdfFileName } from "../pdf";
import { field, h, runTask, statusArea } from "../ui";
import { openInvoice } from "./invoice";
import { matchesSearch } from "../lib/validate";
import type { View } from "./view";

const totalOf = (invoice: Invoice) =>
  computeTotals({
    type: invoice.type,
    lines: invoice.lines,
    supplierState: app.data.profile.stateCode,
    placeOfSupply: invoice.placeOfSupply,
    forceIgst: invoice.forceIgst,
    roundOff: app.data.profile.roundOff,
  }).total;

export const invoicesView: View = {
  id: "invoices",
  title: "Saved",
  heading: "Saved documents",
  description:
    "Every invoice, quotation and note you have saved in this browser. Back them up from the Backup page.",
  mount(container) {
    const search = textInput("", {
      type: "search",
      placeholder: "Number, customer or date",
    });
    const table = h("table", { class: "table" });
    const empty = h("p", { class: "note" });
    const status = statusArea();

    const render = () => {
      const query = search.value.trim();
      const invoices = app.data.invoices
        .filter((invoice) => matchesSearch(invoice, query))
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.number.localeCompare(a.number, undefined, { numeric: true }),
        );
      empty.textContent = app.data.invoices.length
        ? invoices.length
          ? ""
          : "Nothing matches your search."
        : "No documents saved yet. Make one on the New invoice page.";
      empty.hidden = !empty.textContent;
      table.hidden = invoices.length === 0;
      table.replaceChildren(
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { scope: "col" }, "Number"),
            h("th", { scope: "col" }, "Date"),
            h("th", { scope: "col" }, "Customer"),
            h("th", { scope: "col", class: "num" }, "Total"),
            h("th", { scope: "col" }, h("span", { class: "visually-hidden" }, "Actions")),
          ),
        ),
        h(
          "tbody",
          {},
          ...invoices.map((invoice) => {
            const pdf = h("button", { type: "button" }, "PDF");
            pdf.setAttribute("aria-label", `Download ${invoice.number} as PDF`);
            pdf.addEventListener("click", () =>
              runTask(status, [pdf], async () => {
                const bytes = await invoicePdf(app.data.profile, invoice);
                download(bytes, pdfFileName(invoice), "application/pdf");
                status.done(`Downloaded ${pdfFileName(invoice)}.`);
              }),
            );
            const action = (
              label: string,
              name: string,
              onClick: () => void,
              className = "",
            ) =>
              h(
                "button",
                {
                  type: "button",
                  class: className,
                  "aria-label": `${name} ${invoice.number}`,
                  on: { click: onClick },
                },
                label,
              );
            return h(
              "tr",
              {},
              h(
                "th",
                { scope: "row" },
                h("span", { class: "code" }, invoice.number),
                h("small", {}, docTitle(invoice.type)),
              ),
              h("td", {}, formatDate(invoice.date)),
              h("td", {}, invoice.customer.name),
              h("td", { class: "num" }, formatInr(totalOf(invoice))),
              h(
                "td",
                { class: "table__actions" },
                action("Open", "Open", () => openInvoice(invoice)),
                pdf,
                action("Duplicate", "Duplicate", () =>
                  openInvoice(invoice, { copy: true }),
                ),
                action(
                  "Delete",
                  "Delete",
                  () => {
                    if (confirm(`Delete ${invoice.number}? This cannot be undone.`)) {
                      app.data.invoices = app.data.invoices.filter(
                        (i) => i.id !== invoice.id,
                      );
                      void save("invoices");
                      status.done(`Deleted ${invoice.number}.`);
                      render();
                    }
                  },
                  "danger",
                ),
              ),
            );
          }),
        ),
      );
    };
    search.addEventListener("input", render);

    container.append(
      h("div", { class: "toolbar" }, field("Search", search)),
      status.element,
      empty,
      h("div", { class: "table-wrap" }, table),
    );
    invoicesView.show = render;
  },
};
