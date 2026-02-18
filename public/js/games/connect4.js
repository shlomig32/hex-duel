import { moveClick } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

const COLS = 7;
const ROWS = 6;
const CELL_SIZE = 50;
const PADDING = 8;
const RADIUS = 20;

let _ctx = null;
let _board = [];
let _turn = 1;
let _winner = null;
let _destroyed = false;
let _unsubs = [];
let _svg = null;

function buildBoard() {
  if (_destroyed || !_ctx) return;

  const container = _ctx.area.querySelector('.c4-board-container');
  if (!container) return;

  if (_svg) {
    while (_svg.firstChild) _svg.removeChild(_svg.firstChild);
  } else {
    _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(_svg);
  }

  const w = COLS * CELL_SIZE + PADDING * 2;
  const h = ROWS * CELL_SIZE + PADDING * 2;
  _svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  _svg.style.width = '100%';

  // Board background
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', w); bg.setAttribute('height', h);
  bg.setAttribute('rx', 12); bg.setAttribute('fill', '#1E2A5E');
  _svg.appendChild(bg);

  // Not-my-turn dimming
  const myTurn = _turn === _ctx.seat;

  // Column hover zones (invisible clickable rects)
  for (let c = 0; c < COLS; c++) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', PADDING + c * CELL_SIZE);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', CELL_SIZE);
    rect.setAttribute('height', h);
    rect.setAttribute('class', 'c4-col-hover' + (!myTurn && !_winner ? ' dimmed' : ''));
    rect.setAttribute('fill', 'transparent');
    rect.style.cursor = myTurn && !_winner ? 'pointer' : 'default';

    const col = c;
    const handler = (e) => {
      e.preventDefault();
      if (_turn !== _ctx.seat || _winner) return;
      if (_board[0] && _board[0][col] !== 0) return;
      moveClick();
      vibrate('move');
      _ctx.ws.send({ type: 'drop', col });
    };
    rect.addEventListener('click', handler);
    rect.addEventListener('touchend', handler);
    _svg.appendChild(rect);
  }

  // Cells (circles)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', RADIUS);

      let cls = 'c4-cell';
      const val = _board[r] && _board[r][c];
      if (val === 1) cls += ' p1';
      else if (val === 2) cls += ' p2';
      circle.setAttribute('class', cls);

      _svg.appendChild(circle);
    }
  }
}

function updateHUD() {
  if (_destroyed || !_ctx) return;
  const myTurn = _turn === _ctx.seat;
  _ctx.turnText.textContent = myTurn ? '\u2B06 !\u05D4\u05EA\u05D5\u05E8 \u05E9\u05DC\u05DA' : '\u23F3 ...\u05D4\u05D9\u05E8\u05D9\u05D1 \u05D7\u05D5\u05E9\u05D1';
  _ctx.turnText.className = 'turn-indicator' + (myTurn ? ' my-turn' : '');

  // Active player glow via CSS class
  _ctx.p1Tag.classList.toggle('active-glow', _turn === 1);
  _ctx.p2Tag.classList.toggle('active-glow', _turn === 2);
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _svg = null;
  _board = ctx.state?.board || Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  _turn = ctx.state?.turn || 1;
  _winner = null;

  const container = document.createElement('div');
  container.className = 'c4-board-container';
  ctx.area.appendChild(container);

  buildBoard();
  updateHUD();

  _unsubs.push(ctx.ws.on('state', (msg) => {
    if (_destroyed) return;
    _board = msg.board;
    _turn = msg.turn;
    _winner = msg.winner;
    if (msg.timeLeft !== undefined) {
      ctx.timerEl.textContent = msg.timeLeft;
      ctx.timerEl.className = 'timer' + (msg.timeLeft <= 5 ? ' urgent' : '');
    }
    buildBoard();
    updateHUD();
  }));
}

export function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
  _svg = null;
}

export default { init, destroy };
