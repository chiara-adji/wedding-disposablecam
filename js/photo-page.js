// Halaman 3 — Kamera foto (disposable camera)
import { CONFIG } from './config.js';
import { Camera, cameraSupported } from './camera.js';
import {
  PHOTO_FILTERS, getPhotoFilter, applyPhotoFilter, canvasToJpeg,
  fileToCanvas, getGrainDataUrl, formatFilmDate,
} from './filters.js';
import { addShot, countShots, listShots, requestPersistence } from './db.js';
import { getItem, setItem, getDeviceId } from './storage.js';
import { registerScreen, go, currentRoute } from './router.js';
import { getGuestName, guestSlug, requireGuestName } from './guest.js';
import { showCamMessage, hideCamMessage } from './cam-messages.js';
import { t, onLangChange } from './i18n.js';
import { setupFrame } from './frame.js';

const root = document.querySelector('[data-screen="photo"]');
const $ = (sel) => root.querySelector(sel);

const video = $('[data-video]');
const viewfinder = $('[data-viewfinder]');
const overlay = $('[data-filter-overlay]');
const grain = $('[data-grain]');
const liveStamp = $('[data-live-stamp]');
const zoomBar = $('[data-zoom-bar]');
const countdownEl = $('[data-countdown]');
const flashEl = $('[data-shutter-flash]');
const leftEl = $('[data-left]');
const thumbEl = $('[data-thumb]');
const shutterBtn = $('[data-shutter]');
const switchBtn = $('[data-switch]');
const flashBtn = $('[data-flash]');
const flashLabel = $('[data-flash-label]');
const timerBtn = $('[data-timer]');
const timerLabel = $('[data-timer-label]');
const filterList = $('[data-filter-list]');
const filterName = $('[data-filter-name]');
const statusEl = $('[data-status]');
const fileInput = $('[data-cam-file]');

const frameEl = $('[data-frame]');
const camera = new Camera(video, frameEl);
const frame = setupFrame(root, 'photo', { canChange: () => !state.busy && !state.counting });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  active: false,
  used: 0,
  busy: false,
  counting: null, // { cancel() }
  filterId: getItem('photoFilter', PHOTO_FILTERS[0].id),
  flash: getItem('photoFlash', false),
  timer: 0,
  thumbUrl: null,
};

function goThanks() {
  setItem('thanksKind', 'photo');
  go('thanks');
}

const left = () => Math.max(0, CONFIG.PHOTO_LIMIT - state.used);

// ---------------------------------------------------------------
//  Tampilan
// ---------------------------------------------------------------
grain.style.backgroundImage = `url(${getGrainDataUrl()})`;
liveStamp.textContent = formatFilmDate();

function renderFilters() {
  filterList.innerHTML = '';
  for (const f of PHOTO_FILTERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.setAttribute('role', 'radio');
    b.dataset.id = f.id;
    b.innerHTML = `<span class="filter-chip__dot" style="background:${f.swatch}"></span>
                   <span class="filter-chip__name">${f.name}</span>`;
    b.addEventListener('click', () => setFilter(f.id));
    filterList.append(b);
  }
}

function setFilter(id) {
  const f = getPhotoFilter(id);
  state.filterId = f.id;
  setItem('photoFilter', f.id);
  video.style.filter = f.css;
  overlay.style.background = f.overlay;
  grain.style.opacity = String(Math.min(0.5, f.params.grain * 1.6));
  filterName.textContent = f.name;
  for (const b of filterList.children) {
    const on = b.dataset.id === f.id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  }
}

function renderFlash() {
  flashBtn.setAttribute('aria-pressed', String(state.flash));
  flashBtn.classList.toggle('is-on', state.flash);
  flashLabel.textContent = t(state.flash ? 'photo.flashOn' : 'photo.flashOff');
}

function renderTimer() {
  timerBtn.classList.toggle('is-on', state.timer > 0);
  timerLabel.textContent = state.timer ? t('photo.timerOn', { n: state.timer }) : t('photo.timerOff');
}

function renderCounter() {
  leftEl.textContent = t('photo.left', { n: left() });
  root.classList.toggle('is-empty', left() === 0);
}

function renderZoom() {
  zoomBar.innerHTML = '';
  if (!camera.stream) return;
  for (const z of camera.zoomLevels()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zoom-btn';
    b.dataset.z = z;
    b.textContent = z === 0.5 ? '.5' : String(z);
    b.setAttribute('aria-label', t('photo.zoomAria', { z }));
    b.addEventListener('click', async () => {
      await camera.setZoom(z);
      markZoom();
    });
    zoomBar.append(b);
  }
  markZoom();
}

function markZoom() {
  for (const b of zoomBar.children) {
    const on = Number(b.dataset.z) === camera.zoom;
    b.classList.toggle('is-active', on);
    b.textContent = (b.dataset.z === '0.5' ? '.5' : b.dataset.z) + (on ? '×' : '');
  }
}

let statusTimer;
function setStatus(text, ms = 2500) {
  statusEl.textContent = text;
  statusEl.classList.add('is-visible');
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => statusEl.classList.remove('is-visible'), ms);
}

async function refreshThumb() {
  const [latest] = await listShots('photo');
  if (state.thumbUrl) URL.revokeObjectURL(state.thumbUrl);
  state.thumbUrl = latest ? URL.createObjectURL(latest.blob) : null;
  thumbEl.style.backgroundImage = state.thumbUrl ? `url(${state.thumbUrl})` : '';
  thumbEl.classList.toggle('has-photo', !!latest);
}

// ---------------------------------------------------------------
//  Kamera menyala / mati
// ---------------------------------------------------------------
async function startCamera(facing) {
  hideCamMessage(root);
  root.classList.add('is-loading');
  try {
    await camera.start(facing);
    setItem('camGranted', true);
    renderZoom();
    await checkPicture(facing);
  } catch (err) {
    if (!state.active) return;
    showCamMessage(root, err.kind || 'unknown', () => startCamera(facing));
  } finally {
    root.classList.remove('is-loading');
  }
}

// Kalau kamera sudah diizinkan tapi gambarnya tidak muncul, beri tombol yang jelas
async function checkPicture(facing) {
  let h = camera.health();
  if (h === 'ok') return;
  if (h === 'paused') {
    showCamMessage(root, 'paused', async () => {
      hideCamMessage(root);
      const after = await camera.resume();
      if (after !== 'ok' && state.active) showCamMessage(root, 'blank', () => startCamera(facing));
    });
    return;
  }
  // beri waktu sebentar, beberapa HP lambat mengirim gambar pertama
  await new Promise((r) => setTimeout(r, 2500));
  h = camera.health();
  if (h === 'ok' || !state.active) return;
  if (h === 'paused') return checkPicture(facing);
  showCamMessage(root, 'blank', () => startCamera(facing));
}

function openCamera() {
  if (!cameraSupported()) {
    showCamMessage(root, 'unsupported');
    return;
  }
  if (getItem('camGranted')) {
    startCamera();
  } else {
    showCamMessage(root, 'explain', () => startCamera());
  }
}

// ---------------------------------------------------------------
//  Mengambil foto
// ---------------------------------------------------------------
function countdown(seconds) {
  return new Promise((resolve) => {
    let n = seconds;
    countdownEl.hidden = false;
    countdownEl.textContent = n;
    const timer = setInterval(() => {
      n--;
      if (n <= 0) {
        finish(true);
      } else {
        countdownEl.textContent = n;
      }
    }, 1000);
    function finish(ok) {
      clearInterval(timer);
      countdownEl.hidden = true;
      state.counting = null;
      shutterBtn.classList.remove('is-counting');
      resolve(ok);
    }
    state.counting = { cancel: () => finish(false) };
    shutterBtn.classList.add('is-counting');
  });
}

async function savePhoto(canvas) {
  const now = new Date();
  state.used++;
  renderCounter();
  try {
    // beri waktu layar untuk menggambar animasi shutter dulu
    await wait(30);
    applyPhotoFilter(canvas, state.filterId, now);
    const blob = await canvasToJpeg(canvas, 0.85);
    if (!blob) throw new Error('toBlob gagal');
    await addShot({
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'photo',
      blob,
      mime: 'image/jpeg',
      ext: 'jpg',
      createdAt: now.getTime(),
      filter: state.filterId,
      seq: state.used,
      deviceId: getDeviceId(),
      guestName: getGuestName(),
      guestSlug: guestSlug(),
    });
    requestPersistence();
    await refreshThumb();
    setStatus(t('photo.saved', { n: left() }));
    if (left() === 0) setTimeout(() => currentRoute() === 'photo' && goThanks(), 1600);
  } catch (err) {
    console.error(err);
    state.used--;
    renderCounter();
    setStatus(t('photo.saveFailed'), 4000);
  }
}

async function takePhoto() {
  if (state.counting) {
    state.counting.cancel();
    return;
  }
  if (state.busy) return;
  if (left() <= 0) {
    goThanks();
    return;
  }
  if (!camera.stream) return;

  if (state.timer) {
    const ok = await countdown(state.timer);
    if (!ok || !camera.stream) return;
  }

  state.busy = true;
  root.classList.add('is-busy');
  try {
    const front = camera.facing === 'user';
    const torch = state.flash && !front && camera.hasTorch && (await camera.setTorch(true));
    const screenFlash = state.flash && front;
    if (torch) await wait(450);
    if (screenFlash) {
      flashEl.classList.add('is-screen');
      await wait(300);
    }
    const canvas = camera.grabFrame(1600);
    if (torch) camera.setTorch(false);
    flashEl.classList.remove('is-screen');
    // kedip ala shutter
    flashEl.classList.remove('is-blink');
    void flashEl.offsetWidth;
    flashEl.classList.add('is-blink');
    if (navigator.vibrate) navigator.vibrate(30);
    if (canvas) await savePhoto(canvas);
  } finally {
    state.busy = false;
    root.classList.remove('is-busy');
  }
}

// ---------------------------------------------------------------
//  Tombol-tombol
// ---------------------------------------------------------------
shutterBtn.addEventListener('click', takePhoto);

switchBtn.addEventListener('click', async () => {
  if (state.busy || state.counting) return;
  switchBtn.classList.add('is-spinning');
  await startCamera(camera.facing === 'user' ? 'environment' : 'user');
  switchBtn.classList.remove('is-spinning');
  if (state.flash && camera.facing === 'environment' && !camera.hasTorch) {
    setStatus(t('photo.noTorchShort'), 3000);
  }
});

flashBtn.addEventListener('click', () => {
  state.flash = !state.flash;
  setItem('photoFlash', state.flash);
  renderFlash();
  if (state.flash && camera.stream && camera.facing === 'environment' && !camera.hasTorch) {
    setStatus(t('photo.noTorch'), 4000);
  } else {
    setStatus(t(state.flash ? 'photo.flashOn' : 'photo.flashOff'), 1500);
  }
});

timerBtn.addEventListener('click', () => {
  state.timer = state.timer === 0 ? 3 : state.timer === 3 ? 10 : 0;
  renderTimer();
  setStatus(timerLabel.textContent, 1500);
});

// Cadangan: kamera bawaan HP lewat <input type="file" capture>
fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (left() <= 0) return goThanks();
  try {
    const canvas = await fileToCanvas(file, 1600);
    await savePhoto(canvas);
  } catch (err) {
    console.error(err);
    setStatus(t('photo.fileFailed'), 4000);
  }
});

// Matikan kamera saat aplikasi ditinggal (hemat baterai), nyalakan lagi saat kembali
document.addEventListener('visibilitychange', () => {
  if (!state.active) return;
  if (document.hidden) {
    state.counting?.cancel();
    camera.stop();
  } else if (getItem('camGranted') && cameraSupported()) {
    startCamera(camera.facing);
  }
});

// ---------------------------------------------------------------
//  Masuk / keluar halaman
// ---------------------------------------------------------------
renderFilters();
setFilter(state.filterId);
renderFlash();
renderTimer();
onLangChange(() => {
  renderFlash();
  renderTimer();
  renderCounter();
});

registerScreen('photo', {
  async enter() {
    if (!requireGuestName()) return;
    state.active = true;
    frame.layout();
    state.used = await countShots('photo');
    renderCounter();
    refreshThumb();
    if (left() === 0) {
      goThanks();
      return;
    }
    openCamera();
  },
  leave() {
    state.active = false;
    state.counting?.cancel();
    camera.stop();
    hideCamMessage(root);
    zoomBar.innerHTML = '';
  },
});
