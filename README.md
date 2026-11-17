# Wedding Disposable Camera — Chiara & Adji

Web kamera sekali pakai untuk tamu pernikahan Chiara & Adji (Cepu, 19.12.2026).
Tamu scan QR → foto (20 per HP) atau video handycam (5 per HP) → otomatis masuk ke album.

Dibuat dengan HTML, CSS, dan JavaScript biasa — tanpa build step. Di-host di GitHub Pages.

## Struktur

| Folder / file | Isi |
| --- | --- |
| `index.html` | Semua halaman (sambutan, pilih mode, kamera, memories, penutup) |
| `css/` | Tampilan |
| `js/config.js` | **Pengaturan utama**: URL Apps Script, kode acara, batas foto/video |
| `js/i18n.js` | Semua teks (Inggris & Indonesia) |
| `js/filters.js` | Filter foto ala kamera film + cap tanggal |
| `assets/img/` | Foto prewedding & stiker |
| `apps-script/` | Kode Google Apps Script (untuk upload ke Google Drive) |

## Link untuk tamu

`https://<alamat-web>/?e=<KODE_ACARA>` — kode acara ada di `js/config.js`.
