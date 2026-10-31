import { app, save } from "../app";
import { stateSelect, textArea, textInput } from "../forms";
import { IMAGE_TYPES, imageToDataUrl } from "../images";
import { gstinError, normaliseCode, panFromGstin, stateFromGstin } from "../lib/gst";
import { DOC_TYPES, type Profile } from "../lib/model";
import { checkbox, field, h, runTask, setError, statusArea } from "../ui";
import { profileProblems } from "../lib/validate";
import type { View } from "./view";

const imagePicker = (
  label: string,
  hint: string,
  get: () => string,
  set: (value: string) => void,
) => {
  const preview = h("img", { alt: "", class: "image-picker__preview" });
  const input = h("input", {
    type: "file",
    accept: IMAGE_TYPES,
    class: "visually-hidden",
  });
  const remove = h("button", { type: "button" }, `Remove ${label.toLowerCase()}`);
  const status = statusArea();
  const update = () => {
    const value = get();
    preview.src = value;
    preview.hidden = !value;
    remove.hidden = !value;
  };
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      await runTask(status, [], async () => {
        set(await imageToDataUrl(file));
        status.clear();
        update();
      });
    }
  });
  remove.addEventListener("click", () => {
    set("");
    update();
  });
  const id = `image-${label.toLowerCase().replace(/\W+/g, "-")}`;
  input.id = id;
  update();
  return {
    update,
    element: h(
      "div",
      { class: "image-picker" },
      h("span", { class: "image-picker__label" }, label),
      preview,
      h(
        "div",
        { class: "actions" },
        h("label", { for: id, class: "button" }, `Choose ${label.toLowerCase()}`),
        remove,
      ),
      h("small", {}, hint),
      input,
      status.element,
    ),
  };
};

export const profileView: View = {
  id: "profile",
  title: "Business",
  heading: "Your business",
  description:
    "These details are printed on every invoice. They are saved only in this browser.",
  mount(container) {
    const draft = (): Profile => app.data.profile;
    const inputs: Partial<
      Record<keyof Profile, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    > = {};
    const text = (key: keyof Profile, label: string, hint?: string, props = {}) => {
      const input = textInput(String(draft()[key] ?? ""), props);
      inputs[key] = input;
      return field(label, input, hint);
    };
    const area = (key: keyof Profile, label: string, rows: number, hint?: string) => {
      const input = textArea(String(draft()[key] ?? ""), rows);
      inputs[key] = input;
      return field(label, input, hint);
    };
    const state = stateSelect(draft().stateCode);
    inputs.stateCode = state;
    const pan = h("output", { class: "derived" });
    const updatePan = () => {
      const value = panFromGstin(inputs.gstin!.value);
      pan.textContent = value ? `PAN: ${value}` : "";
    };

    const options = {
      hsnSummary: checkbox("Print an HSN/SAC-wise tax summary", draft().hsnSummary),
      roundOff: checkbox("Round the total to the nearest rupee", draft().roundOff),
      upiQr: checkbox(
        "Print a UPI QR code for the amount due",
        draft().upiQr,
        undefined,
        "On tax invoices, bills of supply and proforma invoices, when a UPI ID is set.",
      ),
    };
    const prefixes = DOC_TYPES.map((doc) => {
      const input = textInput(draft().prefixes[doc.value], {
        maxlength: 6,
        class: "short",
      });
      return { doc, input };
    });

    let logo = draft().logo;
    let signature = draft().signature;
    const logoPicker = imagePicker(
      "Logo",
      "PNG or JPEG. Printed at the top left.",
      () => logo,
      (value) => (logo = value),
    );
    const signaturePicker = imagePicker(
      "Signature or stamp",
      "A scan on a white or transparent background works best.",
      () => signature,
      (value) => (signature = value),
    );

    const status = statusArea();
    const saveButton = h("button", { type: "submit", class: "primary" }, "Save details");
    const form = h(
      "form",
      { class: "stack", novalidate: true },
      h(
        "fieldset",
        { class: "options" },
        h("legend", {}, "Business"),
        h(
          "div",
          { class: "form-grid" },
          text("name", "Business name", undefined, { autocomplete: "organization" }),
          field("State", state, "Where you are registered for GST"),
          h(
            "div",
            {},
            text("gstin", "GSTIN", "15 characters. Leave empty if not registered.", {
              maxlength: 18,
              class: "code",
              spellcheck: false,
            }),
            pan,
          ),
          text("phone", "Phone", undefined, { type: "tel", autocomplete: "tel" }),
          text("email", "Email", undefined, { type: "email", autocomplete: "email" }),
        ),
        area("address", "Address", 3),
      ),
      h(
        "fieldset",
        { class: "options" },
        h("legend", {}, "Bank and payment"),
        h(
          "div",
          { class: "form-grid" },
          text("bankName", "Bank name"),
          text("branch", "Branch"),
          text("accountName", "Account name"),
          text("accountNumber", "Account number", undefined, { inputmode: "numeric" }),
          text("ifsc", "IFSC", "For example SBIN0001234", {
            maxlength: 11,
            class: "code",
            spellcheck: false,
          }),
          text("upiId", "UPI ID (optional)", "For example yourname@okhdfcbank", {
            spellcheck: false,
          }),
        ),
        options.upiQr.element,
      ),
      h(
        "fieldset",
        { class: "options" },
        h("legend", {}, "Printing"),
        h("div", { class: "image-pickers" }, logoPicker.element, signaturePicker.element),
        area("terms", "Terms and conditions", 3, "Printed at the end of each invoice."),
        h(
          "div",
          { class: "prefixes" },
          h("p", { class: "prefixes__title" }, "Number prefixes"),
          h(
            "div",
            { class: "form-grid form-grid--narrow" },
            ...prefixes.map(({ doc, input }) => field(doc.title, input)),
          ),
          h(
            "small",
            { class: "note" },
            "Numbers look like INV/2026-27/0001 and start again at 0001 each financial year (1 April). GST allows at most 16 characters.",
          ),
        ),
        options.hsnSummary.element,
        options.roundOff.element,
      ),
      h("div", { class: "actions" }, saveButton),
      status.element,
    );

    const read = (): Profile => {
      const value = (key: keyof Profile) => inputs[key]!.value.trim();
      return {
        ...draft(),
        name: value("name"),
        address: inputs.address!.value.trim(),
        stateCode: state.value,
        gstin: normaliseCode(value("gstin")),
        phone: value("phone"),
        email: value("email"),
        bankName: value("bankName"),
        branch: value("branch"),
        accountName: value("accountName"),
        accountNumber: value("accountNumber").replace(/\s+/g, ""),
        ifsc: normaliseCode(value("ifsc")),
        upiId: value("upiId"),
        terms: inputs.terms!.value.trim(),
        logo,
        signature,
        upiQr: options.upiQr.input.checked,
        hsnSummary: options.hsnSummary.input.checked,
        roundOff: options.roundOff.input.checked,
        prefixes: Object.fromEntries(
          prefixes.map(({ doc, input }) => [
            doc.value,
            input.value.trim().replace(/[/\s]/g, "") || doc.prefix,
          ]),
        ) as Profile["prefixes"],
      };
    };

    const check = (profile: Profile) => {
      for (const input of Object.values(inputs)) {
        setError(input!, "");
      }
      const problems = profileProblems(profile);
      for (const [key, message] of problems) {
        setError(inputs[key]!, message);
      }
      return problems;
    };

    inputs.gstin!.addEventListener("input", () => {
      updatePan();
      const code = stateFromGstin(inputs.gstin!.value);
      if (code && !state.value) {
        state.value = code;
      }
    });
    inputs.gstin!.addEventListener("blur", () => {
      const value = inputs.gstin!.value.trim();
      setError(inputs.gstin!, value ? gstinError(value) : "");
    });
    updatePan();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void runTask(status, [saveButton], async () => {
        const profile = read();
        const problems = check(profile);
        if (problems.length) {
          inputs[problems[0][0]]!.focus();
          status.error(
            `Please fix ${problems.length === 1 ? "the field" : `${problems.length} fields`} marked above.`,
          );
          return;
        }
        app.data.profile = profile;
        await save("profile");
        status.done("Saved. Your details will be used on new and existing invoices.");
      });
    });

    profileView.show = () => {
      const profile = draft();
      for (const [key, input] of Object.entries(inputs)) {
        input!.value = String(profile[key as keyof Profile] ?? "");
      }
      for (const { doc, input } of prefixes) {
        input.value = profile.prefixes[doc.value];
      }
      options.hsnSummary.input.checked = profile.hsnSummary;
      options.roundOff.input.checked = profile.roundOff;
      options.upiQr.input.checked = profile.upiQr;
      logo = profile.logo;
      signature = profile.signature;
      logoPicker.update();
      signaturePicker.update();
      updatePan();
    };

    container.append(form);
  },
};
