// Navigasi antar halaman pakai #hash (tombol Back HP tetap jalan).
// Halaman bisa mendaftarkan enter()/leave(), misalnya untuk menyalakan/mematikan kamera.

const hooks = new Map();
let screens = [];
let current = null;
let internalSteps = 0;

export function registerScreen(name, { enter, leave } = {}) {
  hooks.set(name, { enter, leave });
}

export function go(name) {
  location.hash = `#/${name}`;
}

export function currentRoute() {
  return location.hash.replace(/^#\/?/, '') || 'welcome';
}

function show(name, siteTitle) {
  const names = new Set(screens.map((s) => s.dataset.screen));
  if (!names.has(name)) name = 'welcome';
  if (current === name) return;
  if (current) hooks.get(current)?.leave?.();
  for (const s of screens) {
    const active = s.dataset.screen === name;
    s.hidden = !active;
    s.classList.toggle('is-active', active);
  }
  current = name;
  document.body.dataset.route = name;
  window.scrollTo(0, 0);
  const title = screens.find((s) => s.dataset.screen === name)?.dataset.title;
  document.title = title ? `${title} · ${siteTitle}` : `The Wedding of ${siteTitle}`;
  hooks.get(name)?.enter?.();
}

export function startRouter(siteTitle) {
  screens = [...document.querySelectorAll('[data-screen]')];

  window.addEventListener('hashchange', () => {
    internalSteps++;
    show(currentRoute(), siteTitle);
  });

  // Tombol "kembali" di dalam halaman: mundur di riwayat kalau tamu datang dari
  // halaman lain di web ini; kalau halaman dibuka langsung, ke tujuan bawaan.
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (!back) return;
    e.preventDefault();
    if (internalSteps > 0) {
      internalSteps -= 2; // hashchange dari history.back() akan menambah 1 lagi
      history.back();
    } else {
      location.hash = back.dataset.back || '#/mode';
    }
  });

  show(currentRoute(), siteTitle);
}
