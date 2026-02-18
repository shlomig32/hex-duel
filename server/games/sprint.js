// Sprint Race — straight track, dodge obstacles, first to finish wins
const TRACK_LENGTH = 200;
const LANE_COUNT = 3; // 0=left, 1=center, 2=right
const SPEED = 15; // units per second
const BOOST_SPEED = 25;
const MAX_BOOSTS = 3;
const OBSTACLE_INTERVAL = 12; // every N units along track
const TICK_MS = 50; // 20fps

function init(room) {
  // Generate obstacles (positions along track with lane)
  const obstacles = [];
  for (let z = 20; z < TRACK_LENGTH - 20; z += OBSTACLE_INTERVAL) {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    obstacles.push({ z, lane });
  }

  room.gameState = {
    players: [
      { z: 0, lane: 1, speed: SPEED, boosts: MAX_BOOSTS, boosting: false, stunned: false, finished: false },
      { z: 0, lane: 1, speed: SPEED, boosts: MAX_BOOSTS, boosting: false, stunned: false, finished: false },
    ],
    obstacles,
    startTime: 0,
    elapsed: 0,
  };
}

function getState(room) {
  return {
    players: room.gameState.players.map(p => ({ z: p.z, lane: p.lane, boosts: p.boosts })),
    obstacles: room.gameState.obstacles,
    trackLength: TRACK_LENGTH,
  };
}

function start(room, broadcast) {
  room.gameState.startTime = Date.now();

  room.timers.gameTick = setInterval(() => {
    const gs = room.gameState;
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    for (let i = 0; i < 2; i++) {
      const p = gs.players[i];
      if (p.finished || p.stunned) continue;

      const spd = p.boosting ? BOOST_SPEED : SPEED;
      p.z += spd * dt;

      // Check obstacle collision
      for (const obs of gs.obstacles) {
        if (Math.abs(p.z - obs.z) < 1.5 && p.lane === obs.lane) {
          p.stunned = true;
          p.z = Math.max(0, obs.z - 2);
          setTimeout(() => { p.stunned = false; }, 800);
          break;
        }
      }

      // Check finish
      if (p.z >= TRACK_LENGTH) {
        p.z = TRACK_LENGTH;
        p.finished = true;
      }
    }

    broadcast({
      type: 'race_state',
      players: gs.players.map(p => ({
        z: Math.round(p.z * 10) / 10,
        lane: p.lane,
        boosts: p.boosts,
        stunned: p.stunned,
        finished: p.finished,
      })),
      elapsed: Math.round(gs.elapsed * 10) / 10,
    });

    // Check winner
    const finished = gs.players.filter(p => p.finished);
    if (finished.length > 0) {
      clearInterval(room.timers.gameTick);
      room.timers.gameTick = null;
      room.phase = 'ended';

      let winner;
      if (gs.players[0].finished && gs.players[1].finished) {
        winner = gs.players[0].z >= gs.players[1].z ? 1 : 2;
      } else {
        winner = gs.players[0].finished ? 1 : 2;
      }
      broadcast({ type: 'gameover', winner });
    }

    // Timeout at 30 seconds
    if (gs.elapsed > 30) {
      clearInterval(room.timers.gameTick);
      room.timers.gameTick = null;
      room.phase = 'ended';
      const winner = gs.players[0].z > gs.players[1].z ? 1 : gs.players[1].z > gs.players[0].z ? 2 : 0;
      broadcast({ type: 'gameover', winner });
    }
  }, TICK_MS);
}

function handleMessage(room, seat, msg, broadcast) {
  const p = room.gameState.players[seat - 1];
  if (!p || p.finished || p.stunned) return;

  if (msg.type === 'steer') {
    const lane = msg.lane;
    if (lane >= 0 && lane < LANE_COUNT) {
      p.lane = lane;
    }
  }

  if (msg.type === 'boost') {
    if (p.boosts > 0 && !p.boosting) {
      p.boosts--;
      p.boosting = true;
      setTimeout(() => { p.boosting = false; }, 1500);
    }
  }
}

function dispose(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
