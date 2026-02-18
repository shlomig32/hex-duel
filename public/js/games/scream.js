import { el } from '../lib/dom.js';
import { vibrate } from '../lib/haptics.js';

let _ctx = null;
let _destroyed = false;
let _unsubs = [];

// Mic
let _audioCtx = null;
let _analyser = null;
let _micStream = null;
let _sendInterval = null;

// DOM
let _meterFillMine = null;
let _meterFillOpp = null;
let _meterIndicator = null;
let _myHalf = null;
let _oppHalf = null;
let _instructionEl = null;
let _volumeBars = [];

// State
let _meterPosition = 50;

function getVolume() {
  if (!_analyser) return 0;
  const data = new Uint8Array(_analyser.fftSize);
  _analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.min(100, rms * 300); // scale to 0-100
}

async function startMic() {
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = _audioCtx.createMediaStreamSource(_micStream);
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 512;
    source.connect(_analyser);

    // Send volume to server at ~20fps
    _sendInterval = setInterval(() => {
      if (_destroyed) return;
      const vol = getVolume();
      _ctx.ws.send({ type: 'volume', level: vol });
      updateVolumeBars(vol);

      // Glow effect when loud
      if (_myHalf && vol > 40) {
        const intensity = (vol - 40) / 60;
        _myHalf.style.boxShadow = `inset 0 0 ${20 + intensity * 40}px rgba(16, 185, 129, ${0.1 + intensity * 0.25})`;
      } else if (_myHalf) {
        _myHalf.style.boxShadow = 'none';
      }
    }, 50);

    if (_instructionEl) {
      _instructionEl.textContent = '!\u05E6\u05E2\u05E7';
      _instructionEl.style.color = '#10B981';
    }
  } catch (e) {
    if (_instructionEl) {
      _instructionEl.textContent = '\u26A0\uFE0F \u05E0\u05D3\u05E8\u05E9\u05EA \u05D4\u05E8\u05E9\u05D0\u05EA \u05DE\u05D9\u05E7\u05E8\u05D5\u05E4\u05D5\u05DF';
      _instructionEl.style.color = '#EF4444';
    }
  }
}

function updateVolumeBars(volume) {
  for (let i = 0; i < _volumeBars.length; i++) {
    const threshold = (i / _volumeBars.length) * 100;
    const height = volume > threshold ? 6 + (volume - threshold) * 0.7 : 6;
    _volumeBars[i].style.height = Math.min(70, height) + 'px';

    if (volume > threshold) {
      if (i > _volumeBars.length * 0.7) {
        _volumeBars[i].style.background = '#EF4444';
      } else if (i > _volumeBars.length * 0.4) {
        _volumeBars[i].style.background = '#FBBF24';
      } else {
        _volumeBars[i].style.background = '#10B981';
      }
    } else {
      _volumeBars[i].style.background = '#2A2D50';
    }
  }
}

function updateMeter() {
  if (_destroyed) return;
  const mySeat = _ctx.seat;

  let myPct, oppPct;
  if (mySeat === 1) {
    myPct = _meterPosition;
    oppPct = 100 - _meterPosition;
  } else {
    myPct = 100 - _meterPosition;
    oppPct = _meterPosition;
  }

  if (_meterFillMine) _meterFillMine.style.width = myPct + '%';
  if (_meterFillOpp) _meterFillOpp.style.width = oppPct + '%';
  if (_meterIndicator) _meterIndicator.style.left = _meterPosition + '%';

  // Danger/winning effects
  if (_myHalf) {
    _myHalf.classList.toggle('scream-danger', myPct < 25);
  }
  if (_oppHalf) {
    _oppHalf.classList.toggle('scream-danger', oppPct < 25);
  }
}

export function init(ctx) {
  _ctx = ctx;
  _destroyed = false;
  _meterPosition = 50;
  _volumeBars = [];

  // Hide turn indicator
  ctx.turnText.style.display = 'none';

  // Opponent half (top)
  const oppName = el('div', { className: 'scream-label' }, [ctx.names?.[ctx.seat === 1 ? 1 : 0] || '\u05D9\u05E8\u05D9\u05D1']);
  const oppEmoji = el('div', { className: 'scream-emoji' }, ['\uD83C\uDFA4']);
  _oppHalf = el('div', { className: 'scream-half scream-half--opp' }, [oppName, oppEmoji]);

  // Meter
  _meterFillOpp = el('div', { className: 'scream-meter-fill scream-meter-fill--opp' });
  _meterFillMine = el('div', { className: 'scream-meter-fill scream-meter-fill--mine' });
  _meterIndicator = el('div', { className: 'scream-meter-indicator' });
  const meter = el('div', { className: 'scream-meter' }, [_meterFillOpp, _meterFillMine, _meterIndicator]);

  // My half (bottom) with volume bars
  const barsContainer = el('div', { className: 'scream-volume-bars' });
  for (let i = 0; i < 20; i++) {
    const bar = el('div', { className: 'scream-volume-bar' });
    barsContainer.appendChild(bar);
    _volumeBars.push(bar);
  }

  _instructionEl = el('div', { className: 'scream-instruction' }, ['...\u05DE\u05EA\u05D7\u05D1\u05E8 \u05DC\u05DE\u05D9\u05E7\u05E8\u05D5\u05E4\u05D5\u05DF']);
  const myName = el('div', { className: 'scream-label' }, [ctx.names?.[ctx.seat === 1 ? 0 : 1] || '\u05D0\u05EA\u05D4']);
  _myHalf = el('div', { className: 'scream-half scream-half--mine' }, [myName, barsContainer, _instructionEl]);

  // Layout
  const layout = el('div', { className: 'scream-layout' }, [_oppHalf, meter, _myHalf]);
  ctx.area.appendChild(layout);
  ctx.area.style.padding = '0';

  updateMeter();
  startMic();

  // Server state updates
  _unsubs.push(ctx.ws.on('scream_state', (msg) => {
    if (_destroyed) return;
    _meterPosition = msg.meterPosition;
    if (msg.timeLeft !== undefined) {
      ctx.timerEl.textContent = msg.timeLeft;
      ctx.timerEl.className = 'timer' + (msg.timeLeft <= 5 ? ' urgent' : '');
    }
    updateMeter();
  }));
}

export function destroy() {
  _destroyed = true;
  if (_sendInterval) clearInterval(_sendInterval);
  if (_micStream) {
    _micStream.getTracks().forEach(t => t.stop());
    _micStream = null;
  }
  if (_audioCtx) {
    _audioCtx.close().catch(() => {});
    _audioCtx = null;
  }
  _analyser = null;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
