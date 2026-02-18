import { getPhotoAvatar } from '../lib/photo-avatar.js';
import { vibrate } from '../lib/haptics.js';

// ── Constants ──
const MAZE_SIZE = 13;
const TIME_LIMIT = 45;
const LERP_FACTOR = 0.2;
const SWIPE_THRESHOLD = 15;

// Item emoji map
const ITEM_EMOJI = {
  star: '\u2B50',
  speed: '\u26A1',
  ghost: '\uD83D\uDC7B',
  phase: '\uD83D\uDCA8',
  glue: '\uD83E\uDEE4',    // trap / glue
  dynamite: '\uD83E\uDDE8',
};

// ── Module state ──
let _destroyed = false;
let _unsubs = [];
let _ctx = null;

// Canvas
let _canvas = null;
let _canvasCtx = null;
let _animFrame = 0;

// DOM elements
let _wrapEl = null;
let _dpadEl = null;
let _inventoryBtn = null;

// Game state from server
let _maze = [];           // 2D grid: 0=path, 1=wall
let _players = [];        // [{x,y,alive,score,phased,frozen,inventory}]
let _ghosts = [];         // [{x,y}]
let _items = [];          // [{x,y,type}]
let _traps = [];          // [{x,y,owner}]
let _elapsed = 0;
let _shrinkLevel = 0;

// Display state (smooth interpolation)
let _displayPlayers = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
let _displayInited = false;

// Previous ghost positions for eye direction
let _prevGhostPos = [];

// Input
let _touchStartX = 0;
let _touchStartY = 0;
let _lastMoveDir = 'right';

// Effects
let _shrinkFlashFrames = 0;
let _shakeFrames = 0;
let _frameCount = 0;

// Photo avatar
let _avatarImg = null;
let _avatarLoaded = false;

// ── Web Audio sounds ──
let _audioCtx;
function getAudio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function dingSound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.value = 1000; o.type = 'sine';
  g.gain.setValueAtTime(0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
  o.start(); o.stop(c.currentTime + 0.1);
}

function spookySound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.setValueAtTime(200, c.currentTime);
  o.frequency.linearRampToValueAtTime(400, c.currentTime + 0.3);
  o.type = 'sawtooth';
  g.gain.setValueAtTime(0.08, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  o.start(); o.stop(c.currentTime + 0.3);
}

function boomSound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.setValueAtTime(100, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.15);
  o.type = 'sine';
  g.gain.setValueAtTime(0.2, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  o.start(); o.stop(c.currentTime + 0.2);
}

function freezeSound() {
  const c = getAudio(), o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.frequency.value = 2000; o.type = 'sine';
  g.gain.setValueAtTime(0.05, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  o.start(); o.stop(c.currentTime + 0.2);
}

// ── Helpers ──

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cellSize() {
  if (!_canvas) return 0;
  const dpr = window.devicePixelRatio || 1;
  return (_canvas.width / dpr) / MAZE_SIZE;
}

function mySeatIndex() {
  return _ctx ? _ctx.seat - 1 : 0;
}

function oppSeatIndex() {
  return _ctx ? (_ctx.seat === 1 ? 1 : 0) : 1;
}

// ── Avatar loading ──

function loadAvatar() {
  const src = getPhotoAvatar();
  if (!src) { _avatarLoaded = false; return; }
  const img = new Image();
  img.onload = () => { _avatarImg = img; _avatarLoaded = true; };
  img.onerror = () => { _avatarLoaded = false; };
  img.src = src;
}

// ── Rendering ──

function renderFrame() {
  if (_destroyed || !_canvas || !_canvasCtx) return;
  _frameCount++;

  const ctx = _canvasCtx;
  const dpr = window.devicePixelRatio || 1;
  const rect = _canvas.getBoundingClientRect();
  const logicalW = rect.width;
  const logicalH = rect.height;

  if (_canvas.width !== Math.round(logicalW * dpr) || _canvas.height !== Math.round(logicalH * dpr)) {
    _canvas.width = Math.round(logicalW * dpr);
    _canvas.height = Math.round(logicalH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const cs = logicalW / MAZE_SIZE;

  // Screen shake offset
  let shakeX = 0, shakeY = 0;
  if (_shakeFrames > 0) {
    shakeX = (Math.random() - 0.5) * 6;
    shakeY = (Math.random() - 0.5) * 6;
    _shakeFrames--;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Clear
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(-10, -10, logicalW + 20, logicalH + 20);

  // ── Draw maze ──
  for (let gy = 0; gy < MAZE_SIZE; gy++) {
    for (let gx = 0; gx < MAZE_SIZE; gx++) {
      const px = gx * cs;
      const py = gy * cs;

      if (_maze[gy] && _maze[gy][gx] === 1) {
        // Wall
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#8B5CF6';
        ctx.fillStyle = '#8B5CF6';
        ctx.fillRect(px, py, cs, cs);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        // Path — faint grid line
        ctx.strokeStyle = 'rgba(139,92,246,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, cs, cs);
      }
    }
  }

  // ── Draw traps (own only) ──
  const myIdx = mySeatIndex();
  for (const trap of _traps) {
    if (trap.owner !== myIdx) continue;
    const tx = trap.x * cs + cs / 2;
    const ty = trap.y * cs + cs / 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(245,158,11,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tx, ty, cs * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Draw items ──
  const time = Date.now() / 1000;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const itemFontSize = Math.max(10, cs * 0.6);
  ctx.font = `${itemFontSize}px sans-serif`;

  for (let i = 0; i < _items.length; i++) {
    const item = _items[i];
    const ix = item.x * cs + cs / 2;
    const floatOffset = Math.sin(time * 2 + i) * 2;
    const iy = item.y * cs + cs / 2 + floatOffset;
    const emoji = ITEM_EMOJI[item.type] || '\u2B50';
    ctx.fillText(emoji, ix, iy);
  }

  // ── Draw ghosts ──
  for (let gi = 0; gi < _ghosts.length; gi++) {
    const ghost = _ghosts[gi];
    const gx = ghost.x * cs + cs / 2;
    const gy_pos = ghost.y * cs + cs / 2;

    // Check proximity to my player
    const me = _players[myIdx];
    let closeToMe = false;
    if (me) {
      const dx = ghost.x - me.x;
      const dy = ghost.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      closeToMe = dist < 3;
    }

    // Vibration when close
    let vx = 0, vy = 0;
    if (closeToMe) {
      vx = (Math.random() - 0.5) * 2;
      vy = (Math.random() - 0.5) * 2;
    }

    // Oscillating alpha
    const alpha = 0.5 + 0.2 * Math.sin(time * 3 + gi);
    ctx.globalAlpha = alpha;

    // Ghost body
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(gx + vx, gy_pos + vy, cs * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeR = cs * 0.07;
    const eyeSpacing = cs * 0.12;

    // Direction from previous position
    let edx = 0, edy = 0;
    if (_prevGhostPos[gi]) {
      edx = ghost.x - _prevGhostPos[gi].x;
      edy = ghost.y - _prevGhostPos[gi].y;
    }
    const eOffsetX = edx !== 0 ? Math.sign(edx) * eyeR * 0.5 : 0;
    const eOffsetY = edy !== 0 ? Math.sign(edy) * eyeR * 0.5 : 0;

    ctx.globalAlpha = 1;
    ctx.fillStyle = closeToMe ? '#EF4444' : '#000000';

    // Left eye
    ctx.beginPath();
    ctx.arc(gx + vx - eyeSpacing + eOffsetX, gy_pos + vy - cs * 0.06 + eOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.arc(gx + vx + eyeSpacing + eOffsetX, gy_pos + vy - cs * 0.06 + eOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // Update previous ghost positions
  _prevGhostPos = _ghosts.map(g => ({ x: g.x, y: g.y }));

  // ── Draw players ──
  updateDisplayPositions();
  drawPlayer(ctx, cs, myIdx, '#06B6D4', true);
  drawPlayer(ctx, cs, oppSeatIndex(), '#EC4899', false);

  // ── HUD: scores at top corners ──
  const hudFontSize = Math.max(12, cs * 0.55);
  ctx.font = `bold ${hudFontSize}px sans-serif`;
  ctx.textBaseline = 'top';

  const myScore = _players[myIdx] ? _players[myIdx].score || 0 : 0;
  const oppScore = _players[oppSeatIndex()] ? _players[oppSeatIndex()].score || 0 : 0;

  // My score (left)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#06B6D4';
  ctx.fillText('\u2B50 ' + myScore, 4, 4);

  // Opponent score (right)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#EC4899';
  ctx.fillText('\u2B50 ' + oppScore, logicalW - 4, 4);

  // ── Shrink flash ──
  if (_shrinkFlashFrames > 0) {
    const flashAlpha = (_shrinkFlashFrames / 15) * 0.3;
    ctx.fillStyle = `rgba(239,68,68,${flashAlpha})`;
    const edgeW = cs * 1.5;
    // Top
    ctx.fillRect(0, 0, logicalW, edgeW);
    // Bottom
    ctx.fillRect(0, logicalH - edgeW, logicalW, edgeW);
    // Left
    ctx.fillRect(0, 0, edgeW, logicalH);
    // Right
    ctx.fillRect(logicalW - edgeW, 0, edgeW, logicalH);
    _shrinkFlashFrames--;
  }

  ctx.restore();

  // ── Timer ──
  if (_ctx && _ctx.timerEl) {
    const remaining = Math.max(0, TIME_LIMIT - Math.floor(_elapsed));
    _ctx.timerEl.textContent = String(remaining);
    if (remaining <= 10) {
      _ctx.timerEl.classList.add('urgent');
    } else {
      _ctx.timerEl.classList.remove('urgent');
    }
  }

  // ── Inventory button ──
  updateInventoryButton();
}

function drawPlayer(ctx, cs, idx, color, isMe) {
  const pData = _players[idx];
  if (!pData) return;

  const dp = _displayPlayers[idx];
  if (!dp) return;

  const px = dp.x * cs + cs / 2;
  const py = dp.y * cs + cs / 2;
  const radius = cs * 0.35;

  ctx.save();

  // Phased effect
  if (pData.phased) {
    ctx.globalAlpha = 0.4;
  }

  // Glow ring
  ctx.shadowBlur = isMe ? 8 : 6;
  ctx.shadowColor = color;

  // Draw photo avatar or colored circle
  if (isMe && _avatarLoaded && _avatarImg) {
    // Clip to circle and draw image
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.drawImage(_avatarImg, px - radius, py - radius, radius * 2, radius * 2);
    ctx.restore();

    // Ring outline
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Colored circle
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // First letter of name
    const names = _ctx ? _ctx.names : ['?', '?'];
    const name = names[idx] || '?';
    const letter = name.charAt(0).toUpperCase();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${cs * 0.35}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, px, py);
  }

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Frozen overlay
  if (pData.frozen) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.arc(px, py, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Snowflake emoji above
    ctx.font = `${cs * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('\u2744\uFE0F', px, py - radius - 2);
  }

  ctx.restore();
}

function updateDisplayPositions() {
  for (let i = 0; i < 2; i++) {
    const p = _players[i];
    if (!p) continue;
    if (!_displayInited) {
      _displayPlayers[i].x = p.x;
      _displayPlayers[i].y = p.y;
    } else {
      _displayPlayers[i].x = lerp(_displayPlayers[i].x, p.x, LERP_FACTOR);
      _displayPlayers[i].y = lerp(_displayPlayers[i].y, p.y, LERP_FACTOR);
    }
  }
  _displayInited = true;
}

function updateInventoryButton() {
  if (!_inventoryBtn || !_ctx) return;
  const me = _players[mySeatIndex()];
  if (!me || !me.inventory) {
    _inventoryBtn.classList.remove('visible');
    return;
  }

  const inv = me.inventory;
  if (inv === 'glue' || inv === 'dynamite') {
    _inventoryBtn.classList.add('visible');
    _inventoryBtn.textContent = inv === 'glue' ? '\uD83E\uDEE4' : '\uD83E\uDDE8';
  } else {
    _inventoryBtn.classList.remove('visible');
  }
}

// ── Render loop ──

function startRenderLoop() {
  const loop = () => {
    if (_destroyed) return;
    renderFrame();
    _animFrame = requestAnimationFrame(loop);
  };
  _animFrame = requestAnimationFrame(loop);
}

// ── Input handling ──

function sendMove(dir) {
  if (_destroyed || !_ctx) return;
  _lastMoveDir = dir;
  _ctx.ws.send({ type: 'move', dir });
}

function setupSwipeInput() {
  _canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    _touchStartX = t.clientX;
    _touchStartY = t.clientY;
  }, { passive: false });

  _canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (_destroyed) return;
    if (!e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _touchStartX;
    const dy = t.clientY - _touchStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      sendMove(dx > 0 ? 'right' : 'left');
    } else {
      sendMove(dy > 0 ? 'down' : 'up');
    }
  }, { passive: false });
}

function buildDpad() {
  _dpadEl = document.createElement('div');
  _dpadEl.className = 'dpad';

  const dirs = [
    { dir: 'up',    label: '\u25B2', area: 'up' },
    { dir: 'left',  label: '\u25B6', area: 'left' },   // RTL: ▶ for left
    { dir: 'right', label: '\u25C0', area: 'right' },  // RTL: ◀ for right
    { dir: 'down',  label: '\u25BC', area: 'down' },
  ];

  for (const d of dirs) {
    const btn = document.createElement('button');
    btn.textContent = d.label;
    btn.setAttribute('data-dir', d.area);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (_destroyed) return;
      sendMove(d.dir);
    });
    _dpadEl.appendChild(btn);
  }

  return _dpadEl;
}

function buildInventoryButton() {
  _inventoryBtn = document.createElement('button');
  _inventoryBtn.className = 'inventory-btn';
  _inventoryBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (_destroyed || !_ctx) return;
    const me = _players[mySeatIndex()];
    if (!me || !me.inventory) return;

    if (me.inventory === 'glue') {
      _ctx.ws.send({ type: 'place_trap' });
    } else if (me.inventory === 'dynamite') {
      _ctx.ws.send({ type: 'use_dynamite', dir: _lastMoveDir });
      boomSound();
    }
  });
  return _inventoryBtn;
}

// ── init / destroy ──

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _frameCount = 0;
  _displayInited = false;
  _displayPlayers = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  _prevGhostPos = [];
  _shrinkFlashFrames = 0;
  _shakeFrames = 0;
  _lastMoveDir = 'right';
  _avatarImg = null;
  _avatarLoaded = false;
  _audioCtx = null;

  // Hide turn text (not applicable)
  ctx.turnText.style.display = 'none';

  // Initial state from server
  if (ctx.state) {
    _maze = ctx.state.maze || [];
    _players = ctx.state.players || [];
    _ghosts = ctx.state.ghosts || [];
    _items = ctx.state.items || [];
    _shrinkLevel = ctx.state.shrinkLevel || 0;
  }

  // Init display positions from server state
  for (let i = 0; i < 2; i++) {
    if (_players[i]) {
      _displayPlayers[i] = { x: _players[i].x, y: _players[i].y };
    }
  }

  // Load photo avatar
  loadAvatar();

  // ── Build DOM ──
  _wrapEl = document.createElement('div');
  _wrapEl.className = 'arcade-canvas-wrap';

  // Canvas: square, DPR-aware
  const containerWidth = ctx.area.getBoundingClientRect().width || 360;
  const canvasSize = Math.min(containerWidth, 400);

  _canvas = document.createElement('canvas');
  _canvas.style.width = canvasSize + 'px';
  _canvas.style.height = canvasSize + 'px';
  _canvas.style.touchAction = 'none';

  const dpr = window.devicePixelRatio || 1;
  _canvas.width = Math.round(canvasSize * dpr);
  _canvas.height = Math.round(canvasSize * dpr);
  _canvasCtx = _canvas.getContext('2d');
  _canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  _wrapEl.appendChild(_canvas);

  // Inventory button (positioned inside wrap)
  _wrapEl.appendChild(buildInventoryButton());

  ctx.area.appendChild(_wrapEl);

  // D-pad below canvas
  ctx.area.appendChild(buildDpad());

  // Swipe input on canvas
  setupSwipeInput();

  // Start render loop
  startRenderLoop();

  // ── Server message subscriptions ──

  // Main state updates (20fps)
  _unsubs.push(ctx.ws.on('maze_state', (msg) => {
    if (_destroyed) return;
    _players = msg.players || [];
    _ghosts = msg.ghosts || [];
    _items = msg.items || [];
    _traps = msg.traps || [];
    _elapsed = msg.elapsed || 0;
  }));

  // Maze shrink
  _unsubs.push(ctx.ws.on('maze_shrink', (msg) => {
    if (_destroyed) return;
    _shrinkLevel = msg.level;

    // Set outer ring cells to wall
    const ring = _shrinkLevel - 1;
    for (let i = 0; i < MAZE_SIZE; i++) {
      if (_maze[ring]) _maze[ring][i] = 1;                     // top row
      if (_maze[MAZE_SIZE - 1 - ring]) _maze[MAZE_SIZE - 1 - ring][i] = 1; // bottom row
      if (_maze[i]) {
        _maze[i][ring] = 1;                                    // left col
        _maze[i][MAZE_SIZE - 1 - ring] = 1;                    // right col
      }
    }

    // Visual effects
    _shrinkFlashFrames = 15;
    _shakeFrames = 10;
    vibrate('move');
    try { navigator.vibrate([30, 20, 30]); } catch (_e) { /* ignore */ }
    boomSound();
  }));

  // Ghost caught a player
  _unsubs.push(ctx.ws.on('maze_caught', (msg) => {
    if (_destroyed) return;
    spookySound();
    try { navigator.vibrate([100, 50, 100]); } catch (_e) { /* ignore */ }
  }));

  // Player frozen
  _unsubs.push(ctx.ws.on('maze_frozen', (msg) => {
    if (_destroyed) return;
    freezeSound();
    if (msg.seat === _ctx.seat) {
      try { navigator.vibrate(200); } catch (_e) { /* ignore */ }
    }
  }));

  // Item picked up
  _unsubs.push(ctx.ws.on('maze_item', (msg) => {
    if (_destroyed) return;
    dingSound();
    if (msg.seat === _ctx.seat) {
      vibrate('tap');
    }
  }));

  // Wall destroyed by dynamite
  _unsubs.push(ctx.ws.on('maze_wall_destroyed', (msg) => {
    if (_destroyed) return;
    if (_maze[msg.y]) {
      _maze[msg.y][msg.x] = 0;
    }
    boomSound();
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

  _canvas = null;
  _canvasCtx = null;
  _wrapEl = null;
  _dpadEl = null;
  _inventoryBtn = null;
  _avatarImg = null;
  _ctx = null;
}

export default { init, destroy };
