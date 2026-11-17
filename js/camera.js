// Mengurus kamera HP: nyalakan, ganti depan/belakang, zoom, lampu (torch),
// dan mengambil satu frame persis seperti yang terlihat di viewfinder.

export class CameraError extends Error {
  constructor(kind, original) {
    super(kind);
    this.kind = kind; // 'unsupported' | 'denied' | 'notfound' | 'busy' | 'unknown'
    this.original = original;
  }
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
}

function classify(err) {
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'notfound';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
  return 'unknown';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Camera {
  /** @param {HTMLVideoElement} video  @param {HTMLElement} frame (kotak viewfinder) */
  constructor(video, frame) {
    this.video = video;
    this.frame = frame;
    this.stream = null;
    this.facing = 'environment';
    this.zoom = 1;
    this.hwZoom = null; // {min,max} kalau HP mendukung zoom asli
    this.hasTorch = false;
    this._startId = 0;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.playsInline = true;
  }

  get track() {
    return this.stream?.getVideoTracks()[0] || null;
  }

  get mirrored() {
    return this.facing === 'user';
  }

  async start(facing = this.facing, { audio = false, video: videoConstraints } = {}) {
    if (!cameraSupported()) throw new CameraError('unsupported');
    this.stop(); // matikan stream lama (ini juga menaikkan _startId)
    const id = this._startId;
    this.facing = facing;
    const constraints = {
      audio,
      video: videoConstraints || {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Coba lagi dengan permintaan paling sederhana (beberapa HP menolak ukuran tertentu)
      if (classify(err) === 'notfound' || err?.name === 'OverconstrainedError') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: facing } });
        } catch (err2) {
          throw new CameraError(classify(err2), err2);
        }
      } else {
        throw new CameraError(classify(err), err);
      }
    }
    if (id !== this._startId) {
      // sudah ada permintaan start/stop yang lebih baru
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.classList.toggle('is-mirrored', this.mirrored);
    try {
      await this.video.play();
    } catch {
      /* iOS kadang butuh sentuhan; video tetap jalan setelah metadata siap */
    }
    await this._waitForSize();
    if (id !== this._startId) return;
    this._readCapabilities();
    this.zoom = 1;
    this._digital = 1;
    this._applyDigitalZoom();
  }

  stop() {
    this._startId++;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  async _waitForSize() {
    for (let i = 0; i < 60 && !this.video.videoWidth; i++) await wait(50);
  }

  /**
   * Cek apakah gambar kamera benar-benar tampil.
   * 'ok' | 'paused' (browser menahan video, perlu disentuh) | 'blank' (tidak ada gambar)
   */
  health() {
    if (!this.stream) return 'blank';
    const track = this.track;
    if (!track || track.readyState === 'ended') return 'blank';
    if (this.video.paused) return 'paused';
    if (!this.video.videoWidth) return 'blank';
    return 'ok';
  }

  /** Dipanggil dari ketukan tamu (iOS kadang butuh sentuhan untuk memutar video) */
  async resume() {
    try {
      await this.video.play();
    } catch {
      /* biarkan, health() akan melaporkan */
    }
    await this._waitForSize();
    return this.health();
  }

  _readCapabilities() {
    const caps = this.track?.getCapabilities?.() || {};
    this.hwZoom = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null;
    this.hasTorch = !!caps.torch;
  }

  /** Minta kamera fokus & atur cahaya ulang (kalau HP mendukung). Tidak apa-apa kalau gagal. */
  refocus() {
    const caps = this.track?.getCapabilities?.() || {};
    const adv = {};
    if (caps.focusMode?.includes('single-shot')) adv.focusMode = 'single-shot';
    else if (caps.focusMode?.includes('continuous')) adv.focusMode = 'continuous';
    if (caps.exposureMode?.includes('continuous')) adv.exposureMode = 'continuous';
    if (caps.whiteBalanceMode?.includes('continuous')) adv.whiteBalanceMode = 'continuous';
    if (!Object.keys(adv).length) return;
    this.track.applyConstraints({ advanced: [adv] }).catch(() => {});
  }

  /** Pilihan zoom yang tersedia di HP ini */
  zoomLevels() {
    const levels = [];
    if (this.hwZoom && this.hwZoom.min <= 0.5) levels.push(0.5);
    levels.push(1, 2, 3);
    return levels;
  }

  async setZoom(z) {
    this.zoom = z;
    if (this.hwZoom) {
      const v = Math.min(this.hwZoom.max, Math.max(this.hwZoom.min, z));
      try {
        await this.track.applyConstraints({ advanced: [{ zoom: v }] });
        this._digital = z / v; // sisa zoom yang tidak bisa dilakukan hardware
      } catch {
        this._digital = Math.max(1, z);
      }
    } else {
      this._digital = Math.max(1, z);
    }
    this._applyDigitalZoom();
  }

  _applyDigitalZoom() {
    this.video.style.setProperty('--zoom', String(this._digital || 1));
  }

  async setTorch(on) {
    if (!this.hasTorch || !this.track) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ambil frame seperti yang terlihat di viewfinder (potongan, zoom digital, cermin).
   * @returns {HTMLCanvasElement}
   */
  /** Rasio lebar/tinggi kotak viewfinder */
  boxRatio() {
    const rect = this.frame.getBoundingClientRect();
    return rect.width && rect.height ? rect.width / rect.height : 3 / 4;
  }

  /** Potongan video (object-fit: cover + zoom digital) untuk rasio tertentu */
  sourceRect(boxRatio = this.boxRatio()) {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return null;
    let sw = vw;
    let sh = vw / boxRatio;
    if (sh > vh) {
      sh = vh;
      sw = vh * boxRatio;
    }
    const d = this._digital || 1;
    sw /= d;
    sh /= d;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
  }

  grabFrame(maxSide = 1600) {
    const v = this.video;
    const src = this.sourceRect();
    if (!src) return null;
    const { sx, sy, sw, sh } = src;

    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    if (this.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}
