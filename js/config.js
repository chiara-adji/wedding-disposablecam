// =============================================================
//  PENGATURAN UTAMA — satu-satunya file yang perlu diubah
//  saat sambung ke Google Apps Script atau ganti kode acara.
// =============================================================

export const CONFIG = {
  // URL web app Google Apps Script (diisi di langkah 5).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby6jbi4YzhrQG2U5HAWiMJ-0ETkwT6tswey_xg65ff5xkFdAhbBi5JrRRd6_vYSl-fnVg/exec',

  // Kode acara. Ikut tertulis di link QR: https://<domain>/?e=KODE
  // Apps Script akan menolak upload tanpa kode yang cocok.
  EVENT_TOKEN: 'CA191226',

  // Batas per HP
  PHOTO_LIMIT: 20,
  VIDEO_LIMIT: 10,
  VIDEO_MAX_SECONDS: 30,

  // Galeri bersama: tamu bisa melihat foto & video semua tamu (tab "All guests" di Memories).
  // Matikan (false) kalau tidak jadi dipakai. Butuh fungsi bukaGaleri() sudah dijalankan di Apps Script.
  SHARED_GALLERY: true,

  // Teks yang tampil di halaman
  COUPLE: 'Chiara & Adji',
  PLACE_DATE: 'Cepu, 19.12.2026',
};
