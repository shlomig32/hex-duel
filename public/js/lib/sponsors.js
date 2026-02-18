import { el } from './dom.js';

let _sponsors = [];
let _loaded = false;

export async function loadSponsors() {
  if (_loaded) return _sponsors;
  try {
    const res = await fetch('/sponsors.json');
    const data = await res.json();
    _sponsors = data.sponsors || [];
  } catch { _sponsors = []; }
  _loaded = true;
  return _sponsors;
}

export function getSponsors() {
  return _sponsors;
}

/** Sideline banner — horizontal scrolling strip for during gameplay */
export function createSidelineBanner() {
  const sponsors = getSponsors();
  if (!sponsors.length) return null;

  const strip = el('div', { className: 'sponsor-sideline' });
  // Double the items for seamless loop
  const items = [...sponsors, ...sponsors];
  for (const s of items) {
    const item = el('a', {
      className: 'sponsor-sideline__item',
      href: s.link || '#',
      target: '_blank',
      rel: 'noopener',
      style: { color: s.color || '#fff' },
    }, [
      el('span', { className: 'sponsor-sideline__name' }, [s.name]),
      el('span', { className: 'sponsor-sideline__msg' }, [s.message]),
    ]);
    strip.appendChild(item);
  }
  return strip;
}

/** Result card — shown on result screen */
export function createSponsorCard() {
  const sponsors = getSponsors();
  if (!sponsors.length) return null;

  const s = sponsors[Math.floor(Math.random() * sponsors.length)];

  return el('a', {
    className: 'sponsor-card',
    href: s.link || '#',
    target: '_blank',
    rel: 'noopener',
    style: { borderColor: s.color || '#fff' },
  }, [
    el('div', { className: 'sponsor-card__badge' }, ['Sponsored']),
    el('div', { className: 'sponsor-card__name' }, [s.name]),
    el('div', { className: 'sponsor-card__msg' }, [s.message]),
  ]);
}
