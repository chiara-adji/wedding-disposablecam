// Halaman 5 — Memories.
// Tab "Mine": hasil jepretan di HP ini (dari IndexedDB, bisa disimpan ke HP).
// Tab "All guests": album bersama, daftar foto/video semua tamu dari folder Drive (lewat Apps Script).
import { CONFIG } from './config.js';
import { listShots } from './db.js';
import { registerScreen } from './router.js';
import { getItem, setItem } from './storage.js';
import { t, onLangChange } from './i18n.js';
import { onUploadState, getUploadState, fetchGallery } from './uploader.js';

const root = document.querySelector('[data-screen="memories"]');
const $ = (sel) => root.querySelector(sel);
const grid = $('[data-mem-grid]');
const empty = $('[data-mem-empty]');
const emptyText = $('[data-mem-empty-text]');
const goBtn = $('[data-mem-go]');
const retryBtn = $('[data-mem-retry]');
const moreBtn = $('[data-mem-more]');
const loadingEl = $('[data-mem-loading]');
const countEl = $('[data-mem-count]');
const tabsEl = $('[data-mem-tabs]');
const viewer = $('[data-viewer]');
const viewerMedia = $('[data-viewer-media]');
const saveBtn = $('[data-viewer-save]');
const closeBtn = $('[data-viewer-close]');
const posEl = $('[data-viewer-pos]');
const prevBtn = $('[data-viewer-prev]');
const nextBtn = $('[data-viewer-next]');

const sharedEnabled = () => !!(CONFIG.SHARED_GALLERY && CONFIG.APPS_SCRIPT_URL);

let tab = 'mine';
/** Isi tab yang sedang tampil: { kind, src, poster?, remote, shot?, id?, who? } */
let items = [];
let openIndex = -1;
let urls = [];

// Album bersama (tetap disimpan selama halaman terbuka, supaya ganti tab tidak memuat ulang)
const shared = { items: [], next: null, loaded: false, loading: false, error: false, loadedAt: 0 };

function clearUrls() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

// Sama dengan nama file di Drive: putri_foto1.jpg / putri_video1.mp4
function fileName(shot) {
  if (shot.remoteName) return shot.remoteName;
  const who = shot.guestSlug || 'tamu';
  const kind = shot.kind === 'video' ? 'video' : 'foto';
  return `${who}_${kind}${shot.seq || 1}.${shot.ext}`;
}

/** "putri-2_foto3.jpg" → "Putri" */
function whoFromName(name) {
  const slug = String(name || '').split('_')[0].replace(/-\d+$/, '');
  if (!slug) return '';
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const driveThumb = (id, w = 400) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
const drivePhoto = (id) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1600`;
const driveVideo = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

// ---------------------------------------------------------------
//  Tab
// ---------------------------------------------------------------
function setTab(next) {
  tab = next === 'all' && sharedEnabled() ? 'all' : 'mine';
  setItem('memTab', tab);
  tabsEl.querySelectorAll('[data-mem-tab]').forEach((b) => {
    const on = b.dataset.memTab === tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  render();
}
tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mem-tab]');
  if (b && b.dataset.memTab !== tab) setTab(b.dataset.memTab);
});

function render() {
  return tab === 'all' ? renderAll() : renderMine();
}

// ---------------------------------------------------------------
//  Tab "Mine"
// ---------------------------------------------------------------
let renderId = 0;
async function renderMine() {
  const id = ++renderId;
  const list = await listShots();
  if (id !== renderId || tab !== 'mine') return; // ada render yang lebih baru
  clearUrls();
  items = list.map((shot) => {
    const src = URL.createObjectURL(shot.blob);
    urls.push(src);
    let poster = null;
    if (shot.kind === 'video' && shot.poster) {
      poster = URL.createObjectURL(shot.poster);
      urls.push(poster);
    }
    return { kind: shot.kind, src, poster, remote: false, shot };
  });
  grid.innerHTML = '';
  moreBtn.hidden = true;
  loadingEl.hidden = true;
  renderCount();
  showEmpty(items.length ? null : 'mine');
  const syncOn = getUploadState().enabled;
  items.forEach((it, index) => {
    const b = tile(index);
    if (it.kind === 'video' && it.poster) {
      b.innerHTML = `<img src="${it.poster}" alt="" loading="lazy"><span class="mem-tile__badge">▶</span>`;
    } else if (it.kind === 'video') {
      b.innerHTML = `<video src="${it.src}#t=0.1" muted playsinline preload="metadata"></video><span class="mem-tile__badge">▶</span>`;
    } else {
      b.innerHTML = `<img src="${it.src}" alt="" loading="lazy">`;
    }
    if (syncOn) {
      const sent = it.shot.status === 'uploaded';
      const dot = document.createElement('span');
      dot.className = 'mem-tile__sync' + (sent ? ' is-sent' : '');
      dot.textContent = sent ? '✓' : '⏳';
      dot.setAttribute('aria-label', t(sent ? 'mem.sentAria' : 'mem.queuedAria'));
      b.append(dot);
    }
    grid.append(b);
  });
}

// ---------------------------------------------------------------
//  Tab "All guests" (album bersama)
// ---------------------------------------------------------------
function renderAll() {
  ++renderId;
  clearUrls();
  grid.innerHTML = '';
  countEl.textContent = '';
  items = [];
  appendShared(shared.items);
  updateSharedState();
  // muat (ulang) kalau belum pernah atau sudah lebih dari 1 menit
  if (!shared.loading && (!shared.loaded || Date.now() - shared.loadedAt > 60000)) loadShared(true);
}

function appendShared(list) {
  for (const f of list) {
    const it = {
      kind: f.video ? 'video' : 'photo',
      id: f.id,
      src: f.video ? driveVideo(f.id) : drivePhoto(f.id),
      poster: driveThumb(f.id),
      remote: true,
      who: whoFromName(f.name),
    };
    const index = items.push(it) - 1;
    const b = tile(index);
    b.innerHTML = `<img src="${it.poster}" alt="" loading="lazy" referrerpolicy="no-referrer">` +
      (it.kind === 'video' ? '<span class="mem-tile__badge">▶</span>' : '');
    // thumbnail video kadang belum dibuat Google: tampilkan kotak gelap saja
    b.querySelector('img').addEventListener('error', (e) => e.target.remove(), { once: true });
    grid.append(b);
  }
}

function updateSharedState() {
  if (tab !== 'all') return;
  loadingEl.hidden = !(shared.loading && !shared.items.length);
  moreBtn.hidden = !(shared.next && !shared.loading);
  if (shared.error && !shared.items.length) showEmpty('error');
  else if (shared.loaded && !shared.items.length) showEmpty('all');
  else showEmpty(null);
}

async function loadShared(reset = false) {
  if (shared.loading || (!reset && !shared.next)) return;
  shared.loading = true;
  shared.error = false;
  updateSharedState();
  try {
    const page = await fetchGallery(reset ? null : shared.next);
    if (reset) {
      shared.items = page.items;
    } else {
      shared.items = shared.items.concat(page.items);
    }
    shared.next = page.next;
    shared.loaded = true;
    shared.loadedAt = Date.now();
    shared.loading = false;
    if (tab === 'all' && viewer.hidden && !root.hidden) {
      if (reset) renderAll();
      else appendShared(page.items);
    }
  } catch (err) {
    console.warn('Album gagal dimuat:', err.code || err);
    shared.loading = false;
    shared.error = true;
  }
  updateSharedState();
}

moreBtn.addEventListener('click', () => loadShared(false));
retryBtn.addEventListener('click', () => loadShared(true));

// ---------------------------------------------------------------
//  Bersama
// ---------------------------------------------------------------
function tile(index) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mem-tile';
  b.addEventListener('click', () => openViewer(index));
  return b;
}

function showEmpty(kind) {
  empty.hidden = !kind;
  if (!kind) return;
  emptyText.textContent = t(kind === 'error' ? 'mem.allError' : kind === 'all' ? 'mem.allEmpty' : 'mem.empty');
  goBtn.hidden = kind === 'error';
  retryBtn.hidden = kind !== 'error';
}

function renderCount() {
  if (tab !== 'mine') {
    countEl.textContent = '';
    return;
  }
  const st = getUploadState();
  const n = items.length;
  if (!n) countEl.textContent = '';
  else if (st.enabled) countEl.textContent = t('mem.countSync', { n, u: st.sent });
  else countEl.textContent = t('mem.count', { n });
}

// ---------------------------------------------------------------
//  Penampil besar (geser kiri/kanan)
// ---------------------------------------------------------------
function openViewer(index, dir = 0) {
  if (index < 0 || index >= items.length) return;
  const it = items[index];
  openIndex = index;
  if (it.remote && it.kind === 'video') {
    viewerMedia.innerHTML = `<iframe src="${it.src}" allow="autoplay; fullscreen" allowfullscreen title="Video"></iframe>`;
  } else if (it.kind === 'video') {
    viewerMedia.innerHTML = `<video src="${it.src}" controls playsinline autoplay></video>`;
  } else {
    viewerMedia.innerHTML = `<img src="${it.src}" alt="" draggable="false"${it.remote ? ' referrerpolicy="no-referrer"' : ''}>`;
    if (it.remote) {
      // cadangan kalau alamat foto besar gagal: pakai thumbnail besar
      viewerMedia.firstElementChild.addEventListener('error', (e) => {
        e.target.src = driveThumb(it.id, 1600);
      }, { once: true });
    }
  }
  const el = viewerMedia.firstElementChild;
  if (dir) {
    el.classList.add(dir > 0 ? 'is-from-right' : 'is-from-left');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-from-right', 'is-from-left')));
  }
  posEl.textContent = `${index + 1} / ${items.length}` + (it.who ? ` · ${t('mem.by', { name: it.who })}` : '');
  prevBtn.hidden = index === 0;
  nextBtn.hidden = index === items.length - 1;
  saveBtn.parentElement.hidden = it.remote; // simpan ke HP hanya untuk hasil sendiri
  viewer.hidden = false;
  // dekat ujung album bersama: muat halaman berikutnya
  if (tab === 'all' && shared.next && index >= items.length - 3) loadShared(false);
}

function step(dir) {
  const next = openIndex + dir;
  if (next < 0 || next >= items.length) {
    // ujung galeri: goyang sedikit
    const el = viewerMedia.firstElementChild;
    el?.animate?.([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 18}px)` }, { transform: 'translateX(0)' }], { duration: 220 });
    return;
  }
  openViewer(next, dir);
}

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
  openIndex = -1;
  // halaman album yang termuat saat penampil terbuka: tampilkan di grid
  if (tab === 'all' && grid.children.length < shared.items.length) appendShared(shared.items.slice(grid.children.length));
  updateSharedState();
}

async function saveToPhone() {
  const it = items[openIndex];
  if (!it || it.remote) return;
  const shot = it.shot;
  const name = fileName(shot);
  const file = new File([shot.blob], name, { type: shot.mime });
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
  a.href = URL.createObjectURL(shot.blob);
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
  renderCount();
  if (!empty.hidden) updateSharedState();
  if (tab === 'mine' && !empty.hidden) showEmpty('mine');
});

// Perbarui tanda ✓ saat upload selesai (tanpa menggambar ulang kalau penampil sedang terbuka)
let lastSent = -1;
onUploadState((st) => {
  if (st.sent === lastSent) return;
  lastSent = st.sent;
  if (root.hidden || tab !== 'mine') return;
  if (viewer.hidden) renderMine();
  else renderCount();
});

// Link "Lihat foto semua tamu" di halaman pilih mode
const albumLink = document.querySelector('[data-album-link]');
if (albumLink) {
  albumLink.hidden = !sharedEnabled();
  albumLink.addEventListener('click', () => setItem('memTab', 'all'));
}
// "Camera roll" selalu membuka hasil sendiri
document.querySelectorAll('a[href="#/memories"]:not([data-album-link])').forEach((a) => {
  a.addEventListener('click', () => setItem('memTab', 'mine'));
});

registerScreen('memories', {
  enter() {
    tabsEl.hidden = !sharedEnabled();
    setTab(getItem('memTab', 'mine'));
  },
  leave() {
    closeViewer();
    ++renderId;
    grid.innerHTML = '';
    items = [];
    clearUrls();
  },
});
