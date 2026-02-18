// Scream Battle - tug-of-war powered by microphone volume
// Meter starts at 50. Player 1 pushes toward 100, Player 2 toward 0.
// Win by pushing to edge or having advantage when time runs out.

const DURATION = 15; // seconds
const TICK_MS = 50;  // physics tick
const PUSH_RATE = 0.8;  // how fast meter moves per volume difference
const DECAY_RATE = 0.3; // meter drifts back to center when silent
const WIN_THRESHOLD = 100;

module.exports = {
  init(room) {
    room.gameState = {
      meterPosition: 50, // 0-100
      volumes: { 1: 0, 2: 0 },
      timeLeft: DURATION,
      winner: null,
      active: false,
    };
  },

  start(room, broadcast) {
    const gs = room.gameState;
    gs.active = true;

    // Physics tick
    room.timers.physicsTick = setInterval(() => {
      if (!gs.active) return;

      const vol1 = gs.volumes[1] / 100; // normalize 0-1
      const vol2 = gs.volumes[2] / 100;

      // Player 1 pushes toward 100, Player 2 pushes toward 0
      const push = (vol1 - vol2) * PUSH_RATE;

      // Decay toward center when both are quiet
      let decay = 0;
      if (gs.volumes[1] < 5 && gs.volumes[2] < 5) {
        const dist = gs.meterPosition - 50;
        decay = -Math.sign(dist) * DECAY_RATE;
      }

      gs.meterPosition = Math.max(0, Math.min(WIN_THRESHOLD, gs.meterPosition + push + decay));

      // Instant win
      if (gs.meterPosition >= WIN_THRESHOLD) {
        this._endGame(room, 1, broadcast);
      } else if (gs.meterPosition <= 0) {
        this._endGame(room, 2, broadcast);
      }
    }, TICK_MS);

    // Broadcast state at ~20fps
    room.timers.syncTimer = setInterval(() => {
      if (!gs.active) return;
      broadcast({
        type: 'scream_state',
        meterPosition: gs.meterPosition,
        volumes: { ...gs.volumes },
        timeLeft: gs.timeLeft,
      });
    }, TICK_MS);

    // Game timer
    room.timers.gameTimer = setInterval(() => {
      gs.timeLeft--;
      if (gs.timeLeft <= 0) {
        this._timeUp(room, broadcast);
      }
    }, 1000);
  },

  handleMessage(room, seat, msg, broadcast) {
    if (msg.type === 'volume') {
      const gs = room.gameState;
      if (!gs.active) return;
      gs.volumes[seat] = Math.max(0, Math.min(100, msg.level || 0));
    }
  },

  _endGame(room, winner, broadcast) {
    const gs = room.gameState;
    gs.active = false;
    gs.winner = winner;
    room.phase = 'ended';
    this._stopTimers(room);

    broadcast({
      type: 'scream_state',
      meterPosition: gs.meterPosition,
      volumes: { ...gs.volumes },
      timeLeft: gs.timeLeft,
    });

    setTimeout(() => {
      broadcast({ type: 'gameover', winner });
    }, 1500);
  },

  _timeUp(room, broadcast) {
    const gs = room.gameState;
    // Whoever pushed meter further to their side
    const winner = gs.meterPosition >= 50 ? 1 : 2;
    this._endGame(room, winner, broadcast);
  },

  _stopTimers(room) {
    if (room.timers.physicsTick) clearInterval(room.timers.physicsTick);
    if (room.timers.syncTimer) clearInterval(room.timers.syncTimer);
    if (room.timers.gameTimer) clearInterval(room.timers.gameTimer);
  },

  getState(room) {
    const gs = room.gameState;
    return {
      meterPosition: gs.meterPosition,
      volumes: { ...gs.volumes },
      timeLeft: gs.timeLeft,
    };
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  dispose(room) {
    this._stopTimers(room);
    room.timers = {};
  },
};
