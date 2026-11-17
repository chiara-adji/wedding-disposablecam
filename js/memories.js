// Halaman 5 — Memories: galeri hasil jepretan di HP ini saja.
import { listShots } from './db.js';
import { registerScreen } from './router.js';
import { t, onLangChange } from './i18n.js';
import { onUploadState, getUploadState } from './uploader.js';

const root = document.querySelector('[data-screen="memories"]');
const grid = root.querySelector('[data-mem-grid]');
const empty = root.querySelector('[data-mem-empty]');
const countEl = root.querySelector('[data-mem-count]');
const viewer = root.querySelector('[data-viewer]');
const viewerMedia = root.querySelector('[data-viewer-media]');
const saveBtn = root.querySelector('[data-viewer-save]');
const closeBtn = root.querySelector('[data-viewer-close]');
const posEl = root.querySelector('[data-viewer-pos]');
const prevBtn = root.querySelector('[data-viewer-prev]');
const nextBtn = root.querySelector('[data-viewer-next]');

let urls = [];
let shots = [];
let openShot = null;
let openIndex = -1;
const mediaUrls = new Map(); // shot.id → object URL

function clearUrls() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  mediaUrls.clear();
}

// Sama dengan nama file di Drive: putri_foto1.jpg / putri_video1.mp4
function fileName(shot) {
  if (shot.remoteName) return shot.remoteName;
  const who = shot.guestSlug || 'tamu';
  const kind = shot.kind === 'video' ? 'video' : 'foto';
  return `${who}_${kind}${shot.seq || 1}.${shot.ext}`;
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  const list = await listShots();
  if (id !== renderId) return; // ada render yang lebih baru
  clearUrls();
  shots = list;
  grid.innerHTML = '';
  renderCount();
  empty.hidden = shots.length > 0;
  for (const shot of shots) {
    const url = URL.createObjectURL(shot.blob);
    urls.push(url);
    mediaUrls.set(shot.id, url);
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
    const index = grid.children.length;
    if (getUploadState().enabled) {
      const sent = shot.status === 'uploaded';
      const dot = document.createElement('span');
      dot.className = 'mem-tile__sync' + (sent ? ' is-sent' : '');
      dot.textContent = sent ? '✓' : '⏳';
      dot.setAttribute('aria-label', t(sent ? 'mem.sentAria' : 'mem.queuedAria'));
      b.append(dot);
    }
    b.addEventListener('click', () => openViewer(index));
    grid.append(b);
  }
}

function openViewer(index, dir = 0) {
  if (index < 0 || index >= shots.length) return;
  const shot = shots[index];
  const url = mediaUrls.get(shot.id);
  openShot = shot;
  openIndex = index;
  viewerMedia.innerHTML = shot.kind === 'video'
    ? `<video src="${url}" controls playsinline autoplay></video>`
    : `<img src="${url}" alt="" draggable="false">`;
  const el = viewerMedia.firstElementChild;
  if (dir) {
    el.classList.add(dir > 0 ? 'is-from-right' : 'is-from-left');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-from-right', 'is-from-left')));
  }
  posEl.textContent = `${index + 1} / ${shots.length}`;
  prevBtn.hidden = index === 0;
  nextBtn.hidden = index === shots.length - 1;
  viewer.hidden = false;
}

function step(dir) {
  const next = openIndex + dir;
  if (next < 0 || next >= shots.length) {
    // ujung galeri: goyang sedikit
    const el = viewerMedia.firstElementChild;
    el?.animate?.([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 18}px)` }, { transform: 'translateX(0)' }], { duration: 220 });
    return;
  }
  openViewer(next, dir);
}

// Geser kiri/kanan untuk pindah foto
let touch = null;
viewerMedia.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return (touch = null);
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
viewerMedia.addEventListener('touchmove', (e) => {
  if (!touch) return;
  const dx = e.touches[0].clientX - touch.x;
  const dy = e.touches[0].clientY - touch.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    const el = viewerMedia.firstElementChild;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx * 0.6}px)`;
    }
  }
}, { passive: true });
viewerMedia.addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  const el = viewerMedia.firstElementChild;
  if (el) {
    el.style.transition = '';
    el.style.transform = '';
  }
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
  else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closeViewer(); // geser ke bawah = tutup
});
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
document.addEventListener('keydown', (e) => {
  if (viewer.hidden) return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'Escape') closeViewer();
});

function closeViewer() {
  viewer.hidden = true;
  viewerMedia.innerHTML = '';
  openShot = null;
  openIndex = -1;
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
function renderCount() {
  const st = getUploadState();
  if (!shots.length) countEl.textContent = '';
  else if (st.enabled) countEl.textContent = t('mem.countSync', { n: shots.length, u: st.sent });
  else countEl.textContent = t('mem.count', { n: shots.length });
}
onLangChange(renderCount);
// Perbarui tanda ✓ saat upload selesai (tanpa menggambar ulang kalau penampil sedang terbuka)
let lastSent = -1;
onUploadState((st) => {
  if (st.sent === lastSent) return;
  lastSent = st.sent;
  if (!root.hidden && viewer.hidden) render();
  else renderCount();
});

registerScreen('memories', {
  enter: render,
  leave() {
    closeViewer();
    grid.innerHTML = '';
    clearUrls();
  },
});
