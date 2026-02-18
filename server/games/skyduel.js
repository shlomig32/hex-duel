// Sky Duel — two planes at top/bottom of arena, auto-fire bullets, collect power-ups
// 100-unit-wide normalized arena, 3 HP each, 40s time limit

const TICK_MS = 50; // 20fps
const ARENA_W = 100;
const PLANE_Y = [85, 15]; // seat1=bottom y=85, seat2=top y=15
const BULLET_SPEED = 60;
const HOMING_SPEED = 40;
const HOMING_TURN_RATE = 3; // radians/sec
const BOOMERANG_SPEED = 50;
const AUTO_FIRE_INTERVAL = 0.8; // seconds
const POWERUP_DROP_INTERVAL = 4; // seconds
const POWERUP_HIT_DIST = 5;
const BULLET_HIT_DIST = 4;
const MINE_HIT_DIST = 5;
const MAX_HP = 3;
const TIME_LIMIT = 40; // seconds
const REVERSE_DURATION = 3; // seconds
const MAX_BULLETS = 20;
const MAX_MINES = 3; // per player

const POWERUP_TYPES = ['split', 'homing', 'mine', 'shield', 'boomerang', 'reverse'];

function _round(v) {
  return Math.round(v * 100) / 100;
}

function init(room) {
  room.gameState = {
    players: [
      { x: 30, hp: MAX_HP, shield: false, activeWeapon: null, reversed: false, lastFire: 0 },
      { x: 70, hp: MAX_HP, shield: false, activeWeapon: null, reversed: false, lastFire: 0 },
    ],
    bullets: [],  // { x, y, vx, vy, type, owner, age, returning }
    mines: [],    // { x, y, owner }
    powerups: [], // { x, y, type }
    elapsed: 0,
    nextPowerupTime: POWERUP_DROP_INTERVAL,
  };
}

function getState(room) {
  const gs = room.gameState;
  return {
    players: gs.players.map(p => ({
      x: _round(p.x),
      hp: p.hp,
      shield: p.shield,
      activeWeapon: p.activeWeapon,
      reversed: p.reversed,
    })),
    bullets: gs.bullets.map(b => ({
      x: _round(b.x),
      y: _round(b.y),
      type: b.type,
      owner: b.owner,
    })),
    mines: gs.mines.map(m => ({
      x: _round(m.x),
      y: _round(m.y),
      owner: m.owner,
    })),
    powerups: gs.powerups.map(pu => ({
      x: _round(pu.x),
      y: _round(pu.y),
      type: pu.type,
    })),
    elapsed: _round(gs.elapsed),
    timeLimit: TIME_LIMIT,
  };
}

function start(room, broadcast) {
  room.timers.gameTick = setInterval(() => {
    const gs = room.gameState;
    const dt = TICK_MS / 1000;
    gs.elapsed += dt;

    // --- 1. Auto-fire for each alive player ---
    for (let i = 0; i < 2; i++) {
      const p = gs.players[i];
      if (p.hp <= 0) continue;

      if (gs.elapsed - p.lastFire >= AUTO_FIRE_INTERVAL) {
        p.lastFire = gs.elapsed;
        const seat = i + 1; // 1 or 2
        const dirY = seat === 1 ? -1 : 1; // seat1 shoots up, seat2 shoots down
        const originY = PLANE_Y[i];

        if (p.activeWeapon === 'split') {
          // Fire 3 bullets in a fan: -20deg, 0deg, +20deg
          const angles = [-20, 0, 20];
          for (const angleDeg of angles) {
            const angleRad = angleDeg * (Math.PI / 180);
            gs.bullets.push({
              x: p.x,
              y: originY,
              vx: Math.sin(angleRad) * BULLET_SPEED,
              vy: dirY * Math.cos(angleRad) * BULLET_SPEED,
              type: 'normal',
              owner: seat,
              age: 0,
              returning: false,
            });
          }
          p.activeWeapon = null;
        } else if (p.activeWeapon === 'homing') {
          gs.bullets.push({
            x: p.x,
            y: originY,
            vx: 0,
            vy: dirY * HOMING_SPEED,
            type: 'homing',
            owner: seat,
            age: 0,
            returning: false,
          });
          p.activeWeapon = null;
        } else if (p.activeWeapon === 'boomerang') {
          gs.bullets.push({
            x: p.x,
            y: originY,
            vx: 0,
            vy: dirY * BOOMERANG_SPEED,
            type: 'boomerang',
            owner: seat,
            age: 0,
            returning: false,
          });
          p.activeWeapon = null;
        } else {
          // Normal single bullet
          gs.bullets.push({
            x: p.x,
            y: originY,
            vx: 0,
            vy: dirY * BULLET_SPEED,
            type: 'normal',
            owner: seat,
            age: 0,
            returning: false,
          });
        }

        // Cap total bullets
        while (gs.bullets.length > MAX_BULLETS) {
          gs.bullets.shift(); // remove oldest
        }
      }
    }

    // --- 2. Update bullet positions ---
    for (let bi = gs.bullets.length - 1; bi >= 0; bi--) {
      const b = gs.bullets[bi];
      b.age += dt;

      if (b.type === 'homing') {
        // Find opponent
        const opponentIdx = b.owner === 1 ? 1 : 0;
        const opp = gs.players[opponentIdx];
        const targetX = opp.x;
        const targetY = PLANE_Y[opponentIdx];

        // Current direction angle
        const currentAngle = Math.atan2(b.vy, b.vx);
        // Desired direction angle
        const desiredAngle = Math.atan2(targetY - b.y, targetX - b.x);

        // Compute angle difference, normalized to [-PI, PI]
        let angleDiff = desiredAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // Limit turn rate
        const maxTurn = HOMING_TURN_RATE * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        const newAngle = currentAngle + turn;

        b.vx = Math.cos(newAngle) * HOMING_SPEED;
        b.vy = Math.sin(newAngle) * HOMING_SPEED;
      } else if (b.type === 'boomerang' && !b.returning) {
        // Check if traveled past 60% of arena height without hit
        const originY = b.owner === 1 ? PLANE_Y[0] : PLANE_Y[1];
        const totalTravel = Math.abs(PLANE_Y[0] - PLANE_Y[1]); // 70 units
        const traveled = Math.abs(b.y - originY);
        if (traveled >= totalTravel * 0.6) {
          // Reverse: flip vy and aim vx toward opponent
          b.returning = true;
          b.vy = -b.vy;
          const opponentIdx = b.owner === 1 ? 1 : 0;
          const opp = gs.players[opponentIdx];
          const dx = opp.x - b.x;
          // Add slight horizontal velocity toward opponent
          b.vx = dx !== 0 ? Math.sign(dx) * BOOMERANG_SPEED * 0.3 : 0;
        }
      }

      // Move
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Remove off-screen bullets
      if (b.y < -5 || b.y > 105) {
        gs.bullets.splice(bi, 1);
        continue;
      }

      // Remove boomerangs that have returned past their origin
      if (b.type === 'boomerang' && b.returning) {
        const originY = b.owner === 1 ? PLANE_Y[0] : PLANE_Y[1];
        if (b.owner === 1 && b.y > originY + 5) {
          gs.bullets.splice(bi, 1);
          continue;
        }
        if (b.owner === 2 && b.y < originY - 5) {
          gs.bullets.splice(bi, 1);
          continue;
        }
      }
    }

    // --- 3. Check bullet-to-mine collision (defensive mines block bullets) ---
    for (let bi = gs.bullets.length - 1; bi >= 0; bi--) {
      const b = gs.bullets[bi];
      let bulletRemoved = false;

      for (let mi = gs.mines.length - 1; mi >= 0; mi--) {
        const m = gs.mines[mi];
        // Mine blocks opponent bullets (bullets from the other player)
        if (b.owner === m.owner) continue;

        const dx = b.x - m.x;
        const dy = b.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MINE_HIT_DIST) {
          // Mine explodes — destroys bullet and mine
          broadcast({ type: 'sky_mine_explode', x: _round(m.x), y: _round(m.y) });
          gs.mines.splice(mi, 1);
          gs.bullets.splice(bi, 1);
          bulletRemoved = true;
          break;
        }
      }

      if (bulletRemoved) continue;
    }

    // --- 4. Check bullet-to-powerup collision ---
    for (let bi = gs.bullets.length - 1; bi >= 0; bi--) {
      const b = gs.bullets[bi];
      let bulletRemoved = false;

      for (let pi = gs.powerups.length - 1; pi >= 0; pi--) {
        const pu = gs.powerups[pi];
        const dx = b.x - pu.x;
        const dy = b.y - pu.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < POWERUP_HIT_DIST) {
          const ownerIdx = b.owner - 1;
          const p = gs.players[ownerIdx];
          const opponentIdx = b.owner === 1 ? 1 : 0;
          const opp = gs.players[opponentIdx];

          if (pu.type === 'shield') {
            p.shield = true;
          } else if (pu.type === 'mine') {
            // Place mine at player's x, y=50 if under MAX_MINES
            const playerMines = gs.mines.filter(m => m.owner === b.owner).length;
            if (playerMines < MAX_MINES) {
              gs.mines.push({ x: p.x, y: 50, owner: b.owner });
            }
          } else if (pu.type === 'reverse') {
            opp.reversed = true;
            const timerKey = 'reverse_' + (opponentIdx + 1) + '_' + Date.now();
            room.timers[timerKey] = setTimeout(() => {
              opp.reversed = false;
              delete room.timers[timerKey];
            }, REVERSE_DURATION * 1000);
          } else {
            // split, homing, boomerang — store as activeWeapon
            p.activeWeapon = pu.type;
          }

          broadcast({ type: 'sky_pickup', seat: b.owner, powerupType: pu.type });
          gs.powerups.splice(pi, 1);
          gs.bullets.splice(bi, 1);
          bulletRemoved = true;
          break;
        }
      }

      if (bulletRemoved) continue;
    }

    // --- 5. Check bullet-to-plane collision ---
    for (let bi = gs.bullets.length - 1; bi >= 0; bi--) {
      const b = gs.bullets[bi];
      let bulletRemoved = false;

      for (let pi = 0; pi < 2; pi++) {
        const p = gs.players[pi];
        const seat = pi + 1;

        // Bullets never hit their owner
        if (b.owner === seat) continue;
        if (p.hp <= 0) continue;

        const planeX = p.x;
        const planeY = PLANE_Y[pi];
        const dx = b.x - planeX;
        const dy = b.y - planeY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < BULLET_HIT_DIST) {
          if (p.shield) {
            // Shield breaks, bullet reflected
            p.shield = false;
            b.vy = -b.vy;
            b.owner = seat; // reflected bullet now belongs to the shield holder
            broadcast({ type: 'sky_hit', seat, hp: p.hp, shieldBroken: true });
          } else {
            p.hp = Math.max(0, p.hp - 1);
            gs.bullets.splice(bi, 1);
            bulletRemoved = true;
            broadcast({ type: 'sky_hit', seat, hp: p.hp, shieldBroken: false });
          }
          break;
        }
      }

      if (bulletRemoved) continue;
    }

    // --- 6. Spawn powerups ---
    if (gs.elapsed >= gs.nextPowerupTime && gs.powerups.length < 2) {
      const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      const x = 15 + Math.random() * 70; // range [15, 85]
      gs.powerups.push({ x: _round(x), y: 50, type });
      gs.nextPowerupTime = gs.elapsed + POWERUP_DROP_INTERVAL;
    }

    // --- 7. Broadcast state ---
    broadcast({
      type: 'sky_state',
      players: gs.players.map(p => ({
        x: _round(p.x),
        hp: p.hp,
        shield: p.shield,
        activeWeapon: p.activeWeapon,
        reversed: p.reversed,
      })),
      bullets: gs.bullets.map(b => ({
        x: _round(b.x),
        y: _round(b.y),
        type: b.type,
        owner: b.owner,
      })),
      mines: gs.mines.map(m => ({
        x: _round(m.x),
        y: _round(m.y),
        owner: m.owner,
      })),
      powerups: gs.powerups.map(pu => ({
        x: _round(pu.x),
        y: _round(pu.y),
        type: pu.type,
      })),
      elapsed: _round(gs.elapsed),
    });

    // --- 8. Check game over ---
    const dead0 = gs.players[0].hp <= 0;
    const dead1 = gs.players[1].hp <= 0;

    if (dead0 || dead1 || gs.elapsed >= TIME_LIMIT) {
      _endGame(room, broadcast);
      return;
    }
  }, TICK_MS);
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
    // Tie in HP — seat 1 wins ties
    winner = 1;
  }

  broadcast({ type: 'gameover', winner });
}

function handleMessage(room, seat, msg, broadcast) {
  const gs = room.gameState;
  const p = gs.players[seat - 1];
  if (!p || p.hp <= 0) return;

  if (msg.type === 'move') {
    let x = Number(msg.x);
    if (isNaN(x)) return;

    // Clamp to [5, 95]
    x = Math.max(5, Math.min(95, x));

    // If reversed, invert the position
    if (p.reversed) {
      x = 100 - x;
    }

    p.x = x;
  }
}

function dispose(room) {
  if (room.timers.gameTick) {
    clearInterval(room.timers.gameTick);
    room.timers.gameTick = null;
  }

  // Clear any reverse timeouts
  for (const key of Object.keys(room.timers)) {
    if (key.startsWith('reverse_')) {
      clearTimeout(room.timers[key]);
      delete room.timers[key];
    }
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
