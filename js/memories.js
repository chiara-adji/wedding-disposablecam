// Halaman 5 — Memories: galeri hasil jepretan di HP ini saja.
import { listShots } from './db.js';
import { registerScreen } from './router.js';
import { t, onLangChange } from './i18n.js';

const root = document.querySelector('[data-screen="memories"]');
const grid = root.querySelector('[data-mem-grid]');
const empty = root.querySelector('[data-mem-empty]');
const countEl = root.querySelector('[data-mem-count]');
const viewer = root.querySelector('[data-viewer]');
const viewerMedia = root.querySelector('[data-viewer-media]');
const saveBtn = root.querySelector('[data-viewer-save]');
const closeBtn = root.querySelector('[data-viewer-close]');

let urls = [];
let shots = [];
let openShot = null;

function clearUrls() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

function fileName(shot) {
  const d = new Date(shot.createdAt);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `chiara-adji_${stamp}.${shot.ext}`;
}

async function render() {
  clearUrls();
  shots = await listShots();
  grid.innerHTML = '';
  countEl.textContent = shots.length ? t('mem.count', { n: shots.length }) : '';
  empty.hidden = shots.length > 0;
  for (const shot of shots) {
    const url = URL.createObjectURL(shot.blob);
    urls.push(url);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mem-tile';
    if (shot.kind === 'video' && shot.poster) {
      const posterUrl = URL.createObjectURL(shot.poster);
      urls.push(posterUrl);
      b.innerHTML = `<img src="${posterUrl}" alt="" loading="lazy"><span class="mem-tile__badge">▶</span>`;
    } else if (shot.kind === 'video') {
      b.innerHTML = `<video src="${url}#t=0.1" muted playsinline preload="metadata"></video><span class="mem-tile__badge">▶</span>`;
    } else {
      b.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
    }
    b.addEventListener('click', () => openViewer(shot, url));
    grid.append(b);
  }
}

function openViewer(shot, url) {
  openShot = shot;
  viewerMedia.innerHTML = shot.kind === 'video'
    ? `<video src="${url}" controls playsinline autoplay></video>`
    : `<img src="${url}" alt="">`;
  viewer.hidden = false;
}

function closeViewer() {
  viewer.hidden = true;
  viewerMedia.innerHTML = '';
  openShot = null;
}

async function saveToPhone() {
  if (!openShot) return;
  const name = fileName(openShot);
  const file = new File([openShot.blob], name, { type: openShot.mime });
  // Di HP, menu "bagikan" punya pilihan "Simpan gambar / Save image"
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(openShot.blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

closeBtn.addEventListener('click', closeViewer);
saveBtn.addEventListener('click', saveToPhone);
viewer.addEventListener('click', (e) => {
  if (e.target === viewer) closeViewer();
});
onLangChange(() => {
  countEl.textContent = shots.length ? t('mem.count', { n: shots.length }) : '';
});

registerScreen('memories', {
  enter: render,
  leave() {
    closeViewer();
    grid.innerHTML = '';
    clearUrls();
  },
});
