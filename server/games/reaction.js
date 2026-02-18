const TOTAL_ROUNDS = 5;
const WINS_NEEDED = 3;
const MIN_WAIT_MS = 2000;
const MAX_WAIT_MS = 6000;
const TAP_TIMEOUT_MS = 5000;
const RESULT_DELAY_MS = 1500;

module.exports = {
  init(room) {
    room.gameState = {
      round: 0,
      roundPhase: 'waiting', // waiting, ready, signal, result
      scores: { 1: 0, 2: 0 }, // round wins
      winner: null,
      drawSignalTime: 0,
      roundDecided: false,
      lastRoundWinner: null,
      falseStart: null, // seat number if false start
      reactionTime: null, // ms of winner's reaction
    };
  },

  start(room, broadcast) {
    this._nextRound(room, broadcast);
  },

  handleMessage(room, seat, msg, broadcast) {
    if (msg.type !== 'tap') return;
    const gs = room.gameState;
    if (gs.roundDecided) return;

    const opponent = seat === 1 ? 2 : 1;

    if (gs.roundPhase === 'ready') {
      // FALSE START - tapped before signal
      gs.roundDecided = true;
      gs.falseStart = seat;
      gs.lastRoundWinner = opponent;

      // Cancel the draw signal timeout
      if (room.timers.drawTimeout) {
        clearTimeout(room.timers.drawTimeout);
        room.timers.drawTimeout = null;
      }

      gs.scores[opponent]++;
      broadcast({
        type: 'false_start',
        seat,
        scores: { ...gs.scores },
      });

      this._checkMatchEnd(room, broadcast);
    } else if (gs.roundPhase === 'signal') {
      // Valid tap
      gs.roundDecided = true;
      const reactionMs = Date.now() - gs.drawSignalTime;
      gs.reactionTime = reactionMs;
      gs.lastRoundWinner = seat;

      // Cancel tap timeout
      if (room.timers.tapTimeout) {
        clearTimeout(room.timers.tapTimeout);
        room.timers.tapTimeout = null;
      }

      gs.scores[seat]++;
      broadcast({
        type: 'round_result',
        winner: seat,
        reactionMs,
        scores: { ...gs.scores },
      });

      this._checkMatchEnd(room, broadcast);
    }
  },

  _nextRound(room, broadcast) {
    const gs = room.gameState;
    if (room.phase !== 'playing') return;

    gs.round++;
    gs.roundDecided = false;
    gs.falseStart = null;
    gs.reactionTime = null;
    gs.roundPhase = 'ready';

    broadcast({
      type: 'round_start',
      round: gs.round,
    });

    // Random wait before signal
    const waitMs = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);

    room.timers.drawTimeout = setTimeout(() => {
      if (room.phase !== 'playing' || gs.roundDecided) return;

      gs.roundPhase = 'signal';
      gs.drawSignalTime = Date.now();

      broadcast({ type: 'draw_signal' });

      // Timeout if nobody taps within 5s
      room.timers.tapTimeout = setTimeout(() => {
        if (!gs.roundDecided && room.phase === 'playing') {
          gs.roundDecided = true;
          gs.roundPhase = 'result';
          broadcast({ type: 'round_timeout', round: gs.round });
          this._scheduleNextRound(room, broadcast);
        }
      }, TAP_TIMEOUT_MS);
    }, waitMs);
  },

  _checkMatchEnd(room, broadcast) {
    const gs = room.gameState;

    if (gs.scores[1] >= WINS_NEEDED) {
      gs.winner = 1;
      room.phase = 'ended';
      this._clearTimers(room);
      setTimeout(() => {
        broadcast({ type: 'gameover', winner: 1 });
      }, 1000);
      return;
    }
    if (gs.scores[2] >= WINS_NEEDED) {
      gs.winner = 2;
      room.phase = 'ended';
      this._clearTimers(room);
      setTimeout(() => {
        broadcast({ type: 'gameover', winner: 2 });
      }, 1000);
      return;
    }

    if (gs.round >= TOTAL_ROUNDS) {
      // All rounds played, most wins takes it
      const winner = gs.scores[1] > gs.scores[2] ? 1 :
                     gs.scores[2] > gs.scores[1] ? 2 : 1;
      gs.winner = winner;
      room.phase = 'ended';
      this._clearTimers(room);
      setTimeout(() => {
        broadcast({ type: 'gameover', winner });
      }, 1000);
      return;
    }

    this._scheduleNextRound(room, broadcast);
  },

  _scheduleNextRound(room, broadcast) {
    room.timers.nextRoundTimeout = setTimeout(() => {
      if (room.phase === 'playing') {
        this._nextRound(room, broadcast);
      }
    }, RESULT_DELAY_MS);
  },

  _clearTimers(room) {
    if (room.timers.drawTimeout) clearTimeout(room.timers.drawTimeout);
    if (room.timers.tapTimeout) clearTimeout(room.timers.tapTimeout);
    if (room.timers.nextRoundTimeout) clearTimeout(room.timers.nextRoundTimeout);
    room.timers.drawTimeout = null;
    room.timers.tapTimeout = null;
    room.timers.nextRoundTimeout = null;
  },

  getState(room) {
    const gs = room.gameState;
    return {
      round: gs.round,
      roundPhase: gs.roundPhase,
      scores: { ...gs.scores },
    };
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  dispose(room) {
    this._clearTimers(room);
  },
};
