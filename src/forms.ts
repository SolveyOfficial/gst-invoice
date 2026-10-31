// Inputs used by the forms.
import { FOREIGN, STATES } from "./lib/gst";
import { h } from "./ui";

export const textInput = (value: string, props: Record<string, unknown> = {}) =>
  h("input", { type: "text", value, autocomplete: "off", ...props });

export const numberInput = (value: number, props: Record<string, unknown> = {}) =>
  h("input", {
    type: "number",
    value: String(value),
    step: "any",
    min: 0,
    inputmode: "decimal",
    ...props,
  });

export const textArea = (value: string, rows = 3, props: Record<string, unknown> = {}) =>
  h("textarea", { value, rows, ...props });

/** A select with every state and union territory, and optionally exports. */
export const stateSelect = (value: string, options: { foreign?: boolean } = {}) =>
  h(
    "select",
    {},
    h("option", { value: "" }, "Choose a state"),
    ...STATES.map((state) =>
      h(
        "option",
        { value: state.code, selected: state.code === value },
        `${state.name} (${state.code})`,
      ),
    ),
    ...(options.foreign
      ? [
          h(
            "option",
            { value: FOREIGN.code, selected: value === FOREIGN.code },
            FOREIGN.name,
          ),
        ]
      : []),
  );

/** A list of suggestions for an input. */
export const dataList = (id: string, values: (string | number)[]) =>
  h("datalist", { id }, ...values.map((value) => h("option", { value: String(value) })));

/** Reads a number input, treating an empty box as 0. */
export const readNumber = (input: HTMLInputElement) => {
  const value = input.value.trim() === "" ? 0 : Number(input.value);
  return Number.isFinite(value) ? value : 0;
};
