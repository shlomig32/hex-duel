let _ctx = null;

function getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

function play(freq, duration = 0.1, type = 'sine', vol = 0.15) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function countdownBeep() {
  play(660, 0.12, 'sine', 0.2);
}

export function gameStart() {
  const ctx = getCtx();
  if (!ctx) return;
  [523, 659, 784].forEach((freq, i) => {
    setTimeout(() => play(freq, 0.15, 'sine', 0.2), i * 80);
  });
}

export function moveClick() {
  play(880, 0.06, 'sine', 0.1);
}

export function tapSound() {
  play(1000, 0.05, 'square', 0.08);
}

export function pingSound() {
  play(1200, 0.08, 'sine', 0.12);
}

export function winFanfare() {
  const ctx = getCtx();
  if (!ctx) return;
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => play(freq, 0.2, 'sine', 0.2), i * 120);
  });
}

export function loseTone() {
  play(220, 0.4, 'sawtooth', 0.1);
}

export function errorSound() {
  play(200, 0.15, 'square', 0.1);
}

export function buttonClick() {
  play(600, 0.04, 'sine', 0.06);
}
