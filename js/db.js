// IndexedDB wrapper. Everything the app shows is read from here first, so it opens instantly and works offline.

const DB_NAME = 'trading-journal';
const DB_VERSION = 1;
const STORES = {
  accounts: 'id',
  instruments: 'symbol',
  strategies: 'id',
  cashflows: 'id',
  reviews: 'id',
  trades: 'id',
  settings: 'key',
  meta: 'key'
};

let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const req = fn(s);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const getAll = store => tx(store, 'readonly', s => s.getAll());
export const get = (store, key) => tx(store, 'readonly', s => s.get(key));
export const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
export const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));

export function putMany(store, rows) {
  return tx(store, 'readwrite', s => { rows.forEach(r => s.put(r)); });
}

/** Replace a store with server rows, but never overwrite records that still have unsent local changes. */
export function replaceStore(store, rows, keepKeys = new Set()) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    const keyPath = s.keyPath;
    const existing = s.getAll();
    existing.onsuccess = () => {
      const kept = existing.result.filter(r => keepKeys.has(String(r[keyPath])));
      s.clear();
      rows.forEach(r => { if (!keepKeys.has(String(r[keyPath]))) s.put(r); });
      kept.forEach(r => s.put(r));
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function clearEverything() {
  const db = await open();
  const names = [...db.objectStoreNames];
  await new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    names.forEach(n => t.objectStore(n).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
