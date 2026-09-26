/** Navigation hints only: manuscript identity and content remain the service's authority. */
export interface ReadingPlace {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly blockId: string;
  readonly place: string;
}

const STORE = 'returns';
const UNAVAILABLE = '无法保存或读取返回位置；请稍后重试，原来的返回位置不会被替换。';
let connection: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (connection !== null) return connection;
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('ai7-reading-return', 1); }
    catch { reject(new Error(UNAVAILABLE)); return; }
    let failed = false;
    const fail = (): void => { failed = true; reject(new Error(UNAVAILABLE)); };
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  connection = opened;
  void opened.catch(() => { if (connection === opened) connection = null; });
  return opened;
}

function key(manuscriptId: string, branchId: string): string {
  return `${manuscriptId}\n${branchId}`;
}

function placeOf(value: unknown, manuscriptId: string, branchId: string): ReadingPlace | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null) throw new Error(UNAVAILABLE);
  const record = value as Record<string, unknown>;
  if (record['manuscriptId'] !== manuscriptId || record['branchId'] !== branchId ||
    typeof record['blockId'] !== 'string' || record['blockId'].length === 0 || record['blockId'].length > 128 ||
    typeof record['place'] !== 'string' || record['place'].length > 200) throw new Error(UNAVAILABLE);
  return { manuscriptId, branchId, blockId: record['blockId'], place: record['place'] };
}

/** One exact-key transaction, never a list or an in-memory reconstruction of other Books. */
async function access(
  manuscriptId: string,
  branchId: string,
  change?: (current: ReadingPlace | null) => ReadingPlace | null,
): Promise<ReadingPlace | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE, change === undefined ? 'readonly' : 'readwrite'); }
    catch { reject(new Error(UNAVAILABLE)); return; }
    const store = transaction.objectStore(STORE);
    const request = store.get(key(manuscriptId, branchId));
    let result: ReadingPlace | null = null;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(new Error(UNAVAILABLE));
    transaction.onerror = () => reject(new Error(UNAVAILABLE));
    request.onsuccess = () => {
      try {
        const current = placeOf(request.result, manuscriptId, branchId);
        result = change === undefined ? current : change(current);
        if (change !== undefined) {
          if (result === null) store.delete(key(manuscriptId, branchId));
          else store.put(placeOf(result, manuscriptId, branchId), key(manuscriptId, branchId));
        }
      } catch {
        transaction.abort();
      }
    };
  });
}

export function readReturnPlace(manuscriptId: string, branchId: string): Promise<ReadingPlace | null> {
  return access(manuscriptId, branchId);
}

/** Commit before jumping. An existing unused return wins atomically, including across windows. */
export async function preserveReturnPlace(place: ReadingPlace): Promise<ReadingPlace> {
  const retained = await access(place.manuscriptId, place.branchId, (current) => current ?? place);
  if (retained === null) throw new Error(UNAVAILABLE);
  return retained;
}

/** Consume only the target just reached; another target is never silently removed. */
export function consumeReturnPlace(place: ReadingPlace): Promise<ReadingPlace | null> {
  return access(place.manuscriptId, place.branchId, (current) => current?.blockId === place.blockId ? null : current);
}
