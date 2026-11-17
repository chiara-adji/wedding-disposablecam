// Halaman 4 — Handycam (video). Kamera digambar ke <canvas> bersama filter dan
// tampilan layar handycam, lalu canvas itu yang direkam (jadi tulisan ikut terekam).
import { CONFIG } from './config.js';
import { Camera, cameraSupported, CameraError } from './camera.js';
import { VIDEO_FILTERS, getVideoFilter, applyVideoLook, drawHud } from './video-filters.js';
import { addShot, countShots, listShots, requestPersistence } from './db.js';
import { getItem, setItem, getDeviceId } from './storage.js';
import { registerScreen, go, currentRoute } from './router.js';
import { showCamMessage, hideCamMessage } from './cam-messages.js';
import { t, onLangChange } from './i18n.js';

const root = document.querySelector('[data-screen="video"]');
const $ = (sel) => root.querySelector(sel);

const video = $('[data-video]');
const canvas = $('[data-canvas]');
const viewfinder = $('[data-viewfinder]');
const zoomBar = $('[data-zoom-bar]');
const leftEl = $('[data-left]');
const recLabel = $('[data-rec-label]');
const recLeftEl = $('[data-rec-left]');
const maxLenEl = $('[data-max-len]');
const thumbEl = $('[data-thumb]');
const recordBtn = $('[data-record]');
const ring = $('[data-ring]');
const switchBtn = $('[data-switch]');
const filterList = $('[data-filter-list]');
const filterName = $('[data-filter-name]');
const statusEl = $('[data-status]');
const fileInput = $('[data-cam-file]');

const ctx = canvas.getContext('2d');
const camera = new Camera(video, viewfinder);
const MAX_MS = CONFIG.VIDEO_MAX_SECONDS * 1000;

const state = {
  active: false,
  used: 0,
  filterId: getItem('videoFilter', VIDEO_FILTERS[0].id),
  recorder: null,
  recStart: 0,
  elapsed: 0,
  chunks: [],
  stopTimer: null,
  stopping: null, // Promise saat sedang berhenti & menyimpan
  noAudio: false,
  raf: 0,
  frame: 0,
  thumbUrl: null,
  poster: null,
};

const left = () => Math.max(0, CONFIG.VIDEO_LIMIT - state.used);
const recording = () => !!state.recorder && state.recorder.state === 'recording';

// ---------------------------------------------------------------
//  Format rekaman yang didukung browser ini
// ---------------------------------------------------------------
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (!MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

function extFor(mime) {
  return /mp4/.test(mime) ? 'mp4' : /webm/.test(mime) ? 'webm' : /quicktime/.test(mime) ? 'mov' : 'mp4';
}

// ---------------------------------------------------------------
//  Tampilan
// ---------------------------------------------------------------
function renderFilters() {
  filterList.innerHTML = '';
  for (const f of VIDEO_FILTERS) {
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
  const f = getVideoFilter(id);
  state.filterId = f.id;
  setItem('videoFilter', f.id);
  filterName.textContent = f.name;
  for (const b of filterList.children) {
    const on = b.dataset.id === f.id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  }
}

function renderTexts() {
  leftEl.textContent = t('video.left', { n: left() });
  maxLenEl.textContent = t('video.maxLen', { n: CONFIG.VIDEO_MAX_SECONDS });
  root.classList.toggle('is-empty', left() === 0);
  renderRecUi();
}

function renderRecUi() {
  const rec = recording();
  root.classList.toggle('is-recording', rec);
  const remaining = Math.max(0, Math.ceil((MAX_MS - state.elapsed) / 1000));
  recLabel.textContent = rec ? t('video.recording', { s: remaining }) : t('video.label');
  recLeftEl.textContent = rec ? `● ${remaining}s` : '';
  ring.style.strokeDashoffset = String(100 - Math.min(100, (state.elapsed / MAX_MS) * 100));
}

function renderZoom() {
  zoomBar.innerHTML = '';
  if (!camera.stream) return;
  for (const z of camera.zoomLevels()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zoom-btn';
    b.dataset.z = z;
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
  const [latest] = await listShots('video');
  if (state.thumbUrl) URL.revokeObjectURL(state.thumbUrl);
  state.thumbUrl = latest?.poster ? URL.createObjectURL(latest.poster) : null;
  thumbEl.style.backgroundImage = state.thumbUrl ? `url(${state.thumbUrl})` : '';
}

// ---------------------------------------------------------------
//  Gambar setiap frame ke canvas
// ---------------------------------------------------------------
function sizeCanvas() {
  // 720p: sisi pendek 720 px, mengikuti bentuk viewfinder (maks 1280)
  const ratio = camera.boxRatio();
  let w;
  let h;
  if (ratio <= 1) {
    w = 720;
    h = Math.min(1280, Math.round(720 / ratio));
  } else {
    h = 720;
    w = Math.min(1280, Math.round(720 * ratio));
  }
  w -= w % 2;
  h -= h % 2;
  // jangan ubah ukuran saat merekam (rekaman bisa rusak)
  if (!recording() && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}

function drawFrame() {
  state.raf = requestAnimationFrame(drawFrame);
  const w = canvas.width;
  const h = canvas.height;
  const src = camera.stream && camera.sourceRect(w / h);
  if (!src) return;
  if (recording()) {
    state.elapsed = performance.now() - state.recStart;
    renderRecUi();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (camera.mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
  ctx.restore();
  applyVideoLook(ctx, w, h, state.filterId, state.frame++);
  drawHud(ctx, w, h, {
    recording: recording(),
    elapsed: recording() ? state.elapsed : 0,
    now: new Date(),
    filterId: state.filterId,
  });
}

function startLoop() {
  cancelAnimationFrame(state.raf);
  sizeCanvas();
  state.raf = requestAnimationFrame(drawFrame);
}

function stopLoop() {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
}

window.addEventListener('resize', () => state.active && sizeCanvas());

// ---------------------------------------------------------------
//  Kamera + mikrofon
// ---------------------------------------------------------------
const videoConstraints = (facing) => ({
  facingMode: { ideal: facing },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
});

async function startCamera(facing = camera.facing) {
  hideCamMessage(root);
  root.classList.add('is-loading');
  try {
    try {
      await camera.start(facing, { audio: true, video: videoConstraints(facing) });
      state.noAudio = false;
    } catch (err) {
      // mikrofon ditolak / tidak ada → coba rekam tanpa suara
      if (!(err instanceof CameraError) || err.kind === 'unsupported') throw err;
      await camera.start(facing, { audio: false, video: videoConstraints(facing) });
      state.noAudio = true;
      setStatus(t('video.noAudio'), 4000);
    }
    setItem('camGranted', true);
    renderZoom();
    startLoop();
  } catch (err) {
    if (!state.active) return;
    showCamMessage(root, err.kind || 'unknown', () => startCamera(facing));
  } finally {
    root.classList.remove('is-loading');
  }
}

function openCamera() {
  if (!cameraSupported()) {
    showCamMessage(root, 'unsupported');
    return;
  }
  if (getItem('camGranted') && getItem('micAsked')) {
    startCamera();
  } else {
    showCamMessage(root, 'explainVideo', () => {
      setItem('micAsked', true);
      startCamera();
    });
  }
}

// ---------------------------------------------------------------
//  Merekam
// ---------------------------------------------------------------
function snapshotPoster() {
  const c = document.createElement('canvas');
  const scale = 360 / Math.max(canvas.width, canvas.height);
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.75));
}

function startRecording() {
  const mime = pickMime();
  if (mime === null) {
    setStatus(t('video.unsupported'), 5000);
    return;
  }
  // rekam dari canvas (dengan filter & tulisan). Kalau tidak bisa, rekam kamera langsung.
  let stream;
  if (canvas.captureStream) {
    const vTrack = canvas.captureStream(30).getVideoTracks()[0];
    stream = new MediaStream([vTrack, ...camera.stream.getAudioTracks()]);
  } else {
    stream = camera.stream;
  }
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  state.chunks = [];
  state.recorder = recorder;
  state.elapsed = 0;
  state.poster = snapshotPoster();
  recorder.ondataavailable = (e) => e.data && e.data.size && state.chunks.push(e.data);
  recorder.start(1000);
  state.recStart = performance.now();
  state.stopTimer = setTimeout(() => stopRecording(), MAX_MS);
  if (navigator.vibrate) navigator.vibrate(40);
  renderRecUi();
}

function stopRecording() {
  if (state.stopping) return state.stopping;
  const recorder = state.recorder;
  if (!recorder || recorder.state === 'inactive') return Promise.resolve();
  clearTimeout(state.stopTimer);
  const duration = performance.now() - state.recStart;
  state.stopping = new Promise((resolve) => {
    recorder.onstop = async () => {
      const mime = (recorder.mimeType || state.chunks[0]?.type || 'video/mp4').split(';')[0];
      const blob = new Blob(state.chunks, { type: mime });
      const poster = await state.poster;
      state.recorder = null;
      state.chunks = [];
      state.elapsed = 0;
      renderRecUi();
      if (duration < 1000) {
        setStatus(t('video.tooShort'));
      } else {
        await saveVideo(blob, mime, poster, duration);
      }
      state.stopping = null;
      resolve();
    };
    recorder.stop();
  });
  if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
  return state.stopping;
}

async function saveVideo(blob, mime, poster, duration) {
  const now = new Date();
  state.used++;
  renderTexts();
  try {
    await addShot({
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'video',
      blob,
      poster: poster || null,
      mime,
      ext: extFor(mime),
      createdAt: now.getTime(),
      duration: Math.round(duration),
      filter: state.filterId,
      seq: state.used,
      deviceId: getDeviceId(),
    });
    requestPersistence();
    await refreshThumb();
    setStatus(t('video.saved', { n: left() }), 3000);
    if (left() === 0) {
      setItem('thanksKind', 'video');
      setTimeout(() => currentRoute() === 'video' && go('thanks'), 1800);
    }
  } catch (err) {
    console.error(err);
    state.used--;
    renderTexts();
    setStatus(t('video.saveFailed'), 4000);
  }
}

recordBtn.addEventListener('click', () => {
  if (state.stopping) return;
  if (recording()) {
    stopRecording();
    return;
  }
  if (left() <= 0) {
    setItem('thanksKind', 'video');
    go('thanks');
    return;
  }
  if (!camera.stream) return;
  startRecording();
});

switchBtn.addEventListener('click', async () => {
  if (recording() || state.stopping) return;
  switchBtn.classList.add('is-spinning');
  await startCamera(camera.facing === 'user' ? 'environment' : 'user');
  switchBtn.classList.remove('is-spinning');
});

// Cadangan: perekam video bawaan HP
fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (left() <= 0) return go('thanks');
  const mime = file.type || 'video/mp4';
  await saveVideo(file, mime, null, 0);
});

document.addEventListener('visibilitychange', async () => {
  if (!state.active) return;
  if (document.hidden) {
    await stopRecording();
    stopLoop();
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
onLangChange(renderTexts);

registerScreen('video', {
  async enter() {
    state.active = true;
    state.used = await countShots('video');
    renderTexts();
    refreshThumb();
    if (left() === 0) {
      setItem('thanksKind', 'video');
      go('thanks');
      return;
    }
    openCamera();
  },
  async leave() {
    state.active = false;
    await stopRecording(); // video yang sedang direkam tetap disimpan
    stopLoop();
    camera.stop();
    hideCamMessage(root);
    zoomBar.innerHTML = '';
  },
});
