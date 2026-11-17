// Filter video handycam + tampilan layar ala handycam (ikut terekam).
// Semua efek memakai operasi canvas yang ringan (blend mode), supaya lancar 30 fps di HP.
import { getGrainTile } from './filters.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export const VIDEO_FILTERS = [
  {
    id: 'handy98',
    name: "Handy '98",
    swatch: 'linear-gradient(135deg, #f4b26b, #b5523b 60%, #3a2a2a)',
    stamp: 'rgba(255, 170, 80, 0.92)',
    stampGlow: 'rgba(255, 110, 20, 0.8)',
  },
  {
    id: 'minidv',
    name: 'MiniDV Glow',
    swatch: 'radial-gradient(circle at 45% 40%, #fff6e6, #f0c9a0 40%, #6b5a6e 90%)',
    stamp: 'rgba(255, 255, 255, 0.9)',
    stampGlow: 'rgba(255, 200, 150, 0.7)',
  },
  {
    id: 'handheld2000',
    name: 'Handheld 2000',
    swatch: 'linear-gradient(135deg, #b9c2b4, #6f7d72 55%, #2b302c)',
    stamp: 'rgba(235, 255, 235, 0.9)',
    stampGlow: 'rgba(0, 0, 0, 0.6)',
  },
];

export function getVideoFilter(id) {
  return VIDEO_FILTERS.find((f) => f.id === id) || VIDEO_FILTERS[0];
}

// ---------- pola yang dibuat sekali ----------
let scanlines = null;
function scanlinePattern(ctx) {
  if (!scanlines) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0)';
    x.fillRect(0, 0, 4, 4);
    x.fillStyle = 'rgba(0,0,0,1)';
    x.fillRect(0, 0, 4, 1);
    scanlines = c;
  }
  return ctx.createPattern(scanlines, 'repeat');
}

const small = document.createElement('canvas');
const smallCtx = small.getContext('2d');
const edge = document.createElement('canvas');
const edgeCtx = edge.getContext('2d');

function blurredCopy(ctx, w, h, factor = 12) {
  small.width = Math.max(8, Math.round(w / factor));
  small.height = Math.max(8, Math.round(h / factor));
  smallCtx.drawImage(ctx.canvas, 0, 0, small.width, small.height);
  return small;
}

function fill(ctx, w, h, color, mode, alpha = 1) {
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function grain(ctx, w, h, amount, frame) {
  const p = ctx.createPattern(getGrainTile(), 'repeat');
  const ox = (frame * 97) % 256;
  const oy = (frame * 57) % 256;
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.save();
  ctx.translate(-ox, -oy);
  ctx.fillStyle = p;
  ctx.fillRect(ox, oy, w, h);
  ctx.restore();
}

function vignette(ctx, w, h, amount) {
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.5, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function lines(ctx, w, h, amount) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = amount;
  ctx.fillStyle = scanlinePattern(ctx);
  ctx.fillRect(0, 0, w, h);
}

/** Efek warna per filter. Dipanggil setiap frame setelah gambar kamera digambar. */
export function applyVideoLook(ctx, w, h, filterId, frame) {
  ctx.save();
  switch (filterId) {
    case 'minidv': {
      // glow hangat + pinggiran lembut (soft focus) + grain halus
      const blur = blurredCopy(ctx, w, h, 14);
      edge.width = w;
      edge.height = h;
      edgeCtx.globalCompositeOperation = 'source-over';
      edgeCtx.drawImage(blur, 0, 0, w, h);
      const r = Math.hypot(w, h) / 2;
      const m = edgeCtx.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r * 0.95);
      m.addColorStop(0, 'rgba(0,0,0,0)');
      m.addColorStop(1, 'rgba(0,0,0,1)');
      edgeCtx.globalCompositeOperation = 'destination-in';
      edgeCtx.fillStyle = m;
      edgeCtx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9;
      ctx.drawImage(edge, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(blur, 0, 0, w, h);
      fill(ctx, w, h, 'rgb(236, 226, 214)', 'multiply', 0.5); // redam lampu terlalu terang
      fill(ctx, w, h, 'rgb(255, 170, 110)', 'soft-light', 0.22);
      grain(ctx, w, h, 0.16, frame);
      vignette(ctx, w, h, 0.25);
      break;
    }
    case 'handheld2000': {
      // agak pudar (desaturated), kontras sedang
      fill(ctx, w, h, 'rgb(128,128,128)', 'saturation', 0.4);
      fill(ctx, w, h, 'rgb(120, 140, 125)', 'soft-light', 0.18);
      lines(ctx, w, h, 0.06);
      grain(ctx, w, h, 0.1, frame);
      vignette(ctx, w, h, 0.3);
      break;
    }
    default: {
      // Handy '98: hangat, scanlines tipis, sedikit geser warna
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.07;
      ctx.drawImage(ctx.canvas, 3, 0);
      fill(ctx, w, h, 'rgb(255, 140, 60)', 'soft-light', 0.25);
      fill(ctx, w, h, 'rgb(128,128,128)', 'saturation', 0.12);
      lines(ctx, w, h, 0.12);
      grain(ctx, w, h, 0.08, frame);
      vignette(ctx, w, h, 0.3);
    }
  }
  ctx.restore();
}

// ---------- Tampilan layar handycam ----------
function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatTape(ms) {
  const s = Math.floor(ms / 1000);
  return `0:${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * @param {{recording:boolean, elapsed:number, now:Date, filterId:string, frame:number}} st
 */
export function drawHud(ctx, w, h, st) {
  const f = getVideoFilter(st.filterId);
  const u = Math.min(w, h) / 100; // satuan relatif
  const m = u * 6; // margin
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'top';
  ctx.font = `700 ${u * 5.2}px "Courier New", ui-monospace, monospace`;
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = u * 0.8;
  ctx.shadowOffsetX = u * 0.25;
  ctx.shadowOffsetY = u * 0.25;

  // kiri atas: STBY / ● REC (berkedip)
  const blinkOn = Math.floor(st.elapsed / 500) % 2 === 0;
  if (st.recording) {
    if (blinkOn || st.filterId !== 'handheld2000') {
      ctx.fillStyle = '#ff2b2b';
      ctx.beginPath();
      ctx.arc(m + u * 2, m + u * 2.6, u * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('REC', m + u * 5.5, m);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText('STBY', m, m);
  }

  // kanan atas: penghitung pita + baterai
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatTape(st.elapsed), w - m, m);
  const bw = u * 7;
  const bh = u * 3.4;
  const bx = w - m - bw;
  const by = m + u * 7.5;
  ctx.lineWidth = u * 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + bw, by + bh * 0.3, u * 0.8, bh * 0.4);
  ctx.fillRect(bx + u * 0.9, by + u * 0.9, (bw - u * 1.8) * 0.75, bh - u * 1.8);

  // sudut bidik [ ]
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = u * 0.5;
  const c = u * 6;
  const L = m + u * 1;
  const T = h * 0.24;
  const R = w - L;
  const B = h * 0.76;
  ctx.beginPath();
  ctx.moveTo(L, T + c); ctx.lineTo(L, T); ctx.lineTo(L + c, T);
  ctx.moveTo(R - c, T); ctx.lineTo(R, T); ctx.lineTo(R, T + c);
  ctx.moveTo(L, B - c); ctx.lineTo(L, B); ctx.lineTo(L + c, B);
  ctx.moveTo(R - c, B); ctx.lineTo(R, B); ctx.lineTo(R, B - c);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // kiri bawah: SP
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SP', m, h - m);

  // kanan bawah: tanggal & jam
  const d = st.now;
  const hr = d.getHours() % 12 || 12;
  const time = `${hr}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()} '${String(d.getFullYear()).slice(-2)}`;
  ctx.textAlign = 'right';
  ctx.shadowColor = f.stampGlow;
  ctx.shadowBlur = u * 1.2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = f.stamp;
  ctx.font = `700 ${u * 5.6}px "Courier New", ui-monospace, monospace`;
  ctx.fillText(date, w - m, h - m);
  ctx.font = `700 ${u * 4.6}px "Courier New", ui-monospace, monospace`;
  ctx.fillText(time, w - m, h - m - u * 6.5);
  ctx.restore();
}
