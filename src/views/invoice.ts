import { app, go, save } from "../app";
import {
  dataList,
  numberInput,
  readNumber,
  stateSelect,
  textArea,
  textInput,
} from "../forms";
import { stateLabel } from "../lib/gst";
import {
  COPY_LABELS,
  DOC_TYPES,
  emptyLine,
  emptyParty,
  newId,
  type DocType,
  type Invoice,
  type Line,
} from "../lib/model";
import { amountInWords, formatInr, formatPaise } from "../lib/money";
import { addDays, nextNumber, today } from "../lib/numbering";
import { computeTotals, formatRate, lineAmounts, sgstLabel } from "../lib/tax";
import { download } from "../lib/files";
import { UserError } from "../lib/errors";
import { invoicePdf, pdfFileName, renderPdf } from "../pdf";
import { checkbox, field, h, iconButton, runTask, setError, statusArea } from "../ui";
import { partyFields } from "./customers";
import { invoiceProblems, partyProblems, profileProblems } from "../lib/validate";
import type { View } from "./view";

const blankInvoice = (type: DocType = "tax"): Invoice => {
  const date = today();
  return {
    id: newId(),
    type,
    number: numberFor(type, date, ""),
    date,
    dueDate: addDays(date, 15),
    placeOfSupply: "",
    customer: emptyParty(),
    shipTo: "",
    reverseCharge: false,
    forceIgst: false,
    lines: [emptyLine()],
    notes: "",
    refNumber: "",
    refDate: "",
    copies: [0],
    createdAt: "",
    updatedAt: "",
  };
};

/** The next free number for a document type, ignoring the invoice being edited. */
const numberFor = (type: DocType, date: string, id: string) =>
  nextNumber(
    app.data.invoices.filter((invoice) => invoice.id !== id),
    app.data.profile.prefixes[type],
    date || today(),
  );

let draft: Invoice;
let autoNumber = true;
/** Set when an invoice is opened before the form was first shown. */
let opened = false;
let fillForm: () => void = () => {};

/** Opens an invoice in the form: a saved one to edit, or a copy. */
export const openInvoice = (invoice: Invoice, options: { copy?: boolean } = {}) => {
  draft = structuredClone(invoice);
  opened = true;
  autoNumber = false;
  if (options.copy) {
    draft.id = newId();
    draft.date = today();
    draft.dueDate = invoice.dueDate ? addDays(draft.date, 15) : "";
    draft.number = numberFor(draft.type, draft.date, draft.id);
    draft.createdAt = "";
    draft.updatedAt = "";
    autoNumber = true;
  }
  fillForm();
  go("invoice");
};

export const isSaved = (invoice: Invoice) =>
  app.data.invoices.some((saved) => saved.id === invoice.id);

export const invoiceView: View = {
  id: "invoice",
  title: "New invoice",
  heading: "Invoice",
  description:
    "Fill in the details and the tax is worked out for you. Check the preview, then save and download the PDF.",
  mount(container) {
    const status = statusArea();
    const setupNotice = h(
      "p",
      { class: "notice notice--warning" },
      "Add your business name and state first, so the right tax can be worked out. ",
      h("a", { href: "#profile" }, "Add your business details"),
    );

    // Document details
    const typeSelect = h(
      "select",
      {},
      ...DOC_TYPES.map((doc) => h("option", { value: doc.value }, doc.label)),
    );
    const number = textInput("", { maxlength: 30, class: "code", spellcheck: false });
    const date = h("input", { type: "date" });
    const dueDate = h("input", { type: "date" });
    const dueLabel = h("span");
    const refNumber = textInput("", { list: "invoice-numbers", class: "code" });
    const refDate = h("input", { type: "date" });
    const copies = COPY_LABELS.map((label, index) =>
      checkbox(label, false, (checked) => {
        draft.copies = checked
          ? [...draft.copies, index].sort()
          : draft.copies.filter((n) => n !== index);
        changed();
      }),
    );
    const copiesGroup = h(
      "fieldset",
      { class: "check-group" },
      h("legend", {}, "Copies to print"),
      ...copies.map((copy) => copy.element),
    );
    const creditFields = h(
      "div",
      { class: "form-grid" },
      field("Against invoice no.", refNumber, "The invoice this credit note reduces"),
      field("Invoice date", refDate),
    );
    const dueField = field("Due date", dueDate);
    dueField.querySelector("label")!.replaceChildren(dueLabel);

    // Customer
    const customerSelect = h("select", {});
    const party = partyFields(emptyParty(), () => {
      const before = draft.customer.stateCode;
      draft.customer = party.read();
      if (draft.customer.stateCode !== before && draft.customer.stateCode) {
        draft.placeOfSupply = draft.customer.stateCode;
        placeOfSupply.value = draft.placeOfSupply;
      }
      changed();
    });
    const placeOfSupply = stateSelect("", { foreign: true });
    const supplyHint = h("small", { class: "supply-kind" });
    const saveCustomer = checkbox("Add to saved customers", true);
    const forceIgst = checkbox(
      "Charge IGST even within the state",
      false,
      (checked) => {
        draft.forceIgst = checked;
        changed();
      },
      "For supplies to SEZ units and similar cases.",
    );
    const reverseCharge = checkbox(
      "Tax is payable on reverse charge",
      false,
      (checked) => {
        draft.reverseCharge = checked;
        changed();
      },
    );
    const shipTo = textArea("", 3, { placeholder: "Name\nAddress" });

    // Lines
    const lines = h("div", { class: "lines" });
    const linesError = h("p", { class: "field__error", hidden: true, id: "lines-error" });
    const addLine = h("button", { type: "button" }, "Add a line");
    const saveItems = checkbox("Add new items to saved items", true);
    const notes = textArea("", 2);

    // Summary and actions
    const summary = h("div", { class: "summary", "aria-live": "polite" });
    const saveButton = h("button", { type: "button" }, "Save");
    const pdfButton = h(
      "button",
      { type: "button", class: "primary" },
      "Save and download PDF",
    );
    const newButton = h("button", { type: "button" }, "New invoice");
    const preview = h("div", { class: "preview__pages" });
    const previewStatus = h("p", { class: "note preview__status" });

    const controls: Record<
      string,
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    > = {
      number,
      date,
      dueDate,
      placeOfSupply,
    };

    const typeIsTaxed = () => draft.type !== "supply";

    const lineRow = (line: Line, index: number) => {
      const cell = (
        label: string,
        input: HTMLInputElement,
        className: string,
        update: () => void,
      ) => {
        input.addEventListener("input", () => {
          update();
          lineChanged();
        });
        input.setAttribute("aria-label", `${label}, line ${index + 1}`);
        return h(
          "label",
          { class: `line__cell line__cell--${className}` },
          h("span", { class: "line__label" }, label),
          input,
        );
      };
      const name = textInput(line.name, { list: "saved-items" });
      const hsn = textInput(line.hsn, { inputmode: "numeric", maxlength: 8 });
      const qty = numberInput(line.qty);
      qty.id = `qty-${index}`;
      const unit = textInput(line.unit, { list: "units", maxlength: 8 });
      const rate = numberInput(line.rate);
      const discount = numberInput(line.discount, { max: 100 });
      const gstRate = numberInput(line.gstRate, { list: "gst-rates", max: 100 });
      const cessRate = numberInput(line.cessRate, { max: 400 });
      const amount = h("output", { class: "line__amount" });
      const lineChanged = () => {
        const amounts = lineAmounts(draft.lines[index], typeIsTaxed(), false);
        amount.textContent = formatPaise(amounts.taxable);
        changed();
      };
      const row = h(
        "div",
        { class: "line", role: "group", "aria-label": `Line ${index + 1}` },
        cell("Item or service", name, "name", () => {
          draft.lines[index].name = name.value;
          const saved = app.data.items.find(
            (item) => item.name.toLowerCase() === name.value.trim().toLowerCase(),
          );
          if (saved) {
            Object.assign(draft.lines[index], {
              name: saved.name,
              hsn: saved.hsn,
              unit: saved.unit,
              rate: saved.rate,
              gstRate: saved.gstRate,
              cessRate: saved.cessRate,
            });
            hsn.value = saved.hsn;
            unit.value = saved.unit;
            rate.value = String(saved.rate);
            gstRate.value = String(saved.gstRate);
            cessRate.value = String(saved.cessRate);
          }
        }),
        cell("HSN/SAC", hsn, "hsn", () => (draft.lines[index].hsn = hsn.value.trim())),
        cell("Qty", qty, "qty", () => (draft.lines[index].qty = readNumber(qty))),
        cell(
          "Unit",
          unit,
          "unit",
          () => (draft.lines[index].unit = unit.value.trim().toUpperCase()),
        ),
        cell(
          "Rate (₹)",
          rate,
          "rate",
          () => (draft.lines[index].rate = readNumber(rate)),
        ),
        cell(
          "Disc. %",
          discount,
          "discount",
          () => (draft.lines[index].discount = readNumber(discount)),
        ),
        cell(
          "GST %",
          gstRate,
          "gst tax-only",
          () => (draft.lines[index].gstRate = readNumber(gstRate)),
        ),
        cell(
          "Cess %",
          cessRate,
          "cess tax-only",
          () => (draft.lines[index].cessRate = readNumber(cessRate)),
        ),
        h(
          "div",
          { class: "line__cell line__cell--amount" },
          h("span", { class: "line__label" }, "Taxable value"),
          amount,
        ),
        h(
          "div",
          { class: "line__cell line__cell--remove" },
          iconButton(
            `Remove line ${index + 1}`,
            "✕",
            () => {
              draft.lines.splice(index, 1);
              if (!draft.lines.length) {
                draft.lines.push(emptyLine());
              }
              renderLines();
              changed();
            },
            "danger",
          ),
        ),
        h("small", {
          class: "field__error line__error",
          id: `qty-${index}-error`,
          hidden: true,
        }),
      );
      amount.textContent = formatPaise(lineAmounts(line, typeIsTaxed(), false).taxable);
      return row;
    };

    const renderLines = () => {
      lines.replaceChildren(
        h(
          "div",
          { class: "line line--head", "aria-hidden": "true" },
          ...[
            "Item or service",
            "HSN/SAC",
            "Qty",
            "Unit",
            "Rate (₹)",
            "Disc. %",
            "GST %",
            "Cess %",
            "Taxable value",
            "",
          ].map((label, i) =>
            h(
              "span",
              {
                class: `line__cell${i === 6 || i === 7 ? " tax-only" : ""}${i >= 2 && i !== 3 ? " line__cell--num" : ""}`,
              },
              label,
            ),
          ),
        ),
        ...draft.lines.map(lineRow),
      );
    };
    addLine.addEventListener("click", () => {
      draft.lines.push(emptyLine());
      renderLines();
      lines.querySelector<HTMLInputElement>(".line:last-child input")?.focus();
      changed();
    });

    const updateSummary = () => {
      const profile = app.data.profile;
      const totals = computeTotals({
        type: draft.type,
        lines: draft.lines,
        supplierState: profile.stateCode,
        placeOfSupply: draft.placeOfSupply,
        forceIgst: draft.forceIgst,
        roundOff: profile.roundOff,
      });
      const row = (label: string, value: string, className = "") =>
        h(
          "div",
          { class: `summary__row ${className}` },
          h("dt", {}, label),
          h("dd", {}, value),
        );
      const rows = [
        row(totals.taxed ? "Taxable value" : "Subtotal", formatPaise(totals.taxable)),
      ];
      if (totals.taxed) {
        if (totals.interState) {
          rows.push(row("IGST", formatPaise(totals.igst)));
        } else {
          rows.push(
            row("CGST", formatPaise(totals.cgst)),
            row(sgstLabel(profile.stateCode), formatPaise(totals.sgst)),
          );
        }
        if (totals.cess) {
          rows.push(row("Cess", formatPaise(totals.cess)));
        }
      }
      if (totals.roundOff) {
        rows.push(
          row(
            "Round off",
            `${totals.roundOff > 0 ? "+" : ""}${formatPaise(totals.roundOff)}`,
          ),
        );
      }
      rows.push(row("Total", formatInr(totals.total), "summary__total"));
      const breakdown = totals.rates
        .filter(() => totals.taxed)
        .map((group) =>
          totals.interState
            ? `${formatRate(group.rate)}: IGST ${formatPaise(group.igst)}`
            : `${formatRate(group.rate)}: CGST ${formatPaise(group.cgst)} + ${sgstLabel(profile.stateCode)} ${formatPaise(group.sgst)}`,
        );
      summary.replaceChildren(
        h(
          "div",
          { class: "summary__words" },
          h("span", { class: "summary__label" }, "Amount in words"),
          h("p", {}, amountInWords(totals.total)),
          ...breakdown.map((text) => h("p", { class: "note" }, text)),
        ),
        h("dl", {}, ...rows),
      );
      const supplier = profile.stateCode;
      supplyHint.textContent = !totals.taxed
        ? "No tax is charged on a bill of supply."
        : !supplier || !draft.placeOfSupply
          ? "Choose the place of supply to work out the tax."
          : totals.interState
            ? `Inter-state supply from ${stateLabel(supplier)}: IGST is charged.`
            : `Supply within ${stateLabel(supplier)}: CGST and ${sgstLabel(supplier)} are charged, half the rate each.`;
    };

    let previewTimer: number | undefined;
    let previewRun = 0;
    const updatePreview = () => {
      clearTimeout(previewTimer);
      previewTimer = window.setTimeout(async () => {
        if (location.hash !== "#invoice" && location.hash !== "") {
          return;
        }
        const run = ++previewRun;
        previewStatus.textContent = "Updating the preview…";
        try {
          const bytes = await invoicePdf(app.data.profile, {
            ...draft,
            copies: draft.copies.slice(0, 1),
          });
          const width = Math.min(preview.clientWidth || 640, 760);
          const canvases = await renderPdf(bytes, width);
          if (run === previewRun) {
            preview.replaceChildren(...canvases);
            previewStatus.textContent = "";
          }
        } catch (error) {
          console.error(error);
          if (run === previewRun) {
            previewStatus.textContent = "The preview could not be drawn.";
          }
        }
      }, 350);
    };

    const updateVisibility = () => {
      const type = draft.type;
      copiesGroup.hidden = !["tax", "supply", "credit"].includes(type);
      creditFields.hidden = type !== "credit";
      lines.classList.toggle("lines--untaxed", type === "supply");
      reverseCharge.element.hidden = type === "supply";
      forceIgst.element.hidden = type === "supply";
      dueLabel.textContent = type === "quotation" ? "Valid until" : "Due date";
      const known = app.data.customers.some(
        (c) => c.name.trim().toLowerCase() === draft.customer.name.trim().toLowerCase(),
      );
      saveCustomer.element.hidden = known || !draft.customer.name.trim();
      const unsaved = draft.lines.some(
        (line) =>
          line.name.trim() &&
          !app.data.items.some(
            (item) => item.name.toLowerCase() === line.name.trim().toLowerCase(),
          ),
      );
      saveItems.element.hidden = !unsaved;
      const problems = profileProblems(app.data.profile).filter(
        ([key]) => key === "name" || key === "stateCode",
      );
      setupNotice.hidden = problems.length === 0;
    };

    function changed() {
      updateVisibility();
      updateSummary();
      updatePreview();
    }

    const fillCustomers = () => {
      customerSelect.replaceChildren(
        h(
          "option",
          { value: "" },
          app.data.customers.length
            ? "Choose a saved customer"
            : "No saved customers yet",
        ),
        ...[...app.data.customers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => h("option", { value: c.id }, c.name)),
      );
    };

    fillForm = () => {
      typeSelect.value = draft.type;
      number.value = draft.number;
      date.value = draft.date;
      dueDate.value = draft.dueDate;
      refNumber.value = draft.refNumber;
      refDate.value = draft.refDate;
      copies.forEach(
        (copy, index) => (copy.input.checked = draft.copies.includes(index)),
      );
      fillCustomers();
      customerSelect.value = "";
      party.fill(draft.customer);
      placeOfSupply.value = draft.placeOfSupply;
      forceIgst.input.checked = draft.forceIgst;
      reverseCharge.input.checked = draft.reverseCharge;
      shipTo.value = draft.shipTo;
      notes.value = draft.notes;
      for (const control of Object.values(controls)) {
        setError(control, "");
      }
      linesError.hidden = true;
      heading.textContent = isSaved(draft) ? `Edit ${draft.number}` : "New document";
      status.clear();
      renderLines();
      changed();
    };

    // Events
    typeSelect.addEventListener("change", () => {
      draft.type = typeSelect.value as DocType;
      if (autoNumber) {
        draft.number = numberFor(draft.type, draft.date, draft.id);
        number.value = draft.number;
      }
      renderLines();
      changed();
    });
    number.addEventListener("input", () => {
      draft.number = number.value.trim();
      autoNumber = false;
      changed();
    });
    date.addEventListener("change", () => {
      draft.date = date.value;
      if (autoNumber) {
        draft.number = numberFor(draft.type, draft.date, draft.id);
        number.value = draft.number;
      }
      changed();
    });
    dueDate.addEventListener("change", () => {
      draft.dueDate = dueDate.value;
      changed();
    });
    refNumber.addEventListener("input", () => {
      draft.refNumber = refNumber.value.trim();
      const original = app.data.invoices.find(
        (invoice) => invoice.number === draft.refNumber,
      );
      if (original && !refDate.value) {
        refDate.value = original.date;
        draft.refDate = original.date;
      }
      changed();
    });
    refDate.addEventListener("change", () => {
      draft.refDate = refDate.value;
      changed();
    });
    customerSelect.addEventListener("change", () => {
      const customer = app.data.customers.find((c) => c.id === customerSelect.value);
      if (customer) {
        draft.customer = structuredClone(customer);
        draft.placeOfSupply = customer.stateCode || draft.placeOfSupply;
        party.fill(draft.customer);
        placeOfSupply.value = draft.placeOfSupply;
        changed();
      }
    });
    placeOfSupply.addEventListener("change", () => {
      draft.placeOfSupply = placeOfSupply.value;
      changed();
    });
    shipTo.addEventListener("input", () => {
      draft.shipTo = shipTo.value;
      changed();
    });
    notes.addEventListener("input", () => {
      draft.notes = notes.value;
      changed();
    });

    const commit = async () => {
      for (const control of Object.values(controls)) {
        setError(control, "");
      }
      linesError.hidden = true;
      lines
        .querySelectorAll<HTMLElement>(".line__error")
        .forEach((el) => (el.hidden = true));
      const profileIssues = profileProblems(app.data.profile).filter(
        ([key]) => key === "name" || key === "stateCode",
      );
      if (profileIssues.length) {
        throw new UserError(
          "Add your business name and state on the Business page first.",
        );
      }
      draft.number = draft.number.trim();
      const customer = party.read();
      const customerIssues = partyProblems(customer);
      const issues = invoiceProblems(draft, app.data.invoices);
      if (customerIssues.length) {
        party.check(customer);
      }
      for (const issue of issues) {
        if (controls[issue.field]) {
          setError(controls[issue.field], issue.message);
        } else if (issue.field === "lines") {
          linesError.textContent = issue.message;
          linesError.hidden = false;
        } else {
          const error = document.getElementById(`${issue.field}-error`);
          if (error) {
            error.textContent = issue.message;
            error.hidden = false;
          }
        }
      }
      if (issues.length || customerIssues.length) {
        const first = issues[0];
        if (first) {
          (controls[first.field] ?? document.getElementById(first.field))?.focus();
        }
        throw new UserError("Please fix the fields marked above.");
      }
      draft.customer = customer;
      draft.lines = draft.lines.filter((line) => line.name.trim());
      const now = new Date().toISOString();
      draft.createdAt ||= now;
      draft.updatedAt = now;
      const saved = structuredClone(draft);
      const keys: ("invoices" | "customers" | "items")[] = ["invoices"];
      if (isSaved(saved)) {
        app.data.invoices = app.data.invoices.map((invoice) =>
          invoice.id === saved.id ? saved : invoice,
        );
      } else {
        app.data.invoices.push(saved);
      }
      if (!saveCustomer.element.hidden && saveCustomer.input.checked) {
        app.data.customers.push({ ...customer, id: newId() });
        keys.push("customers");
      }
      if (!saveItems.element.hidden && saveItems.input.checked) {
        for (const line of saved.lines) {
          if (
            !app.data.items.some(
              (item) => item.name.toLowerCase() === line.name.toLowerCase(),
            )
          ) {
            app.data.items.push({
              id: newId(),
              name: line.name,
              hsn: line.hsn,
              unit: line.unit,
              rate: line.rate,
              gstRate: line.gstRate,
              cessRate: line.cessRate,
            });
          }
        }
        keys.push("items");
      }
      await save(...keys);
      autoNumber = false;
      heading.textContent = `Edit ${saved.number}`;
      renderLines();
      updateVisibility();
      refreshLists();
      return saved;
    };

    saveButton.addEventListener("click", () =>
      runTask(status, [saveButton, pdfButton], async () => {
        const saved = await commit();
        status.done(`Saved ${saved.number}.`);
      }),
    );
    pdfButton.addEventListener("click", () =>
      runTask(status, [saveButton, pdfButton], async () => {
        const saved = await commit();
        status.progress("Making the PDF…");
        const bytes = await invoicePdf(app.data.profile, saved);
        download(bytes, pdfFileName(saved), "application/pdf");
        status.done(`Saved ${saved.number} and downloaded ${pdfFileName(saved)}.`);
      }),
    );
    newButton.addEventListener("click", () => {
      draft = blankInvoice(draft.type);
      autoNumber = true;
      fillForm();
      typeSelect.focus();
    });

    const heading = h("h3", { class: "editor__heading" }, "New document");
    container.append(
      h(
        "p",
        { class: "notice" },
        "This tool helps you prepare invoices. It is not tax or legal advice: check GST rates, the place of supply and the figures with your accountant.",
      ),
      setupNotice,
      h(
        "div",
        { class: "editor" },
        h(
          "div",
          { class: "editor__form stack" },
          heading,
          h(
            "fieldset",
            { class: "options" },
            h("legend", {}, "Document"),
            h(
              "div",
              { class: "form-grid" },
              field("Type", typeSelect),
              field(
                "Number",
                number,
                "Filled in for you; the series restarts each 1 April",
              ),
              field("Date", date),
              dueField,
            ),
            creditFields,
            copiesGroup,
          ),
          h(
            "fieldset",
            { class: "options" },
            h("legend", {}, "Customer"),
            field("Saved customer", customerSelect),
            party.element,
            saveCustomer.element,
            h(
              "div",
              { class: "form-grid" },
              h("div", {}, field("Place of supply", placeOfSupply), supplyHint),
              field("Ship to (if different)", shipTo),
            ),
            forceIgst.element,
            reverseCharge.element,
          ),
          h(
            "fieldset",
            { class: "options" },
            h("legend", {}, "Items"),
            h(
              "p",
              { class: "note" },
              "Rates are before tax. Pick a saved item from the suggestions, or type a new one.",
            ),
            lines,
            linesError,
            h("div", { class: "actions" }, addLine),
            saveItems.element,
            field("Notes (optional)", notes, "Printed above the terms"),
          ),
          h("section", { class: "options", "aria-label": "Totals" }, summary),
          h("div", { class: "actions" }, pdfButton, saveButton, newButton),
          status.element,
        ),
        h(
          "section",
          { class: "preview", "aria-labelledby": "preview-heading" },
          h("h3", { id: "preview-heading" }, "Preview"),
          previewStatus,
          preview,
        ),
      ),
      dataList("invoice-numbers", []),
    );

    const refreshLists = () => {
      const list = document.getElementById("invoice-numbers")!;
      list.replaceChildren(
        ...app.data.invoices
          .filter((invoice) => invoice.type === "tax")
          .map((invoice) => h("option", { value: invoice.number })),
      );
    };

    invoiceView.show = () => {
      // keep the draft, but pick up changes to the profile, customers and items
      if (autoNumber) {
        draft.number = numberFor(draft.type, draft.date, draft.id);
        number.value = draft.number;
      }
      fillCustomers();
      refreshLists();
      changed();
    };

    if (!opened) {
      draft = blankInvoice();
    }
    fillForm();
  },
};

/** Starts a new invoice in the form. */
export const resetDraft = () => {
  draft = blankInvoice();
  autoNumber = true;
  fillForm();
};
