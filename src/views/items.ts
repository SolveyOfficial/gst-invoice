import { app, save } from "../app";
import { numberInput, readNumber, textInput } from "../forms";
import { isValidGstRate } from "../lib/gst";
import { newId, type Item } from "../lib/model";
import { formatInr, toPaise } from "../lib/money";
import { formatRate } from "../lib/tax";
import { field, h, iconButton, runTask, setError, statusArea } from "../ui";
import type { View } from "./view";

const emptyItem = (): Item => ({
  id: "",
  name: "",
  hsn: "",
  unit: "NOS",
  rate: 0,
  gstRate: 18,
  cessRate: 0,
});

export const itemsView: View = {
  id: "items",
  title: "Items",
  heading: "Items and services",
  description:
    "Save what you sell with its HSN/SAC code, price and GST rate, to add it to an invoice quickly.",
  mount(container) {
    const inputs = {
      name: textInput(""),
      hsn: textInput("", { inputmode: "numeric", maxlength: 8, class: "code" }),
      unit: textInput("", { list: "units", maxlength: 8, class: "short" }),
      rate: numberInput(0),
      gstRate: numberInput(18, { list: "gst-rates", max: 100, class: "short" }),
      cessRate: numberInput(0, { max: 400, class: "short" }),
    };
    let id = "";
    const fill = (item: Item) => {
      id = item.id;
      inputs.name.value = item.name;
      inputs.hsn.value = item.hsn;
      inputs.unit.value = item.unit;
      inputs.rate.value = String(item.rate);
      inputs.gstRate.value = String(item.gstRate);
      inputs.cessRate.value = String(item.cessRate);
      for (const input of Object.values(inputs)) {
        setError(input, "");
      }
    };
    const list = h("ul", { class: "record-list", "aria-label": "Saved items" });
    const empty = h("p", { class: "note" }, "No items saved yet.");
    const heading = h("h3", {}, "Add an item");
    const status = statusArea();
    const saveButton = h("button", { type: "submit", class: "primary" }, "Save item");
    const cancel = h("button", { type: "button" }, "Cancel");
    const reset = () => {
      fill(emptyItem());
      heading.textContent = "Add an item";
      cancel.hidden = true;
    };
    cancel.addEventListener("click", () => {
      reset();
      status.clear();
    });

    const render = () => {
      const items = [...app.data.items].sort((a, b) => a.name.localeCompare(b.name));
      empty.hidden = items.length > 0;
      list.replaceChildren(
        ...items.map((item) =>
          h(
            "li",
            { class: "record" },
            h(
              "div",
              { class: "record__main" },
              h("strong", {}, item.name),
              h(
                "small",
                {},
                [
                  item.hsn && `HSN/SAC ${item.hsn}`,
                  `${formatInr(toPaise(item.rate))} per ${item.unit || "unit"}`,
                  `GST ${formatRate(item.gstRate)}`,
                  item.cessRate ? `Cess ${formatRate(item.cessRate)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              ),
            ),
            h(
              "div",
              { class: "record__actions" },
              iconButton(`Edit ${item.name}`, "✎", () => {
                fill(item);
                heading.textContent = `Edit ${item.name}`;
                cancel.hidden = false;
                status.clear();
                inputs.name.focus();
              }),
              iconButton(
                `Delete ${item.name}`,
                "✕",
                () => {
                  if (confirm(`Delete ${item.name}?`)) {
                    app.data.items = app.data.items.filter((i) => i.id !== item.id);
                    void save("items");
                    render();
                  }
                },
                "danger",
              ),
            ),
          ),
        ),
      );
    };

    const form = h(
      "form",
      { class: "options", novalidate: true },
      heading,
      h(
        "div",
        { class: "form-grid" },
        field("Name", inputs.name),
        field("HSN/SAC", inputs.hsn, "HSN for goods, SAC for services"),
        field("Unit", inputs.unit, "For example NOS, KGS, HRS"),
        field("Price per unit (₹, before tax)", inputs.rate),
        field(
          "GST rate (%)",
          inputs.gstRate,
          "Type any rate. Check the current rate for your item: rates were changed in 2025.",
        ),
        field("Cess (%)", inputs.cessRate, "Only for goods that attract cess"),
      ),
      h("div", { class: "actions" }, saveButton, cancel),
      status.element,
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runTask(status, [saveButton], async () => {
        const item: Item = {
          id: id || newId(),
          name: inputs.name.value.trim(),
          hsn: inputs.hsn.value.trim(),
          unit: inputs.unit.value.trim().toUpperCase(),
          rate: readNumber(inputs.rate),
          gstRate: readNumber(inputs.gstRate),
          cessRate: readNumber(inputs.cessRate),
        };
        const problems: [HTMLInputElement, string][] = [];
        if (!item.name) {
          problems.push([inputs.name, "Enter a name."]);
        }
        if (item.hsn && !/^\d{4,8}$/.test(item.hsn)) {
          problems.push([inputs.hsn, "HSN/SAC codes are 4 to 8 digits."]);
        }
        if (!isValidGstRate(item.gstRate)) {
          problems.push([inputs.gstRate, "Enter a rate from 0 to 100."]);
        }
        for (const input of Object.values(inputs)) {
          setError(input, "");
        }
        for (const [input, message] of problems) {
          setError(input, message);
        }
        if (problems.length) {
          problems[0][0].focus();
          status.clear();
          return;
        }
        if (app.data.items.some((i) => i.id === item.id)) {
          app.data.items = app.data.items.map((i) => (i.id === item.id ? item : i));
        } else {
          app.data.items.push(item);
        }
        await save("items");
        render();
        reset();
        status.done(`Saved ${item.name}.`);
      });
    });

    reset();
    container.append(form, h("h3", {}, "Saved items"), empty, list);
    itemsView.show = render;
  },
};
