import { normalizeSlip, Slip } from './model';

const DATABASE = 'seriea-multipla';
const STORE = 'slips';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readAll() {
  const database = await openDatabase();
  return new Promise<Slip[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as Partial<Slip>[]).map(normalizeSlip));
    request.onerror = () => reject(request.error);
  });
}

export async function putSlip(slip: Slip) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(slip);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeSlip(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateSlip(oldId: string, slip: Slip) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    if (oldId !== slip.id) store.delete(oldId);
    store.put(slip);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function replaceAll(items: Slip[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.clear();
    items.map(normalizeSlip).forEach((slip) => store.put(slip));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
