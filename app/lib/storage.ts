import { normalizeSlip, Slip } from './model';
import historicalPatches from '../data/historical-v3-patches.json';

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


const V3_MIGRATION_KEY = 'historical-v3-patches-v1';

type HistoricalPatch = {
  slipId: string;
  playedOdd?: number;
  bonusAmount?: number;
  returnAmount?: number;
  picks?: Array<{
    pickId: string;
    playedMarket?: string;
    playedOdd?: number;
    executionChanged?: boolean;
  }>;
};

export async function migrateHistoricalV3Once() {
  if (typeof localStorage === 'undefined' || localStorage.getItem(V3_MIGRATION_KEY) === 'done') return false;
  const database = await openDatabase();
  const existing = await new Promise<Partial<Slip>[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as Partial<Slip>[]);
    request.onerror = () => reject(request.error);
  });
  const patches = (historicalPatches.slips || []) as HistoricalPatch[];
  const patchMap = new Map(patches.map((patch) => [patch.slipId, patch]));
  const updated = existing.map((raw) => {
    const slip = normalizeSlip(raw);
    const patch = patchMap.get(slip.id);
    if (!patch) return slip;
    const picks = slip.picks.map((pick) => {
      const pickPatch = patch.picks?.find((item) => item.pickId === pick.id);
      if (!pickPatch) return pick;
      return {
        ...pick,
        playedOdd: pick.playedOdd ?? pickPatch.playedOdd,
        playedMarket: pick.playedMarket ?? pickPatch.playedMarket,
        executionChanged: pick.executionChanged || pickPatch.executionChanged || false,
      };
    });
    return normalizeSlip({
      ...slip,
      picks,
      playedOdd: slip.playedOdd ?? patch.playedOdd,
      bonusAmount: slip.bonusAmount ?? patch.bonusAmount,
      returnAmount: patch.returnAmount ?? slip.returnAmount,
    });
  });
  await replaceAll(updated);
  localStorage.setItem(V3_MIGRATION_KEY, 'done');
  return true;
}
