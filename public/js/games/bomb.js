import { el } from '../lib/dom.js';
import { vibrate } from '../lib/haptics.js';

let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// DOM
let _bombArea = null;
let _bombEl = null;
let _instructionEl = null;
let _fuseBar = null;
let _fuseBarFill = null;
let _roundDotsContainer = null;
let _scoresEl = null;
let _myScoreEl = null;
let _oppScoreEl = null;

// State
let _holder = 0;
let _round = 0;
let _scores = { 1: 0, 2: 0 };
let _exploded = false;
let _shakeInterval = null;

function updateUI() {
  if (_destroyed) return;

  const isMyBomb = _holder === _ctx.seat;

  // Bomb visual
  _bombEl.textContent = _exploded ? '\uD83D\uDCA5' : '\uD83D\uDCA3';
  _bombEl.className = 'bomb-emoji' + (isMyBomb && !_exploded ? ' bomb-mine' : '') + (_exploded ? ' bomb-exploded' : '');

  // Instruction
  if (_exploded) {
    const iLost = _holder === _ctx.seat;
    _instructionEl.textContent = iLost ? '!\u05D4\u05EA\u05E4\u05D5\u05E6\u05E5 \u05E2\u05DC\u05D9\u05DA' : '!\u05D4\u05D9\u05E8\u05D9\u05D1 \u05D4\u05EA\u05E4\u05D5\u05E6\u05E5';
    _instructionEl.style.color = iLost ? '#EF4444' : '#10B981';
  } else if (isMyBomb) {
    _instructionEl.textContent = '!\u05DC\u05D7\u05E5 \u05DC\u05D4\u05E2\u05D1\u05D9\u05E8';
    _instructionEl.style.color = '#FBBF24';
  } else {
    _instructionEl.textContent = '...\u05D4\u05E4\u05E6\u05E6\u05D4 \u05D0\u05E6\u05DC \u05D4\u05D9\u05E8\u05D9\u05D1';
    _instructionEl.style.color = '#8B92A8';
  }

  // Bomb area styling
  _bombArea.className = 'bomb-area' + (isMyBomb && !_exploded ? ' bomb-area--mine' : '') + (_exploded ? ' bomb-area--exploded' : '');

  // Scores
  const mySeat = _ctx.seat;
  const oppSeat = mySeat === 1 ? 2 : 1;
  _myScoreEl.textContent = String(_scores[mySeat] || 0);
  _oppScoreEl.textContent = String(_scores[oppSeat] || 0);
}

function updateRoundDots() {
  if (!_roundDotsContainer) return;
  while (_roundDotsContainer.firstChild) _roundDotsContainer.removeChild(_roundDotsContainer.firstChild);
  for (let i = 0; i < 3; i++) {
    const dot = el('div', { className: 'bomb-round-dot' + (i < _round ? ' active' : '') });
    _roundDotsContainer.appendChild(dot);
  }
}

function handleTap(e) {
  e.preventDefault();
  if (_destroyed || _exploded) return;
  if (_holder !== _ctx.seat) return;
  vibrate('tap');
  _ctx.ws.send({ type: 'pass_bomb' });
}

function startShake() {
  stopShake();
  let tick = 0;
  _shakeInterval = setInterval(() => {
    if (_destroyed || !_bombEl) { stopShake(); return; }
    tick++;
    const intensity = Math.min(6, 1 + tick * 0.3);
    const x = (Math.random() - 0.5) * intensity;
    const y = (Math.random() - 0.5) * intensity;
    _bombEl.style.transform = `translate(${x}px, ${y}px)`;
  }, 50);
}

function stopShake() {
  if (_shakeInterval) {
    clearInterval(_shakeInterval);
    _shakeInterval = null;
  }
  if (_bombEl) _bombEl.style.transform = '';
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _scores = { 1: 0, 2: 0 };
  _holder = 0;
  _round = 0;
  _exploded = false;

  // Hide timer & turn
  ctx.timerEl.style.display = 'none';
  ctx.turnText.style.display = 'none';

  // Build UI
  _bombEl = el('div', { className: 'bomb-emoji' }, ['\uD83D\uDCA3']);
  _instructionEl = el('div', { className: 'bomb-instruction' }, ['...\u05DE\u05EA\u05DB\u05D5\u05E0\u05E0\u05D9\u05DD']);

  _fuseBarFill = el('div', { className: 'fuse-bar-fill' });
  _fuseBar = el('div', { className: 'fuse-bar' }, [_fuseBarFill]);

  _roundDotsContainer = el('div', { className: 'bomb-round-dots' });

  _myScoreEl = el('span', { style: { color: '#F97316' } }, ['0']);
  _oppScoreEl = el('span', { style: { color: '#8B92A8' } }, ['0']);
  _scoresEl = el('div', { className: 'bomb-scores' }, [
    _myScoreEl,
    el('span', { style: { color: '#5A6178' } }, [':']),
    _oppScoreEl,
  ]);

  _bombArea = el('div', { className: 'bomb-area' }, [
    _roundDotsContainer,
    _bombEl,
    _fuseBar,
    _instructionEl,
    _scoresEl,
  ]);

  _bombArea.addEventListener('click', handleTap);
  _bombArea.addEventListener('touchend', handleTap);

  ctx.area.appendChild(_bombArea);
  ctx.area.style.padding = '0';

  updateRoundDots();

  // Round start
  _unsubs.push(ctx.ws.on('bomb_round_start', (msg) => {
    if (_destroyed) return;
    _round = msg.round;
    _holder = msg.holder;
    _exploded = false;
    _fuseBarFill.style.width = '100%';
    _fuseBarFill.style.background = '#10B981';
    startShake();
    updateRoundDots();
    updateUI();
  }));

  // Bomb passed
  _unsubs.push(ctx.ws.on('bomb_passed', (msg) => {
    if (_destroyed) return;
    _holder = msg.holder;
    vibrate('move');
    updateUI();
  }));

  // Fuse tick
  _unsubs.push(ctx.ws.on('bomb_tick', (msg) => {
    if (_destroyed) return;
    _holder = msg.holder;
    const pct = Math.max(0, (msg.fuse / msg.totalFuse) * 100);
    _fuseBarFill.style.width = pct + '%';
    if (pct < 30) {
      _fuseBarFill.style.background = '#EF4444';
    } else if (pct < 60) {
      _fuseBarFill.style.background = '#FBBF24';
    }
    updateUI();
  }));

  // Explosion
  _unsubs.push(ctx.ws.on('bomb_exploded', (msg) => {
    if (_destroyed) return;
    _exploded = true;
    _scores = msg.scores;
    _holder = msg.loser;
    stopShake();
    vibrate('error');
    _fuseBarFill.style.width = '0%';
    updateUI();
    updateRoundDots();
  }));
}

export function destroy() {
  _destroyed = true;
  stopShake();
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
