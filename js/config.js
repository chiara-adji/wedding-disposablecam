// =============================================================
//  PENGATURAN UTAMA — satu-satunya file yang perlu diubah
//  saat sambung ke Google Apps Script atau ganti kode acara.
// =============================================================

export const CONFIG = {
  // URL web app Google Apps Script (diisi di langkah 5).
  APPS_SCRIPT_URL: '',

  // Kode acara. Ikut tertulis di link QR: https://<domain>/?e=KODE
  // Apps Script akan menolak upload tanpa kode yang cocok.
  EVENT_TOKEN: 'CA191226',

  // Batas per HP
  PHOTO_LIMIT: 20,
  VIDEO_LIMIT: 5,
  VIDEO_MAX_SECONDS: 30,

  // Teks yang tampil di halaman
  COUPLE: 'Chiara & Adji',
  PLACE_DATE: 'Cepu, 19.12.2026',
};
