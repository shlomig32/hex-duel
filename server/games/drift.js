// Drift Arena — circular arena, collect coins, bump to steal
// Two cars drive forward continuously; steering is the only input.
// Most coins after 30 seconds wins.

const TICK_MS = 50; // 20 fps
const ARENA_RADIUS = 40;
const COIN_SPAWN_RADIUS = 35;
const MAX_COINS = 5;
const COIN_INTERVAL = 3; // seconds between spawns
const PICKUP_DIST = 3;
const BUMP_DIST = 4;
const BUMP_COOLDOWN = 1; // seconds
const STUN_DURATION = 500; // ms
const CAR_SPEED = 8; // units per second
const TURN_RATE = 3; // radians per second
const GAME_DURATION = 30; // seconds

function init(room) {
  room.gameState = {
    players: [
      { x: -20, y: 0, angle: 0, speed: CAR_SPEED, coins: 0, stunned: false, steerInput: 0 },
      { x: 20, y: 0, angle: Math.PI, speed: CAR_SPEED, coins: 0, stunned: false, steerInput: 0 },
    ],
    coins: [],
    elapsed: 0,
    nextCoinTime: 2,
    lastBumpTime: -BUMP_COOLDOWN,
  };
}

function getState(room) {
  const gs = room.gameState;
  return {
    players: gs.players.map(p => ({
      x: round2(p.x),
      y: round2(p.y),
      angle: round2(p.angle),
      coins: p.coins,
      stunned: p.stunned,
    })),
    coins: gs.coins.map(c => ({ x: round2(c.x), y: round2(c.y) })),
    elapsed: round2(gs.elapsed),
    duration: GAME_DURATION,
    arenaRadius: ARENA_RADIUS,
  };
}

function start(room, broadcast) {
  room.gameState.startTime = Date.now();

  room.timers.gameTick = setInterval(() => {
    const gs = room.gameState;
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    // --- Update car positions ---
    for (let i = 0; i < 2; i++) {
      const p = gs.players[i];
      if (p.stunned) continue;

      // Apply steering
      p.angle += p.steerInput * TURN_RATE * dt;

      // Move forward
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;

      // Clamp to arena boundary
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      if (dist > ARENA_RADIUS) {
        p.x = (p.x / dist) * ARENA_RADIUS;
        p.y = (p.y / dist) * ARENA_RADIUS;
      }
    }

    // --- Check coin collection ---
    for (let i = gs.coins.length - 1; i >= 0; i--) {
      const coin = gs.coins[i];
      for (let j = 0; j < 2; j++) {
        const p = gs.players[j];
        if (p.stunned) continue;
        const dx = p.x - coin.x;
        const dy = p.y - coin.y;
        if (Math.sqrt(dx * dx + dy * dy) < PICKUP_DIST) {
          p.coins++;
          gs.coins.splice(i, 1);
          broadcast({ type: 'coin_collected', seat: j + 1, coins: p.coins });
          break;
        }
      }
    }

    // --- Check bump ---
    const p0 = gs.players[0];
    const p1 = gs.players[1];
    if (!p0.stunned && !p1.stunned && gs.elapsed - gs.lastBumpTime >= BUMP_COOLDOWN) {
      const dx = p0.x - p1.x;
      const dy = p0.y - p1.y;
      if (Math.sqrt(dx * dx + dy * dy) < BUMP_DIST) {
        gs.lastBumpTime = gs.elapsed;

        // Each player steals 1 coin from the other (mutual bump).
        // If only one has coins, only they lose one.
        const steal0 = p1.coins > 0 ? 1 : 0; // p0 steals from p1
        const steal1 = p0.coins > 0 ? 1 : 0; // p1 steals from p0
        p0.coins = p0.coins - steal1 + steal0;
        p1.coins = p1.coins - steal0 + steal1;

        // Stun both players
        p0.stunned = true;
        p1.stunned = true;
        setTimeout(() => { p0.stunned = false; }, STUN_DURATION);
        setTimeout(() => { p1.stunned = false; }, STUN_DURATION);

        broadcast({
          type: 'bump',
          coins: [p0.coins, p1.coins],
        });
      }
    }

    // --- Spawn coins ---
    if (gs.elapsed >= gs.nextCoinTime && gs.coins.length < MAX_COINS) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * COIN_SPAWN_RADIUS;
      gs.coins.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      gs.nextCoinTime = gs.elapsed + COIN_INTERVAL;
      broadcast({
        type: 'coin_spawned',
        coins: gs.coins.map(c => ({ x: round2(c.x), y: round2(c.y) })),
      });
    }

    // --- Broadcast state ---
    broadcast({
      type: 'race_state',
      players: gs.players.map(p => ({
        x: round2(p.x),
        y: round2(p.y),
        angle: round2(p.angle),
        coins: p.coins,
        stunned: p.stunned,
      })),
      coins: gs.coins.map(c => ({ x: round2(c.x), y: round2(c.y) })),
      elapsed: round2(gs.elapsed),
    });

    // --- Check game over ---
    if (gs.elapsed >= GAME_DURATION) {
      clearInterval(room.timers.gameTick);
      room.timers.gameTick = null;
      room.phase = 'ended';

      const winner = p0.coins > p1.coins ? 1 : p1.coins > p0.coins ? 2 : 0;
      broadcast({
        type: 'gameover',
        winner,
        coins: [p0.coins, p1.coins],
      });
    }
  }, TICK_MS);
}

function handleMessage(room, seat, msg, broadcast) {
  if (msg.type === 'steer') {
    const p = room.gameState.players[seat - 1];
    if (!p) return;
    // Clamp steering input to [-1, 1]
    const input = Number(msg.angle);
    if (!Number.isFinite(input)) return;
    p.steerInput = Math.max(-1, Math.min(1, input));
  }
}

function dispose(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { init, getState, start, handleMessage, dispose };
