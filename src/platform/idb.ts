/* A tiny key-value store in IndexedDB, for the one thing that can't live in the GLUE folder:
   folder handles (the browser can't write them to a file). */
const DB = 'mco', STORE = 'handles';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
export const idbGet = <T>(key: string) => tx<T | undefined>('readonly', s => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) => tx('readwrite', s => s.put(value, key)).then(() => {});
export const idbDel = (key: string) => tx('readwrite', s => s.delete(key)).then(() => {});
