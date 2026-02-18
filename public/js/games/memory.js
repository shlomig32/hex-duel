import { el } from '../lib/dom.js';
import { moveClick } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

let _area, _ws, _seat, _unsubs = [];
let _cards = [];
let _turn = 1;
let _scores = [0, 0];
let _destroyed = false;

function init({ area, ws, seat, names, state, timerEl, turnText, p1Tag, p2Tag }) {
  _area = area;
  _ws = ws;
  _seat = seat;
  _unsubs = [];
  _cards = [];
  _turn = state.turn || 1;
  _scores = state.scores || [0, 0];
  _destroyed = false;

  // Score display
  const scoreEl = el('div', { className: 'memory-scores' }, [
    el('span', { className: 'memory-score p1-score' }, [`${names[0]}: ${_scores[0]}`]),
    el('span', { className: 'memory-score p2-score' }, [`${names[1]}: ${_scores[1]}`]),
  ]);
  area.appendChild(scoreEl);

  // Build 4x4 grid
  const grid = el('div', { className: 'memory-grid' });
  for (let i = 0; i < 16; i++) {
    const card = el('div', {
      className: 'memory-card',
      'data-index': String(i),
      onClick: () => _flipCard(i),
    }, [
      el('div', { className: 'memory-card__inner' }, [
        el('div', { className: 'memory-card__front' }, ['?']),
        el('div', { className: 'memory-card__back' }, ['']),
      ]),
    ]);
    // Mark already-revealed cards
    if (state.revealed && state.revealed[i]) {
      card.classList.add('revealed');
    }
    _cards.push(card);
    grid.appendChild(card);
  }
  area.appendChild(grid);

  _updateTurn(turnText, names);

  // WS handlers
  _unsubs.push(ws.on('card_flipped', (msg) => {
    if (_destroyed) return;
    const card = _cards[msg.index];
    if (!card) return;
    card.querySelector('.memory-card__back').textContent = msg.emoji;
    card.classList.add('flipped');
    moveClick();
    vibrate('tap');
  }));

  _unsubs.push(ws.on('match', (msg) => {
    if (_destroyed) return;
    _scores = msg.scores;
    for (const idx of msg.indices) {
      _cards[idx].classList.add('matched');
      _cards[idx].classList.remove('flipped');
    }
    _updateScores(scoreEl, names);
    // Turn stays with same player on match
  }));

  _unsubs.push(ws.on('no_match', (msg) => {
    if (_destroyed) return;
    _turn = msg.turn;
    for (const idx of msg.indices) {
      _cards[idx].classList.remove('flipped');
      setTimeout(() => {
        _cards[idx].querySelector('.memory-card__back').textContent = '';
      }, 300);
    }
    _updateTurn(turnText, names);
  }));

  _unsubs.push(ws.on('game_state', (msg) => {
    if (_destroyed) return;
    _turn = msg.turn;
    _scores = msg.scores;
    _updateScores(scoreEl, names);
    _updateTurn(turnText, names);
  }));
}

function _flipCard(index) {
  if (_turn !== _seat) return;
  if (_cards[index].classList.contains('flipped')) return;
  if (_cards[index].classList.contains('matched')) return;
  _ws.send({ type: 'flip', index });
}

function _updateScores(scoreEl, names) {
  const spans = scoreEl.querySelectorAll('.memory-score');
  spans[0].textContent = `${names[0]}: ${_scores[0]}`;
  spans[1].textContent = `${names[1]}: ${_scores[1]}`;
}

function _updateTurn(turnText, names) {
  if (_turn === _seat) {
    turnText.textContent = 'התור שלך — הפוך קלף!';
    turnText.style.color = '#10B981';
  } else {
    turnText.textContent = `התור של ${names[_turn - 1]}...`;
    turnText.style.color = '#9CA3AF';
  }
}

function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
