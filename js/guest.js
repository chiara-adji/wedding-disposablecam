// Nama tamu: diisi setelah Start, dipakai untuk menamai file di Drive
// (misalnya putri_foto1.jpg, putri_video1.mp4).
import { getItem, setItem } from './storage.js';
import { getMeta, setMeta } from './db.js';
import { registerScreen, go } from './router.js';
import { t, onLangChange } from './i18n.js';

export function getGuestName() {
  return getItem('guestName', '') || '';
}

/** Nama aman untuk file: huruf kecil, tanpa simbol aneh. "Putri Ayu!" → "putri-ayu" */
export function guestSlug(name = getGuestName()) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return slug || 'tamu';
}

function saveGuestName(name) {
  setItem('guestName', name);
  setMeta('guestName', name).catch(() => {});
}

// Cadangan dari IndexedDB kalau localStorage terhapus
(async () => {
  try {
    const saved = await getMeta('guestName');
    if (saved && !getGuestName()) setItem('guestName', saved);
  } catch {
    /* tidak apa-apa */
  }
})();

/** Halaman kamera memanggil ini: kalau belum ada nama, arahkan dulu ke halaman nama */
export function requireGuestName() {
  if (getGuestName()) return true;
  go('name');
  return false;
}

// ---------------------------------------------------------------
//  Halaman nama
// ---------------------------------------------------------------
const root = document.querySelector('[data-screen="name"]');
const form = root.querySelector('[data-name-form]');
const input = root.querySelector('[data-name-input]');
const help = root.querySelector('[data-name-help]');
const clock = root.querySelector('[data-name-clock]');
let clockTimer = 0;

function tick() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function showHelp(error) {
  help.textContent = t(error ? 'name.error' : 'name.help');
  help.classList.toggle('is-error', error);
  root.classList.toggle('has-error', error);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = input.value.replace(/\s+/g, ' ').trim();
  if (!name) {
    showHelp(true);
    input.focus();
    return;
  }
  saveGuestName(name);
  input.blur();
  go('mode');
});

input.addEventListener('input', () => {
  if (root.classList.contains('has-error') && input.value.trim()) showHelp(false);
});

onLangChange(() => showHelp(root.classList.contains('has-error')));

registerScreen('name', {
  enter() {
    input.value = getGuestName();
    showHelp(false);
    tick();
    clockTimer = setInterval(tick, 1000);
  },
  leave() {
    clearInterval(clockTimer);
  },
});

// ---------------------------------------------------------------
//  Sapaan di halaman pilih mode
// ---------------------------------------------------------------
const hello = document.querySelector('[data-hello]');
function renderHello() {
  const name = getGuestName();
  hello.parentElement.hidden = !name;
  hello.textContent = t('mode.hello', { name });
}
onLangChange(renderHello);
registerScreen('mode', {
  enter() {
    if (!getGuestName()) {
      go('name');
      return;
    }
    renderHello();
  },
});
