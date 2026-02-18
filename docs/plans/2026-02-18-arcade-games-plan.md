# Arcade Games Category Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 3 new arcade games (Sky Duel, Maze Mayhem, Snake Clash) in a new "Arcade" category, bringing hex-duel to 15 games across 5 categories.

**Architecture:** Each game has a server module (CommonJS, `server/games/X.js`) and a client module (ES module, `public/js/games/X.js`). Server is authoritative — all game logic runs server-side at 20fps (50ms tick). Client renders state and sends input. All games use Canvas 2D, photo avatar on player characters, Web Audio for sounds.

**Tech Stack:** Node.js (server), vanilla JS + Canvas 2D (client), Web Audio API (sounds), navigator.vibrate (haptics)

**Design doc:** `docs/plans/2026-02-18-arcade-games-design.md`

---

## Reference: Codebase Patterns

### Server Game Module Pattern
Every server game at `server/games/X.js` exports:
```js
module.exports = { init, getState, start, handleMessage, dispose };
```
- `init(room)` — sets `room.gameState = { ... }`
- `getState(room)` — returns serializable snapshot for initial state broadcast
- `start(room, broadcast)` — starts game loop via `room.timers.gameTick = setInterval(..., 50)`
- `handleMessage(room, seat, msg, broadcast)` — handles client input (seat is 1 or 2)
- `dispose(room)` — clears all timers

Reference files: `server/games/pong.js`, `server/games/derby.js`, `server/games/drift.js`

### Client Game Module Pattern
Every client game at `public/js/games/X.js` exports:
```js
export function init(ctx) { ... }
export function destroy() { ... }
export default { init, destroy };
```
- Module-level variables: `let _destroyed = false; let _unsubs = []; let _ctx = null;`
- `ctx` object has: `{ area, ws, seat, names, state, timerEl, turnText, p1Tag, p2Tag }`
- Subscribe to messages: `_unsubs.push(ctx.ws.on('msg_type', (msg) => { if (_destroyed) return; ... }))`
- `destroy()` sets `_destroyed = true`, unsubscribes, cancels animation frames, nulls refs
- **NEVER** call `removeAllListeners()` — use `_destroyed` flag instead
- Import sounds: `import { pingSound } from '../lib/sounds.js';`
- Import haptics: `import { vibrate } from '../lib/haptics.js';`
- Import photo avatar: `import { getPhotoAvatar } from '../lib/photo-avatar.js';`

Reference files: `public/js/games/pong.js`, `public/js/games/derby.js`

### Game Registry
File: `public/js/lib/game-registry.js` — add entries to `GAME_REGISTRY`, `CATEGORIES`, and `GAME_COLORS`.

### Room Registration
File: `server/rooms.js` — add `require('./games/X')` and entry in `GAMES` map.

### Testing
No test framework. Verify with:
1. `node -e "require('./server/games/X')"` — module loads without error
2. `node -c public/js/games/X.js` — syntax check
3. `timeout 3 node server.js` — server starts
4. Manual browser test at port 3000

---

## Task 1: Sky Duel Server Game

**Files:**
- Create: `server/games/skyduel.js`

**Context:** Two planes at top/bottom, auto-fire bullets, power-ups drop from center. 3 HP, 40s limit. Server handles all bullet physics, collision, power-up effects.

**Step 1: Create the server game module**

Create `server/games/skyduel.js` with these constants and full implementation:

```js
const TICK_MS = 50; // 20fps
const ARENA_W = 100; // normalized 0-100
const PLANE_Y = [85, 15]; // seat1 bottom, seat2 top
const PLANE_SPEED = 40; // units/sec
const BULLET_SPEED = 60; // units/sec
const HOMING_SPEED = 40; // slower but tracks
const HOMING_TURN_RATE = 3; // radians/sec
const BOOMERANG_SPEED = 50;
const AUTO_FIRE_INTERVAL = 0.8; // seconds
const POWERUP_DROP_INTERVAL = 4; // seconds
const POWERUP_FALL_SPEED = 15; // units/sec
const POWERUP_HIT_DIST = 5; // bullet-to-powerup
const BULLET_HIT_DIST = 4; // bullet-to-plane
const MINE_HIT_DIST = 5;
const MAX_HP = 3;
const TIME_LIMIT = 40;
const REVERSE_DURATION = 3; // seconds
const SHIELD_DURATION = 15; // seconds (long, but one-use)
const MAX_BULLETS = 20; // cap per player
const MAX_MINES = 3; // cap per player
```

**Game state structure:**
```js
room.gameState = {
  players: [
    { x: 30, hp: MAX_HP, shield: false, activeWeapon: null, reversed: false, lastFire: 0 },
    { x: 70, hp: MAX_HP, shield: false, activeWeapon: null, reversed: false, lastFire: 0 },
  ],
  bullets: [], // { x, y, vx, vy, type, owner, age }
  mines: [],   // { x, y, owner }
  powerups: [], // { x, y, type } — falling powerups
  elapsed: 0,
  nextPowerupTime: POWERUP_DROP_INTERVAL,
};
```

**Key algorithms:**

Auto-fire logic (inside tick):
```js
for (let i = 0; i < 2; i++) {
  const p = gs.players[i];
  if (p.hp <= 0) continue;
  if (gs.elapsed - p.lastFire >= AUTO_FIRE_INTERVAL) {
    p.lastFire = gs.elapsed;
    const dirY = i === 0 ? -1 : 1; // seat1 shoots up, seat2 shoots down
    if (p.activeWeapon === 'split') {
      // 3 bullets in a fan: -20deg, 0deg, +20deg
      for (const angleDeg of [-20, 0, 20]) {
        const rad = angleDeg * Math.PI / 180;
        gs.bullets.push({ x: p.x, y: PLANE_Y[i], vx: Math.sin(rad) * BULLET_SPEED, vy: dirY * Math.cos(rad) * BULLET_SPEED, type: 'normal', owner: i, age: 0 });
      }
      p.activeWeapon = null;
    } else if (p.activeWeapon === 'homing') {
      gs.bullets.push({ x: p.x, y: PLANE_Y[i], vx: 0, vy: dirY * HOMING_SPEED, type: 'homing', owner: i, age: 0 });
      p.activeWeapon = null;
    } else if (p.activeWeapon === 'boomerang') {
      gs.bullets.push({ x: p.x, y: PLANE_Y[i], vx: 0, vy: dirY * BOOMERANG_SPEED, type: 'boomerang', owner: i, age: 0, returning: false });
      p.activeWeapon = null;
    } else {
      // Regular bullet
      gs.bullets.push({ x: p.x, y: PLANE_Y[i], vx: 0, vy: dirY * BULLET_SPEED, type: 'normal', owner: i, age: 0 });
    }
  }
}
```

Homing bullet tracking (inside bullet update):
```js
if (b.type === 'homing') {
  const target = gs.players[1 - b.owner];
  if (target.hp > 0) {
    const tx = target.x - b.x;
    const ty = PLANE_Y[1 - b.owner] - b.y;
    const dist = Math.sqrt(tx * tx + ty * ty);
    if (dist > 0) {
      const currentAngle = Math.atan2(b.vx, b.vy);
      const targetAngle = Math.atan2(tx, ty);
      let diff = targetAngle - currentAngle;
      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const turn = Math.sign(diff) * Math.min(Math.abs(diff), HOMING_TURN_RATE * dt);
      const newAngle = currentAngle + turn;
      b.vx = Math.sin(newAngle) * HOMING_SPEED;
      b.vy = Math.cos(newAngle) * HOMING_SPEED;
    }
  }
}
```

Boomerang logic:
```js
if (b.type === 'boomerang' && !b.returning) {
  // After traveling 60% of arena without hit, reverse direction
  if ((b.owner === 0 && b.y < 20) || (b.owner === 1 && b.y > 80)) {
    b.returning = true;
    b.vy = -b.vy;
    b.vx = (gs.players[1 - b.owner].x - b.x) * 0.5; // aim toward opponent on return
  }
}
```

Power-up types: `['split', 'homing', 'mine', 'shield', 'boomerang', 'reverse']`

Power-up dropping: spawn at random X (15-85), y=50, falls toward both players. First bullet that hits it → that player gets it.

Mine placement: when player has `activeWeapon === 'mine'`, place mine at player's X, at y=50 (center). Mines are stationary. Any opponent bullet/plane movement near mine triggers it.

Reverse wind: sets `opponent.reversed = true` for 3 seconds via setTimeout stored on room.timers.

Shield: absorbs 1 hit, reflects the bullet back (reverse vy, set owner to shield player).

**handleMessage:** Only `{ type: 'move', x }` — normalized 0-100, clamped. If player is reversed, invert: `x = 100 - x`.

**Broadcast messages:**
- `sky_state` (20fps): `{ players, bullets, mines, powerups, elapsed }`
- `sky_hit`: `{ seat, hp, shieldBroken }` — on hit events
- `sky_pickup`: `{ seat, powerupType }` — on power-up collect

**End condition:** HP depleted or 40s timeout. Most HP wins on timeout (tie: seat 1).

**Step 2: Verify module loads**

Run: `cd /workspaces/game/hex-duel && node -e "const g = require('./server/games/skyduel'); console.log(Object.keys(g));"`
Expected: `[ 'init', 'getState', 'start', 'handleMessage', 'dispose' ]`

**Step 3: Commit**

```bash
git add server/games/skyduel.js
git commit -m "feat: add Sky Duel server game"
```

---

## Task 2: Maze Mayhem Server Game

**Files:**
- Create: `server/games/maze.js`

**Context:** 13x13 random maze, 2 players, ghosts with A* pathfinding, items, traps, shrinking arena. Grid-based movement.

**Step 1: Create the server game module**

Create `server/games/maze.js` with these constants:

```js
const TICK_MS = 50;
const MAZE_SIZE = 13; // must be odd for maze gen
const PLAYER_SPEED = 5; // cells per second
const GHOST_SPEED = 3; // cells per second (slower than player)
const GHOST_SPEED_INCREASE = 0.3; // per shrink level
const INITIAL_GHOSTS = 2;
const ITEM_COUNT = 8; // initial items scattered
const ITEM_RESPAWN_INTERVAL = 5; // seconds
const SHRINK_INTERVAL = 10; // seconds between shrinks
const PHASE_DURATION = 3; // seconds for phase powerup
const FREEZE_DURATION = 2; // seconds for glue trap
const TURBO_DURATION = 3;
const TIME_LIMIT = 45;
const MAX_TRAPS_PER_PLAYER = 2;
```

**Maze generation — Recursive Backtracker:**
```js
function generateMaze(size) {
  // size must be odd. Grid: 0=path, 1=wall
  const grid = Array.from({ length: size }, () => new Array(size).fill(1));

  function carve(x, y) {
    grid[y][x] = 0;
    const dirs = [[0,-2],[0,2],[-2,0],[2,0]];
    // Shuffle directions
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && grid[ny][nx] === 1) {
        grid[y + dy/2][x + dx/2] = 0; // carve wall between
        carve(nx, ny);
      }
    }
  }

  carve(1, 1);
  return grid;
}
```

**A* pathfinding for ghosts:**
```js
function astar(grid, start, goal, size) {
  const key = (x, y) => y * size + x;
  const open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map();
  gScore.set(key(start.x, start.y), 0);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();

    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path = [];
      let k = key(current.x, current.y);
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k);
        path.unshift({ x: current.x, y: current.y });
        current.x = prev.x; current.y = prev.y;
        k = key(current.x, current.y);
      }
      return path;
    }

    closed.add(key(current.x, current.y));

    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = current.x + dx, ny = current.y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      if (grid[ny][nx] === 1) continue; // wall
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;

      const tentG = (gScore.get(key(current.x, current.y)) || 0) + 1;
      if (tentG < (gScore.get(nk) || Infinity)) {
        gScore.set(nk, tentG);
        const h = Math.abs(nx - goal.x) + Math.abs(ny - goal.y);
        cameFrom.set(nk, { x: current.x, y: current.y });
        if (!open.find(n => n.x === nx && n.y === ny)) {
          open.push({ x: nx, y: ny, g: tentG, f: tentG + h });
        }
      }
    }
  }
  return []; // no path
}
```

**Ghost movement:** Every tick, each ghost moves fractionally toward its A* path target. Recalculate path every 0.5s. Ghost targets the nearest alive player. Speed increases by `GHOST_SPEED_INCREASE` per shrink level.

**Player movement:** Grid-snapped. Player sends `{ type: 'move', dir }` (up/down/left/right). Server validates: target cell must be path (0) and within current shrink bounds. Movement is smooth — player moves toward target cell at `PLAYER_SPEED` cells/sec.

**Shrinking maze:** Every `SHRINK_INTERVAL` seconds, increment `shrinkLevel`. All cells where `x < shrinkLevel` or `x >= MAZE_SIZE - shrinkLevel` or `y < shrinkLevel` or `y >= MAZE_SIZE - shrinkLevel` become wall. Players/ghosts in those cells get pushed inward. Broadcast `maze_shrink` event.

**Items spawn at random path cells:**
- `star` (50% chance) — +1 score
- `turbo` (15%) — speed x2 for 3s
- `ghost_spawn` (10%) — adds ghost near opponent
- `phase` (10%) — transparent 3s
- `glue` (10%) — picks up, player can place trap later with `{ type: 'place_trap' }`
- `dynamite` (5%) — picks up, player can blow wall with `{ type: 'use_dynamite', dir }`

**Traps:** Invisible to opponent. When opponent steps on trap cell, they freeze for `FREEZE_DURATION`. Broadcast `maze_frozen`.

**Dynamite:** Destroys one wall adjacent to player in specified direction. Broadcast `maze_wall_destroyed`.

**Ghost spawn power-up:** New ghost appears at a random path cell within 3 cells of opponent.

**Game state:**
```js
room.gameState = {
  maze: [], // 2D array
  players: [
    { x: 1, y: 1, tx: 1, ty: 1, alive: true, score: 0, speed: PLAYER_SPEED, phased: false, frozen: false, inventory: null },
    { x: 11, y: 11, tx: 11, ty: 11, alive: true, score: 0, speed: PLAYER_SPEED, phased: false, frozen: false, inventory: null },
  ],
  ghosts: [], // { x, y, tx, ty, speed, pathCache, pathTimer }
  items: [],  // { x, y, type }
  traps: [],  // { x, y, owner }
  elapsed: 0,
  shrinkLevel: 0,
  nextShrinkTime: SHRINK_INTERVAL,
  nextItemTime: ITEM_RESPAWN_INTERVAL,
};
```

**Broadcast:** `maze_state` at 20fps with full state (maze only sent once at start via `getState`, then `maze_shrink` events update it).

**End:** Ghost catches player → eliminated. Both dead → tie. Time up → most stars. Last survivor if one eliminated.

**Step 2: Verify module loads**

Run: `cd /workspaces/game/hex-duel && node -e "const g = require('./server/games/maze'); console.log(Object.keys(g));"`
Expected: `[ 'init', 'getState', 'start', 'handleMessage', 'dispose' ]`

**Step 3: Commit**

```bash
git add server/games/maze.js
git commit -m "feat: add Maze Mayhem server game"
```

---

## Task 3: Snake Clash Server Game

**Files:**
- Create: `server/games/snakeclash.js`

**Context:** Two snakes on 20x20 grid, collect food, power-ups cause chaos. Crash = shrink by 3 (not death). Grid-based movement at 150ms intervals.

**Step 1: Create the server game module**

Create `server/games/snakeclash.js` with constants:

```js
const TICK_MS = 50;
const MOVE_INTERVAL = 150; // ms between snake moves
const GRID_SIZE = 20;
const INITIAL_LENGTH = 3;
const CRASH_SHRINK = 3;
const MAX_FOOD = 4;
const FOOD_RESPAWN_INTERVAL = 2; // seconds
const POWERUP_INTERVAL = 8; // seconds
const WALL_MODE_DURATION = 4; // seconds
const GHOST_MODE_DURATION = 3;
const TURBO_DURATION = 3;
const TURBO_MOVE_INTERVAL = 80; // faster move interval
const TIME_LIMIT = 40;
const MINE_COUNT = 3;
const MINE_SHRINK = 2;
const GOLDEN_SPEED_DURATION = 3;
const GOLDEN_MOVE_INTERVAL = 100;
```

**Game state:**
```js
room.gameState = {
  players: [
    { segments: [{x:1,y:1},{x:2,y:1},{x:3,y:1}], dir: 'right', nextDir: 'right', score: 0, speed: MOVE_INTERVAL, ghosted: false, walled: false, alive: true },
    { segments: [{x:18,y:18},{x:17,y:18},{x:16,y:18}], dir: 'left', nextDir: 'left', score: 0, speed: MOVE_INTERVAL, ghosted: false, walled: false, alive: true },
  ],
  food: [],     // { x, y, type } — apple, golden, poison, turbo
  powerups: [],  // { x, y, type } — wall, swap, ghost, mines
  mines: [],     // { x, y, owner }
  elapsed: 0,
  lastMoveTime: [0, 0],
  nextFoodTime: 1,
  nextPowerupTime: POWERUP_INTERVAL,
};
```

**Key algorithms:**

Snake movement (per-player, checked every tick):
```js
const now = gs.elapsed;
for (let i = 0; i < 2; i++) {
  const p = gs.players[i];
  if (!p.alive) continue;
  if (now - gs.lastMoveTime[i] < p.speed / 1000) continue;
  gs.lastMoveTime[i] = now;

  // Apply queued direction
  p.dir = p.nextDir;

  const head = p.segments[0];
  const dirs = { up: {x:0,y:-1}, down: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
  const d = dirs[p.dir];
  const newHead = { x: head.x + d.x, y: head.y + d.y };

  // Wall collision
  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    if (!p.ghosted) { _shrinkSnake(gs, i, CRASH_SHRINK, broadcast); continue; }
    else { newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE; newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE; }
  }

  // Self collision
  if (!p.ghosted && p.segments.some(s => s.x === newHead.x && s.y === newHead.y)) {
    _shrinkSnake(gs, i, CRASH_SHRINK, broadcast); continue;
  }

  // Opponent collision
  const opp = gs.players[1 - i];
  if (!p.ghosted && opp.alive) {
    const hitOpp = opp.segments.some(s => s.x === newHead.x && s.y === newHead.y);
    if (hitOpp) {
      if (opp.walled) {
        _shrinkSnake(gs, i, CRASH_SHRINK, broadcast); continue;
      } else {
        _shrinkSnake(gs, i, CRASH_SHRINK, broadcast); continue;
      }
    }
  }

  // Mine collision
  const mineIdx = gs.mines.findIndex(m => m.x === newHead.x && m.y === newHead.y && m.owner !== i);
  if (mineIdx !== -1 && !p.ghosted) {
    gs.mines.splice(mineIdx, 1);
    _shrinkSnake(gs, i, MINE_SHRINK, broadcast);
    // Don't skip — still move
  }

  // Move: add new head
  p.segments.unshift(newHead);

  // Check food
  const foodIdx = gs.food.findIndex(f => f.x === newHead.x && f.y === newHead.y);
  if (foodIdx !== -1) {
    const food = gs.food[foodIdx];
    gs.food.splice(foodIdx, 1);
    _applyFood(gs, i, food, broadcast);
  } else {
    // No food — remove tail (normal movement)
    p.segments.pop();
  }

  // Check powerup
  const puIdx = gs.powerups.findIndex(pu => pu.x === newHead.x && pu.y === newHead.y);
  if (puIdx !== -1) {
    const pu = gs.powerups[puIdx];
    gs.powerups.splice(puIdx, 1);
    _applyPowerup(gs, i, pu, room, broadcast);
    p.segments.pop(); // still consume tail movement for powerup
  }
}
```

Food effects:
- `apple`: +1 score, grow by 1 (don't pop tail)
- `golden`: +3 score, grow by 2 (don't pop tail for 2 moves), both snakes speed up for 3s
- `poison`: -2 score, shrink by 2
- `turbo`: speed = TURBO_MOVE_INTERVAL for 3s

Power-up effects:
- `wall`: player's tail becomes wall for 4s (set `p.walled = true`, setTimeout to clear)
- `swap`: swap `players[0].segments` with `players[1].segments` and swap `dir`s
- `ghost`: `p.ghosted = true` for 3s — phase through everything, wrap at walls
- `mines`: drop 3 mines at the last 3 tail positions

Shrink function:
```js
function _shrinkSnake(gs, idx, amount, broadcast) {
  const p = gs.players[idx];
  for (let i = 0; i < amount && p.segments.length > 0; i++) {
    p.segments.pop();
  }
  if (p.segments.length === 0) {
    p.alive = false;
  }
  p.score = Math.max(0, p.score - amount);
  broadcast({ type: 'snake_hit', seat: idx + 1, length: p.segments.length, alive: p.alive });
}
```

Random free cell:
```js
function _randomFreeCell(gs) {
  const occupied = new Set();
  for (const p of gs.players) {
    for (const s of p.segments) occupied.add(`${s.x},${s.y}`);
  }
  for (const f of gs.food) occupied.add(`${f.x},${f.y}`);
  for (const pu of gs.powerups) occupied.add(`${pu.x},${pu.y}`);
  for (const m of gs.mines) occupied.add(`${m.x},${m.y}`);

  let x, y;
  for (let tries = 0; tries < 100; tries++) {
    x = Math.floor(Math.random() * GRID_SIZE);
    y = Math.floor(Math.random() * GRID_SIZE);
    if (!occupied.has(`${x},${y}`)) return { x, y };
  }
  return { x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2) };
}
```

Food spawning: Random type — apple 60%, golden 10%, poison 15%, turbo 15%.

**handleMessage:** `{ type: 'dir', dir }` — validate direction isn't opposite of current (no instant reversal). Store in `p.nextDir`.

**Broadcast:** `snake_state` at 20fps with all state. Additional events: `snake_hit`, `snake_powerup`, `snake_swap`.

**End:** Time up or both dead or one dead. Most score wins if both alive. Survivor wins if one dead. Tie: seat 1.

**Step 2: Verify module loads**

Run: `cd /workspaces/game/hex-duel && node -e "const g = require('./server/games/snakeclash'); console.log(Object.keys(g));"`
Expected: `[ 'init', 'getState', 'start', 'handleMessage', 'dispose' ]`

**Step 3: Commit**

```bash
git add server/games/snakeclash.js
git commit -m "feat: add Snake Clash server game"
```

---

## Task 4: Sky Duel Client Game

**Files:**
- Create: `public/js/games/skyduel.js`

**Context:** Canvas 2D rendering of two planes, bullets, mines, power-ups. Photo avatar on cockpit. Input: horizontal drag/touch to move plane.

**Step 1: Create the client game module**

Create `public/js/games/skyduel.js` following the client pattern (module-level vars, init/destroy exports).

**Visual design spec:**

Canvas setup: full-width, 400px height. DPR-aware.

Background layers (parallax):
- Layer 1 (far): slow-scrolling dark gradient sky `#0a0a2e` → `#1a1a4e`
- Layer 2 (mid): 3-4 cloud shapes, semi-transparent white blobs, scroll at 5px/s
- Layer 3 (near): 2 cloud shapes, slightly more opaque, scroll at 10px/s

Planes:
- Triangle shape pointing at opponent (up or down depending on seat)
- Player's plane: cyan `#06B6D4` with glow
- Opponent's plane: magenta `#EC4899` with glow
- Photo avatar: draw circular clipped image (24px) at plane center using `ctx.clip()` with arc
- If no photo: draw colored circle with first letter of name
- When hit: flash red + shake (offset position by random +-3px for 10 frames)
- When dead: explosion particles — 20 circles expanding outward with fade

Shield visual: semi-transparent circle (radius 20 in game units) around plane, pulsing opacity

Active weapon indicator: small icon drawn below plane (emoji rendered via `ctx.fillText`)

Bullets:
- Normal: small circle (radius 2), colored per player
- Homing: slightly larger, with a faint trail (last 3 positions as smaller fading circles)
- Boomerang: spinning arc shape (rotate over time), trail
- All bullets leave a faint 3-frame trail

Mines: pulsing red circles with `💣` emoji rendered at center

Power-ups (falling): glowing rectangles with emoji icon, gentle bob animation

HUD:
- HP display: hearts (❤️ or 🖤) for each player, positioned at top-left and top-right
- Active weapon badge: shows current weapon icon below HP
- Timer: use `ctx.timerEl` from game screen

Input:
- Touch/mouse drag on canvas: send `{ type: 'move', x }` (normalized 0-100 based on touch X)
- Throttle to 20 sends/sec max

Sounds (Web Audio):
- `pewSound()`: short high-frequency oscillator burst (800Hz, 50ms)
- `boomSound()`: low frequency (100Hz, 200ms) with decay
- `whooshSound()`: white noise burst (100ms) with bandpass filter
- `shieldSound()`: metallic ping (1200Hz, 100ms)
- `pickupSound()`: ascending two-tone (400Hz→800Hz, 100ms each)

Haptics:
- Hit taken: `vibrate('hit')` or `vibrate([50, 30, 50])`
- Power-up pickup: `vibrate('tap')`

**Message handling:**
- `sky_state`: update all positions (planes, bullets, mines, powerups, elapsed)
- `sky_hit`: flash + shake on hit, update HP display
- `sky_pickup`: show brief weapon icon, play pickup sound

**Seat perspective:** If seat === 2, flip Y coordinates so player is always at bottom.

**Step 2: Verify syntax**

Run: `cd /workspaces/game/hex-duel && node -c public/js/games/skyduel.js`
Expected: no error

**Step 3: Commit**

```bash
git add public/js/games/skyduel.js
git commit -m "feat: add Sky Duel client game"
```

---

## Task 5: Maze Mayhem Client Game

**Files:**
- Create: `public/js/games/maze.js`

**Context:** Canvas 2D top-down maze rendering. Neon visual style. Photo avatar as player character.

**Step 1: Create the client game module**

Create `public/js/games/maze.js`.

**Visual design spec:**

Canvas: full-width, square aspect ratio (min(width, 400px)). DPR-aware.

Maze rendering:
- Cell size: `canvasWidth / mazeSize`
- Walls: filled rectangles in purple `#8B5CF6` with subtle glow (shadowBlur=4, shadowColor=#8B5CF6)
- Paths: dark `#0a0a1e`
- Grid overlay: very faint lines (rgba(139,92,246,0.1)) on path cells

Players:
- Circle with photo avatar (clipped to circle, `cellSize * 0.8` diameter)
- If no photo: colored circle with emoji/letter
- My player: cyan `#06B6D4` glow ring
- Opponent: magenta `#EC4899` glow ring
- Smooth interpolation between grid cells (lerp position toward target cell)
- When phased: 50% opacity + faint glow
- When frozen: blue tint + ice crystal emoji above

Ghosts:
- Semi-transparent white circles with two dot "eyes"
- Pulsing opacity (0.3 ↔ 0.7)
- When close to player: eyes turn red, vibrate slightly
- Smooth movement interpolation between cells

Items:
- Rendered as emoji text at cell center: ⭐ 🧨 ⚡ 👻 💨 🪤
- Gentle floating animation (oscillate Y by +-2px)

Traps:
- My traps: very faint dotted circle (only visible to owner)
- Opponent traps: completely invisible

Shrink visualization:
- Cells becoming walls: flash red → fade to purple wall color
- Screen shake on shrink event
- Brief red border flash

Fog of war (optional but recommended):
- Only reveal maze within 4 cells of player (radial gradient mask)
- Opponent visible only if within 5 cells (or always visible — up to implementation)
- Decision: make opponent always visible (more fun for spectating/chasing)

HUD:
- Score: star count for each player at top
- Inventory: current held item icon (if any) at bottom
- Timer: via `ctx.timerEl`
- Ghost count indicator

Input:
- Swipe detection on canvas: measure touch delta on touchend, determine direction (up/down/left/right)
- Also: 4 directional buttons below canvas as backup
- Send `{ type: 'move', dir }` on input
- For inventory use: `{ type: 'place_trap' }` or `{ type: 'use_dynamite', dir }` — button appears when player has item

Sounds:
- Star collect: bright ding (1000Hz, 50ms)
- Ghost nearby: low pulsing tone that gets louder/faster
- Freeze: ice crack sound (white noise burst + high freq)
- Dynamite: deep boom + crumble (100Hz + noise)
- Ghost spawn (from opponent's pickup): spooky warble (200-400Hz sweep)
- Caught by ghost: descending tone + vibration

Haptics:
- Ghost nearby: gentle pulse
- Caught: strong vibrate
- Item pickup: tap
- Freeze trap triggered: buzz

**Message handling:**
- `maze_state`: update player positions, ghost positions, items, traps (own only), elapsed
- `maze_shrink`: update maze grid (close outer ring), play shrink effect
- `maze_caught`: elimination animation, play death sound
- `maze_frozen`: play freeze sound/animation for target

**Step 2: Verify syntax**

Run: `cd /workspaces/game/hex-duel && node -c public/js/games/maze.js`
Expected: no error

**Step 3: Commit**

```bash
git add public/js/games/maze.js
git commit -m "feat: add Maze Mayhem client game"
```

---

## Task 6: Snake Clash Client Game

**Files:**
- Create: `public/js/games/snakeclash.js`

**Context:** Canvas 2D grid-based snake game. Neon green theme. Photo avatar on snake head.

**Step 1: Create the client game module**

Create `public/js/games/snakeclash.js`.

**Visual design spec:**

Canvas: full-width, square aspect ratio (min(width, 400px)). DPR-aware.

Grid:
- Cell size: `canvasWidth / GRID_SIZE`
- Background: dark `#0a0a1a`
- Grid lines: very faint neon green `rgba(16,185,129,0.08)`
- Border: slightly brighter green line

Snakes:
- Head: rounded square with photo avatar (clipped circle, `cellSize * 0.7`)
- If no photo: colored circle with emoji
- Body segments: rounded rectangles with slight size reduction toward tail
- My snake: cyan-green gradient `#06B6D4` → `#10B981`
- Opponent: pink-purple gradient `#EC4899` → `#8B5CF6`
- Smooth interpolation: each segment lerps toward its grid position
- When ghosted: 40% opacity + faint glow aura
- When walled: body segments outlined in white with glow, pulsing
- Direction indicator: small triangle on head pointing in movement direction

Growth animation: new segment pops in with scale 0 → 1

Shrink animation: removed segments flash red and shrink to 0

Food:
- Apple 🍎: gentle pulse at cell center
- Golden 🌟: bright golden glow, sparkle particles
- Poison ☠️: sickly green glow, slight wobble
- Turbo 🚀: fast pulse, blue glow

Power-ups:
- Wall 🧱: brown glow
- Swap 🔄: spinning animation (rotate emoji)
- Ghost 👻: ethereal glow, semi-transparent
- Mines 💥: red pulse

Mines (placed):
- Very small red dots, barely visible
- Pulse faintly

Swap effect: full-screen flash + whoosh trail between old and new positions

HUD:
- Score: large numbers for each player at top (cyan vs magenta)
- Snake length indicator: small bar or number
- Power-up status: icon shown when player has active power-up
- Timer: via `ctx.timerEl`

Input:
- Swipe detection on canvas: touchstart records position, touchend calculates delta, sends direction
- 4 arrow buttons below canvas (RTL: right ◀, up ▲, down ▼, left ▶)
- Send `{ type: 'dir', dir }` (up/down/left/right)
- Prevent opposite direction (if going right, can't instantly go left) — server also validates this

Sounds:
- Chomp: short snappy sound (600Hz, 30ms square wave)
- Hiss/crash: white noise burst (150ms)
- Golden apple spawn: bright ding-ding-ding (ascending 3 tones)
- Swap: whoosh (frequency sweep 800→200Hz)
- Mine explosion: boom (80Hz, 100ms)
- Ghost mode: ethereal sweep (300-600Hz with tremolo)

Haptics:
- Eat food: quick tap
- Crash/shrink: strong buzz
- Power-up pickup: double tap
- Swap: long buzz

**Message handling:**
- `snake_state`: update all snake segments, food, powerups, mines, elapsed, scores
- `snake_hit`: play crash sound, flash animation, update length
- `snake_powerup`: show power-up activation effect
- `snake_swap`: play swap animation (flash + position change)

**Step 2: Verify syntax**

Run: `cd /workspaces/game/hex-duel && node -c public/js/games/snakeclash.js`
Expected: no error

**Step 3: Commit**

```bash
git add public/js/games/snakeclash.js
git commit -m "feat: add Snake Clash client game"
```

---

## Task 7: Integration — Registry, Rooms, CSS

**Files:**
- Modify: `public/js/lib/game-registry.js`
- Modify: `server/rooms.js`
- Modify: `public/css/style.css`
- Modify: `public/index.html`

**Step 1: Update game-registry.js**

Add 3 game entries to `GAME_REGISTRY`:

```js
skyduel: {
  id: 'skyduel',
  emoji: '✈️',
  name: 'קרב אווירי',
  tagline: 'ירה. התחמק. שלוט בשמיים.',
  category: 'arcade',
  difficulty: 2,
  duration: '40 שנ\'',
  instructions: [
    'המטוס שלך יורה אוטומטית — זוז ימינה-שמאלה כדי לכוון',
    'ירה על פאוור-אפים שנופלים כדי לתפוס נשקים מיוחדים',
    'מגן מחזיר יריות, מוקש רחפני = מלכודת, רוח הפוכה = בלגן!',
    '3 חיים. 40 שניות. מי שנשאר — מנצח!',
  ],
},
maze: {
  id: 'maze',
  emoji: '👻',
  name: 'מבוך מסוכן',
  tagline: 'ברח מרוחות. שלח צרות ליריב.',
  category: 'arcade',
  difficulty: 2,
  duration: '45 שנ\'',
  instructions: [
    'שני שחקנים במבוך — רוחות רודפות את שניכם',
    'אסוף כוכבים ופריטים מיוחדים: דינמיט, מלכודת דבק, רוח שד',
    'המבוך מתכווץ כל 10 שניות!',
    'מי ששורד אחרון — מנצח. שווה? הכי הרבה כוכבים!',
  ],
},
snakeclash: {
  id: 'snakeclash',
  emoji: '🐍',
  name: 'קרב נחשים',
  tagline: 'גדל. תקוף. שרוד.',
  category: 'arcade',
  difficulty: 2,
  duration: '40 שנ\'',
  instructions: [
    'שני נחשים על אותו לוח — אסוף אוכל כדי לגדול',
    'התנגשות = מתכווץ ב-3 (לא מת מיד!)',
    'פאוור-אפים: קיר זמני, החלפת מקום, רוח רפאים, מוקשים',
    '40 שניות — הכי הרבה נקודות מנצח!',
  ],
},
```

Add new category to `CATEGORIES`:
```js
{
  id: 'arcade',
  title: '👾 ארקייד',
  games: ['skyduel', 'maze', 'snakeclash'],
},
```

Add to `GAME_COLORS`:
```js
skyduel: { p1: '#06B6D4', p2: '#EC4899', p1bg: 'rgba(6,182,212,0.2)', p2bg: 'rgba(236,72,153,0.2)' },
maze: { p1: '#8B5CF6', p2: '#F59E0B', p1bg: 'rgba(139,92,246,0.2)', p2bg: 'rgba(245,158,11,0.2)' },
snakeclash: { p1: '#10B981', p2: '#EC4899', p1bg: 'rgba(16,185,129,0.2)', p2bg: 'rgba(236,72,153,0.2)' },
```

**Step 2: Update rooms.js**

Add at top of file:
```js
const skyduelGame = require('./games/skyduel');
const mazeGame = require('./games/maze');
const snakeclashGame = require('./games/snakeclash');
```

Add to GAMES map:
```js
skyduel: skyduelGame,
maze: mazeGame,
snakeclash: snakeclashGame,
```

**Step 3: Update style.css**

Add arcade game canvas styles:
```css
/* Arcade games canvas container */
.arcade-canvas-wrap {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  position: relative;
}

.arcade-canvas-wrap canvas {
  width: 100%;
  display: block;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.3);
}

/* Arcade game controls */
.arcade-controls {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.arcade-controls button {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.3);
  background: rgba(139, 92, 246, 0.1);
  color: #E2E8F0;
  font-size: 20px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}

.arcade-controls button:active {
  background: rgba(139, 92, 246, 0.3);
}

/* D-pad layout for maze/snake */
.dpad {
  display: grid;
  grid-template-areas: ". up ." "left . right" ". down .";
  grid-template-columns: 56px 56px 56px;
  grid-template-rows: 48px 48px 48px;
  gap: 4px;
  justify-content: center;
  margin-top: 8px;
}

.dpad button[data-dir="up"] { grid-area: up; }
.dpad button[data-dir="down"] { grid-area: down; }
.dpad button[data-dir="left"] { grid-area: left; }
.dpad button[data-dir="right"] { grid-area: right; }

/* Inventory button */
.inventory-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(245, 158, 11, 0.5);
  background: rgba(245, 158, 11, 0.15);
  font-size: 20px;
  color: #F59E0B;
  cursor: pointer;
  display: none;
}

.inventory-btn.visible {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 1s infinite;
}

/* HP hearts display */
.hp-display {
  display: flex;
  gap: 2px;
  font-size: 18px;
}
```

**Step 4: Update index.html**

Change meta description from "12 משחקים" to "15 משחקים".

**Step 5: Verify all modules load**

Run: `cd /workspaces/game/hex-duel && timeout 3 node server.js`
Expected: `Game Arena running at http://localhost:3000`

**Step 6: Commit**

```bash
git add public/js/lib/game-registry.js server/rooms.js public/css/style.css public/index.html
git commit -m "feat: integrate 3 arcade games — registry, rooms, CSS"
```

---

## Task 8: Test, Push, Deploy

**Step 1: Full server test**

```bash
cd /workspaces/game/hex-duel
timeout 3 node server.js
```
Expected: starts without errors.

**Step 2: Syntax check all new client files**

```bash
node -c public/js/games/skyduel.js
node -c public/js/games/maze.js
node -c public/js/games/snakeclash.js
```
Expected: no errors.

**Step 3: Verify all server modules**

```bash
node -e "
  const s = require('./server/games/skyduel');
  const m = require('./server/games/maze');
  const n = require('./server/games/snakeclash');
  console.log('skyduel:', Object.keys(s));
  console.log('maze:', Object.keys(m));
  console.log('snakeclash:', Object.keys(n));
"
```
Expected: all show `[ 'init', 'getState', 'start', 'handleMessage', 'dispose' ]`.

**Step 4: Push to GitHub**

```bash
git push origin main
```

**Step 5: Deploy to DigitalOcean**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $DO_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.digitalocean.com/v2/apps/<app-id>/deployments" \
  -d '{"force_build":true}'
```

**Step 6: Verify deployment**

Poll deployment status until ACTIVE:
```bash
curl -s \
  -H "Authorization: Bearer <token>" \
  "https://api.digitalocean.com/v2/apps/<app-id>/deployments/<deployment-id>" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['deployment']['phase'])"
```
Expected: `ACTIVE`

**Step 7: Final commit message**

The last commit was the integration commit. Push includes all previous task commits.
