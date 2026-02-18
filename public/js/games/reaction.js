import { el } from '../lib/dom.js';
import { tapSound } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// DOM refs
let _area = null;
let _instructionEl = null;
let _roundDotsContainer = null;
let _scoresEl = null;
let _myScoreEl = null;
let _oppScoreEl = null;
let _reactionArea = null;

// State
let _round = 0;
let _phase = 'waiting'; // waiting, ready, signal, result
let _scores = { 1: 0, 2: 0 };
let _roundResults = []; // per-round winner seat or 0
let _prevScores = { 1: 0, 2: 0 };

function updateUI() {
  if (_destroyed) return;

  // Phase styling
  _reactionArea.className = 'reaction-area phase-' + _phase;

  // Instruction text
  switch (_phase) {
    case 'waiting':
      _instructionEl.textContent = '...\u05DE\u05EA\u05DB\u05D5\u05E0\u05E0\u05D9\u05DD';
      _instructionEl.style.color = '#8B92A8';
      break;
    case 'ready':
      _instructionEl.textContent = '...\u05D7\u05DB\u05D4 \u05DC\u05D0\u05D5\u05EA';
      _instructionEl.style.color = '#EF4444';
      break;
    case 'signal':
      _instructionEl.textContent = '!\u05DC\u05D7\u05E5 \u05E2\u05DB\u05E9\u05D9\u05D5';
      _instructionEl.style.color = '#10B981';
      _instructionEl.style.fontSize = '2.5rem';
      break;
    case 'result':
      // Updated by result handlers
      break;
  }

  // Round dots
  while (_roundDotsContainer.firstChild) _roundDotsContainer.removeChild(_roundDotsContainer.firstChild);
  for (let i = 0; i < 5; i++) {
    const dot = el('div', { className: 'reaction-dot' });
    if (i < _roundResults.length) {
      const winner = _roundResults[i];
      if (winner === _ctx.seat) dot.classList.add('won-1');
      else if (winner > 0) dot.classList.add('won-2');
    }
    _roundDotsContainer.appendChild(dot);
  }

  // Scores
  const mySeat = _ctx.seat;
  const oppSeat = mySeat === 1 ? 2 : 1;
  const myNew = _scores[mySeat] || 0;
  const oppNew = _scores[oppSeat] || 0;
  const myOld = _prevScores[mySeat] || 0;
  const oppOld = _prevScores[oppSeat] || 0;

  _myScoreEl.textContent = String(myNew);
  _oppScoreEl.textContent = String(oppNew);

  // Score pop animation
  if (myNew !== myOld) {
    _myScoreEl.classList.remove('score-pop');
    void _myScoreEl.offsetWidth;
    _myScoreEl.classList.add('score-pop');
  }
  if (oppNew !== oppOld) {
    _oppScoreEl.classList.remove('score-pop');
    void _oppScoreEl.offsetWidth;
    _oppScoreEl.classList.add('score-pop');
  }
  _prevScores = { ..._scores };
}

function handleTap(e) {
  e.preventDefault();
  if (_destroyed) return;
  if (_phase === 'ready' || _phase === 'signal') {
    tapSound();
    vibrate('tap');
    _ctx.ws.send({ type: 'tap' });
  }
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _scores = { 1: 0, 2: 0 };
  _prevScores = { 1: 0, 2: 0 };
  _roundResults = [];
  _round = 0;
  _phase = 'waiting';

  // Hide timer & turn (not used)
  ctx.timerEl.style.display = 'none';
  ctx.turnText.style.display = 'none';

  // Build UI
  _instructionEl = el('div', { className: 'reaction-instruction' }, ['...\u05DE\u05EA\u05DB\u05D5\u05E0\u05E0\u05D9\u05DD']);

  _roundDotsContainer = el('div', { className: 'reaction-round-dots' });

  _myScoreEl = el('span', { style: { color: '#10B981' } }, ['0']);
  _oppScoreEl = el('span', { style: { color: '#F97316' } }, ['0']);
  _scoresEl = el('div', { className: 'reaction-scores' }, [_myScoreEl, el('span', { style: { color: '#5A6178' } }, [':']), _oppScoreEl]);

  _reactionArea = el('div', { className: 'reaction-area phase-waiting' }, [
    _roundDotsContainer,
    _instructionEl,
    _scoresEl,
  ]);

  _reactionArea.addEventListener('click', handleTap);
  _reactionArea.addEventListener('touchend', handleTap);

  ctx.area.appendChild(_reactionArea);
  ctx.area.style.padding = '0';

  updateUI();

  // Round start
  _unsubs.push(ctx.ws.on('round_start', (msg) => {
    if (_destroyed) return;
    _round = msg.round;
    _phase = 'ready';
    _instructionEl.style.fontSize = '1.5rem';
    updateUI();
  }));

  // Draw signal
  _unsubs.push(ctx.ws.on('draw_signal', () => {
    if (_destroyed) return;
    _phase = 'signal';
    updateUI();
  }));

  // Round result (valid tap)
  _unsubs.push(ctx.ws.on('round_result', (msg) => {
    if (_destroyed) return;
    _phase = 'result';
    _scores = msg.scores;
    _roundResults.push(msg.winner);

    const iWon = msg.winner === _ctx.seat;
    _instructionEl.style.fontSize = '1.5rem';
    if (iWon) {
      _instructionEl.textContent = `!\u05E0\u05D9\u05E6\u05D7\u05EA \u05D0\u05EA \u05D4\u05E1\u05D9\u05D1\u05D5\u05D1 (${msg.reactionMs}ms)`;
      _instructionEl.style.color = '#10B981';
    } else {
      _instructionEl.textContent = `\u05D4\u05E4\u05E1\u05D3\u05EA \u05D0\u05EA \u05D4\u05E1\u05D9\u05D1\u05D5\u05D1 (${msg.reactionMs}ms)`;
      _instructionEl.style.color = '#F97316';
    }
    updateUI();
  }));

  // False start
  _unsubs.push(ctx.ws.on('false_start', (msg) => {
    if (_destroyed) return;
    _phase = 'result';
    _scores = msg.scores;
    const oppSeat = _ctx.seat === 1 ? 2 : 1;
    _roundResults.push(oppSeat === msg.seat ? _ctx.seat : oppSeat);

    if (msg.seat === _ctx.seat) {
      _instructionEl.textContent = '!\u05D6\u05D9\u05E0\u05D5\u05E7 \u05DE\u05D5\u05E7\u05D3\u05DD';
      _instructionEl.style.color = '#EF4444';
    } else {
      _instructionEl.textContent = '!\u05D4\u05D9\u05E8\u05D9\u05D1 \u05D6\u05D9\u05E0\u05E7 \u05DE\u05D5\u05E7\u05D3\u05DD';
      _instructionEl.style.color = '#10B981';
    }
    _instructionEl.style.fontSize = '1.5rem';
    updateUI();
  }));

  // Round timeout
  _unsubs.push(ctx.ws.on('round_timeout', () => {
    if (_destroyed) return;
    _phase = 'result';
    _roundResults.push(0);
    _instructionEl.textContent = '!\u05E9\u05E0\u05D9\u05DB\u05DD \u05D0\u05D9\u05D8\u05D9\u05D9\u05DD \u05DE\u05D3\u05D9';
    _instructionEl.style.color = '#8B92A8';
    _instructionEl.style.fontSize = '1.5rem';
    updateUI();
  }));
}

export function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
