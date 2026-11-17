import { CONFIG } from './config.js';
import { getItem, setItem, getDeviceId } from './storage.js';
import { getMeta, setMeta } from './db.js';
import { startRouter } from './router.js';
import { applyI18n, setGlobals } from './i18n.js';
import './photo-page.js';
import './memories.js';

// ---------- Kode acara dari link QR (?e=KODE) ----------
const params = new URLSearchParams(location.search);
const tokenFromUrl = params.get('e');
if (tokenFromUrl) setItem('eventToken', tokenFromUrl);

// ---------- ID perangkat: localStorage + cadangan di IndexedDB ----------
(async () => {
  try {
    const saved = await getMeta('deviceId');
    const local = getItem('deviceId');
    if (saved && saved !== local) setItem('deviceId', saved);
    else if (!saved) await setMeta('deviceId', getDeviceId());
  } catch {
    /* tidak apa-apa */
  }
})();

// ---------- Isi teks dari config + bahasa ----------
document.querySelectorAll('[data-couple]').forEach((el) => (el.textContent = CONFIG.COUPLE));
document.querySelectorAll('[data-place-date]').forEach((el) => (el.textContent = CONFIG.PLACE_DATE));
setGlobals({ couple: CONFIG.COUPLE });
applyI18n();

startRouter(CONFIG.COUPLE);
