import { pingSound } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

// Pong constants (match server)
const PADDLE_WIDTH = 20;
const PADDLE_HEIGHT = 2;
const PADDLE_Y_OFFSET = 5;
const BALL_RADIUS = 1.5;

let _ctx = null;
let _destroyed = false;
let _unsubs = [];
let _canvas = null;
let _canvasCtx = null;
let _animFrame = 0;
let _isDragging = false;

// State from server
let _paddles = { 1: 50, 2: 50 };
let _ball = { x: 50, y: 50, vx: 0, vy: 0 };
let _scores = { 1: 0, 2: 0 };
let _prevScores = { 1: 0, 2: 0 };
let _myScoreEl = null;
let _oppScoreEl = null;

function setupInput() {
  const getX = (e) => {
    const rect = _canvas.getBoundingClientRect();
    const clientX = e.touches ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const sendPaddle = (x) => {
    if (_ctx && _ctx.ws) {
      _ctx.ws.send({ type: 'paddle_move', x });
    }
  };

  _canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _isDragging = true;
    sendPaddle(getX(e));
  }, { passive: false });

  _canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (_isDragging) sendPaddle(getX(e));
  }, { passive: false });

  _canvas.addEventListener('touchend', () => { _isDragging = false; });

  _canvas.addEventListener('mousedown', (e) => {
    _isDragging = true;
    sendPaddle(getX(e));
  });

  _canvas.addEventListener('mousemove', (e) => {
    if (_isDragging) sendPaddle(getX(e));
  });

  _canvas.addEventListener('mouseup', () => { _isDragging = false; });
  _canvas.addEventListener('mouseleave', () => { _isDragging = false; });
}

function renderFrame() {
  if (_destroyed || !_canvas || !_canvasCtx) return;
  const ctx = _canvasCtx;
  const dpr = window.devicePixelRatio || 1;

  const rect = _canvas.getBoundingClientRect();
  if (_canvas.width !== rect.width * dpr || _canvas.height !== rect.height * dpr) {
    _canvas.width = rect.width * dpr;
    _canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  const w = rect.width;
  const h = rect.height;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0B0D1A');
  bgGrad.addColorStop(0.5, '#151830');
  bgGrad.addColorStop(1, '#0B0D1A');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Center line
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Seat 1 = bottom, Seat 2 = top
  // If I'm seat 2, flip view so I'm always at bottom
  const flipped = _ctx.seat === 2;
  const toX = (x) => (x / 100) * w;
  const toY = (y) => {
    const normalized = flipped ? (100 - y) : y;
    return (normalized / 100) * h;
  };

  // Paddles
  const paddleW = (PADDLE_WIDTH / 100) * w;
  const paddleH = Math.max(6, (PADDLE_HEIGHT / 100) * h);
  const radius = paddleH / 2;

  const myPaddle = flipped ? _paddles[2] : _paddles[1];
  const oppPaddle = flipped ? _paddles[1] : _paddles[2];

  const bottomY = toY(100 - PADDLE_Y_OFFSET);
  const topY = toY(PADDLE_Y_OFFSET);

  // My paddle (bottom) - cyan
  drawPaddle(ctx, toX(myPaddle), bottomY, paddleW, paddleH, radius, '#06B6D4', 'rgba(6,182,212,0.4)');
  // Opponent paddle (top) - purple
  drawPaddle(ctx, toX(oppPaddle), topY, paddleW, paddleH, radius, '#8B5CF6', 'rgba(139,92,246,0.4)');

  // Ball
  const bx = toX(_ball.x);
  const by = toY(_ball.y);
  const br = (BALL_RADIUS / 100) * Math.min(w, h);

  // Ball glow
  const ballGlow = ctx.createRadialGradient(bx, by, 0, bx, by, br * 3);
  ballGlow.addColorStop(0, 'rgba(255,255,255,0.3)');
  ballGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ballGlow;
  ctx.fillRect(bx - br * 3, by - br * 3, br * 6, br * 6);

  // Ball
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function drawPaddle(ctx, cx, cy, pw, ph, radius, color, glowColor) {
  const x = cx - pw / 2;
  const y = cy - ph / 2;

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 15;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + pw - radius, y);
  ctx.arcTo(x + pw, y, x + pw, y + radius, radius);
  ctx.lineTo(x + pw, y + ph - radius);
  ctx.arcTo(x + pw, y + ph, x + pw - radius, y + ph, radius);
  ctx.lineTo(x + radius, y + ph);
  ctx.arcTo(x, y + ph, x, y + ph - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

function startRenderLoop() {
  const loop = () => {
    if (_destroyed) return;
    renderFrame();
    _animFrame = requestAnimationFrame(loop);
  };
  _animFrame = requestAnimationFrame(loop);
}

function updateScores() {
  if (!_myScoreEl || !_oppScoreEl) return;
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
    void _myScoreEl.offsetWidth; // force reflow
    _myScoreEl.classList.add('score-pop');
  }
  if (oppNew !== oppOld) {
    _oppScoreEl.classList.remove('score-pop');
    void _oppScoreEl.offsetWidth;
    _oppScoreEl.classList.add('score-pop');
  }
  _prevScores = { ..._scores };
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _prevScores = { 1: 0, 2: 0 };

  // Hide turn indicator (not used for pong)
  ctx.turnText.style.display = 'none';

  // Score display
  const scoreHud = document.createElement('div');
  scoreHud.className = 'pong-scores';

  _myScoreEl = document.createElement('span');
  _myScoreEl.style.cssText = 'color: #06B6D4; text-shadow: 0 0 20px rgba(6,182,212,0.5);';
  _myScoreEl.textContent = '0';

  const divider = document.createElement('span');
  divider.style.cssText = 'color: #5A6178;';
  divider.textContent = ':';

  _oppScoreEl = document.createElement('span');
  _oppScoreEl.style.cssText = 'color: #8B5CF6; text-shadow: 0 0 20px rgba(139,92,246,0.5);';
  _oppScoreEl.textContent = '0';

  scoreHud.appendChild(_myScoreEl);
  scoreHud.appendChild(divider);
  scoreHud.appendChild(_oppScoreEl);

  // Container
  const container = document.createElement('div');
  container.className = 'pong-container';

  _canvas = document.createElement('canvas');
  _canvasCtx = _canvas.getContext('2d');
  container.appendChild(_canvas);

  ctx.area.appendChild(scoreHud);
  ctx.area.appendChild(container);
  ctx.area.style.flexDirection = 'column';

  setupInput();
  startRenderLoop();

  // Listen for state updates (30fps from server)
  _unsubs.push(ctx.ws.on('pong_state', (msg) => {
    if (_destroyed) return;
    _paddles = msg.paddles;
    _ball = msg.ball;
    _scores = msg.scores;
    if (msg.timeLeft !== undefined) {
      ctx.timerEl.textContent = msg.timeLeft;
      ctx.timerEl.className = 'timer' + (msg.timeLeft <= 10 ? ' urgent' : '');
    }
    updateScores();
  }));

  _unsubs.push(ctx.ws.on('point_scored', (msg) => {
    if (_destroyed) return;
    _scores = msg.scores;
    pingSound();
    vibrate('tap');
    updateScores();
  }));
}

export function destroy() {
  _destroyed = true;
  if (_animFrame) cancelAnimationFrame(_animFrame);
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
  _canvas = null;
  _canvasCtx = null;
}

export default { init, destroy };
