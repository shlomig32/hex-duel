import { el } from './dom.js';

/**
 * Show a promise-based name input modal (replaces browser prompt()).
 * @param {string} label - The prompt text
 * @param {string} defaultValue - Pre-filled value
 * @returns {Promise<string|null>} trimmed input or null if cancelled
 */
export function promptModal(label, defaultValue = '') {
  return new Promise((resolve) => {
    const input = el('input', {
      className: 'modal-input',
      type: 'text',
      maxlength: '15',
      dir: 'rtl',
    });
    input.value = defaultValue;

    const okBtn = el('button', { className: 'btn modal-ok' }, ['\u05D0\u05D9\u05E9\u05D5\u05E8']); // אישור
    const cancelBtn = el('button', { className: 'btn btn--ghost modal-cancel' }, ['\u05D1\u05D9\u05D8\u05D5\u05DC']); // ביטול

    const card = el('div', { className: 'modal-card' }, [
      el('div', { className: 'modal-label' }, [label]),
      input,
      el('div', { className: 'modal-buttons' }, [okBtn, cancelBtn]),
    ]);

    const overlay = el('div', { className: 'modal-overlay' }, [card]);

    function close(value) {
      overlay.classList.add('modal-overlay--exit');
      overlay.addEventListener('animationend', () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
      resolve(value);
    }

    okBtn.addEventListener('click', () => {
      const val = input.value.trim();
      close(val || null);
    });

    cancelBtn.addEventListener('click', () => close(null));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        close(val || null);
      }
    });

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('modal-overlay--visible');
      input.focus();
      input.select();
    });
  });
}
