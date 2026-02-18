// Bomb Pass - hot potato with a ticking bomb
// Best of 3 rounds, random fuse time, tap to pass

const ROUNDS = 3;
const FUSE_MIN = 8000;   // min fuse ms
const FUSE_MAX = 18000;  // max fuse ms
const PASS_COOLDOWN = 300; // ms between passes to prevent spam

module.exports = {
  init(room) {
    room.gameState = {
      round: 0,
      scores: { 1: 0, 2: 0 },
      holder: 0,        // seat holding the bomb
      fuse: 0,          // ms remaining
      totalFuse: 0,     // original fuse for progress bar
      exploded: false,
      roundActive: false,
      winner: null,
      lastPassTime: 0,
      passCount: 0,
    };
  },

  start(room, broadcast) {
    this._startRound(room, broadcast);
  },

  handleMessage(room, seat, msg, broadcast) {
    const gs = room.gameState;
    if (msg.type === 'pass_bomb') {
      if (!gs.roundActive || gs.exploded) return;
      if (gs.holder !== seat) return;

      const now = Date.now();
      if (now - gs.lastPassTime < PASS_COOLDOWN) return;

      gs.lastPassTime = now;
      gs.passCount++;
      gs.holder = seat === 1 ? 2 : 1;

      broadcast({
        type: 'bomb_passed',
        holder: gs.holder,
        passCount: gs.passCount,
      });
    }
  },

  _startRound(room, broadcast) {
    const gs = room.gameState;
    gs.round++;
    gs.exploded = false;
    gs.roundActive = true;
    gs.passCount = 0;
    gs.lastPassTime = 0;

    // Random holder and fuse
    gs.holder = Math.random() < 0.5 ? 1 : 2;
    gs.totalFuse = FUSE_MIN + Math.random() * (FUSE_MAX - FUSE_MIN);
    gs.fuse = gs.totalFuse;

    broadcast({
      type: 'bomb_round_start',
      round: gs.round,
      holder: gs.holder,
      totalFuse: gs.totalFuse,
    });

    // Tick fuse
    const tickMs = 50;
    room.timers.fuseTimer = setInterval(() => {
      gs.fuse -= tickMs;

      // Broadcast fuse progress periodically
      if (Math.floor(gs.fuse / 200) !== Math.floor((gs.fuse + tickMs) / 200)) {
        broadcast({
          type: 'bomb_tick',
          fuse: gs.fuse,
          totalFuse: gs.totalFuse,
          holder: gs.holder,
        });
      }

      if (gs.fuse <= 0) {
        clearInterval(room.timers.fuseTimer);
        this._explode(room, broadcast);
      }
    }, tickMs);
  },

  _explode(room, broadcast) {
    const gs = room.gameState;
    gs.exploded = true;
    gs.roundActive = false;

    // Holder loses, opponent scores
    const winner = gs.holder === 1 ? 2 : 1;
    gs.scores[winner]++;

    broadcast({
      type: 'bomb_exploded',
      loser: gs.holder,
      scores: { ...gs.scores },
      round: gs.round,
    });

    // Check if game over
    const maxWins = Math.ceil(ROUNDS / 2); // 2 out of 3
    if (gs.scores[1] >= maxWins || gs.scores[2] >= maxWins) {
      gs.winner = gs.scores[1] >= maxWins ? 1 : 2;
      room.phase = 'ended';

      room.timers.endTimeout = setTimeout(() => {
        broadcast({ type: 'gameover', winner: gs.winner });
      }, 2500);
      return;
    }

    // Next round after delay
    room.timers.nextRoundTimeout = setTimeout(() => {
      if (room.phase === 'playing') {
        this._startRound(room, broadcast);
      }
    }, 3000);
  },

  getState(room) {
    const gs = room.gameState;
    return {
      round: gs.round,
      scores: { ...gs.scores },
    };
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  dispose(room) {
    if (room.timers.fuseTimer) clearInterval(room.timers.fuseTimer);
    if (room.timers.nextRoundTimeout) clearTimeout(room.timers.nextRoundTimeout);
    if (room.timers.endTimeout) clearTimeout(room.timers.endTimeout);
    room.timers = {};
  },
};
