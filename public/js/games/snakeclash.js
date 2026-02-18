import { getPhotoAvatar } from '../lib/photo-avatar.js';
import { vibrate } from '../lib/haptics.js';

// ── Constants ───────────────────────────────────────────────────────────
const GRID_SIZE = 20;
const BG_COLOR = '#0a0a1a';
const GRID_LINE_COLOR = 'rgba(16,185,129,0.06)';
const BORDER_COLOR = 'rgba(16,185,129,0.2)';

const MY_HEAD_COLOR = '#06B6D4';
const MY_BODY_START = '#10B981';
const MY_BODY_END = '#065F46';
const OPP_HEAD_COLOR = '#EC4899';
const OPP_BODY_START = '#8B5CF6';
const OPP_BODY_END = '#4C1D95';

const FOOD_EMOJI = { apple: '\u{1F34E}', golden: '\u{1F31F}', poison: '\u2620\uFE0F', turbo: '\u{1F680}' };
const POWERUP_EMOJI = { wall: '\u{1F9F1}', swap: '\u{1F504}', ghost: '\u{1F47B}', mines: '\u{1F4A5}' };

const OPPOSITE_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SWIPE_THRESHOLD = 15;

// ── Module state ────────────────────────────────────────────────────────
let _destroyed = false;
let _unsubs = [];
let _ctx = null;
let _canvas = null;
let _canvasCtx = null;
let _animFrame = 0;
let _dpadEl = null;

// Game state from server
let _players = [];
let _food = [];
let _powerups = [];
let _mines = [];
let _elapsed = 0;
let _timeLimit = 40;

// Input
let _lastSentDir = null;
let _touchStartX = 0;
let _touchStartY = 0;

// Visual effects
let _swapFlashFrames = 0;  // countdown frames for white swap flash
let _hitFlashFrames = 0;   // countdown frames for red hit flash
let _frameCount = 0;       // global frame counter for animations

// Avatar
let _avatarImg = null;
let _avatarLoaded = false;

// ── Audio ───────────────────────────────────────────────────────────────
let _audioCtx;
function getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function chompSound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.value = 600; o.type = 'square';
  g.gain.setValueAtTime(0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
  o.start(); o.stop(c.currentTime + 0.05);
}

function hissSound() {
  const c = getAudio();
  const bufferSize = c.sampleRate * 0.15;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
  src.connect(g); g.connect(c.destination);
  src.start(); src.stop(c.currentTime + 0.15);
}

function whooshSound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.setValueAtTime(800, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
  o.type = 'sine';
  g.gain.setValueAtTime(0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
  o.start(); o.stop(c.currentTime + 0.15);
}

function goldenDing() {
  const c = getAudio();
  [800, 1000, 1200].forEach((freq, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.08, c.currentTime + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.08 + 0.1);
    o.start(c.currentTime + i * 0.08); o.stop(c.currentTime + i * 0.08 + 0.1);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────
function sendDir(dir) {
  if (_destroyed || !_ctx || !_ctx.ws) return;
  if (_lastSentDir && OPPOSITE_DIR[_lastSentDir] === dir) return;
  _lastSentDir = dir;
  _ctx.ws.send({ type: 'dir', dir });
}

function mySeat() { return _ctx ? _ctx.seat : 1; }
function oppSeat() { return mySeat() === 1 ? 2 : 1; }
function myIdx() { return mySeat() - 1; }
function oppIdx() { return oppSeat() - 1; }

function myPlayer() { return _players[myIdx()] || null; }
function oppPlayer() { return _players[oppIdx()] || null; }

// ── Input: Swipe ────────────────────────────────────────────────────────
function onTouchStart(e) {
  if (_destroyed) return;
  const t = e.touches[0];
  _touchStartX = t.clientX;
  _touchStartY = t.clientY;
}

function onTouchEnd(e) {
  if (_destroyed) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - _touchStartX;
  const dy = t.clientY - _touchStartY;
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    sendDir(dx < 0 ? 'left' : 'right');
  } else {
    sendDir(dy < 0 ? 'up' : 'down');
  }
}

// ── Input: D-pad ────────────────────────────────────────────────────────
function createDpad(container) {
  _dpadEl = document.createElement('div');
  _dpadEl.className = 'dpad';

  const dirs = [
    { dir: 'up', label: '\u25B2' },
    { dir: 'left', label: '\u25C0' },
    { dir: 'right', label: '\u25B6' },
    { dir: 'down', label: '\u25BC' },
  ];

  for (const d of dirs) {
    const btn = document.createElement('button');
    btn.setAttribute('data-dir', d.dir);
    btn.textContent = d.label;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sendDir(d.dir);
    });
    _dpadEl.appendChild(btn);
  }

  container.appendChild(_dpadEl);
}

// ── Drawing helpers ─────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function lerpColor(startHex, endHex, t) {
  const s = parseInt(startHex.slice(1), 16);
  const e = parseInt(endHex.slice(1), 16);
  const sr = (s >> 16) & 0xFF, sg = (s >> 8) & 0xFF, sb = s & 0xFF;
  const er = (e >> 16) & 0xFF, eg = (e >> 8) & 0xFF, eb = e & 0xFF;
  const r = Math.round(sr + (er - sr) * t);
  const g = Math.round(sg + (eg - sg) * t);
  const b = Math.round(sb + (eb - sb) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Rendering ───────────────────────────────────────────────────────────
function renderFrame() {
  if (_destroyed || !_canvas || !_canvasCtx) return;
  _frameCount++;

  const ctx = _canvasCtx;
  const dpr = window.devicePixelRatio || 1;
  const rect = _canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  if (_canvas.width !== Math.round(w * dpr) || _canvas.height !== Math.round(h * dpr)) {
    _canvas.width = Math.round(w * dpr);
    _canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const cell = w / GRID_SIZE;

  // ── Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // ── Grid lines
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID_SIZE; i++) {
    const pos = i * cell;
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(w, pos); ctx.stroke();
  }

  // ── Border
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // ── Mines
  for (const mine of _mines) {
    const cx = mine.x * cell + cell / 2;
    const cy = mine.y * cell + cell / 2;
    const r = cell * 0.15;
    const pulse = 0.7 + 0.3 * Math.sin(_frameCount * 0.08);
    ctx.save();
    ctx.globalAlpha = 0.6 * pulse;
    ctx.fillStyle = '#EF4444';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Food
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = cell * 0.65;
  ctx.font = `${fontSize}px serif`;

  for (const f of _food) {
    const cx = f.x * cell + cell / 2;
    const cy = f.y * cell + cell / 2;
    const emoji = FOOD_EMOJI[f.type] || FOOD_EMOJI.apple;

    ctx.save();

    if (f.type === 'golden') {
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 10;
      // sparkle effect — slight rotation
      const sparkle = Math.sin(_frameCount * 0.15) * 0.1;
      ctx.translate(cx, cy);
      ctx.rotate(sparkle);
      ctx.fillText(emoji, 0, 0);
    } else if (f.type === 'poison') {
      // wobble
      const wobble = Math.sin(_frameCount * 0.1) * (5 * Math.PI / 180);
      ctx.translate(cx, cy);
      ctx.rotate(wobble);
      ctx.fillText(emoji, 0, 0);
    } else if (f.type === 'turbo') {
      // fast pulse with blue glow
      const scale = 0.9 + 0.2 * Math.abs(Math.sin(_frameCount * 0.15));
      ctx.shadowColor = '#3B82F6';
      ctx.shadowBlur = 8;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillText(emoji, 0, 0);
    } else {
      // apple — gentle pulse
      const scale = 0.9 + 0.1 * Math.sin(_frameCount * 0.06);
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillText(emoji, 0, 0);
    }

    ctx.restore();
  }

  // ── Powerups
  for (const p of _powerups) {
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    const emoji = POWERUP_EMOJI[p.type] || '\u2753';

    ctx.save();

    if (p.type === 'wall') {
      ctx.shadowColor = '#92400E';
      ctx.shadowBlur = 6;
      ctx.translate(cx, cy);
      ctx.fillText(emoji, 0, 0);
    } else if (p.type === 'swap') {
      // spinning
      const angle = _frameCount * 0.05;
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillText(emoji, 0, 0);
    } else if (p.type === 'ghost') {
      ctx.globalAlpha = 0.7;
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 8;
      ctx.translate(cx, cy);
      ctx.fillText(emoji, 0, 0);
    } else if (p.type === 'mines') {
      const pulse = 0.9 + 0.1 * Math.sin(_frameCount * 0.1);
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 6;
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.fillText(emoji, 0, 0);
    } else {
      ctx.translate(cx, cy);
      ctx.fillText(emoji, 0, 0);
    }

    ctx.restore();
  }

  // ── Snakes
  drawSnake(ctx, cell, myPlayer(), true);
  drawSnake(ctx, cell, oppPlayer(), false);

  // ── Swap flash effect
  if (_swapFlashFrames > 0) {
    const alpha = _swapFlashFrames / 15;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    _swapFlashFrames--;
  }

  // ── Hit flash effect (red)
  if (_hitFlashFrames > 0) {
    const alpha = _hitFlashFrames / 5;
    ctx.save();
    ctx.fillStyle = `rgba(255,0,0,${alpha * 0.3})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    _hitFlashFrames--;
  }

  // ── HUD
  drawHUD(ctx, w, cell);
}

function drawSnake(ctx, cell, player, isMe) {
  if (!player || !player.segments || player.segments.length === 0) return;

  const segments = player.segments;
  const headColor = isMe ? MY_HEAD_COLOR : OPP_HEAD_COLOR;
  const bodyStart = isMe ? MY_BODY_START : OPP_BODY_START;
  const bodyEnd = isMe ? MY_BODY_END : OPP_BODY_END;
  const ghosted = player.ghosted;
  const walled = player.walled;

  ctx.save();

  if (ghosted) {
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 6;
  }

  // Body segments (draw from tail to head so head is on top)
  for (let i = segments.length - 1; i >= 1; i--) {
    const seg = segments[i];
    const t = segments.length > 2 ? (i - 1) / (segments.length - 2) : 0;
    const sizeRatio = 0.75 - 0.15 * (1 - t); // slightly smaller toward tail
    const segSize = cell * Math.max(0.5, sizeRatio);
    const offset = (cell - segSize) / 2;
    const color = lerpColor(bodyStart, bodyEnd, 1 - t);

    ctx.fillStyle = color;
    roundRect(ctx, seg.x * cell + offset, seg.y * cell + offset, segSize, segSize, segSize * 0.2);
    ctx.fill();

    if (walled) {
      const pulseAlpha = 0.5 + 0.5 * Math.sin(_frameCount * 0.15);
      ctx.strokeStyle = `rgba(255,255,255,${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Head
  const head = segments[0];
  const headSize = cell * 0.85;
  const headOff = (cell - headSize) / 2;
  const hx = head.x * cell + headOff;
  const hy = head.y * cell + headOff;

  ctx.fillStyle = headColor;
  ctx.shadowColor = headColor;
  ctx.shadowBlur = ghosted ? 6 : 8;
  roundRect(ctx, hx, hy, headSize, headSize, headSize * 0.25);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Avatar on head
  const headCx = head.x * cell + cell / 2;
  const headCy = head.y * cell + cell / 2;
  const avatarRadius = headSize * 0.35;

  if (isMe && _avatarImg && _avatarLoaded) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(headCx, headCy, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      _avatarImg,
      headCx - avatarRadius, headCy - avatarRadius,
      avatarRadius * 2, avatarRadius * 2
    );
    ctx.restore();
  } else {
    // Colored circle with initial
    const initial = isMe
      ? (_ctx.names ? (_ctx.names[myIdx()] || 'P1') : 'P1').charAt(0).toUpperCase()
      : (_ctx.names ? (_ctx.names[oppIdx()] || 'P2') : 'P2').charAt(0).toUpperCase();
    ctx.save();
    ctx.fillStyle = isMe ? '#065F46' : '#4C1D95';
    ctx.beginPath();
    ctx.arc(headCx, headCy, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${avatarRadius * 1.1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, headCx, headCy);
    ctx.restore();
  }

  // Direction triangle on head
  const dir = player.dir || 'right';
  const triSize = headSize * 0.22;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = ghosted ? 0.35 : 0.85;
  ctx.translate(headCx, headCy);
  let triAngle = 0;
  if (dir === 'up') triAngle = -Math.PI / 2;
  else if (dir === 'down') triAngle = Math.PI / 2;
  else if (dir === 'left') triAngle = Math.PI;
  else triAngle = 0;
  ctx.rotate(triAngle);
  // Triangle offset toward the edge of the head
  const triOffsetX = headSize * 0.32;
  ctx.beginPath();
  ctx.moveTo(triOffsetX + triSize, 0);
  ctx.lineTo(triOffsetX - triSize * 0.5, -triSize * 0.7);
  ctx.lineTo(triOffsetX - triSize * 0.5, triSize * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Walled head border
  if (walled) {
    const pulseAlpha = 0.5 + 0.5 * Math.sin(_frameCount * 0.15);
    ctx.strokeStyle = `rgba(255,255,255,${pulseAlpha})`;
    ctx.lineWidth = 2;
    roundRect(ctx, hx, hy, headSize, headSize, headSize * 0.25);
    ctx.stroke();
  }

  ctx.restore(); // pop ghosted alpha
}

function drawHUD(ctx, canvasW, cell) {
  const me = myPlayer();
  const opp = oppPlayer();
  const myScore = me ? (me.score || 0) : 0;
  const oppScore = opp ? (opp.score || 0) : 0;

  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'top';

  // My score — top left
  ctx.textAlign = 'left';
  ctx.fillStyle = '#06B6D4';
  ctx.shadowColor = 'rgba(6,182,212,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillText(`Score: ${myScore}`, 8, 8);

  // Opponent score — top right
  ctx.textAlign = 'right';
  ctx.fillStyle = '#EC4899';
  ctx.shadowColor = 'rgba(236,72,153,0.5)';
  ctx.fillText(`Score: ${oppScore}`, canvasW - 8, 8);

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Active power-up indicators
  let indicatorY = 26;
  if (me && me.ghosted) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px sans-serif';
    ctx.fillText('\u{1F47B} Ghost', 8, indicatorY);
    indicatorY += 16;
  }
  if (me && me.walled) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px sans-serif';
    ctx.fillText('\u{1F9F1} Wall', 8, indicatorY);
  }

  ctx.restore();

  // Update timer in DOM
  if (_ctx && _ctx.timerEl) {
    const remaining = Math.max(0, _timeLimit - Math.floor(_elapsed));
    _ctx.timerEl.textContent = String(remaining);
    if (remaining <= 10) {
      _ctx.timerEl.classList.add('urgent');
    } else {
      _ctx.timerEl.classList.remove('urgent');
    }
  }
}

// ── Render loop ─────────────────────────────────────────────────────────
function startRenderLoop() {
  const loop = () => {
    if (_destroyed) return;
    renderFrame();
    _animFrame = requestAnimationFrame(loop);
  };
  _animFrame = requestAnimationFrame(loop);
}

// ── Init / Destroy ──────────────────────────────────────────────────────
export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _frameCount = 0;
  _swapFlashFrames = 0;
  _hitFlashFrames = 0;
  _lastSentDir = null;
  _avatarImg = null;
  _avatarLoaded = false;

  // Hide turn indicator (not used for snake)
  ctx.turnText.style.display = 'none';

  // Initial state
  if (ctx.state) {
    _players = ctx.state.players || [];
    _food = ctx.state.food || [];
    _powerups = ctx.state.powerups || [];
    _mines = ctx.state.mines || [];
    _timeLimit = ctx.state.timeLimit || 40;
  }

  // Load photo avatar
  const photo = getPhotoAvatar();
  if (photo) {
    _avatarImg = new Image();
    _avatarImg.onload = () => { _avatarLoaded = true; };
    _avatarImg.src = photo;
  }

  // Canvas wrapper
  const wrap = document.createElement('div');
  wrap.className = 'arcade-canvas-wrap';

  _canvas = document.createElement('canvas');
  _canvasCtx = _canvas.getContext('2d');
  _canvas.style.touchAction = 'none';

  // Size: square, fit container
  const containerW = Math.min(ctx.area.clientWidth || 400, 400);
  _canvas.style.width = containerW + 'px';
  _canvas.style.height = containerW + 'px';

  wrap.appendChild(_canvas);
  ctx.area.appendChild(wrap);

  // D-pad
  createDpad(ctx.area);

  // Swipe input on canvas
  _canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  _canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  // Start render
  startRenderLoop();

  // ── Server message handlers ─────────────────────────────────────────

  // Main state updates (frequent)
  _unsubs.push(ctx.ws.on('snake_state', (msg) => {
    if (_destroyed) return;
    _players = msg.players || [];
    _food = msg.food || [];
    _powerups = msg.powerups || [];
    _mines = msg.mines || [];
    if (msg.elapsed !== undefined) _elapsed = msg.elapsed;
  }));

  // Hit event
  _unsubs.push(ctx.ws.on('snake_hit', (msg) => {
    if (_destroyed) return;
    if (msg.seat === mySeat()) {
      _hitFlashFrames = 5;
      hissSound();
      try { navigator.vibrate([50, 30, 50]); } catch (_e) { /* noop */ }
    }
  }));

  // Food eaten
  _unsubs.push(ctx.ws.on('snake_food', (msg) => {
    if (_destroyed) return;
    if (msg.seat === mySeat()) {
      if (msg.foodType === 'golden') {
        goldenDing();
      } else {
        chompSound();
      }
      vibrate('tap');
    }
  }));

  // Powerup collected
  _unsubs.push(ctx.ws.on('snake_powerup', (msg) => {
    if (_destroyed) return;
    if (msg.seat === mySeat()) {
      chompSound();
      vibrate('tap');
    }
  }));

  // Swap event
  _unsubs.push(ctx.ws.on('snake_swap', () => {
    if (_destroyed) return;
    _swapFlashFrames = 15;
    whooshSound();
    try { navigator.vibrate(200); } catch (_e) { /* noop */ }
  }));
}

export function destroy() {
  _destroyed = true;

  if (_animFrame) {
    cancelAnimationFrame(_animFrame);
    _animFrame = 0;
  }

  for (const unsub of _unsubs) unsub();
  _unsubs = [];

  if (_canvas) {
    _canvas.removeEventListener('touchstart', onTouchStart);
    _canvas.removeEventListener('touchend', onTouchEnd);
  }

  _canvas = null;
  _canvasCtx = null;
  _dpadEl = null;
  _avatarImg = null;
  _avatarLoaded = false;
  _players = [];
  _food = [];
  _powerups = [];
  _mines = [];
  _ctx = null;
}

export default { init, destroy };
