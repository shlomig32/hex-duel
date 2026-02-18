// Tap Sprint - tap as fast as possible for 10 seconds

const DURATION = 10; // seconds

module.exports = {
  init(room) {
    room.gameState = {
      taps: { 1: 0, 2: 0 },
      timeLeft: DURATION,
      winner: null,
      active: false,
    };
  },

  start(room, broadcast) {
    const gs = room.gameState;
    gs.active = true;

    // Game timer - 1s ticks
    room.timers.gameTimer = setInterval(() => {
      gs.timeLeft--;
      broadcast({
        type: 'tapsprint_state',
        taps: { ...gs.taps },
        timeLeft: gs.timeLeft,
      });

      if (gs.timeLeft <= 0) {
        this._endGame(room, broadcast);
      }
    }, 1000);

    // Broadcast initial state
    broadcast({
      type: 'tapsprint_state',
      taps: { ...gs.taps },
      timeLeft: gs.timeLeft,
    });
  },

  handleMessage(room, seat, msg, broadcast) {
    const gs = room.gameState;
    if (msg.type === 'sprint_tap') {
      if (!gs.active) return;
      gs.taps[seat]++;
      broadcast({
        type: 'tapsprint_tap',
        seat,
        taps: { ...gs.taps },
      });
    }
  },

  _endGame(room, broadcast) {
    const gs = room.gameState;
    gs.active = false;
    this._stopTimers(room);
    room.phase = 'ended';

    const winner = gs.taps[1] > gs.taps[2] ? 1 :
                   gs.taps[2] > gs.taps[1] ? 2 : 0; // 0 = draw
    gs.winner = winner;

    broadcast({
      type: 'tapsprint_end',
      taps: { ...gs.taps },
      winner,
    });

    setTimeout(() => {
      broadcast({ type: 'gameover', winner: winner || 1 });
    }, 3000);
  },

  getState(room) {
    const gs = room.gameState;
    return {
      taps: { ...gs.taps },
      timeLeft: gs.timeLeft,
    };
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  _stopTimers(room) {
    if (room.timers.gameTimer) clearInterval(room.timers.gameTimer);
  },

  dispose(room) {
    this._stopTimers(room);
    room.timers = {};
  },
};
