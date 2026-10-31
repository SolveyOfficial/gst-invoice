// Keeps the app's data in this browser's IndexedDB. Nothing is sent anywhere.
import {
  emptyData,
  readInvoice,
  readItem,
  readParty,
  readProfile,
  type AppData,
} from "./backup";

const DB_NAME = "solvey-gst-invoice";
const STORE = "data";

let opening: Promise<IDBDatabase> | undefined;

const open = () =>
  (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

const done = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const KEYS = ["profile", "customers", "items", "invoices"] as const;
type Key = (typeof KEYS)[number];

export const loadData = async (): Promise<AppData> => {
  const db = await open();
  const transaction = db.transaction(STORE, "readonly");
  const store = transaction.objectStore(STORE);
  const values = await Promise.all(
    KEYS.map(
      (key) =>
        new Promise<unknown>((resolve, reject) => {
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }),
    ),
  );
  const [profile, customers, items, invoices] = values;
  const data = emptyData();
  const rows = (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "object" && v) : [];
  return {
    profile: profile ? readProfile(profile) : data.profile,
    customers: rows(customers).map(readParty),
    items: rows(items).map(readItem),
    invoices: rows(invoices).map(readInvoice),
  };
};

export const saveData = async (data: AppData, keys: readonly Key[] = KEYS) => {
  const db = await open();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  for (const key of keys) {
    store.put(structuredClone(data[key]), key);
  }
  await done(transaction);
};
