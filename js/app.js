import { CONFIG } from './config.js';
import { getItem, setItem, getDeviceId } from './storage.js';
import { getMeta, setMeta } from './db.js';
import { startRouter, registerScreen } from './router.js';
import { applyI18n, setGlobals, t } from './i18n.js';
import './photo-page.js';
import './video-page.js';
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

// Nomor versi kecil di halaman pilih mode (untuk cek HP sudah memakai versi terbaru)
const version = document.querySelector('meta[name="app-version"]')?.content;
const versionEl = document.querySelector('[data-app-version]');
if (versionEl && version) versionEl.textContent = `v${version}`;

// ---------- Halaman penutup: pesan sesuai slot yang habis ----------
registerScreen('thanks', {
  enter() {
    const note = document.querySelector('[data-screen="thanks"] .thanks__note');
    note.textContent = t(getItem('thanksKind') === 'video' ? 'thanks.noteVideo' : 'thanks.note');
  },
});

startRouter(CONFIG.COUPLE);
