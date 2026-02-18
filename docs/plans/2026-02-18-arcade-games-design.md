# Arcade Games Category Design

## Overview

Add a new "Arcade 👾" category with 3 games to hex-duel Game Arena, bringing the total to 15 games across 5 categories.

All 3 games are **Canvas 2D**, use **photo avatar** on player characters, and feature **trap/surprise mechanics** that let players mess with each other for funny moments.

---

## Game 1: Sky Duel (קרב אווירי) ✈️

**Concept:** Two planes at top/bottom of screen, moving left-right, auto-shooting at each other. Power-ups fall from the sky — shoot them to collect.

### Core Mechanics
- 3 HP each, 40-second time limit
- Planes move horizontally (drag/buttons), always facing opponent
- Auto-fire every 0.8s (regular bullet)
- Power-ups drop from center every 4s — shoot to collect

### Power-ups

| Power-up | Effect | Icon |
|----------|--------|------|
| Split Shot | Fires 3 bullets in a fan | 🔱 |
| Homing Missile | Bullet tracks opponent | 🎯 |
| Hover Mine | Places floating mine — damages whoever touches | 💣 |
| Bubble Shield | Blocks 1 hit + reflects bullet back | 🛡️ |
| Boomerang | Bullet returns if it misses — 2 chances to hit | 🪃 |
| Reverse Wind | Inverts opponent controls for 3s | 🌪️ |

### Visuals (Canvas 2D)
- Sky background with parallax cloud layers scrolling
- Player photo avatar on plane cockpit (24px circle)
- Hit = plane shake + smoke particles
- Shield = glowing bubble around plane
- Special weapon = colored glow flash on plane
- Death (0 HP) = explosion particle burst
- Bullets are colored per player (cyan/magenta)

### Audio
- pew-pew oscillator per shot
- Deep BOOM on hit
- Whoosh for homing missile
- Ping-ping for boomerang return
- Warped/distorted tone during reverse wind

### Server State
```
players: [{ x, hp, shield, activeWeapon, reversed }]
bullets: [{ x, y, type, owner, angle }]
mines: [{ x, y, owner }]
powerups: [{ x, y, type }]
elapsed, timeLimit: 40
```

### Messages
- Client → Server: `{ type: 'move', x }` (normalized 0-1)
- Server → Client: `{ type: 'sky_state', ... }` (20fps tick)
- Server → Client: `{ type: 'sky_hit', seat, hp }` (on hit)
- Server → Client: `{ type: 'sky_pickup', seat, powerupType }` (on pickup)

---

## Game 2: Maze Mayhem (מבוך מסוכן) 👻

**Concept:** Two players in the same randomly generated maze. Ghosts chase both. Last survivor wins. You can send trouble to your opponent.

### Core Mechanics
- 13x13 maze (randomized with guaranteed paths)
- 2 players start at opposite corners
- 2 ghosts start at center, chase nearest player (A* pathfinding)
- 45-second timer — if both survive, most stars wins
- Ghost touch = eliminated
- Movement: swipe/tap in 4 directions (grid-based movement)

### Special Items (scattered in maze)

| Item | Effect | Icon |
|------|--------|------|
| Star | +1 point | ⭐ |
| Turbo | Speed x2 for 3s | ⚡ |
| Ghost Spawn | Adds a NEW ghost near opponent! | 👻 |
| Phase | Transparent 3s — ghosts pass through you | 💨 |
| Glue Trap | Leave a trap at your position — opponent stepping on it freezes 2s | 🪤 |
| Dynamite | Destroy one adjacent wall — creates new shortcut | 🧨 |

### Shrinking Maze
- Every 10 seconds, the outermost open ring of the maze becomes solid wall
- Arena shrinks: 13x13 → 11x11 → 9x9 → 7x7
- More cramped = more ghost encounters = more tension
- Visual: new walls rise with red glow animation

### Visuals (Canvas 2D)
- Dark background with neon-style maze walls (purple #8B5CF6 glow)
- Player = circle with photo avatar (24px), colored glow aura
- Opponent = circle with opponent color
- Ghosts = semi-transparent sprites with glowing eyes, vibrate when close
- Traps = nearly invisible to opponent (fully invisible), subtle shimmer for owner
- Wall destruction = particle debris animation
- Shrink event = red pulse wave from edges

### Audio
- Tense low drone background (rising pitch over time)
- Heartbeat getting louder when ghost is close
- Boom + crumble for dynamite
- Ghost-catch = spooky sound + vibration
- Star collect = cheerful ding
- Freeze = ice crack sound

### Server State
```
maze: 2D array (0=path, 1=wall)
players: [{ x, y, alive, score, phased, frozen, speed }]
ghosts: [{ x, y, targetSeat }]
items: [{ x, y, type }]
traps: [{ x, y, owner }]
elapsed, shrinkLevel
```

### Messages
- Client → Server: `{ type: 'move', dir }` (up/down/left/right)
- Client → Server: `{ type: 'use_item', itemType }` (for dynamite direction)
- Server → Client: `{ type: 'maze_state', ... }` (20fps tick)
- Server → Client: `{ type: 'maze_shrink', level }` (shrink event)
- Server → Client: `{ type: 'maze_caught', seat }` (elimination)

---

## Game 3: Snake Clash (קרב נחשים) 🐍

**Concept:** Two snakes on the same board competing for food. Special power-ups create chaos. Crash = shrink (not instant death), allowing comebacks.

### Core Mechanics
- 20x20 grid, snakes start at opposite corners (length 3)
- 40-second timer — most points wins (or last survivor)
- Movement: swipe/arrow buttons, 4 directions
- Collision with wall/self/opponent = **shrink by 3 segments** (not death)
- Shrink below 1 segment = eliminated
- Tick rate: movement every 150ms (slower than server tick, grid-based)

### Food Types

| Item | Points | Effect | Icon |
|------|--------|--------|------|
| Apple | +1 | Grow by 1 | 🍎 |
| Golden Apple | +3 | Grow by 2 + both snakes speed up 3s | 🌟 |
| Poison | -2 | Shrink by 2 | ☠️ |
| Turbo | — | Speed x2 for 3s (harder to control) | 🚀 |

### Power-ups (appear every 8 seconds)

| Power-up | Effect | Icon |
|----------|--------|------|
| Wall Mode | Your tail becomes solid wall for 4s — opponent crashes into it | 🧱 |
| Swap Places | Swap your position with opponent instantly | 🔄 |
| Ghost Mode | Phase through everything for 3s | 👻 |
| Land Mines | Drop 3 mines behind you — whoever touches shrinks by 2 | 💥 |

### Visuals (Canvas 2D)
- Dark board with subtle neon-green grid lines
- Player snake = cyan-green body with photo avatar on head (20px)
- Opponent snake = pink-purple body
- Growth = green pulse animation
- Shrink = red flash + shake
- Wall mode = tail segments glow white
- Ghost mode = snake becomes semi-transparent with glow
- Swap = flash animation + whoosh trail between positions
- Items = emoji icons that wobble and rotate
- Mines = small pulsing red dots (nearly invisible)

### Audio
- Chomp on eat
- Hiss on collision/shrink
- Whoosh for swap
- Heartbeat when snake is small (1-2 segments)
- Ding-ding-ding for golden apple (tempting)
- Crunch for wall mode activation

### Server State
```
players: [{ segments: [{x,y}], dir, score, speed, ghosted, walled }]
food: [{ x, y, type }]
powerups: [{ x, y, type }]
mines: [{ x, y, owner }]
elapsed
```

### Messages
- Client → Server: `{ type: 'dir', dir }` (up/down/left/right)
- Server → Client: `{ type: 'snake_state', ... }` (every 150ms movement tick)
- Server → Client: `{ type: 'snake_hit', seat, newLength }` (on collision)
- Server → Client: `{ type: 'snake_powerup', seat, type }` (on pickup)

---

## Shared Architecture

### Category Addition
```js
// game-registry.js
{ id: 'arcade', title: '👾 ארקייד', games: ['skyduel', 'maze', 'snakeclash'] }
```

### Tech Stack
- **Canvas 2D** for all 3 games (not Three.js) — better performance, retro arcade feel
- **Web Audio API** for synthesized sounds (zero file size)
- **Photo avatar** rendered on player character in each game
- **20fps server tick** (50ms interval) for skyduel + maze; snake uses 150ms movement tick inside server tick
- **Server-authoritative** — all collision/pickup logic on server

### Photo Avatar Integration
- Sky Duel: photo on plane cockpit
- Maze: photo as player circle in maze
- Snake: photo on snake head segment

### New Files
- Server: `server/games/skyduel.js`, `server/games/maze.js`, `server/games/snakeclash.js`
- Client: `public/js/games/skyduel.js`, `public/js/games/maze.js`, `public/js/games/snakeclash.js`
- Modified: `game-registry.js`, `rooms.js`, `style.css`
