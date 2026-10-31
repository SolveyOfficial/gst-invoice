import { app, save } from "../app";
import { stateSelect, textArea, textInput } from "../forms";
import { gstinError, normaliseCode, stateFromGstin, stateLabel } from "../lib/gst";
import { emptyParty, newId, type Party } from "../lib/model";
import { field, h, iconButton, runTask, setError, statusArea } from "../ui";
import { partyProblems } from "../lib/validate";
import type { View } from "./view";

/** The customer form, also used inside the invoice form. */
export const partyFields = (initial: Party, onChange?: () => void) => {
  const inputs = {
    name: textInput(initial.name, { autocomplete: "off" }),
    gstin: textInput(initial.gstin, { maxlength: 18, class: "code", spellcheck: false }),
    stateCode: stateSelect(initial.stateCode),
    address: textArea(initial.address, 2),
    phone: textInput(initial.phone, { type: "tel" }),
    email: textInput(initial.email, { type: "email" }),
  };
  inputs.gstin.addEventListener("input", () => {
    const code = stateFromGstin(inputs.gstin.value);
    if (code && inputs.stateCode.value !== code) {
      inputs.stateCode.value = code;
      inputs.stateCode.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  inputs.gstin.addEventListener("blur", () => {
    const value = inputs.gstin.value.trim();
    setError(inputs.gstin, value ? gstinError(value) : "");
  });
  if (onChange) {
    for (const input of Object.values(inputs)) {
      input.addEventListener("input", onChange);
      input.addEventListener("change", onChange);
    }
  }
  let id = initial.id;
  return {
    inputs,
    element: h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "form-grid" },
        field("Name", inputs.name),
        field("GSTIN", inputs.gstin, "Leave empty for unregistered buyers"),
        field("State", inputs.stateCode),
        field("Phone", inputs.phone),
        field("Email", inputs.email),
      ),
      field("Address", inputs.address),
    ),
    read: (): Party => ({
      id,
      name: inputs.name.value.trim(),
      gstin: normaliseCode(inputs.gstin.value),
      stateCode: inputs.stateCode.value,
      address: inputs.address.value.trim(),
      phone: inputs.phone.value.trim(),
      email: inputs.email.value.trim(),
    }),
    fill: (party: Party) => {
      id = party.id;
      inputs.name.value = party.name;
      inputs.gstin.value = party.gstin;
      inputs.stateCode.value = party.stateCode;
      inputs.address.value = party.address;
      inputs.phone.value = party.phone;
      inputs.email.value = party.email;
      for (const input of Object.values(inputs)) {
        setError(input, "");
      }
    },
    check: (party: Party) => {
      for (const input of Object.values(inputs)) {
        setError(input, "");
      }
      const problems = partyProblems(party);
      for (const [key, message] of problems) {
        setError(inputs[key as keyof typeof inputs], message);
      }
      if (problems.length) {
        inputs[problems[0][0] as keyof typeof inputs].focus();
      }
      return problems;
    },
  };
};

export const customersView: View = {
  id: "customers",
  title: "Customers",
  heading: "Customers",
  description: "Save the people and businesses you bill, to pick them on an invoice.",
  mount(container) {
    const list = h("ul", { class: "record-list", "aria-label": "Saved customers" });
    const empty = h("p", { class: "note" }, "No customers saved yet.");
    const fields = partyFields(emptyParty());
    const heading = h("h3", {}, "Add a customer");
    const status = statusArea();
    const saveButton = h("button", { type: "submit", class: "primary" }, "Save customer");
    const cancel = h("button", { type: "button" }, "Cancel");

    const reset = () => {
      fields.fill(emptyParty());
      heading.textContent = "Add a customer";
      cancel.hidden = true;
    };
    cancel.addEventListener("click", () => {
      reset();
      status.clear();
    });

    const render = () => {
      const customers = [...app.data.customers].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      empty.hidden = customers.length > 0;
      list.replaceChildren(
        ...customers.map((customer) =>
          h(
            "li",
            { class: "record" },
            h(
              "div",
              { class: "record__main" },
              h("strong", {}, customer.name),
              h(
                "small",
                {},
                [customer.gstin || "Unregistered", stateLabel(customer.stateCode)]
                  .filter(Boolean)
                  .join(" · "),
              ),
            ),
            h(
              "div",
              { class: "record__actions" },
              iconButton(`Edit ${customer.name}`, "✎", () => {
                fields.fill(customer);
                heading.textContent = `Edit ${customer.name}`;
                cancel.hidden = false;
                status.clear();
                fields.inputs.name.focus();
              }),
              iconButton(
                `Delete ${customer.name}`,
                "✕",
                () => {
                  if (
                    confirm(
                      `Delete ${customer.name}? Invoices already made keep their details.`,
                    )
                  ) {
                    app.data.customers = app.data.customers.filter(
                      (c) => c.id !== customer.id,
                    );
                    void save("customers");
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
      fields.element,
      h("div", { class: "actions" }, saveButton, cancel),
      status.element,
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runTask(status, [saveButton], async () => {
        const party = fields.read();
        if (fields.check(party).length) {
          status.clear();
          return;
        }
        if (party.id && app.data.customers.some((c) => c.id === party.id)) {
          app.data.customers = app.data.customers.map((c) =>
            c.id === party.id ? party : c,
          );
        } else {
          app.data.customers.push({ ...party, id: newId() });
        }
        await save("customers");
        render();
        reset();
        status.done(`Saved ${party.name}.`);
      });
    });

    reset();
    container.append(form, h("h3", {}, "Saved customers"), empty, list);
    customersView.show = render;
  },
};
