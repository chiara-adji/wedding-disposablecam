// Antrean upload ke Google Drive (lewat Google Apps Script).
// Setiap jepretan sudah tersimpan di HP (IndexedDB). Modul ini mengirimnya satu per satu
// di latar belakang, dan mencoba lagi otomatis kalau sinyal putus.
import { CONFIG } from './config.js';
import { listShots, updateShot } from './db.js';
import { getItem, setItem, getDeviceId } from './storage.js';
import { getGuestName, guestSlug } from './guest.js';
import { t, onLangChange } from './i18n.js';

const RETRY_STEPS = [2, 5, 15, 30, 60]; // detik
const DIRECT_CHUNK = 2 * 1024 * 1024; // kelipatan 256 KB (syarat Google Drive)
const PROXY_CHUNK = 1024 * 1024;

const state = {
  enabled: !!CONFIG.APPS_SCRIPT_URL,
  pending: 0,
  sending: false,
  waiting: false, // gagal, menunggu coba lagi
  sent: 0,
  total: 0,
};

let running = false;
let again = false;
let failures = 0;
let retryTimer = 0;
const listeners = new Set();

// -------------------------------------------------------------
//  Komunikasi dengan Apps Script
// -------------------------------------------------------------
class UploadError extends Error {
  constructor(code, final = false) {
    super(code);
    this.code = code;
    this.final = final; // true = jangan dicoba lagi (mis. kuota habis)
  }
}

function token() {
  return getItem('eventToken') || CONFIG.EVENT_TOKEN;
}

async function call(action, body = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    // text/plain supaya browser tidak perlu "preflight" (Apps Script tidak mendukungnya)
    res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: token(), deviceId: getDeviceId(), ...body }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch {
    throw new UploadError('network');
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new UploadError('bad_response');
  }
  if (!data.ok) {
    const final = ['quota', 'too_big', 'bad_token', 'bad_device'].includes(data.error);
    throw new UploadError(data.error || 'server', final);
  }
  return data;
}

async function register(force = false) {
  const name = getGuestName();
  if (!force && getItem('regName') === name && getItem('serverSlug')) return getItem('serverSlug');
  const r = await call('register', { guestName: name, guestSlug: guestSlug(name) });
  setItem('regName', name);
  setItem('serverSlug', r.slug);
  return r.slug;
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// -------------------------------------------------------------
//  Foto
// -------------------------------------------------------------
async function sendPhoto(shot) {
  const r = await call('uploadPhoto', {
    shotId: shot.id,
    mime: shot.mime,
    ext: shot.ext,
    createdAt: shot.createdAt,
    size: shot.blob.size,
    data: await toBase64(shot.blob),
  }, 90000);
  return { fileId: r.fileId, remoteName: r.name };
}

// -------------------------------------------------------------
//  Video: sesi "resumable upload" Google Drive.
//  Cara utama: HP mengirim potongan langsung ke Google.
//  Cadangan: potongan dikirim lewat Apps Script (kalau cara utama diblokir browser).
// -------------------------------------------------------------
function baseMime(mime) {
  return String(mime || 'video/mp4').split(';')[0];
}

async function startSession(shot, restart = false) {
  const r = await call('startVideo', {
    shotId: shot.id,
    mime: baseMime(shot.mime),
    ext: shot.ext,
    size: shot.blob.size,
    createdAt: shot.createdAt,
    origin: location.origin,
    restart,
  });
  if (r.done) return { done: true, fileId: r.fileId, name: r.name };
  const upload = { url: r.uploadUrl, offset: 0, name: r.name };
  await updateShot(shot.id, { upload });
  return upload;
}

async function serverStatus(upload, total) {
  return call('videoStatus', { uploadUrl: upload.url, total });
}

async function putDirect(upload, chunk, start, total) {
  const end = start + chunk.size - 1;
  const res = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
    body: chunk,
  });
  if (res.status === 200 || res.status === 201) {
    let id = null;
    try {
      id = (await res.json()).id;
    } catch {
      /* dibaca lewat videoStatus */
    }
    return { done: true, fileId: id };
  }
  if (res.status === 308) {
    const range = res.headers.get('Range');
    return { done: false, offset: range ? Number(range.split('-')[1]) + 1 : end + 1 };
  }
  if (res.status === 404 || res.status === 410) throw new UploadError('session_expired');
  throw new UploadError('drive_' + res.status);
}

async function putProxy(upload, chunk, start, total, mime) {
  return call('videoChunk', {
    uploadUrl: upload.url,
    start,
    total,
    mime,
    data: await toBase64(chunk),
  }, 120000);
}

async function sendVideo(shot) {
  const total = shot.blob.size;
  const mime = baseMime(shot.mime);
  let upload = shot.upload;
  let fileId = null;

  if (!upload?.url) {
    const s = await startSession(shot);
    if (s.done) return { fileId: s.fileId, remoteName: s.name };
    upload = s;
  } else {
    // Lanjutkan dari bagian yang sudah sampai di Google
    try {
      const st = await serverStatus(upload, total);
      if (st.done) fileId = st.fileId;
      else upload.offset = st.offset;
    } catch (err) {
      if (err.code !== 'session_expired') throw err;
      upload = await startSession(shot, true);
    }
  }

  let offset = upload.offset || 0;
  while (!fileId && offset < total) {
    const proxy = getItem('videoMode') === 'proxy';
    const chunk = shot.blob.slice(offset, offset + (proxy ? PROXY_CHUNK : DIRECT_CHUNK));
    let r;
    if (proxy) {
      r = await putProxy(upload, chunk, offset, total, mime);
    } else {
      try {
        r = await putDirect(upload, chunk, offset, total);
      } catch (err) {
        if (err instanceof UploadError) throw err;
        // fetch gagal: sinyal putus, atau browser memblokir kiriman langsung ke Google.
        // Kalau Apps Script masih bisa dihubungi berarti sinyal ada → pakai jalur cadangan.
        const st = await serverStatus(upload, total); // melempar 'network' kalau memang offline
        setItem('videoMode', 'proxy');
        if (st.done) {
          fileId = st.fileId;
          break;
        }
        offset = st.offset;
        continue;
      }
    }
    if (r.done) {
      fileId = r.fileId;
      if (!fileId) {
        const st = await serverStatus(upload, total);
        fileId = st.fileId;
      }
      break;
    }
    offset = r.offset;
    upload.offset = offset;
    await updateShot(shot.id, { upload });
  }

  await call('finishVideo', { shotId: shot.id, fileId });
  return { fileId, remoteName: upload.name };
}

// -------------------------------------------------------------
//  Antrean
// -------------------------------------------------------------
function emit() {
  listeners.forEach((fn) => fn({ ...state }));
  renderSync();
}

async function refreshCounts() {
  const all = await listShots();
  state.total = all.length;
  state.sent = all.filter((s) => s.status === 'uploaded').length;
  state.pending = all.filter((s) => s.status !== 'uploaded' && s.status !== 'rejected').length;
  return all;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const sec = RETRY_STEPS[Math.min(failures - 1, RETRY_STEPS.length - 1)];
  retryTimer = setTimeout(kickUpload, sec * 1000);
}

export async function kickUpload() {
  state.enabled = !!CONFIG.APPS_SCRIPT_URL;
  if (!state.enabled) {
    await refreshCounts();
    emit();
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  clearTimeout(retryTimer);
  try {
    do {
      again = false;
      const all = await refreshCounts();
      const queue = all
        .filter((s) => s.status !== 'uploaded' && s.status !== 'rejected')
        .sort((a, b) => a.createdAt - b.createdAt);
      if (!queue.length) break;
      state.sending = true;
      state.waiting = false;
      emit();
      await register();
      for (const shot of queue) {
        let result;
        try {
          result = shot.kind === 'video' ? await sendVideo(shot) : await sendPhoto(shot);
        } catch (err) {
          if (err.code === 'not_registered') {
            await register(true);
            again = true;
            break;
          }
          if (err.final) {
            await updateShot(shot.id, { status: 'rejected', error: err.code });
            continue;
          }
          throw err;
        }
        await updateShot(shot.id, { status: 'uploaded', uploadedAt: Date.now(), ...result });
        failures = 0;
        await refreshCounts();
        emit();
      }
    } while (again);
    failures = 0;
    state.waiting = false;
  } catch (err) {
    console.warn('Upload tertunda:', err.code || err);
    failures++;
    state.waiting = true;
    scheduleRetry();
  } finally {
    running = false;
    state.sending = false;
    await refreshCounts().catch(() => {});
    emit();
  }
}

export function onUploadState(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getUploadState() {
  return { ...state };
}

// -------------------------------------------------------------
//  Status kecil di layar kamera: "Mengirim 2…", "⏳ 3 antre", "✓ Terkirim"
// -------------------------------------------------------------
function syncText() {
  if (!state.enabled) return '';
  if (state.pending === 0) return state.sent ? t('sync.done') : '';
  if (state.waiting && !navigator.onLine) return t('sync.offline', { n: state.pending });
  if (state.waiting) return t('sync.waiting', { n: state.pending });
  return t('sync.sending', { n: state.pending });
}

function renderSync() {
  const text = syncText();
  document.querySelectorAll('[data-sync]').forEach((el) => {
    el.textContent = text;
    el.classList.toggle('is-waiting', state.waiting && state.pending > 0);
    el.classList.toggle('is-done', state.pending === 0);
  });
}
onLangChange(renderSync);

// -------------------------------------------------------------
//  Pemicu: saat halaman dibuka, sinyal kembali, aplikasi dibuka lagi
// -------------------------------------------------------------
window.addEventListener('online', () => {
  failures = 0;
  kickUpload();
});
window.addEventListener('offline', renderSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') kickUpload();
});
// Ingatkan dengan lembut kalau tamu menutup tab saat masih ada antrean
window.addEventListener('beforeunload', (e) => {
  if (state.enabled && state.pending > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
setTimeout(kickUpload, 1500);
