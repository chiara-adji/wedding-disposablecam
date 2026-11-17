// Penyimpanan kecil di HP tamu. Semua dibungkus try/catch karena
// localStorage bisa diblokir (mode privat, browser di dalam aplikasi chat).

const PREFIX = 'wdc.';

export function getItem(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* abaikan: aplikasi tetap jalan tanpa penyimpanan */
  }
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ID acak per HP. Bukan data pribadi, hanya untuk menghitung kuota.
// (Di langkah 4 akan dicadangkan juga ke IndexedDB.)
export function getDeviceId() {
  let id = getItem('deviceId');
  if (!id) {
    id = randomId();
    setItem('deviceId', id);
  }
  return id;
}
