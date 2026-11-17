// Teks dua bahasa. Default: Inggris. Tamu bisa ganti ke Indonesia lewat tombol EN / ID.
// Di HTML: <span data-i18n="kunci">  (pakai data-i18n-html kalau teksnya mengandung tag)
//          data-i18n-aria="kunci" untuk aria-label.
import { getItem, setItem } from './storage.js';

const DICT = {
  en: {
    'welcome.start': 'Start',
    'welcome.note': 'Photos & videos you take will be sent automatically to {couple}’s wedding album.',
    'mode.hint': 'Choose one:',
    'mode.photo': 'Photo',
    'mode.video': 'Video',
    'mode.cameraRoll': 'Camera roll',
    'mode.cameraRollAria': 'Camera roll: see your photos and videos',
    'common.back': 'Back',

    'photo.flashOff': 'Flash off',
    'photo.flashOn': 'Flash on',
    'photo.timerOff': 'Timer off',
    'photo.timerOn': 'Timer {n}s',
    'photo.left': '{n} left',
    'photo.label': 'Photo',
    'photo.shutterAria': 'Take a photo',
    'photo.switchAria': 'Switch front/back camera',
    'photo.thumbAria': 'See your photos',
    'photo.zoomAria': 'Zoom {z}×',
    'photo.chooseFilter': 'Choose<br>filter',
    'photo.saved': 'Saved ✓  {n} photos left',
    'photo.saveFailed': 'Couldn’t save the photo. Please try again.',
    'photo.fileFailed': 'Couldn’t read that photo. Please try again.',
    'photo.noTorch': 'This phone’s back camera has no flash. Flash still works on the front camera.',
    'photo.noTorchShort': 'Back camera flash isn’t supported on this phone',

    'cam.explain.title': 'Allow the camera',
    'cam.explain.text': 'To take photos, your browser will ask for camera access.<br>Please tap <b>Allow</b>.',
    'cam.explain.btn': 'Turn on camera',
    'cam.denied.title': 'Camera access is blocked',
    'cam.denied.ios': '<ol><li>Tap <b>aA</b> in the address bar</li><li>Tap <b>Website Settings</b></li><li>Set <b>Camera</b> to <b>Allow</b></li><li>Tap <b>Try again</b> below</li></ol>',
    'cam.denied.android': '<ol><li>Tap the <b>icon left of the web address</b></li><li>Tap <b>Permissions</b> → <b>Camera</b></li><li>Choose <b>Allow</b></li><li>Tap <b>Try again</b> below</li></ol>',
    'cam.unsupported.title': 'Please open in Chrome or Safari',
    'cam.unsupported.text': 'This app’s browser can’t open the camera.<br>Tap the <b>⋮</b> or <b>⋯</b> menu, then choose <b>Open in Chrome</b> / <b>Open in Safari</b>.',
    'cam.unsupported.btn': 'Copy link',
    'cam.copied': 'Link copied ✓ Paste it in Chrome or Safari',
    'cam.busy.title': 'Camera is in use',
    'cam.busy.text': 'Another app is using the camera. Close it (e.g. the camera or a video call), then try again.',
    'cam.notfound.title': 'No camera found',
    'cam.notfound.text': 'We couldn’t find a camera on this device.',
    'cam.unknown.title': 'Camera couldn’t start',
    'cam.unknown.text': 'Something went wrong. Please try again.',
    'cam.retry': 'Try again',
    'cam.fileAlt': 'Use the phone’s own camera instead',

    'mem.empty': 'No photos or videos yet.',
    'mem.go': 'Start shooting',
    'mem.count': '{n} saved',
    'mem.save': 'Save to phone',
    'mem.close': 'Close',

    'thanks.title': 'Thank you',
    'thanks.note': 'You’ve used all your photos. Thank you for capturing our day!',
    'thanks.see': 'See your photos',
    'thanks.menu': 'Back to menu',
  },

  id: {
    'welcome.start': 'Mulai',
    'welcome.note': 'Foto & video yang kamu ambil akan otomatis dikirim ke album pernikahan {couple}.',
    'mode.hint': 'Pilih salah satu:',
    'mode.photo': 'Foto',
    'mode.video': 'Video',
    'mode.cameraRoll': 'Camera roll',
    'mode.cameraRollAria': 'Camera roll: lihat hasil foto dan video kamu',
    'common.back': 'Kembali',

    'photo.flashOff': 'Flash mati',
    'photo.flashOn': 'Flash nyala',
    'photo.timerOff': 'Timer mati',
    'photo.timerOn': 'Timer {n} dtk',
    'photo.left': 'sisa {n}',
    'photo.label': 'Foto',
    'photo.shutterAria': 'Ambil foto',
    'photo.switchAria': 'Ganti kamera depan/belakang',
    'photo.thumbAria': 'Lihat hasil foto kamu',
    'photo.zoomAria': 'Zoom {z}×',
    'photo.chooseFilter': 'Pilih<br>filter',
    'photo.saved': 'Tersimpan ✓  Sisa {n} foto',
    'photo.saveFailed': 'Foto gagal disimpan. Coba lagi ya.',
    'photo.fileFailed': 'Foto tidak bisa dibaca. Coba lagi ya.',
    'photo.noTorch': 'Kamera belakang HP ini tidak punya flash. Flash tetap jalan di kamera depan.',
    'photo.noTorchShort': 'Flash kamera belakang tidak didukung HP ini',

    'cam.explain.title': 'Izinkan kamera ya',
    'cam.explain.text': 'Supaya bisa memotret, browser akan minta izin kamera.<br>Pilih <b>Izinkan</b> / <b>Allow</b>.',
    'cam.explain.btn': 'Nyalakan kamera',
    'cam.denied.title': 'Kamera belum diizinkan',
    'cam.denied.ios': '<ol><li>Ketuk <b>aA</b> di kolom alamat</li><li>Pilih <b>Pengaturan Situs Web</b></li><li>Ubah <b>Kamera</b> jadi <b>Izinkan</b></li><li>Ketuk <b>Coba lagi</b> di bawah</li></ol>',
    'cam.denied.android': '<ol><li>Ketuk <b>ikon di kiri alamat web</b></li><li>Pilih <b>Izin</b> → <b>Kamera</b></li><li>Pilih <b>Izinkan</b></li><li>Ketuk <b>Coba lagi</b> di bawah</li></ol>',
    'cam.unsupported.title': 'Buka di Chrome atau Safari ya',
    'cam.unsupported.text': 'Browser di aplikasi ini tidak bisa membuka kamera.<br>Ketuk menu <b>⋮</b> atau <b>⋯</b>, lalu pilih <b>Buka di Chrome</b> / <b>Buka di Safari</b>.',
    'cam.unsupported.btn': 'Salin link',
    'cam.copied': 'Link tersalin ✓ Tempel di Chrome atau Safari',
    'cam.busy.title': 'Kamera sedang dipakai',
    'cam.busy.text': 'Ada aplikasi lain yang memakai kamera. Tutup dulu (misalnya kamera atau video call), lalu coba lagi.',
    'cam.notfound.title': 'Kamera tidak ditemukan',
    'cam.notfound.text': 'HP ini tidak terdeteksi punya kamera.',
    'cam.unknown.title': 'Kamera belum bisa menyala',
    'cam.unknown.text': 'Ada kendala. Coba lagi ya.',
    'cam.retry': 'Coba lagi',
    'cam.fileAlt': 'Pakai kamera bawaan HP saja',

    'mem.empty': 'Belum ada foto atau video.',
    'mem.go': 'Mulai memotret',
    'mem.count': '{n} tersimpan',
    'mem.save': 'Simpan ke HP',
    'mem.close': 'Tutup',

    'thanks.title': 'Terima kasih',
    'thanks.note': 'Slot foto kamu sudah habis. Terima kasih sudah ikut mengabadikan hari kami!',
    'thanks.see': 'Lihat hasil kamu',
    'thanks.menu': 'Kembali ke menu',
  },
};

let lang = getItem('lang', 'en');
if (!DICT[lang]) lang = 'en';
const listeners = new Set();
const globals = {};

export function setGlobals(vars) {
  Object.assign(globals, vars);
}

export function getLang() {
  return lang;
}

export function t(key, vars = {}) {
  const s = DICT[lang][key] ?? DICT.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? globals[k] ?? ''));
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
}

export function setLang(next) {
  if (!DICT[next] || next === lang) return;
  lang = next;
  setItem('lang', lang);
  applyI18n();
  listeners.forEach((fn) => fn(lang));
}

/** Dipanggil setiap bahasa berganti (untuk teks yang dibuat lewat JavaScript) */
export function onLangChange(fn) {
  listeners.add(fn);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b) setLang(b.dataset.lang);
});
