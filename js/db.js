// Penyimpanan hasil jepretan di HP tamu (IndexedDB).
// Setiap foto/video disimpan dulu di sini, baru nanti diupload (langkah 5).
// Kalau IndexedDB tidak bisa dipakai (mode privat tertentu), pakai memori sementara.

const DB_NAME = 'wedding-cam';
const DB_VERSION = 1;

let dbPromise = null;
const memory = { shots: new Map(), meta: new Map() }; // cadangan

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      const shots = db.createObjectStore('shots', { keyPath: 'id' });
      shots.createIndex('kind', 'kind');
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDb();
  if (!db) return null;
  return db.transaction(name, mode).objectStore(name);
}

/** Simpan satu jepretan. shot = { id, kind:'photo'|'video', blob, mime, ext, createdAt, filter, seq } */
export async function addShot(shot) {
  const record = { status: 'pending', ...shot };
  const s = await store('shots', 'readwrite');
  if (!s) return void memory.shots.set(record.id, record);
  await wrap(s.put(record));
}

export async function updateShot(id, changes) {
  const s = await store('shots', 'readwrite');
  if (!s) {
    const r = memory.shots.get(id);
    if (r) Object.assign(r, changes);
    return;
  }
  const r = await wrap(s.get(id));
  if (r) await wrap(s.put({ ...r, ...changes }));
}

/** Semua jepretan (opsional: hanya 'photo' / 'video'), terbaru dulu. */
export async function listShots(kind) {
  const s = await store('shots');
  let all;
  if (!s) all = [...memory.shots.values()];
  else all = await wrap(kind ? s.index('kind').getAll(kind) : s.getAll());
  if (kind) all = all.filter((x) => x.kind === kind);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function countShots(kind) {
  const s = await store('shots');
  if (!s) return [...memory.shots.values()].filter((x) => x.kind === kind).length;
  return wrap(s.index('kind').count(kind));
}

export async function getMeta(key) {
  const s = await store('meta');
  if (!s) return memory.meta.get(key);
  return wrap(s.get(key));
}

export async function setMeta(key, value) {
  const s = await store('meta', 'readwrite');
  if (!s) return void memory.meta.set(key, value);
  await wrap(s.put(value, key));
}

// Minta browser supaya data tidak dihapus otomatis saat memori HP penuh.
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* tidak apa-apa */
  }
}
