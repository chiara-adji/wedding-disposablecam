// Filter foto ala kamera film + cap tanggal oranye.
// - `css` dan `overlay` dipakai untuk preview langsung di viewfinder (ringan).
// - `params` dipakai saat memproses foto sungguhan di <canvas> (lebih akurat).

export const PHOTO_FILTERS = [
  {
    id: 'fuji400',
    name: 'Fujifilm 400',
    swatch: 'linear-gradient(135deg, #f6c98a, #d98b5f 55%, #7a8a5a)',
    css: 'sepia(0.14) saturate(1.12) contrast(1.06) brightness(1.04) hue-rotate(-4deg)',
    overlay: 'radial-gradient(ellipse at center, transparent 55%, rgba(40,20,0,0.28) 100%)',
    params: {
      gain: [1.06, 1.0, 0.9], // hangat, kulit lebih merona
      sat: 1.1,
      contrast: 1.07,
      lift: 0.035, // hitam sedikit pudar ala film
      shoulder: 0.1,
      glow: 0.12,
      grain: 0.1,
      vignette: 0.22,
    },
  },
  {
    id: 'kodakgold',
    name: 'Kodak Gold',
    swatch: 'linear-gradient(135deg, #ffe08a, #e2a24a 55%, #8a5a2a)',
    css: 'sepia(0.3) saturate(1.18) contrast(0.95) brightness(1.06)',
    overlay: 'radial-gradient(ellipse at center, rgba(255,210,120,0.10) 0%, transparent 55%, rgba(60,30,0,0.30) 100%)',
    params: {
      gain: [1.1, 1.03, 0.8], // keemasan
      sat: 1.05,
      contrast: 0.94,
      lift: 0.05,
      shoulder: 0.28, // highlight lembut
      glow: 0.3,
      grain: 0.09,
      vignette: 0.26,
    },
  },
  {
    id: 'flash98',
    name: "Flashback '98",
    swatch: 'radial-gradient(circle at 40% 40%, #ffffff, #c9d3e0 35%, #1d1b22 80%)',
    css: 'contrast(1.32) brightness(1.08) saturate(1.12)',
    overlay: 'radial-gradient(ellipse 70% 60% at center, rgba(255,255,255,0.16) 0%, transparent 50%, rgba(0,0,0,0.55) 100%)',
    params: {
      gain: [1.0, 1.0, 1.04], // putih blitz sedikit dingin
      sat: 1.12,
      contrast: 1.32,
      lift: 0.0,
      shoulder: 0.05,
      glow: 0.06,
      grain: 0.1,
      vignette: 0.6,
      flash: 0.32, // kilatan terang di tengah
    },
  },
  {
    id: 'noir',
    name: 'B&W Noir',
    swatch: 'linear-gradient(135deg, #f2f2f2, #8a8a8a 50%, #111)',
    css: 'grayscale(1) contrast(1.38) brightness(1.04)',
    overlay: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.38) 100%)',
    params: {
      bw: true,
      contrast: 1.38,
      lift: 0.02,
      shoulder: 0.08,
      glow: 0.05,
      grain: 0.26,
      vignette: 0.32,
    },
  },
];

export function getPhotoFilter(id) {
  return PHOTO_FILTERS.find((f) => f.id === id) || PHOTO_FILTERS[0];
}

// ---------------------------------------------------------------
//  Tekstur grain (dibuat sekali, dipakai ulang)
// ---------------------------------------------------------------
let grainTile = null;
export function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // noise sekitar abu-abu tengah (netral untuk blend "overlay")
    const n = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

let grainUrl = null;
export function getGrainDataUrl() {
  if (!grainUrl) grainUrl = getGrainTile().toDataURL('image/png');
  return grainUrl;
}

// ---------------------------------------------------------------
//  Proses warna per piksel
// ---------------------------------------------------------------
function buildToneLut({ contrast = 1, lift = 0, shoulder = 0 }) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let x = i / 255;
    // kontras lembut (kurva S) di sekitar tengah
    x = 0.5 + (x - 0.5) * contrast;
    x = Math.min(1, Math.max(0, x));
    // highlight lembut: tekan bagian terang
    if (shoulder > 0) {
      const knee = 1 - shoulder;
      if (x > knee) x = knee + (1 - Math.exp(-(x - knee) / shoulder)) * shoulder * 0.9;
    }
    // hitam terangkat (pudar)
    x = lift + x * (1 - lift);
    lut[i] = Math.round(x * 255);
  }
  return lut;
}

function colorPass(ctx, w, h, p) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lut = buildToneLut(p);
  if (p.bw) {
    for (let i = 0; i < d.length; i += 4) {
      // campuran ala film hitam-putih (merah sedikit lebih terang → kulit halus)
      const y = d[i] * 0.36 + d[i + 1] * 0.54 + d[i + 2] * 0.1;
      d[i] = d[i + 1] = d[i + 2] = lut[y | 0];
    }
  } else {
    const [gr, gg, gb] = p.gain || [1, 1, 1];
    const s = p.sat ?? 1;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * gr;
      let g = d[i + 1] * gg;
      let b = d[i + 2] * gb;
      const y = r * 0.299 + g * 0.587 + b * 0.114;
      r = y + (r - y) * s;
      g = y + (g - y) * s;
      b = y + (b - y) * s;
      d[i] = lut[r < 0 ? 0 : r > 255 ? 255 : r | 0];
      d[i + 1] = lut[g < 0 ? 0 : g > 255 ? 255 : g | 0];
      d[i + 2] = lut[b < 0 ? 0 : b > 255 ? 255 : b | 0];
    }
  }
  ctx.putImageData(img, 0, 0);
}

function glowPass(ctx, w, h, amount) {
  if (!amount) return;
  // blur murah: perkecil lalu perbesar lagi
  const small = document.createElement('canvas');
  small.width = Math.max(8, Math.round(w / 16));
  small.height = Math.max(8, Math.round(h / 16));
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

function flashPass(ctx, w, h, amount) {
  if (!amount) return;
  const r = Math.max(w, h) * 0.55;
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, r);
  g.addColorStop(0, `rgba(255,255,255,${amount})`);
  g.addColorStop(0.5, `rgba(255,255,255,${amount * 0.35})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function vignettePass(ctx, w, h, amount) {
  if (!amount) return;
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function grainPass(ctx, w, h, amount) {
  if (!amount) return;
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  // butiran sedikit lebih besar di foto beresolusi tinggi
  const k = Math.max(1, Math.round(Math.max(w, h) / 1100));
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  ctx.scale(k, k);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w / k, h / k);
  ctx.restore();
}

// ---------------------------------------------------------------
//  Cap tanggal oranye ala kamera film:  12 19 '26
// ---------------------------------------------------------------
export function formatFilmDate(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm} ${dd} '${yy}`;
}

function dateStampPass(ctx, w, h, date) {
  const text = formatFilmDate(date);
  const size = Math.round(Math.min(w, h) * 0.05);
  ctx.save();
  ctx.font = `600 ${size}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const x = w - size * 1.1;
  const y = h - size * 1.0;
  ctx.shadowColor = 'rgba(255, 110, 20, 0.9)';
  ctx.shadowBlur = size * 0.45;
  ctx.fillStyle = 'rgba(255, 142, 40, 0.95)';
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 196, 120, 0.85)';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Terapkan filter ke canvas (diubah langsung), lalu tambah cap tanggal.
 * @param {HTMLCanvasElement} canvas
 */
export function applyPhotoFilter(canvas, filterId, date = new Date()) {
  const f = getPhotoFilter(filterId);
  const p = f.params;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  colorPass(ctx, w, h, p);
  glowPass(ctx, w, h, p.glow);
  flashPass(ctx, w, h, p.flash);
  vignettePass(ctx, w, h, p.vignette);
  grainPass(ctx, w, h, p.grain);
  dateStampPass(ctx, w, h, date);
  return canvas;
}

export function canvasToJpeg(canvas, quality = 0.85) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** Gambar file (dari input kamera bawaan) ke canvas, sisi terpanjang maksimal maxSide */
export async function fileToCanvas(file, maxSide = 1600) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}
