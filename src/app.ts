// The data shared by every view, loaded once and saved after each change.
import { emptyData, type AppData } from "./lib/backup";
import { loadData, saveData } from "./lib/store";

export const app: { data: AppData; storageError: string } = {
  data: emptyData(),
  storageError: "",
};

export const load = async () => {
  try {
    app.data = await loadData();
  } catch (error) {
    console.warn(error);
    app.storageError =
      "This browser is not letting the app save data (for example in a private window). You can still make invoices, but they will be lost when you close the page.";
  }
};

type Key = keyof AppData;

export const save = async (...keys: Key[]) => {
  if (app.storageError) {
    return;
  }
  await saveData(app.data, keys.length ? keys : undefined);
};

/** Opens a view, for example `go("invoice")`. */
export const go = (id: string) => {
  if (location.hash === `#${id}`) {
    dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = id;
  }
};
