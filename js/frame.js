// Bentuk jendela bidik: foto 3:2 (film 35mm kamera disposable), video 4:3 (handycam).
// Tamu bisa memilih Portrait atau Landscape.
import { getItem, setItem } from './storage.js';
import { t, onLangChange } from './i18n.js';

export const RATIOS = {
  photo: 3 / 2,
  video: 4 / 3,
};

/**
 * @param {HTMLElement} root  halaman kamera
 * @param {'photo'|'video'} kind
 * @param {{ canChange?: () => boolean, onChange?: () => void }} opts
 */
export function setupFrame(root, kind, { canChange = () => true, onChange } = {}) {
  const viewfinder = root.querySelector('[data-viewfinder]');
  const frame = root.querySelector('[data-frame]');
  const btn = root.querySelector('[data-orient]');
  const label = root.querySelector('[data-orient-label]');
  const key = `${kind}Orient`;
  let orient = getItem(key, 'portrait') === 'landscape' ? 'landscape' : 'portrait';

  const ratio = () => (orient === 'landscape' ? RATIOS[kind] : 1 / RATIOS[kind]);

  function layout() {
    const r = viewfinder.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const target = ratio();
    let w = r.width;
    let h = w / target;
    if (h > r.height) {
      h = r.height;
      w = h * target;
    }
    frame.style.width = `${Math.floor(w)}px`;
    frame.style.height = `${Math.floor(h)}px`;
  }

  function render() {
    root.dataset.orient = orient;
    label.textContent = t(orient === 'landscape' ? 'cam.landscape' : 'cam.portrait');
    btn.setAttribute('aria-label', t('cam.orientAria'));
    layout();
  }

  btn.addEventListener('click', () => {
    if (!canChange()) return;
    orient = orient === 'portrait' ? 'landscape' : 'portrait';
    setItem(key, orient);
    render();
    onChange?.();
  });

  if (window.ResizeObserver) new ResizeObserver(layout).observe(viewfinder);
  window.addEventListener('resize', layout);
  onLangChange(render);
  render();

  return {
    layout,
    ratio,
    get orient() {
      return orient;
    },
  };
}
