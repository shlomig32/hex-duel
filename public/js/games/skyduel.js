import { vibrate } from '../lib/haptics.js';
import { getPhotoAvatar } from '../lib/photo-avatar.js';

// ── Module-level state ──────────────────────────────────────────────────
let _destroyed = false;
let _unsubs = [];
let _ctx = null;

let _canvas = null;
let _canvasCtx = null;
let _animFrame = 0;

// Input
let _isDragging = false;
let _lastSendTime = 0;

// Game state from server
let _players = []; // [{x, hp, shield, activeWeapon, reversed}]
let _bullets = [];
let _mines = [];
let _powerups = [];
let _elapsed = 0;
const TIME_LIMIT = 40;

// Visual effects
let _hitFlashFrames = 0;   // remaining frames of red flash
let _shakeFrames = 0;      // remaining frames of screen shake
let _shakeOffsetX = 0;
let _shakeOffsetY = 0;

// Death explosion particles: { x, y, vx, vy, life, color }
let _explosionParticles = [];

// Clouds for parallax background: { x, y, w, h, speed }
let _clouds = [];

// Bullet trails: Map<bulletIndex, prevPositions[]>
let _bulletTrails = new Map();

// Boomerang rotation angles
let _boomerangAngles = new Map();

// Photo avatars
let _myPhotoImg = null;
let _oppPhotoImg = null;

// ── Audio (inline Web Audio API) ────────────────────────────────────────
let _audioCtx;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

function pewSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = 800;
  osc.type = 'square';
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.start(); osc.stop(ctx.currentTime + 0.05);
}

function boomSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.start(); osc.stop(ctx.currentTime + 0.2);
}

function pickupSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.1);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(); osc.stop(ctx.currentTime + 0.15);
}

// ── Clouds initialisation ───────────────────────────────────────────────
function initClouds() {
  _clouds = [
    { x: 15,  y: 12, w: 28, h: 8,  speed: 0.015 },
    { x: 55,  y: 30, w: 22, h: 6,  speed: 0.025 },
    { x: 80,  y: 55, w: 30, h: 9,  speed: 0.010 },
    { x: 35,  y: 75, w: 20, h: 5,  speed: 0.020 },
  ];
}

// ── Coordinate helpers ──────────────────────────────────────────────────
let _flipped = false;

function toX(x, w) { return (x / 100) * w; }
function toY(y, h) {
  const mapped = _flipped ? (100 - y) : y;
  return (mapped / 100) * h;
}

// ── Input ───────────────────────────────────────────────────────────────
function setupInput() {
  const getXPercent = (e) => {
    const rect = _canvas.getBoundingClientRect();
    const clientX = e.touches ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const trySend = (x) => {
    const now = performance.now();
    // Throttle to 20/sec (50ms)
    if (now - _lastSendTime < 50) return;
    _lastSendTime = now;
    if (_ctx && _ctx.ws) {
      _ctx.ws.send({ type: 'move', x });
    }
  };

  _canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _isDragging = true;
    trySend(getXPercent(e));
  }, { passive: false });

  _canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (_isDragging) trySend(getXPercent(e));
  }, { passive: false });

  _canvas.addEventListener('touchend', () => { _isDragging = false; });

  _canvas.addEventListener('mousedown', (e) => {
    _isDragging = true;
    trySend(getXPercent(e));
  });

  _canvas.addEventListener('mousemove', (e) => {
    if (_isDragging) trySend(getXPercent(e));
  });

  _canvas.addEventListener('mouseup', () => { _isDragging = false; });
  _canvas.addEventListener('mouseleave', () => { _isDragging = false; });
}

// ── Photo avatar loading ────────────────────────────────────────────────
function loadPhotoImage(base64) {
  if (!base64) return null;
  const img = new Image();
  img.src = base64;
  return img;
}

// ── Render helpers ──────────────────────────────────────────────────────

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#1a1a4e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawClouds(ctx, w, h) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (const c of _clouds) {
    // Update position (parallax scroll)
    c.x += c.speed;
    if (c.x > 110) c.x = -30;

    const cx = (c.x / 100) * w;
    const cy = (c.y / 100) * h;
    const cw = (c.w / 100) * w;
    const ch = (c.h / 100) * h;

    // Draw cloud as overlapping ellipses
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, ch / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - cw * 0.25, cy + ch * 0.1, cw * 0.3, ch * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + cw * 0.25, cy + ch * 0.15, cw * 0.35, ch * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlane(ctx, px, py, w, h, color, isMe, seat, name, photoImg) {
  const planeW = (8 / 100) * w;
  const planeH = planeW * 1.2;

  // Determine if this plane points up or down on screen
  // My plane always at bottom, pointing up; opponent at top, pointing down
  const pointsUp = isMe;

  // Hit flash: override color
  let drawColor = color;
  if (isMe && _hitFlashFrames > 0) {
    drawColor = '#FF0000';
  }

  // Shake offset (only for my plane)
  let sx = 0, sy = 0;
  if (isMe && _shakeFrames > 0) {
    sx = _shakeOffsetX;
    sy = _shakeOffsetY;
  }

  const cx = px + sx;
  const cy = py + sy;

  // Glow
  ctx.shadowColor = drawColor;
  ctx.shadowBlur = 10;

  // Triangle
  ctx.beginPath();
  if (pointsUp) {
    ctx.moveTo(cx, cy - planeH / 2);            // tip (top)
    ctx.lineTo(cx - planeW / 2, cy + planeH / 2); // bottom-left
    ctx.lineTo(cx + planeW / 2, cy + planeH / 2); // bottom-right
  } else {
    ctx.moveTo(cx, cy + planeH / 2);            // tip (bottom)
    ctx.lineTo(cx - planeW / 2, cy - planeH / 2); // top-left
    ctx.lineTo(cx + planeW / 2, cy - planeH / 2); // top-right
  }
  ctx.closePath();
  ctx.fillStyle = drawColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Avatar circle at plane center
  const avatarR = 12;
  if (photoImg && photoImg.complete && photoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photoImg, cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2);
    ctx.restore();
  } else {
    // Colored circle with first letter
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
    ctx.fillStyle = drawColor;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = (name && name.length > 0) ? name[0].toUpperCase() : '?';
    ctx.fillText(letter, cx, cy);
  }
}

function drawShield(ctx, px, py, w) {
  const radius = (8 / 100) * w;
  const pulse = 0.3 + 0.3 * Math.abs(Math.sin(performance.now() * 0.004));
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(59, 130, 246, ${pulse})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = `rgba(59, 130, 246, ${pulse * 0.3})`;
  ctx.fill();
}

function drawBullet(ctx, bx, by, bullet, w, h, frameCounter) {
  const ownerColor = bullet.owner === 0 ? '#06B6D4' : '#EC4899';
  const bulletKey = `${bullet.x.toFixed(2)},${bullet.y.toFixed(2)},${bullet.type},${bullet.owner}`;

  if (bullet.type === 'homing') {
    // Larger circle with trail
    const trail = _bulletTrails.get(bulletKey) || [];
    trail.push({ x: bx, y: by });
    if (trail.length > 3) trail.shift();
    _bulletTrails.set(bulletKey, trail);

    // Draw trail
    for (let i = 0; i < trail.length - 1; i++) {
      const alpha = (i + 1) / trail.length * 0.5;
      const r = (1.5 - i * 0.3) * (w / 100);
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fillStyle = ownerColor.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', '');
      // Use hex with alpha workaround
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ownerColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Main bullet
    const mainR = (2 / 100) * w;
    ctx.beginPath();
    ctx.arc(bx, by, mainR, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor;
    ctx.fill();
  } else if (bullet.type === 'boomerang') {
    // Spinning crescent with trail
    const trail = _bulletTrails.get(bulletKey) || [];
    trail.push({ x: bx, y: by });
    if (trail.length > 3) trail.shift();
    _bulletTrails.set(bulletKey, trail);

    // Draw trail
    for (let i = 0; i < trail.length - 1; i++) {
      ctx.globalAlpha = (i + 1) / trail.length * 0.4;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, (1 / 100) * w, 0, Math.PI * 2);
      ctx.fillStyle = ownerColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Spinning crescent
    let angle = _boomerangAngles.get(bulletKey) || 0;
    angle += 0.25;
    _boomerangAngles.set(bulletKey, angle);

    const boomR = (2.5 / 100) * w;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, boomR, 0, Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ownerColor;
    ctx.stroke();
    ctx.restore();
  } else {
    // Normal bullet: small circle
    const mainR = (1.5 / 100) * w;
    ctx.beginPath();
    ctx.arc(bx, by, mainR, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor;
    ctx.fill();

    // Thin trail line
    const trail = _bulletTrails.get(bulletKey) || [];
    if (trail.length > 0) {
      const prev = trail[trail.length - 1];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = ownerColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    trail.push({ x: bx, y: by });
    if (trail.length > 2) trail.shift();
    _bulletTrails.set(bulletKey, trail);
  }
}

function drawMine(ctx, mx, my, w) {
  const radius = (3 / 100) * w;
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() * 0.005));

  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.5})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('\uD83D\uDCA3', mx, my);
}

function drawPowerup(ctx, px, py, type, w) {
  const icons = {
    split: '\uD83D\uDD31',
    homing: '\uD83C\uDFAF',
    mine: '\uD83D\uDCA3',
    shield: '\uD83D\uDEE1\uFE0F',
    boomerang: '\uD83E\uDE83',
    reverse: '\uD83C\uDF2A\uFE0F',
  };
  const colors = {
    split: '#A855F7',
    homing: '#F59E0B',
    mine: '#EF4444',
    shield: '#3B82F6',
    boomerang: '#10B981',
    reverse: '#EC4899',
  };

  const icon = icons[type] || '?';
  const color = colors[type] || '#FFFFFF';
  const boxW = (6 / 100) * w;

  // Gentle float
  const floatOff = Math.sin(performance.now() * 0.003 + px) * ((2 / 100) * w);
  const drawY = py + floatOff;

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  // Rounded rect background
  const r = boxW * 0.3;
  const x = px - boxW / 2;
  const y = drawY - boxW / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + boxW - r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + r, r);
  ctx.lineTo(x + boxW, y + boxW - r);
  ctx.arcTo(x + boxW, y + boxW, x + boxW - r, y + boxW, r);
  ctx.lineTo(x + r, y + boxW);
  ctx.arcTo(x, y + boxW, x, y + boxW - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Emoji icon
  ctx.font = `${Math.round(boxW * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, px, drawY);
}

function drawHUD(ctx, w, h) {
  if (!_players.length) return;

  const mySeat = _ctx.seat;
  const oppSeat = mySeat === 1 ? 2 : 1;
  const myP = _players[mySeat - 1];
  const oppP = _players[oppSeat - 1];

  if (!myP || !oppP) return;

  const myHp = myP.hp ?? 0;
  const oppHp = oppP.hp ?? 0;
  const maxHp = 3; // assumed max HP

  // My HP (top-left)
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let hpStr = '';
  for (let i = 0; i < maxHp; i++) {
    hpStr += i < myHp ? '\u2764\uFE0F' : '\uD83D\uDDA4';
  }
  ctx.fillText(hpStr, 8, 8);

  // Opponent HP (top-right)
  ctx.textAlign = 'right';
  let oppHpStr = '';
  for (let i = 0; i < maxHp; i++) {
    oppHpStr += i < oppHp ? '\u2764\uFE0F' : '\uD83D\uDDA4';
  }
  ctx.fillText(oppHpStr, w - 8, 8);

  // Active weapon icon (bottom-center)
  const activeWeapon = myP.activeWeapon;
  if (activeWeapon) {
    const weaponIcons = {
      split: '\uD83D\uDD31',
      homing: '\uD83C\uDFAF',
      mine: '\uD83D\uDCA3',
      shield: '\uD83D\uDEE1\uFE0F',
      boomerang: '\uD83E\uDE83',
      reverse: '\uD83C\uDF2A\uFE0F',
    };
    const weaponColors = {
      split: '#A855F7',
      homing: '#F59E0B',
      mine: '#EF4444',
      shield: '#3B82F6',
      boomerang: '#10B981',
      reverse: '#EC4899',
    };
    const wIcon = weaponIcons[activeWeapon] || '?';
    const wColor = weaponColors[activeWeapon] || '#FFFFFF';

    ctx.shadowColor = wColor;
    ctx.shadowBlur = 8;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(wIcon, w / 2, h - 10);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}

function drawExplosions(ctx, w, h) {
  for (let i = _explosionParticles.length - 1; i >= 0; i--) {
    const p = _explosionParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    if (p.life <= 0) {
      _explosionParticles.splice(i, 1);
      continue;
    }

    const alpha = p.life / 30;
    const radius = (1 + (30 - p.life) * 0.1) * (w / 400);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function spawnExplosion(px, py, color) {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    _explosionParticles.push({
      x: px,
      y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30,
      color: color,
    });
  }
}

// ── Render frame ────────────────────────────────────────────────────────
let _frameCounter = 0;

function renderFrame() {
  if (_destroyed || !_canvas || !_canvasCtx) return;

  const ctx = _canvasCtx;
  const dpr = window.devicePixelRatio || 1;
  const rect = _canvas.getBoundingClientRect();

  if (_canvas.width !== Math.round(rect.width * dpr) || _canvas.height !== Math.round(rect.height * dpr)) {
    _canvas.width = Math.round(rect.width * dpr);
    _canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const w = rect.width;
  const h = rect.height;

  _frameCounter++;

  // Update shake
  if (_shakeFrames > 0) {
    _shakeFrames--;
    _shakeOffsetX = (Math.random() - 0.5) * 6;
    _shakeOffsetY = (Math.random() - 0.5) * 6;
  } else {
    _shakeOffsetX = 0;
    _shakeOffsetY = 0;
  }

  // Update hit flash
  if (_hitFlashFrames > 0) _hitFlashFrames--;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background
  drawBackground(ctx, w, h);
  drawClouds(ctx, w, h);

  // Powerups
  for (const pu of _powerups) {
    const px = toX(pu.x, w);
    const py = toY(pu.y, h);
    drawPowerup(ctx, px, py, pu.type, w);
  }

  // Mines
  for (const mine of _mines) {
    const mx = toX(mine.x, w);
    const my = toY(mine.y, h);
    drawMine(ctx, mx, my, w);
  }

  // Bullets
  for (const bullet of _bullets) {
    const bx = toX(bullet.x, w);
    const by = toY(bullet.y, h);
    drawBullet(ctx, bx, by, bullet, w, h, _frameCounter);
  }

  // Planes
  if (_players.length >= 2) {
    const mySeat = _ctx.seat;
    const oppSeat = mySeat === 1 ? 2 : 1;
    const myP = _players[mySeat - 1];
    const oppP = _players[oppSeat - 1];

    if (oppP) {
      const ox = toX(oppP.x, w);
      const oy = toY(oppSeat === 1 ? 85 : 15, h);
      if (oppP.shield) drawShield(ctx, ox, oy, w);
      drawPlane(ctx, ox, oy, w, h, '#EC4899', false, oppSeat, _ctx.names?.[oppSeat - 1] || '', _oppPhotoImg);
    }

    if (myP) {
      const mx = toX(myP.x, w);
      const my = toY(mySeat === 1 ? 85 : 15, h);
      if (myP.shield) drawShield(ctx, mx, my, w);
      drawPlane(ctx, mx, my, w, h, '#06B6D4', true, mySeat, _ctx.names?.[mySeat - 1] || '', _myPhotoImg);
    }
  }

  // Explosions
  drawExplosions(ctx, w, h);

  // HUD (on canvas)
  drawHUD(ctx, w, h);

  // Timer
  if (_ctx && _ctx.timerEl) {
    const remaining = Math.max(0, TIME_LIMIT - Math.floor(_elapsed));
    _ctx.timerEl.textContent = String(remaining);
    _ctx.timerEl.className = 'timer' + (remaining <= 10 ? ' urgent' : '');
  }
}

function startRenderLoop() {
  const loop = () => {
    if (_destroyed) return;
    renderFrame();
    _animFrame = requestAnimationFrame(loop);
  };
  _animFrame = requestAnimationFrame(loop);
}

// ── Lifecycle ───────────────────────────────────────────────────────────

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _unsubs = [];
  _hitFlashFrames = 0;
  _shakeFrames = 0;
  _shakeOffsetX = 0;
  _shakeOffsetY = 0;
  _explosionParticles = [];
  _bulletTrails = new Map();
  _boomerangAngles = new Map();
  _isDragging = false;
  _lastSendTime = 0;
  _frameCounter = 0;

  _flipped = ctx.seat === 2;

  // Hide turn indicator (not used)
  ctx.turnText.style.display = 'none';

  // Load initial state
  if (ctx.state) {
    _players = ctx.state.players || [];
    _bullets = ctx.state.bullets || [];
    _mines = ctx.state.mines || [];
    _powerups = ctx.state.powerups || [];
    _elapsed = ctx.state.elapsed || 0;
  }

  // Load photo avatar
  const photoBase64 = getPhotoAvatar();
  _myPhotoImg = loadPhotoImage(photoBase64);
  _oppPhotoImg = null; // opponent photo not available client-side

  // Container
  const container = document.createElement('div');
  container.className = 'arcade-canvas-wrap';

  _canvas = document.createElement('canvas');
  _canvas.style.touchAction = 'none';
  _canvas.style.height = '400px';
  _canvasCtx = _canvas.getContext('2d');
  container.appendChild(_canvas);

  ctx.area.appendChild(container);
  ctx.area.style.flexDirection = 'column';

  // Init clouds
  initClouds();

  // Input
  setupInput();

  // Start render loop
  startRenderLoop();

  // Listen for server state updates (20fps)
  _unsubs.push(ctx.ws.on('sky_state', (msg) => {
    if (_destroyed) return;
    _players = msg.players || [];
    _bullets = msg.bullets || [];
    _mines = msg.mines || [];
    _powerups = msg.powerups || [];
    _elapsed = msg.elapsed || 0;
  }));

  // Hit event
  _unsubs.push(ctx.ws.on('sky_hit', (msg) => {
    if (_destroyed) return;
    const mySeat = _ctx.seat;

    if (msg.seat === mySeat) {
      // I got hit
      _hitFlashFrames = 10;
      _shakeFrames = 10;
      vibrate('error');
      pewSound();

      // Check for death
      if (msg.hp <= 0) {
        // Spawn explosion at my plane position
        const myP = _players[mySeat - 1];
        if (myP && _canvas) {
          const rect = _canvas.getBoundingClientRect();
          const px = toX(myP.x, rect.width);
          const py = toY(mySeat === 1 ? 85 : 15, rect.height);
          spawnExplosion(px, py, '#06B6D4');
          boomSound();
        }
      }
    } else {
      // Opponent got hit
      pewSound();

      if (msg.hp <= 0) {
        const oppSeat = mySeat === 1 ? 2 : 1;
        const oppP = _players[oppSeat - 1];
        if (oppP && _canvas) {
          const rect = _canvas.getBoundingClientRect();
          const px = toX(oppP.x, rect.width);
          const py = toY(oppSeat === 1 ? 85 : 15, rect.height);
          spawnExplosion(px, py, '#EC4899');
          boomSound();
        }
      }
    }
  }));

  // Pickup event
  _unsubs.push(ctx.ws.on('sky_pickup', (msg) => {
    if (_destroyed) return;
    pickupSound();
    if (msg.seat === _ctx.seat) {
      vibrate('tap');
    }
  }));

  // Mine explosion event
  _unsubs.push(ctx.ws.on('sky_mine_explode', (msg) => {
    if (_destroyed) return;
    if (_canvas) {
      const rect = _canvas.getBoundingClientRect();
      const px = toX(msg.x, rect.width);
      const py = toY(msg.y, rect.height);
      spawnExplosion(px, py, '#EF4444');
      boomSound();
    }
  }));
}

export function destroy() {
  _destroyed = true;
  if (_animFrame) cancelAnimationFrame(_animFrame);
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
  _canvas = null;
  _canvasCtx = null;
  _myPhotoImg = null;
  _oppPhotoImg = null;
  _players = [];
  _bullets = [];
  _mines = [];
  _powerups = [];
  _explosionParticles = [];
  _bulletTrails = new Map();
  _boomerangAngles = new Map();
  _clouds = [];
  _ctx = null;
}

export default { init, destroy };
