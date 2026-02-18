import { el } from '../lib/dom.js';
import { tapSound } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// DOM
let _area = null;
let _myCountEl = null;
let _oppCountEl = null;
let _timerTextEl = null;
let _tapBtn = null;
let _barMine = null;
let _barOpp = null;
let _instructionEl = null;

// State
let _taps = { 1: 0, 2: 0 };
let _timeLeft = 10;
let _active = false;
let _ended = false;

function updateUI() {
  if (_destroyed) return;

  const mySeat = _ctx.seat;
  const oppSeat = mySeat === 1 ? 2 : 1;
  const myTaps = _taps[mySeat] || 0;
  const oppTaps = _taps[oppSeat] || 0;

  _myCountEl.textContent = String(myTaps);
  _oppCountEl.textContent = String(oppTaps);

  // Progress bars (relative to max 100 taps)
  const maxTaps = Math.max(myTaps, oppTaps, 1);
  _barMine.style.width = ((myTaps / Math.max(maxTaps * 1.2, 20)) * 100) + '%';
  _barOpp.style.width = ((oppTaps / Math.max(maxTaps * 1.2, 20)) * 100) + '%';

  _timerTextEl.textContent = String(_timeLeft);
  if (_timeLeft <= 3) {
    _timerTextEl.style.color = '#EF4444';
  }
}

function handleTap(e) {
  e.preventDefault();
  if (_destroyed || !_active || _ended) return;
  tapSound();
  vibrate('tap');
  _ctx.ws.send({ type: 'sprint_tap' });

  // Optimistic local update for responsiveness
  _taps[_ctx.seat]++;
  updateUI();

  // Tap animation
  _tapBtn.classList.remove('tap-pop');
  void _tapBtn.offsetWidth;
  _tapBtn.classList.add('tap-pop');
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _taps = { 1: 0, 2: 0 };
  _timeLeft = 10;
  _active = true;
  _ended = false;

  // Hide default HUD elements
  ctx.timerEl.style.display = 'none';
  ctx.turnText.style.display = 'none';

  // Timer
  _timerTextEl = el('div', { className: 'sprint-timer' }, ['10']);

  // Score bars
  _myCountEl = el('span', { className: 'sprint-count sprint-count--mine' }, ['0']);
  _oppCountEl = el('span', { className: 'sprint-count sprint-count--opp' }, ['0']);

  _barMine = el('div', { className: 'sprint-bar-fill sprint-bar-fill--mine' });
  _barOpp = el('div', { className: 'sprint-bar-fill sprint-bar-fill--opp' });

  const scoreSection = el('div', { className: 'sprint-scores' }, [
    el('div', { className: 'sprint-bar-row' }, [
      _myCountEl,
      el('div', { className: 'sprint-bar' }, [_barMine]),
    ]),
    el('div', { className: 'sprint-bar-row' }, [
      _oppCountEl,
      el('div', { className: 'sprint-bar' }, [_barOpp]),
    ]),
  ]);

  // Tap button
  _tapBtn = el('div', { className: 'sprint-tap-btn' }, ['\uD83D\uDC46']);

  _instructionEl = el('div', { className: 'sprint-instruction' }, ['!\u05DC\u05D7\u05E5 \u05DB\u05DE\u05D4 \u05E9\u05D9\u05D5\u05EA\u05E8']);

  _area = el('div', { className: 'sprint-area' }, [
    _timerTextEl,
    scoreSection,
    _tapBtn,
    _instructionEl,
  ]);

  _tapBtn.addEventListener('click', handleTap);
  _tapBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleTap(e);
  }, { passive: false });

  ctx.area.appendChild(_area);
  ctx.area.style.padding = '0';

  updateUI();

  // Server state sync
  _unsubs.push(ctx.ws.on('tapsprint_state', (msg) => {
    if (_destroyed) return;
    _taps = msg.taps;
    _timeLeft = msg.timeLeft;
    updateUI();
  }));

  // Individual tap from server (authoritative)
  _unsubs.push(ctx.ws.on('tapsprint_tap', (msg) => {
    if (_destroyed) return;
    _taps = msg.taps;
    updateUI();
  }));

  // Game ended
  _unsubs.push(ctx.ws.on('tapsprint_end', (msg) => {
    if (_destroyed) return;
    _ended = true;
    _active = false;
    _taps = msg.taps;

    const mySeat = _ctx.seat;
    const iWon = msg.winner === mySeat;
    const isDraw = msg.winner === 0;

    _tapBtn.style.pointerEvents = 'none';
    _tapBtn.style.opacity = '0.4';

    if (isDraw) {
      _instructionEl.textContent = '!\u05EA\u05D9\u05E7\u05D5';
      _instructionEl.style.color = '#06B6D4';
    } else if (iWon) {
      _instructionEl.textContent = '!\u05E0\u05D9\u05E6\u05D7\u05EA';
      _instructionEl.style.color = '#10B981';
    } else {
      _instructionEl.textContent = '\u05D4\u05E4\u05E1\u05D3\u05EA';
      _instructionEl.style.color = '#EF4444';
    }
    updateUI();
  }));
}

export function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
