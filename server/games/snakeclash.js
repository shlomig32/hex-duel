// Snake Clash — two snakes on a 20x20 grid, collect food, use power-ups, crash = shrink

const TICK_MS = 50;
const MOVE_INTERVAL = 150; // ms between snake moves (grid steps)
const GRID_SIZE = 20;
const INITIAL_LENGTH = 3;
const CRASH_SHRINK = 3; // segments lost on crash
const MAX_FOOD = 4;
const FOOD_RESPAWN_INTERVAL = 2; // seconds
const POWERUP_INTERVAL = 8; // seconds
const WALL_MODE_DURATION = 4; // seconds
const GHOST_MODE_DURATION = 3; // seconds
const TURBO_DURATION = 3; // seconds
const TURBO_MOVE_INTERVAL = 80; // ms (faster)
const GOLDEN_SPEED_DURATION = 3; // seconds both snakes speed up
const GOLDEN_MOVE_INTERVAL = 100; // ms
const TIME_LIMIT = 40;
const MINE_COUNT = 3; // mines dropped per pickup
const MINE_SHRINK = 2; // segments lost to mine

const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
const dirs = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const validDirs = ['up', 'down', 'left', 'right'];

function init(room) {
  // Player 0: starts at (2,1) facing right, tail extends left: [{x:2,y:1},{x:1,y:1},{x:0,y:1}]
  const seg0 = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    seg0.push({ x: (INITIAL_LENGTH - 1) - i, y: 1 });
  }

  // Player 1: starts at (17,18) facing left, tail extends right: [{x:17,y:18},{x:18,y:18},{x:19,y:18}]
  const seg1 = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    seg1.push({ x: (GRID_SIZE - INITIAL_LENGTH) + i, y: 18 });
  }

  room.gameState = {
    players: [
      {
        segments: seg0,
        dir: 'right',
        nextDir: 'right',
        score: 0,
        moveInterval: MOVE_INTERVAL,
        ghosted: false,
        walled: false,
        alive: true,
        growCount: 0,
      },
      {
        segments: seg1,
        dir: 'left',
        nextDir: 'left',
        score: 0,
        moveInterval: MOVE_INTERVAL,
        ghosted: false,
        walled: false,
        alive: true,
        growCount: 0,
      },
    ],
    food: [],
    powerups: [],
    mines: [],
    elapsed: 0,
    lastMoveTime: [0, 0],
    nextFoodTime: 1,
    nextPowerupTime: POWERUP_INTERVAL,
  };

  // Ensure effects timeout array exists
  if (!room.timers) room.timers = {};
  room.timers.effects = [];
}

function getState(room) {
  const gs = room.gameState;
  return {
    players: gs.players.map(function (p) {
      return {
        segments: p.segments,
        dir: p.dir,
        score: p.score,
        ghosted: p.ghosted,
        walled: p.walled,
        alive: p.alive,
      };
    }),
    food: gs.food,
    powerups: gs.powerups,
    mines: gs.mines,
    gridSize: GRID_SIZE,
    timeLimit: TIME_LIMIT,
  };
}

function start(room, broadcast) {
  const gs = room.gameState;
  if (!room.timers) room.timers = {};
  room.timers.effects = [];

  room.timers.gameTick = setInterval(function () {
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    // Move each alive player if enough time has passed
    for (let i = 0; i < 2; i++) {
      const p = gs.players[i];
      if (!p.alive) continue;

      if (gs.elapsed - gs.lastMoveTime[i] >= p.moveInterval / 1000) {
        gs.lastMoveTime[i] = gs.elapsed;
        _moveSnake(gs, i, broadcast, room);
      }
    }

    // Spawn food
    if (gs.elapsed >= gs.nextFoodTime && gs.food.length < MAX_FOOD) {
      _spawnFood(gs);
      gs.nextFoodTime = gs.elapsed + FOOD_RESPAWN_INTERVAL;
    }

    // Spawn powerup
    if (gs.elapsed >= gs.nextPowerupTime && gs.powerups.length < 1) {
      _spawnPowerup(gs);
      gs.nextPowerupTime = gs.elapsed + POWERUP_INTERVAL;
    }

    // Broadcast state
    broadcast({
      type: 'snake_state',
      players: gs.players.map(function (p) {
        return {
          segments: p.segments,
          dir: p.dir,
          score: p.score,
          ghosted: p.ghosted,
          walled: p.walled,
          alive: p.alive,
        };
      }),
      food: gs.food,
      powerups: gs.powerups,
      mines: gs.mines,
      elapsed: Math.round(gs.elapsed * 10) / 10,
    });

    // Check game over
    var bothDead = !gs.players[0].alive && !gs.players[1].alive;
    var oneDead = !gs.players[0].alive || !gs.players[1].alive;
    var timeUp = gs.elapsed >= TIME_LIMIT;

    if (bothDead || timeUp) {
      _endGame(room, broadcast);
      return;
    }
    if (oneDead) {
      _endGame(room, broadcast);
      return;
    }
  }, TICK_MS);
}

function _moveSnake(gs, idx, broadcast, room) {
  var p = gs.players[idx];
  var opponent = gs.players[1 - idx];

  // Apply queued direction (prevent 180-degree reversal)
  if (p.nextDir !== opposites[p.dir]) {
    p.dir = p.nextDir;
  }

  // Calculate new head position
  var d = dirs[p.dir];
  var head = p.segments[0];
  var newHead = { x: head.x + d.x, y: head.y + d.y };

  // Check wall collision
  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    if (p.ghosted) {
      // Wrap around
      newHead.x = ((newHead.x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
      newHead.y = ((newHead.y % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
    } else {
      shrinkSnake(gs, idx, CRASH_SHRINK, broadcast);
      return; // skip rest of move
    }
  }

  // Check self collision (skip if ghosted)
  if (!p.ghosted) {
    for (var s = 0; s < p.segments.length; s++) {
      if (p.segments[s].x === newHead.x && p.segments[s].y === newHead.y) {
        shrinkSnake(gs, idx, CRASH_SHRINK, broadcast);
        return; // skip rest of move
      }
    }
  }

  // Check opponent collision (skip if ghosted)
  if (!p.ghosted) {
    for (var s = 0; s < opponent.segments.length; s++) {
      if (opponent.segments[s].x === newHead.x && opponent.segments[s].y === newHead.y) {
        // Walled opponent acts as extra-hard wall
        shrinkSnake(gs, idx, CRASH_SHRINK, broadcast);
        return; // skip rest of move
      }
    }
  }

  // Check mine collision (skip if ghosted)
  if (!p.ghosted) {
    for (var m = gs.mines.length - 1; m >= 0; m--) {
      var mine = gs.mines[m];
      if (mine.x === newHead.x && mine.y === newHead.y && mine.owner !== idx) {
        gs.mines.splice(m, 1);
        shrinkSnake(gs, idx, MINE_SHRINK, broadcast);
        // Don't return — still continue the move
        break;
      }
    }
  }

  // If snake died from mine shrink, stop
  if (!p.alive) return;

  // Move: add new head
  p.segments.unshift(newHead);

  // Check food at new head position
  for (var f = gs.food.length - 1; f >= 0; f--) {
    var food = gs.food[f];
    if (food.x === newHead.x && food.y === newHead.y) {
      if (food.type === 'apple') {
        p.score += 1;
        p.growCount += 1;
      } else if (food.type === 'golden') {
        p.score += 3;
        p.growCount += 2;
        // Both snakes get temporary speed boost
        for (let gi = 0; gi < 2; gi++) {
          gs.players[gi].moveInterval = GOLDEN_MOVE_INTERVAL;
          var tid = setTimeout(function () {
            gs.players[gi].moveInterval = MOVE_INTERVAL;
          }, GOLDEN_SPEED_DURATION * 1000);
          room.timers.effects.push(tid);
        }
      } else if (food.type === 'poison') {
        p.score = Math.max(0, p.score - 2);
        // Shrink by 2 immediately (remove from tail)
        for (var si = 0; si < 2 && p.segments.length > 1; si++) {
          p.segments.pop();
        }
        if (p.segments.length === 0) {
          p.alive = false;
        }
      } else if (food.type === 'turbo') {
        p.moveInterval = TURBO_MOVE_INTERVAL;
        var capturedIdx = idx;
        var tid = setTimeout(function () {
          gs.players[capturedIdx].moveInterval = MOVE_INTERVAL;
        }, TURBO_DURATION * 1000);
        room.timers.effects.push(tid);
      }

      gs.food.splice(f, 1);
      broadcast({ type: 'snake_food', seat: idx + 1, foodType: food.type, score: p.score });
      break;
    }
  }

  // Check powerup at new head position
  for (var pu = gs.powerups.length - 1; pu >= 0; pu--) {
    var powerup = gs.powerups[pu];
    if (powerup.x === newHead.x && powerup.y === newHead.y) {
      if (powerup.type === 'wall') {
        p.walled = true;
        var capturedIdx = idx;
        var tid = setTimeout(function () {
          gs.players[capturedIdx].walled = false;
        }, WALL_MODE_DURATION * 1000);
        room.timers.effects.push(tid);
      } else if (powerup.type === 'swap') {
        // Swap segments between players
        var tempSegments = gs.players[0].segments;
        gs.players[0].segments = gs.players[1].segments;
        gs.players[1].segments = tempSegments;
        // Swap directions
        var tempDir = gs.players[0].dir;
        gs.players[0].dir = gs.players[1].dir;
        gs.players[1].dir = tempDir;
        var tempNextDir = gs.players[0].nextDir;
        gs.players[0].nextDir = gs.players[1].nextDir;
        gs.players[1].nextDir = tempNextDir;
        broadcast({ type: 'snake_swap' });
      } else if (powerup.type === 'ghost') {
        p.ghosted = true;
        var capturedIdx = idx;
        var tid = setTimeout(function () {
          gs.players[capturedIdx].ghosted = false;
        }, GHOST_MODE_DURATION * 1000);
        room.timers.effects.push(tid);
      } else if (powerup.type === 'mines') {
        // Drop mines at the last MINE_COUNT tail positions
        var tailStart = Math.max(0, p.segments.length - MINE_COUNT);
        for (var mi = p.segments.length - 1; mi >= tailStart; mi--) {
          gs.mines.push({
            x: p.segments[mi].x,
            y: p.segments[mi].y,
            owner: idx,
          });
        }
      }

      gs.powerups.splice(pu, 1);
      broadcast({ type: 'snake_powerup', seat: idx + 1, powerupType: powerup.type });
      break;
    }
  }

  // Remove tail
  if (p.growCount > 0) {
    p.growCount--;
  } else {
    p.segments.pop();
  }
}

function shrinkSnake(gs, idx, amount, broadcast) {
  var p = gs.players[idx];
  for (var i = 0; i < amount && p.segments.length > 0; i++) {
    p.segments.pop();
  }
  if (p.segments.length === 0) {
    p.alive = false;
  }
  p.score = Math.max(0, p.score - amount);
  broadcast({ type: 'snake_hit', seat: idx + 1, length: p.segments.length, alive: p.alive });
}

function randomFreeCell(gs) {
  var occupied = new Set();
  for (var pi = 0; pi < gs.players.length; pi++) {
    var segs = gs.players[pi].segments;
    for (var s = 0; s < segs.length; s++) {
      occupied.add(segs[s].x + ',' + segs[s].y);
    }
  }
  for (var fi = 0; fi < gs.food.length; fi++) {
    occupied.add(gs.food[fi].x + ',' + gs.food[fi].y);
  }
  for (var pui = 0; pui < gs.powerups.length; pui++) {
    occupied.add(gs.powerups[pui].x + ',' + gs.powerups[pui].y);
  }
  for (var mi = 0; mi < gs.mines.length; mi++) {
    occupied.add(gs.mines[mi].x + ',' + gs.mines[mi].y);
  }

  for (var tries = 0; tries < 100; tries++) {
    var x = Math.floor(Math.random() * GRID_SIZE);
    var y = Math.floor(Math.random() * GRID_SIZE);
    if (!occupied.has(x + ',' + y)) return { x: x, y: y };
  }
  return { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };
}

function _spawnFood(gs) {
  var r = Math.random();
  var type;
  if (r < 0.60) {
    type = 'apple';
  } else if (r < 0.70) {
    type = 'golden';
  } else if (r < 0.85) {
    type = 'poison';
  } else {
    type = 'turbo';
  }
  var cell = randomFreeCell(gs);
  gs.food.push({ x: cell.x, y: cell.y, type: type });
}

function _spawnPowerup(gs) {
  var r = Math.random();
  var type;
  if (r < 0.25) {
    type = 'wall';
  } else if (r < 0.50) {
    type = 'swap';
  } else if (r < 0.75) {
    type = 'ghost';
  } else {
    type = 'mines';
  }
  var cell = randomFreeCell(gs);
  gs.powerups.push({ x: cell.x, y: cell.y, type: type });
}

function _endGame(room, broadcast) {
  clearInterval(room.timers.gameTick);
  room.timers.gameTick = null;

  // Clear all effect timeouts
  if (room.timers.effects) {
    for (var i = 0; i < room.timers.effects.length; i++) {
      clearTimeout(room.timers.effects[i]);
    }
    room.timers.effects = [];
  }

  room.phase = 'ended';

  var gs = room.gameState;
  var p0 = gs.players[0];
  var p1 = gs.players[1];

  var winner;
  if (!p0.alive && !p1.alive) {
    // Both dead — most score wins, tie: seat 1
    winner = p0.score >= p1.score ? 1 : 2;
  } else if (!p0.alive) {
    winner = 2;
  } else if (!p1.alive) {
    winner = 1;
  } else {
    // Time up — most score wins, tie: seat 1
    winner = p0.score >= p1.score ? 1 : 2;
  }

  broadcast({ type: 'gameover', winner: winner });
}

function handleMessage(room, seat, msg, broadcast) {
  if (msg.type === 'dir') {
    if (typeof msg.dir !== 'string' || validDirs.indexOf(msg.dir) === -1) return;
    var p = room.gameState.players[seat - 1];
    if (!p || !p.alive) return;
    // Store as nextDir — 180-degree reversal check happens at move time
    p.nextDir = msg.dir;
  }
}

function dispose(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }
  if (room.timers.effects) {
    for (var i = 0; i < room.timers.effects.length; i++) {
      clearTimeout(room.timers.effects[i]);
    }
    room.timers.effects = [];
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
