// Demolition Derby — two cars in a small arena, ram to damage, last standing wins
// 60x60 arena centered at origin, 3 HP each, power-ups spawn periodically

const TICK_MS = 50; // 20fps
const ARENA_HALF = 30; // arena from -30 to 30
const BASE_SPEED = 10; // units per second
const BOOST_SPEED = 20; // units per second when boosted
const STEER_RATE = 3.5; // radians per second at full input
const COLLISION_DIST = 4; // units — car-to-car collision threshold
const COLLISION_COOLDOWN = 1.5; // seconds between collisions
const STUN_DURATION = 0.6; // seconds
const BOOST_DURATION = 3; // seconds
const POWERUP_INTERVAL = 5; // seconds between powerup spawns
const POWERUP_PICKUP_DIST = 3; // units
const MAX_POWERUPS = 2;
const MAX_HP = 3;
const TIME_LIMIT = 45; // seconds

function init(room) {
  room.gameState = {
    players: [
      { x: -15, y: 0, angle: 0, speed: BASE_SPEED, hp: MAX_HP, shield: false, boosted: false, stunned: false, steerInput: 0, braking: false },
      { x: 15, y: 0, angle: Math.PI, speed: BASE_SPEED, hp: MAX_HP, shield: false, boosted: false, stunned: false, steerInput: 0, braking: false },
    ],
    powerups: [],
    elapsed: 0,
    nextPowerupTime: POWERUP_INTERVAL,
    lastCollisionTime: -COLLISION_COOLDOWN, // allow immediate first collision
  };
}

function getState(room) {
  const gs = room.gameState;
  return {
    players: gs.players.map(p => ({
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      shield: p.shield,
      boosted: p.boosted,
      stunned: p.stunned,
    })),
    powerups: gs.powerups.map(pu => ({ x: pu.x, y: pu.y, type: pu.type })),
    elapsed: gs.elapsed,
    timeLimit: TIME_LIMIT,
    arenaSize: ARENA_HALF * 2,
  };
}

function start(room, broadcast) {
  room.timers.gameTick = setInterval(() => {
    const gs = room.gameState;
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    // Move cars
    for (let i = 0; i < 2; i++) {
      const p = gs.players[i];
      if (p.stunned || p.hp <= 0) continue;

      // Steering
      p.angle += p.steerInput * STEER_RATE * dt;

      // Determine effective speed
      let effectiveSpeed = p.boosted ? BOOST_SPEED : BASE_SPEED;
      if (p.braking) {
        effectiveSpeed *= 0.3;
      }

      // Move forward along facing direction
      p.x += Math.cos(p.angle) * effectiveSpeed * dt;
      p.y += Math.sin(p.angle) * effectiveSpeed * dt;

      // Clamp to arena bounds
      p.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p.x));
      p.y = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p.y));
    }

    // Car-to-car collision
    _checkCarCollision(gs, broadcast);

    // Power-up pickup
    _checkPowerupPickup(gs, broadcast);

    // Spawn power-ups
    if (gs.elapsed >= gs.nextPowerupTime && gs.powerups.length < MAX_POWERUPS) {
      _spawnPowerup(gs);
      gs.nextPowerupTime = gs.elapsed + POWERUP_INTERVAL;
    }

    // Broadcast state
    broadcast({
      type: 'derby_state',
      players: gs.players.map(p => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        angle: Math.round(p.angle * 1000) / 1000,
        hp: p.hp,
        shield: p.shield,
        boosted: p.boosted,
        stunned: p.stunned,
      })),
      powerups: gs.powerups.map(pu => ({ x: pu.x, y: pu.y, type: pu.type })),
      elapsed: Math.round(gs.elapsed * 10) / 10,
    });

    // Check game over: HP depletion
    const dead = gs.players.findIndex(p => p.hp <= 0);
    if (dead !== -1) {
      _endGame(room, broadcast);
      return;
    }

    // Check game over: time limit
    if (gs.elapsed >= TIME_LIMIT) {
      _endGame(room, broadcast);
      return;
    }
  }, TICK_MS);
}

function _checkCarCollision(gs, broadcast) {
  const p0 = gs.players[0];
  const p1 = gs.players[1];

  // Skip if either car is dead or stunned
  if (p0.hp <= 0 || p1.hp <= 0 || p0.stunned || p1.stunned) return;

  // Check cooldown
  if (gs.elapsed - gs.lastCollisionTime < COLLISION_COOLDOWN) return;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= COLLISION_DIST) return;

  // Collision detected
  gs.lastCollisionTime = gs.elapsed;

  // Determine collision type by comparing speeds
  const speed0 = p0.boosted ? BOOST_SPEED : BASE_SPEED;
  const speed1 = p1.boosted ? BOOST_SPEED : BASE_SPEED;

  // Calculate forward velocity component toward the other car for each player
  const toOtherAngle0 = Math.atan2(dy, dx);
  const toOtherAngle1 = Math.atan2(-dy, -dx);
  const forwardComponent0 = Math.cos(p0.angle - toOtherAngle0) * speed0;
  const forwardComponent1 = Math.cos(p1.angle - toOtherAngle1) * speed1;

  // Head-on: both moving toward each other significantly
  const headOn = forwardComponent0 > 0 && forwardComponent1 > 0;

  if (headOn) {
    // Both take damage
    _applyDamage(p0, broadcast, 0);
    _applyDamage(p1, broadcast, 1);
  } else {
    // Side/rear collision: slower car takes damage
    if (forwardComponent0 >= forwardComponent1) {
      _applyDamage(p1, broadcast, 1);
    } else {
      _applyDamage(p0, broadcast, 0);
    }
  }

  // Stun both cars
  p0.stunned = true;
  p1.stunned = true;
  setTimeout(() => { p0.stunned = false; }, STUN_DURATION * 1000);
  setTimeout(() => { p1.stunned = false; }, STUN_DURATION * 1000);

  // Push cars apart to prevent overlap
  if (dist > 0) {
    const pushDist = (COLLISION_DIST - dist) / 2 + 0.5;
    const nx = dx / dist;
    const ny = dy / dist;
    p0.x -= nx * pushDist;
    p0.y -= ny * pushDist;
    p1.x += nx * pushDist;
    p1.y += ny * pushDist;

    // Re-clamp after push
    p0.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p0.x));
    p0.y = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p0.y));
    p1.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p1.x));
    p1.y = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, p1.y));
  }

  broadcast({
    type: 'derby_collision',
    players: [
      { hp: p0.hp, shield: p0.shield },
      { hp: p1.hp, shield: p1.shield },
    ],
  });
}

function _applyDamage(player, broadcast, index) {
  if (player.shield) {
    player.shield = false;
    return;
  }
  player.hp = Math.max(0, player.hp - 1);
}

function _checkPowerupPickup(gs, broadcast) {
  for (let i = gs.powerups.length - 1; i >= 0; i--) {
    const pu = gs.powerups[i];
    for (let pi = 0; pi < 2; pi++) {
      const p = gs.players[pi];
      if (p.hp <= 0 || p.stunned) continue;

      const dx = p.x - pu.x;
      const dy = p.y - pu.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < POWERUP_PICKUP_DIST) {
        // Apply powerup
        if (pu.type === 'shield') {
          p.shield = true;
        } else if (pu.type === 'boost') {
          p.boosted = true;
          setTimeout(() => { p.boosted = false; }, BOOST_DURATION * 1000);
        }

        broadcast({
          type: 'derby_powerup_pickup',
          seat: pi + 1,
          powerupType: pu.type,
        });

        gs.powerups.splice(i, 1);
        break; // this powerup is consumed, move to next
      }
    }
  }
}

function _spawnPowerup(gs) {
  const type = Math.random() < 0.5 ? 'shield' : 'boost';
  const x = Math.round((Math.random() * 50 - 25) * 100) / 100;
  const y = Math.round((Math.random() * 50 - 25) * 100) / 100;
  gs.powerups.push({ x, y, type });
}

function _endGame(room, broadcast) {
  clearInterval(room.timers.gameTick);
  room.timers.gameTick = null;
  room.phase = 'ended';

  const gs = room.gameState;
  const hp0 = gs.players[0].hp;
  const hp1 = gs.players[1].hp;

  let winner;
  if (hp0 > hp1) {
    winner = 1;
  } else if (hp1 > hp0) {
    winner = 2;
  } else {
    // Tie in HP — whoever dealt more damage effectively survived longer; seat 1 wins ties
    winner = 1;
  }

  broadcast({ type: 'gameover', winner });
}

function handleMessage(room, seat, msg, broadcast) {
  const p = room.gameState.players[seat - 1];
  if (!p || p.hp <= 0) return;

  if (msg.type === 'steer') {
    // Clamp steering input to [-1, 1]
    const input = Number(msg.angle) || 0;
    p.steerInput = Math.max(-1, Math.min(1, input));
  }

  if (msg.type === 'brake') {
    p.braking = !!msg.active;
  }
}

function dispose(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
