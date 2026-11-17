// Kotak pesan di atas viewfinder: penjelasan sebelum izin kamera dan pesan error yang ramah.
import { t } from './i18n.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function copyLink(onDone) {
  const url = location.href.split('#')[0];
  const done = () => onDone?.();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done, () => prompt('Link:', url));
  } else {
    prompt('Link:', url);
  }
}

/**
 * @param {HTMLElement} root  halaman kamera
 * @param {'explain'|'denied'|'unsupported'|'busy'|'notfound'|'unknown'} kind
 * @param {() => void} [onAction]  aksi tombol utama (nyalakan / coba lagi)
 */
export function showCamMessage(root, kind, onAction) {
  const box = root.querySelector('[data-cam-msg]');
  const title = root.querySelector('[data-cam-msg-title]');
  const text = root.querySelector('[data-cam-msg-text]');
  const btn = root.querySelector('[data-cam-msg-btn]');
  const fileLabel = root.querySelector('[data-cam-file-label]');
  const fileText = fileLabel.querySelector('span');

  let btnText = t('cam.retry');
  let action = onAction;
  let showFile = true;

  switch (kind) {
    case 'explain':
    case 'explainVideo':
      title.textContent = t('cam.explain.title');
      text.innerHTML = t(kind === 'explainVideo' ? 'cam.explainVideo.text' : 'cam.explain.text');
      btnText = t('cam.explain.btn');
      showFile = false;
      break;
    case 'denied':
      title.textContent = t('cam.denied.title');
      text.innerHTML = t(isIOS ? 'cam.denied.ios' : 'cam.denied.android');
      break;
    case 'unsupported':
      title.textContent = t('cam.unsupported.title');
      text.innerHTML = t('cam.unsupported.text');
      btnText = t('cam.unsupported.btn');
      action = () => copyLink(() => { btn.textContent = t('cam.copied'); });
      break;
    case 'busy':
    case 'notfound':
      title.textContent = t(`cam.${kind}.title`);
      text.textContent = t(`cam.${kind}.text`);
      break;
    default:
      title.textContent = t('cam.unknown.title');
      text.textContent = t('cam.unknown.text');
  }

  btn.textContent = btnText;
  btn.hidden = !action;
  btn.onclick = action ? () => action() : null;
  fileLabel.hidden = !showFile;
  fileText.textContent = t('cam.fileAlt');
  box.hidden = false;
  root.classList.add('has-msg');
}

export function hideCamMessage(root) {
  root.querySelector('[data-cam-msg]').hidden = true;
  root.classList.remove('has-msg');
}
