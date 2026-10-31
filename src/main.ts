import "./styles.css";

import { app, load } from "./app";
import { dataList } from "./forms";
import { COMMON_GST_RATES } from "./lib/gst";
import { UNITS } from "./lib/model";
import { h } from "./ui";
import { backupView } from "./views/backup";
import { customersView } from "./views/customers";
import { invoiceView } from "./views/invoice";
import { invoicesView } from "./views/invoices";
import { itemsView } from "./views/items";
import { profileView } from "./views/profile";
import type { View } from "./views/view";

const views: View[] = [
  invoiceView,
  invoicesView,
  customersView,
  itemsView,
  profileView,
  backupView,
];

const nav = document.querySelector<HTMLElement>("#tools")!;
const main = document.querySelector<HTMLElement>("#main")!;
const panels = new Map<string, HTMLElement>();
const tabs = new Map<string, HTMLAnchorElement>();

// Suggestions shared by the forms
const savedItems = h("datalist", { id: "saved-items" });
document.body.append(
  dataList("units", UNITS),
  dataList("gst-rates", COMMON_GST_RATES),
  savedItems,
);
const refreshSavedItems = () =>
  savedItems.replaceChildren(
    ...app.data.items.map((item) => h("option", { value: item.name })),
  );

const show = () => {
  const id = location.hash.slice(1);
  const view = views.find((candidate) => candidate.id === id) ?? views[0];
  let panel = panels.get(view.id);
  if (!panel) {
    const body = h("div", { class: "panel__body" });
    panel = h(
      "section",
      { class: "panel", "aria-labelledby": `${view.id}-heading` },
      h("h2", { id: `${view.id}-heading` }, view.heading),
      h("p", { class: "panel__description" }, view.description),
      body,
    );
    view.mount(body);
    panels.set(view.id, panel);
    main.append(panel);
  }
  refreshSavedItems();
  view.show?.();
  for (const [key, element] of panels) {
    element.hidden = key !== view.id;
  }
  for (const [key, tab] of tabs) {
    if (key === view.id) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  }
  document.title = `${view.heading} · Solvey GST Invoice`;
};

const start = async () => {
  await load();
  for (const view of views) {
    const tab = h("a", { href: `#${view.id}`, class: "tab" }, view.title);
    tabs.set(view.id, tab);
    nav.append(tab);
  }
  if (app.storageError) {
    main.before(
      h("p", { class: "wrap notice notice--warning storage-warning" }, app.storageError),
    );
  }
  // first visit: start with the business details
  if (!location.hash && !app.data.profile.name) {
    history.replaceState(null, "", "#profile");
  }
  addEventListener("hashchange", show);
  show();
};

void start();

// Files dropped outside a drop area would otherwise be opened by the browser
for (const type of ["dragover", "drop"]) {
  addEventListener(type, (event) => event.preventDefault());
}
