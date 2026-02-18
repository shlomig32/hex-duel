// Maze Mayhem — two players in a random maze with ghosts chasing them.
// Collect items, place traps, survive the shrinking maze.
// Last player alive wins, or highest score when time runs out.

const TICK_MS = 50;
const MAZE_SIZE = 13; // odd number for maze generation
const PLAYER_MOVE_SPEED = 6; // cells per second
const GHOST_BASE_SPEED = 3.5; // cells per second
const GHOST_SPEED_INCREASE = 0.4; // per shrink level
const INITIAL_GHOSTS = 2;
const ITEM_COUNT = 8; // initial scattered items
const ITEM_RESPAWN_INTERVAL = 5; // seconds
const SHRINK_INTERVAL = 10; // seconds
const PHASE_DURATION = 3; // seconds (ghost pass-through)
const FREEZE_DURATION = 2; // seconds (glue trap)
const TURBO_DURATION = 3; // seconds
const TIME_LIMIT = 45;
const MAX_TRAPS_PER_PLAYER = 2;
const GHOST_REPATH_INTERVAL = 0.5; // seconds, how often ghosts recalculate path
const CATCH_DIST = 0.5; // cells — ghost catches player if within this distance

// Item types with weighted probabilities
const ITEM_WEIGHTS = [
  { type: 'star', weight: 50 },
  { type: 'turbo', weight: 15 },
  { type: 'ghost_spawn', weight: 10 },
  { type: 'phase', weight: 10 },
  { type: 'glue', weight: 10 },
  { type: 'dynamite', weight: 5 },
];
const TOTAL_WEIGHT = ITEM_WEIGHTS.reduce((s, w) => s + w.weight, 0);

function round2(n) {
  return Math.round(n * 100) / 100;
}

// --- Maze Generation: Recursive Backtracker ---
function generateMaze(size) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    grid[y] = [];
    for (let x = 0; x < size; x++) {
      grid[y][x] = 1; // all walls initially
    }
  }

  function carve(x, y) {
    grid[y][x] = 0;
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    // Fisher-Yates shuffle
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx > 0 && nx < size && ny > 0 && ny < size && grid[ny][nx] === 1) {
        grid[y + dy / 2][x + dx / 2] = 0; // carve wall between
        carve(nx, ny);
      }
    }
  }

  carve(1, 1); // start from (1,1)

  // Ensure corners are open for player spawns
  grid[1][1] = 0;
  grid[1][2] = 0;
  grid[2][1] = 0;
  grid[size - 2][size - 2] = 0;
  grid[size - 2][size - 3] = 0;
  grid[size - 3][size - 2] = 0;

  // Ensure center area is open for ghost spawns
  const mid = Math.floor(size / 2);
  grid[mid][mid] = 0;
  grid[mid - 1][mid] = 0;
  grid[mid + 1][mid] = 0;
  grid[mid][mid - 1] = 0;
  grid[mid][mid + 1] = 0;

  return grid;
}

// --- A* Pathfinding ---
function findPath(grid, sx, sy, gx, gy, size, shrinkLevel) {
  const lo = shrinkLevel;
  const hi = size - 1 - shrinkLevel;

  // Clamp start/goal to bounds
  if (sx < lo || sx > hi || sy < lo || sy > hi) return [];
  if (gx < lo || gx > hi || gy < lo || gy > hi) return [];
  if (grid[sy][sx] === 1 || grid[gy][gx] === 1) return [];

  const key = (x, y) => y * size + x;
  const openSet = [];
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const closedSet = new Set();

  const startKey = key(sx, sy);
  gScore.set(startKey, 0);
  fScore.set(startKey, Math.abs(gx - sx) + Math.abs(gy - sy));
  openSet.push({ x: sx, y: sy, f: fScore.get(startKey) });

  while (openSet.length > 0) {
    // Find node with lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    const ck = key(current.x, current.y);

    if (current.x === gx && current.y === gy) {
      // Reconstruct path
      const result = [];
      let cx = gx, cy = gy;
      while (cameFrom.has(key(cx, cy))) {
        result.unshift({ x: cx, y: cy });
        const prev = cameFrom.get(key(cx, cy));
        cx = prev.x;
        cy = prev.y;
      }
      return result;
    }

    closedSet.add(ck);

    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < lo || nx > hi || ny < lo || ny > hi) continue;
      if (grid[ny][nx] === 1) continue;
      const nk = key(nx, ny);
      if (closedSet.has(nk)) continue;

      const tentG = gScore.get(ck) + 1;
      if (tentG < (gScore.get(nk) || Infinity)) {
        cameFrom.set(nk, { x: current.x, y: current.y });
        gScore.set(nk, tentG);
        const f = tentG + Math.abs(gx - nx) + Math.abs(gy - ny);
        fScore.set(nk, f);
        if (!openSet.find(n => key(n.x, n.y) === nk)) {
          openSet.push({ x: nx, y: ny, f });
        }
      }
    }
  }

  return []; // no path found
}

// --- Helpers ---
function randomItemType() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const entry of ITEM_WEIGHTS) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return 'star';
}

function getPathCells(grid, size, shrinkLevel) {
  const lo = shrinkLevel;
  const hi = size - 1 - shrinkLevel;
  const cells = [];
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      if (grid[y][x] === 0) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function spawnItem(grid, size, shrinkLevel, existingItems, players) {
  const cells = getPathCells(grid, size, shrinkLevel);
  // Filter out cells occupied by items or players
  const occupied = new Set();
  for (const it of existingItems) occupied.add(it.y * size + it.x);
  for (const p of players) occupied.add(Math.round(p.y) * size + Math.round(p.x));

  const available = cells.filter(c => !occupied.has(c.y * size + c.x));
  if (available.length === 0) return null;

  const cell = available[Math.floor(Math.random() * available.length)];
  return { x: cell.x, y: cell.y, type: randomItemType() };
}

function findNearestValidCell(grid, x, y, size, shrinkLevel) {
  const lo = shrinkLevel;
  const hi = size - 1 - shrinkLevel;

  // BFS from (x,y) to find nearest path cell within bounds
  const visited = new Set();
  const queue = [{ x: Math.round(x), y: Math.round(y) }];
  visited.add(Math.round(y) * size + Math.round(x));

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr.x >= lo && curr.x <= hi && curr.y >= lo && curr.y <= hi && grid[curr.y][curr.x] === 0) {
      return curr;
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const k = ny * size + nx;
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push({ x: nx, y: ny });
    }
  }

  // Fallback: center of remaining area
  const mid = Math.floor(size / 2);
  return { x: mid, y: mid };
}

function distanceBetween(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Direction vectors
const DIR_MAP = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

// --- Module exports ---

function init(room) {
  const maze = generateMaze(MAZE_SIZE);
  const mid = Math.floor(MAZE_SIZE / 2);

  const gs = {
    maze,
    players: [
      { x: 1, y: 1, alive: true, score: 0, speed: PLAYER_MOVE_SPEED, phased: false, frozen: false, frozenUntil: 0, inventory: null, targetX: null, targetY: null },
      { x: MAZE_SIZE - 2, y: MAZE_SIZE - 2, alive: true, score: 0, speed: PLAYER_MOVE_SPEED, phased: false, frozen: false, frozenUntil: 0, inventory: null, targetX: null, targetY: null },
    ],
    ghosts: [
      { x: mid, y: mid, speed: GHOST_BASE_SPEED, path: [], pathTimer: 0 },
      { x: mid + 1, y: mid, speed: GHOST_BASE_SPEED, path: [], pathTimer: 0 },
    ],
    items: [],
    traps: [],
    elapsed: 0,
    shrinkLevel: 0,
    nextShrinkTime: SHRINK_INTERVAL,
    nextItemTime: ITEM_RESPAWN_INTERVAL,
  };

  room.gameState = gs;

  // Scatter initial items
  for (let i = 0; i < ITEM_COUNT; i++) {
    const item = spawnItem(maze, MAZE_SIZE, 0, gs.items, gs.players);
    if (item) gs.items.push(item);
  }

  // Effect timers storage
  room.timers = room.timers || {};
  room.timers.effects = [];
}

function getState(room) {
  const gs = room.gameState;
  return {
    maze: gs.maze,
    players: gs.players.map(p => ({
      x: round2(p.x), y: round2(p.y),
      alive: p.alive, score: p.score,
      phased: p.phased, frozen: p.frozen,
      inventory: p.inventory,
    })),
    ghosts: gs.ghosts.map(g => ({ x: round2(g.x), y: round2(g.y) })),
    items: gs.items.map(it => ({ x: it.x, y: it.y, type: it.type })),
    shrinkLevel: gs.shrinkLevel,
    timeLimit: TIME_LIMIT,
  };
}

function start(room, broadcast) {
  const gs = room.gameState;

  room.timers.gameTick = setInterval(() => {
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    // 1. Unfreeze players
    for (const p of gs.players) {
      if (p.frozen && gs.elapsed >= p.frozenUntil) {
        p.frozen = false;
      }
    }

    // 2. Move players toward their targets (smooth interpolation)
    for (const p of gs.players) {
      if (!p.alive || p.frozen) continue;
      if (p.targetX === null || p.targetY === null) continue;

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.01) {
        // Arrived at target
        p.x = p.targetX;
        p.y = p.targetY;
        p.targetX = null;
        p.targetY = null;
      } else {
        const step = p.speed * dt;
        if (step >= dist) {
          p.x = p.targetX;
          p.y = p.targetY;
          p.targetX = null;
          p.targetY = null;
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
        }
      }
    }

    // 3. Move ghosts
    const ghostSpeed = GHOST_BASE_SPEED + gs.shrinkLevel * GHOST_SPEED_INCREASE;
    for (const ghost of gs.ghosts) {
      ghost.speed = ghostSpeed;
      ghost.pathTimer += dt;

      // Repath periodically
      if (ghost.pathTimer >= GHOST_REPATH_INTERVAL || ghost.path.length === 0) {
        ghost.pathTimer = 0;

        // Find nearest alive non-phased player
        let bestTarget = null;
        let bestDist = Infinity;
        for (const p of gs.players) {
          if (!p.alive || p.phased) continue;
          const d = distanceBetween(ghost.x, ghost.y, p.x, p.y);
          if (d < bestDist) {
            bestDist = d;
            bestTarget = p;
          }
        }

        if (bestTarget) {
          const gx = Math.round(ghost.x);
          const gy = Math.round(ghost.y);
          const tx = Math.round(bestTarget.x);
          const ty = Math.round(bestTarget.y);
          ghost.path = findPath(gs.maze, gx, gy, tx, ty, MAZE_SIZE, gs.shrinkLevel);
        }
      }

      // Move along path
      if (ghost.path.length > 0) {
        const next = ghost.path[0];
        const dx = next.x - ghost.x;
        const dy = next.y - ghost.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const step = ghost.speed * dt;
        if (step >= dist) {
          ghost.x = next.x;
          ghost.y = next.y;
          ghost.path.shift();
        } else {
          ghost.x += (dx / dist) * step;
          ghost.y += (dy / dist) * step;
        }
      }
    }

    // 4. Check ghost-player collision
    for (const ghost of gs.ghosts) {
      for (let i = 0; i < gs.players.length; i++) {
        const p = gs.players[i];
        if (!p.alive || p.phased) continue;
        if (distanceBetween(ghost.x, ghost.y, p.x, p.y) < CATCH_DIST) {
          p.alive = false;
          broadcast({ type: 'maze_caught', seat: i + 1 });
        }
      }
    }

    // 5. Check player-item collision
    for (let i = gs.items.length - 1; i >= 0; i--) {
      const item = gs.items[i];
      for (let pi = 0; pi < gs.players.length; pi++) {
        const p = gs.players[pi];
        if (!p.alive) continue;
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        if (px === item.x && py === item.y) {
          // Apply item effect
          _applyItem(room, gs, pi, item, broadcast);
          gs.items.splice(i, 1);
          broadcast({ type: 'maze_item', seat: pi + 1, itemType: item.type });
          break;
        }
      }
    }

    // 6. Check player-trap collision
    for (let i = gs.traps.length - 1; i >= 0; i--) {
      const trap = gs.traps[i];
      for (let pi = 0; pi < gs.players.length; pi++) {
        const p = gs.players[pi];
        if (!p.alive || p.phased) continue;
        // Trap only affects opponent
        if (trap.owner === pi) continue;
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        if (px === trap.x && py === trap.y) {
          p.frozen = true;
          p.frozenUntil = gs.elapsed + FREEZE_DURATION;
          p.targetX = null;
          p.targetY = null;
          gs.traps.splice(i, 1);
          broadcast({ type: 'maze_frozen', seat: pi + 1 });
          break;
        }
      }
    }

    // 7. Shrink maze
    if (gs.elapsed >= gs.nextShrinkTime && gs.shrinkLevel < 3) {
      gs.shrinkLevel++;
      const lo = gs.shrinkLevel;
      const hi = MAZE_SIZE - 1 - gs.shrinkLevel;

      // Turn boundary cells into walls
      for (let y = 0; y < MAZE_SIZE; y++) {
        for (let x = 0; x < MAZE_SIZE; x++) {
          if (x < lo || x > hi || y < lo || y > hi) {
            gs.maze[y][x] = 1;
          }
        }
      }

      // Push players inside shrunk area to nearest valid cell
      for (const p of gs.players) {
        if (!p.alive) continue;
        const rx = Math.round(p.x);
        const ry = Math.round(p.y);
        if (rx < lo || rx > hi || ry < lo || ry > hi || gs.maze[ry][rx] === 1) {
          const valid = findNearestValidCell(gs.maze, p.x, p.y, MAZE_SIZE, gs.shrinkLevel);
          p.x = valid.x;
          p.y = valid.y;
          p.targetX = null;
          p.targetY = null;
        }
      }

      // Push ghosts inside shrunk area to nearest valid cell
      for (const ghost of gs.ghosts) {
        const rx = Math.round(ghost.x);
        const ry = Math.round(ghost.y);
        if (rx < lo || rx > hi || ry < lo || ry > hi || gs.maze[ry][rx] === 1) {
          const valid = findNearestValidCell(gs.maze, ghost.x, ghost.y, MAZE_SIZE, gs.shrinkLevel);
          ghost.x = valid.x;
          ghost.y = valid.y;
          ghost.path = [];
        }
      }

      // Remove items and traps outside bounds
      gs.items = gs.items.filter(it => it.x >= lo && it.x <= hi && it.y >= lo && it.y <= hi);
      gs.traps = gs.traps.filter(t => t.x >= lo && t.x <= hi && t.y >= lo && t.y <= hi);

      gs.nextShrinkTime += SHRINK_INTERVAL;
      broadcast({ type: 'maze_shrink', level: gs.shrinkLevel });
    }

    // 8. Spawn items if needed
    if (gs.elapsed >= gs.nextItemTime && gs.items.length < ITEM_COUNT) {
      const item = spawnItem(gs.maze, MAZE_SIZE, gs.shrinkLevel, gs.items, gs.players);
      if (item) gs.items.push(item);
      gs.nextItemTime = gs.elapsed + ITEM_RESPAWN_INTERVAL;
    }

    // 9. Broadcast state
    broadcast({
      type: 'maze_state',
      players: gs.players.map(p => ({
        x: round2(p.x), y: round2(p.y),
        alive: p.alive, score: p.score,
        phased: p.phased, frozen: p.frozen,
        inventory: p.inventory,
      })),
      ghosts: gs.ghosts.map(g => ({ x: round2(g.x), y: round2(g.y) })),
      items: gs.items.map(it => ({ x: it.x, y: it.y, type: it.type })),
      traps: gs.traps.map(t => ({ x: t.x, y: t.y, owner: t.owner })),
      elapsed: round2(gs.elapsed),
    });

    // 10. Check game over
    const alive0 = gs.players[0].alive;
    const alive1 = gs.players[1].alive;

    if (!alive0 && !alive1) {
      // Both dead — compare scores, tie goes to seat 1
      const winner = gs.players[0].score >= gs.players[1].score ? 1 : 2;
      _endGame(room, winner, broadcast);
      return;
    }
    if (!alive0) {
      _endGame(room, 2, broadcast);
      return;
    }
    if (!alive1) {
      _endGame(room, 1, broadcast);
      return;
    }
    if (gs.elapsed >= TIME_LIMIT) {
      // Time up — most score wins, tie goes to seat 1
      const winner = gs.players[0].score >= gs.players[1].score ? 1 : 2;
      _endGame(room, winner, broadcast);
      return;
    }
  }, TICK_MS);
}

function _endGame(room, winner, broadcast) {
  room.phase = 'ended';
  _stopTimers(room);
  broadcast({ type: 'gameover', winner });
}

function _applyItem(room, gs, playerIdx, item, broadcast) {
  const p = gs.players[playerIdx];

  switch (item.type) {
    case 'star':
      p.score += 1;
      break;

    case 'turbo': {
      const prevSpeed = p.speed;
      p.speed = PLAYER_MOVE_SPEED * 2;
      const tid = setTimeout(() => {
        p.speed = PLAYER_MOVE_SPEED;
      }, TURBO_DURATION * 1000);
      room.timers.effects.push(tid);
      break;
    }

    case 'ghost_spawn': {
      // Spawn ghost near opponent
      const opponentIdx = playerIdx === 0 ? 1 : 0;
      const opp = gs.players[opponentIdx];
      const oppX = Math.round(opp.x);
      const oppY = Math.round(opp.y);

      // Find path cells within 3 cells of opponent
      const cells = getPathCells(gs.maze, MAZE_SIZE, gs.shrinkLevel);
      const nearby = cells.filter(c => {
        const d = Math.abs(c.x - oppX) + Math.abs(c.y - oppY);
        return d >= 2 && d <= 3;
      });

      let spawnCell;
      if (nearby.length > 0) {
        spawnCell = nearby[Math.floor(Math.random() * nearby.length)];
      } else {
        // Fallback: random path cell
        spawnCell = cells[Math.floor(Math.random() * cells.length)];
      }

      if (spawnCell) {
        gs.ghosts.push({
          x: spawnCell.x,
          y: spawnCell.y,
          speed: GHOST_BASE_SPEED + gs.shrinkLevel * GHOST_SPEED_INCREASE,
          path: [],
          pathTimer: 0,
        });
      }
      break;
    }

    case 'phase': {
      p.phased = true;
      const tid = setTimeout(() => {
        p.phased = false;
      }, PHASE_DURATION * 1000);
      room.timers.effects.push(tid);
      break;
    }

    case 'glue':
      p.inventory = 'glue';
      break;

    case 'dynamite':
      p.inventory = 'dynamite';
      break;
  }
}

function handleMessage(room, seat, msg, broadcast) {
  const gs = room.gameState;
  const playerIdx = seat - 1;
  const p = gs.players[playerIdx];
  if (!p || !p.alive) return;

  if (msg.type === 'move') {
    if (p.frozen) return;

    const dir = DIR_MAP[msg.dir];
    if (!dir) return;

    // Calculate target cell from current rounded position
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    const tx = cx + dir.dx;
    const ty = cy + dir.dy;

    // Validate: must be path and within shrink bounds
    const lo = gs.shrinkLevel;
    const hi = MAZE_SIZE - 1 - gs.shrinkLevel;
    if (tx < lo || tx > hi || ty < lo || ty > hi) return;
    if (gs.maze[ty][tx] === 1) return;

    // Set movement target
    p.targetX = tx;
    p.targetY = ty;
  }

  if (msg.type === 'place_trap') {
    if (p.inventory !== 'glue') return;

    // Count existing traps owned by this player
    const owned = gs.traps.filter(t => t.owner === playerIdx).length;
    if (owned >= MAX_TRAPS_PER_PLAYER) return;

    const tx = Math.round(p.x);
    const ty = Math.round(p.y);
    gs.traps.push({ x: tx, y: ty, owner: playerIdx });
    p.inventory = null;
  }

  if (msg.type === 'use_dynamite') {
    if (p.inventory !== 'dynamite') return;

    const dir = DIR_MAP[msg.dir];
    if (!dir) return;

    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    const wx = cx + dir.dx;
    const wy = cy + dir.dy;

    // Validate: must be a wall within shrink bounds
    const lo = gs.shrinkLevel;
    const hi = MAZE_SIZE - 1 - gs.shrinkLevel;
    if (wx < lo || wx > hi || wy < lo || wy > hi) return;
    if (gs.maze[wy][wx] !== 1) return;

    gs.maze[wy][wx] = 0;
    p.inventory = null;
    broadcast({ type: 'maze_wall_destroyed', x: wx, y: wy });
  }
}

function _stopTimers(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }
  if (room.timers.effects) {
    for (const tid of room.timers.effects) {
      clearTimeout(tid);
    }
    room.timers.effects = [];
  }
}

function dispose(room) {
  _stopTimers(room);
  room.timers = {};
}

module.exports = { init, getState, start, handleMessage, dispose };
