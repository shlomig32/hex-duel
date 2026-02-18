import { moveClick } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

const SIZE = 11;
const HEX_R = 18;
const HEX_W = HEX_R * Math.sqrt(3);
const HEX_H = HEX_R * 2;
const OFFSET_X = 40;
const OFFSET_Y = 30;

let _ctx = null; // { area, ws, seat, timerEl, turnText, p1Tag, p2Tag }
let _board = [];
let _turn = 1;
let _winner = null;
let _destroyed = false;
let _unsubs = [];

function hexCenter(row, col) {
  const x = OFFSET_X + col * HEX_W + row * (HEX_W / 2);
  const y = OFFSET_Y + row * (HEX_H * 0.75);
  return { x, y };
}

function hexPoints(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30);
    pts.push(`${cx + HEX_R * Math.cos(angle)},${cy + HEX_R * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

function renderBoard() {
  if (_destroyed) return;
  const container = _ctx.area.querySelector('.hex-board-container');
  if (!container) return;

  let svg = container.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg);
  }

  // Clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const lastCenter = hexCenter(SIZE - 1, SIZE - 1);
  const vw = lastCenter.x + HEX_R + 20;
  const vh = lastCenter.y + HEX_R + 20;
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);

  // Border lines
  for (let c = 0; c < SIZE; c++) {
    const { x, y } = hexCenter(0, c);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x - HEX_W / 2); line.setAttribute('y1', y - HEX_R);
    line.setAttribute('x2', x + HEX_W / 2); line.setAttribute('y2', y - HEX_R);
    line.setAttribute('class', 'border-line border-p1');
    svg.appendChild(line);
  }
  for (let c = 0; c < SIZE; c++) {
    const { x, y } = hexCenter(SIZE - 1, c);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x - HEX_W / 2); line.setAttribute('y1', y + HEX_R);
    line.setAttribute('x2', x + HEX_W / 2); line.setAttribute('y2', y + HEX_R);
    line.setAttribute('class', 'border-line border-p1');
    svg.appendChild(line);
  }
  for (let r = 0; r < SIZE; r++) {
    const { x, y } = hexCenter(r, 0);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x - HEX_R); line.setAttribute('y1', y - HEX_H * 0.25);
    line.setAttribute('x2', x - HEX_R); line.setAttribute('y2', y + HEX_H * 0.25);
    line.setAttribute('class', 'border-line border-p2');
    svg.appendChild(line);
  }
  for (let r = 0; r < SIZE; r++) {
    const { x, y } = hexCenter(r, SIZE - 1);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x + HEX_R); line.setAttribute('y1', y - HEX_H * 0.25);
    line.setAttribute('x2', x + HEX_R); line.setAttribute('y2', y + HEX_H * 0.25);
    line.setAttribute('class', 'border-line border-p2');
    svg.appendChild(line);
  }

  // Not-my-turn dimming
  const myTurn = _turn === _ctx.seat;

  // Hex cells
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = hexCenter(r, c);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', hexPoints(x, y));

      let cls = 'hex-cell';
      const val = _board[r] && _board[r][c];
      if (val === 1) cls += ' p1';
      else if (val === 2) cls += ' p2';
      else if (!myTurn && !_winner) cls += ' dimmed';
      polygon.setAttribute('class', cls);

      if ((!_board[r] || _board[r][c] === 0) && !_winner) {
        const row = r, col = c;
        const handler = (e) => {
          e.preventDefault();
          if (_turn !== _ctx.seat || _winner) return;
          moveClick();
          vibrate('move');
          _ctx.ws.send({ type: 'move', row, col });
        };
        polygon.addEventListener('click', handler);
        polygon.addEventListener('touchend', handler);
      }

      svg.appendChild(polygon);
    }
  }
}

function updateHUD() {
  if (_destroyed) return;
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
  _board = ctx.state?.board || [];
  _turn = ctx.state?.turn || 1;
  _winner = null;

  // Create board container
  const container = document.createElement('div');
  container.className = 'hex-board-container';
  ctx.area.appendChild(container);

  renderBoard();
  updateHUD();

  // Listen for state updates
  _unsubs.push(ctx.ws.on('state', (msg) => {
    if (_destroyed) return;
    _board = msg.board;
    _turn = msg.turn;
    _winner = msg.winner;
    if (msg.timeLeft !== undefined) {
      ctx.timerEl.textContent = msg.timeLeft;
      ctx.timerEl.className = 'timer' + (msg.timeLeft <= 5 ? ' urgent' : '');
    }
    renderBoard();
    updateHUD();
  }));
}

export function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
