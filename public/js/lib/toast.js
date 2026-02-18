let _container = null;

function getContainer() {
  if (!_container || !_container.parentNode) {
    _container = document.createElement('div');
    _container.className = 'toast-container';
    document.body.appendChild(_container);
  }
  return _container;
}

/**
 * Show a non-blocking toast notification.
 * @param {string} message
 * @param {'info'|'error'|'success'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = getContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
  }, duration);
}
