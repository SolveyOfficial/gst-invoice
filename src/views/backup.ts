import { app, save } from "../app";
import { backupJson, emptyData, parseBackup } from "../lib/backup";
import { download } from "../lib/files";
import { today } from "../lib/numbering";
import { dropZone, h, runTask, statusArea } from "../ui";
import { resetDraft } from "./invoice";
import type { View } from "./view";

export const backupView: View = {
  id: "backup",
  title: "Backup",
  heading: "Back up your data",
  description:
    "Your business details, customers, items and invoices are kept only in this browser. Save a backup file now and then, and use it to move to another browser or computer.",
  mount(container) {
    const status = statusArea();
    const counts = h("p", {});
    const exportButton = h(
      "button",
      { type: "button", class: "primary" },
      "Download backup",
    );
    exportButton.addEventListener("click", () => {
      download(
        new TextEncoder().encode(backupJson(app.data)),
        `gst-invoice-backup-${today()}.json`,
        "application/json",
      );
      status.done("Backup downloaded. Keep it somewhere safe.");
    });

    const importZone = dropZone({
      accept: ".json,application/json",
      multiple: false,
      label: "Restore from a backup file",
      hint: "Drop the .json file here, or choose it. This replaces the data in this browser.",
      onFiles: ([file]) =>
        runTask(status, [], async () => {
          const data = parseBackup(new TextDecoder().decode(file.bytes));
          const message = `Replace everything in this browser with this backup (${data.invoices.length} documents, ${data.customers.length} customers, ${data.items.length} items)?`;
          if (!confirm(message)) {
            return;
          }
          app.data = data;
          await save();
          resetDraft();
          render();
          status.done(
            `Restored ${data.invoices.length} documents, ${data.customers.length} customers and ${data.items.length} items.`,
          );
        }),
    });

    const clearButton = h(
      "button",
      { type: "button", class: "danger" },
      "Delete all data",
    );
    clearButton.addEventListener("click", () =>
      runTask(status, [clearButton], async () => {
        if (
          !confirm(
            "Delete your business details, customers, items and all documents from this browser? Download a backup first if you may need them.",
          )
        ) {
          return;
        }
        app.data = emptyData();
        await save();
        resetDraft();
        render();
        status.done("All data deleted from this browser.");
      }),
    );

    const render = () => {
      const { invoices, customers, items } = app.data;
      counts.textContent = `This browser holds ${invoices.length} ${invoices.length === 1 ? "document" : "documents"}, ${customers.length} ${customers.length === 1 ? "customer" : "customers"} and ${items.length} ${items.length === 1 ? "item" : "items"}.`;
    };

    container.append(
      h(
        "div",
        { class: "options" },
        counts,
        h("div", { class: "actions" }, exportButton),
      ),
      importZone.element,
      status.element,
      h(
        "div",
        { class: "options" },
        h("h3", {}, "Start again"),
        h(
          "p",
          { class: "note" },
          "Removes everything this app has saved in this browser.",
        ),
        h("div", { class: "actions" }, clearButton),
      ),
    );
    backupView.show = render;
  },
};
