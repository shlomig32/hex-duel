import { el } from './dom.js';

const STORAGE_KEY = 'ga_photo_avatar';
const PHOTO_SIZE = 80; // px

export function getPhotoAvatar() {
  return localStorage.getItem(STORAGE_KEY) || null;
}

export function setPhotoAvatar(base64) {
  localStorage.setItem(STORAGE_KEY, base64);
}

export function clearPhotoAvatar() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Create a circular avatar element — uses photo if available, else emoji */
export function createAvatarEl(emoji, photoBase64, size = 32) {
  if (photoBase64) {
    const img = el('img', {
      className: 'photo-avatar',
      src: photoBase64,
      style: {
        width: size + 'px',
        height: size + 'px',
        borderRadius: '50%',
        objectFit: 'cover',
      },
    });
    return img;
  }
  return el('span', {
    className: 'emoji-avatar',
    style: { fontSize: (size * 0.7) + 'px', lineHeight: '1' },
  }, [emoji]);
}

/** Open camera, take a photo, return base64 JPEG. Returns null if cancelled/denied. */
export function capturePhoto() {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'photo-overlay' });

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.className = 'photo-video';

    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;

    const snapBtn = el('button', { className: 'btn photo-snap-btn' }, ['\uD83D\uDCF8 \u05E6\u05DC\u05DD']);
    const cancelBtn = el('button', { className: 'btn btn--ghost photo-cancel-btn' }, ['\u05D1\u05D9\u05D8\u05D5\u05DC']);

    const card = el('div', { className: 'photo-card' }, [
      el('div', { className: 'photo-title' }, ['\u05E6\u05DC\u05DD \u05EA\u05DE\u05D5\u05E0\u05D4']),
      video,
      el('div', { className: 'photo-buttons' }, [snapBtn, cancelBtn]),
    ]);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let stream = null;

    function cleanup() {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      overlay.classList.add('htp-exit');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }

    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    snapBtn.addEventListener('click', () => {
      const ctx = canvas.getContext('2d');
      // Center-crop to square
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const side = Math.min(vw, vh);
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      cleanup();
      resolve(base64);
    });

    // Start camera
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 320 },
    }).then((s) => {
      stream = s;
      video.srcObject = s;
    }).catch(() => {
      cleanup();
      resolve(null);
    });
  });
}
