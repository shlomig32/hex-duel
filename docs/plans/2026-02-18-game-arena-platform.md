# Game Arena Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform hex-duel into a full Game Arena platform with categories, player identity, instructions, sponsor system, and 2 new games.

**Architecture:** Vanilla JS ES modules (client) + CommonJS Node.js WebSocket server. Zero dependencies beyond `ws`. All state in localStorage (client) and in-memory (server). Sponsor data loaded from static JSON.

**Tech Stack:** Vanilla JS, raw WebSocket (`ws`), CSS3 animations, Web Audio API

**Note:** No test framework exists. Verification is done by starting the server (`node server.js`) and checking behavior manually or via `node --input-type=module --check`.

---

### Task 1: Shared Utilities — Stats Tracker

**Files:**
- Create: `public/js/lib/stats.js`

**Step 1: Create stats module**

```js
// localStorage-backed session stats
const STORAGE_KEY = 'ga_stats';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaults();
  } catch { return defaults(); }
}

function defaults() {
  return { played: 0, wins: 0, streak: 0, bestStreak: 0 };
}

function save(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function getStats() {
  return load();
}

export function recordGame(won) {
  const s = load();
  s.played++;
  if (won) {
    s.wins++;
    s.streak++;
    if (s.streak > s.bestStreak) s.bestStreak = s.streak;
  } else {
    s.streak = 0;
  }
  save(s);
  return s;
}

export function resetStats() {
  localStorage.removeItem(STORAGE_KEY);
}
```

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/lib/stats.js`
Expected: no output (clean)

**Step 3: Commit**

```bash
git add public/js/lib/stats.js
git commit -m "feat: add localStorage stats tracker"
```

---

### Task 2: Shared Utilities — Avatar System

**Files:**
- Create: `public/js/lib/avatars.js`

**Step 1: Create avatars module**

```js
export const AVATARS = [
  '😎', '🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦈', '🐙', '🎯',
  '🔥', '⚡', '💎', '🎮', '👾', '🤖', '🥷', '🧙', '🦸', '💀',
];

const STORAGE_KEY = 'ga_avatar';

export function getAvatar() {
  return localStorage.getItem(STORAGE_KEY) || AVATARS[0];
}

export function setAvatar(emoji) {
  localStorage.setItem(STORAGE_KEY, emoji);
}
```

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/lib/avatars.js`

**Step 3: Commit**

```bash
git add public/js/lib/avatars.js
git commit -m "feat: add avatar system with 20 emoji options"
```

---

### Task 3: Shared Utilities — Sponsor System

**Files:**
- Create: `public/sponsors.json`
- Create: `public/js/lib/sponsors.js`

**Step 1: Create sponsor data file**

```json
{
  "sponsors": [
    {
      "id": "demo1",
      "name": "Pizza Planet",
      "message": "🍕 הפיצה הכי טובה בעיר!",
      "color": "#EF4444",
      "link": "#"
    },
    {
      "id": "demo2",
      "name": "TechShop",
      "message": "💻 הגאדג'טים הכי חמים",
      "color": "#3B82F6",
      "link": "#"
    },
    {
      "id": "demo3",
      "name": "FitZone",
      "message": "💪 חדר כושר — חודש ראשון חינם",
      "color": "#10B981",
      "link": "#"
    }
  ]
}
```

**Step 2: Create sponsors module**

```js
import { el } from './dom.js';

let _sponsors = [];
let _loaded = false;

export async function loadSponsors() {
  if (_loaded) return _sponsors;
  try {
    const res = await fetch('/sponsors.json');
    const data = await res.json();
    _sponsors = data.sponsors || [];
  } catch { _sponsors = []; }
  _loaded = true;
  return _sponsors;
}

export function getSponsors() {
  return _sponsors;
}

/** Sideline banner — horizontal scrolling strip for during gameplay */
export function createSidelineBanner() {
  const sponsors = getSponsors();
  if (!sponsors.length) return null;

  const strip = el('div', { className: 'sponsor-sideline' });
  // Double the items for seamless loop
  const items = [...sponsors, ...sponsors];
  for (const s of items) {
    const item = el('a', {
      className: 'sponsor-sideline__item',
      href: s.link || '#',
      target: '_blank',
      rel: 'noopener',
      style: { color: s.color || '#fff' },
    }, [
      el('span', { className: 'sponsor-sideline__name' }, [s.name]),
      el('span', { className: 'sponsor-sideline__msg' }, [s.message]),
    ]);
    strip.appendChild(item);
  }
  return strip;
}

/** Result card — shown on result screen */
export function createSponsorCard() {
  const sponsors = getSponsors();
  if (!sponsors.length) return null;

  const s = sponsors[Math.floor(Math.random() * sponsors.length)];

  return el('a', {
    className: 'sponsor-card',
    href: s.link || '#',
    target: '_blank',
    rel: 'noopener',
    style: { borderColor: s.color || '#fff' },
  }, [
    el('div', { className: 'sponsor-card__badge' }, ['Sponsored']),
    el('div', { className: 'sponsor-card__name' }, [s.name]),
    el('div', { className: 'sponsor-card__msg' }, [s.message]),
  ]);
}
```

**Step 3: Verify syntax**

Run: `node --input-type=module --check < public/js/lib/sponsors.js`

**Step 4: Commit**

```bash
git add public/sponsors.json public/js/lib/sponsors.js
git commit -m "feat: add sponsor system with sideline banner and result card"
```

---

### Task 4: Shared Utilities — How-To-Play Data & Overlay

**Files:**
- Create: `public/js/lib/game-registry.js`

**Step 1: Create game registry with full metadata and instructions**

This centralizes ALL game data (currently duplicated across home.js, game.js, result.js, waiting.js).

```js
export const GAME_REGISTRY = {
  hex: {
    id: 'hex',
    emoji: '⬡',
    name: 'הקס דואל',
    tagline: 'חבר צדדים. חסום יריב.',
    category: 'strategy',
    difficulty: 2,
    duration: '3-5 דק\'',
    instructions: [
      'המטרה: חבר את הצד שלך לצד הנגדי',
      'כל תור — הנח אבן על משושה ריקה',
      'אדום מחבר ימין-שמאל, כחול מחבר למעלה-למטה',
      'הראשון שיוצר שרשרת רציפה מנצח!',
    ],
  },
  connect4: {
    id: 'connect4',
    emoji: '🔴',
    name: 'ארבע בשורה',
    tagline: 'הפל אסימונים. חבר ארבע.',
    category: 'strategy',
    difficulty: 1,
    duration: '2-4 דק\'',
    instructions: [
      'המטרה: חבר 4 אסימונים ברצף',
      'לחץ על עמודה כדי להפיל אסימון',
      'רצף אנכי, אופקי או אלכסוני — הכל עובד',
      'חשוב קדימה וחסום את היריב!',
    ],
  },
  pong: {
    id: 'pong',
    emoji: '🏓',
    name: 'פונג',
    tagline: 'הזז מחבט. הבקע שערים.',
    category: 'party',
    difficulty: 1,
    duration: '1-2 דק\'',
    instructions: [
      'הזז את המחבט עם האצבע או העכבר',
      'הכדור מואץ עם כל חזרה',
      'הראשון שמגיע ל-5 נקודות מנצח',
      'כיוון הפגיעה במחבט משפיע על זווית הכדור',
    ],
  },
  reaction: {
    id: 'reaction',
    emoji: '⚡',
    name: 'תגובה מהירה',
    tagline: 'חכה לאות. לחץ ראשון.',
    category: 'speed',
    difficulty: 1,
    duration: '1 דק\'',
    instructions: [
      'חכה עד שהמסך הופך ירוק',
      'לחץ כמה שיותר מהר!',
      'אם לחצת לפני — פסילה לסיבוב',
      '5 סיבובים — הכי מהיר מנצח',
    ],
  },
  bomb: {
    id: 'bomb',
    emoji: '💣',
    name: 'פצצה חמה',
    tagline: 'העבר את הפצצה. אל תיתפס.',
    category: 'party',
    difficulty: 1,
    duration: '1-2 דק\'',
    instructions: [
      'פצצה עם פתיל בוער עוברת ביניכם',
      'לחץ מהר כדי להעביר אותה ליריב',
      'מי שמחזיק כשהפצצה מתפוצצת — מפסיד',
      'הטוב מ-3 סיבובים מנצח',
    ],
  },
  tapsprint: {
    id: 'tapsprint',
    emoji: '👆',
    name: 'קליק מטורף',
    tagline: 'לחץ הכי מהר. 10 שניות.',
    category: 'speed',
    difficulty: 1,
    duration: '10 שנ\'',
    instructions: [
      'לחץ על הכפתור כמה שיותר פעמים',
      'יש לך 10 שניות בלבד',
      'רואים את ההתקדמות של שני השחקנים',
      'הכי הרבה לחיצות — מנצח!',
    ],
  },
  scream: {
    id: 'scream',
    emoji: '🗣️',
    name: 'קרב צעקות',
    tagline: 'צעק חזק מהיריב. דחוף אותו.',
    category: 'speed',
    difficulty: 2,
    duration: '15 שנ\'',
    instructions: [
      'צעק לתוך המיקרופון כמה שיותר חזק',
      'המד נע לפי עוצמת הקול שלך',
      'דחוף את המד עד הקצה של היריב',
      'מי שדוחף את המד לקצה — מנצח!',
    ],
  },
  memory: {
    id: 'memory',
    emoji: '🧩',
    name: 'זיכרון',
    tagline: 'הפוך זוגות. זכור הכל.',
    category: 'strategy',
    difficulty: 1,
    duration: '2-4 דק\'',
    instructions: [
      'לוח 4×4 עם 8 זוגות מוסתרים',
      'בתורך — הפוך 2 קלפים',
      'אם זהים — הזוג שלך ותור נוסף!',
      'אם שונים — חוזרים ועובר ליריב',
      'הכי הרבה זוגות — מנצח!',
    ],
  },
  emojiquiz: {
    id: 'emojiquiz',
    emoji: '🎭',
    name: 'ניחוש אימוג\'י',
    tagline: 'רמז באימוג\'י. נחש מילה.',
    category: 'party',
    difficulty: 2,
    duration: '2-3 דק\'',
    instructions: [
      'שחקן אחד רואה מילה ובוחר 3 אימוג\'ים כרמז',
      'השחקן השני מנחש מתוך 4 אפשרויות',
      'מתחלפים כל סיבוב',
      '5 סיבובים — הכי הרבה ניחושים נכונים מנצח',
    ],
  },
};

export const CATEGORIES = [
  {
    id: 'strategy',
    title: '🧠 אסטרטגיה',
    games: ['hex', 'connect4', 'memory'],
  },
  {
    id: 'speed',
    title: '⚡ מהירות',
    games: ['reaction', 'tapsprint', 'scream'],
  },
  {
    id: 'party',
    title: '🎉 מסיבה',
    games: ['bomb', 'pong', 'emojiquiz'],
  },
];

export const GAME_COLORS = {
  hex: { p1: '#EF4444', p2: '#3B82F6', p1bg: 'rgba(239,68,68,0.2)', p2bg: 'rgba(59,130,246,0.2)' },
  connect4: { p1: '#FBBF24', p2: '#EF4444', p1bg: 'rgba(251,191,36,0.2)', p2bg: 'rgba(239,68,68,0.2)' },
  pong: { p1: '#06B6D4', p2: '#8B5CF6', p1bg: 'rgba(6,182,212,0.2)', p2bg: 'rgba(139,92,246,0.2)' },
  reaction: { p1: '#10B981', p2: '#F97316', p1bg: 'rgba(16,185,129,0.2)', p2bg: 'rgba(249,115,22,0.2)' },
  bomb: { p1: '#F97316', p2: '#FBBF24', p1bg: 'rgba(249,115,22,0.2)', p2bg: 'rgba(251,191,36,0.2)' },
  tapsprint: { p1: '#EC4899', p2: '#8B5CF6', p1bg: 'rgba(236,72,153,0.2)', p2bg: 'rgba(139,92,246,0.2)' },
  scream: { p1: '#F59E0B', p2: '#EF4444', p1bg: 'rgba(245,158,11,0.2)', p2bg: 'rgba(239,68,68,0.2)' },
  memory: { p1: '#8B5CF6', p2: '#EC4899', p1bg: 'rgba(139,92,246,0.2)', p2bg: 'rgba(236,72,153,0.2)' },
  emojiquiz: { p1: '#F59E0B', p2: '#06B6D4', p1bg: 'rgba(245,158,11,0.2)', p2bg: 'rgba(6,182,212,0.2)' },
};
```

**Step 2: Verify**

Run: `node --input-type=module --check < public/js/lib/game-registry.js`

**Step 3: Commit**

```bash
git add public/js/lib/game-registry.js
git commit -m "feat: centralized game registry with categories, metadata, and instructions"
```

---

### Task 5: How-To-Play Overlay Screen

**Files:**
- Create: `public/js/screens/how-to-play.js`

**Step 1: Create overlay component**

A modal-like overlay that shows game instructions. Used by game-setup.js.

```js
import { el } from '../lib/dom.js';
import { GAME_REGISTRY } from '../lib/game-registry.js';

export function showHowToPlay(gameId) {
  return new Promise((resolve) => {
    const game = GAME_REGISTRY[gameId];
    if (!game) { resolve(); return; }

    const steps = game.instructions.map((text, i) =>
      el('li', { className: 'htp-step', style: { animationDelay: `${i * 0.12}s` } }, [text])
    );

    const overlay = el('div', { className: 'htp-overlay' }, [
      el('div', { className: 'htp-card' }, [
        el('div', { className: 'htp-emoji' }, [game.emoji]),
        el('div', { className: 'htp-title' }, [game.name]),
        el('div', { className: 'htp-meta' }, [
          el('span', { className: 'htp-difficulty' }, ['⭐'.repeat(game.difficulty)]),
          el('span', { className: 'htp-duration' }, [`⏱ ${game.duration}`]),
        ]),
        el('ol', { className: 'htp-steps' }, steps),
        el('button', {
          className: 'btn htp-close',
          onClick: () => {
            overlay.classList.add('htp-exit');
            setTimeout(() => {
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              resolve();
            }, 200);
          },
        }, ['הבנתי!']),
      ]),
    ]);

    document.body.appendChild(overlay);
  });
}

/** Mark a game as "seen instructions" */
export function hasSeenInstructions(gameId) {
  return !!localStorage.getItem(`htp_${gameId}`);
}

export function markInstructionsSeen(gameId) {
  localStorage.setItem(`htp_${gameId}`, '1');
}
```

**Step 2: Verify**

Run: `node --input-type=module --check < public/js/screens/how-to-play.js`

**Step 3: Commit**

```bash
git add public/js/screens/how-to-play.js
git commit -m "feat: how-to-play overlay with animated instructions"
```

---

### Task 6: Memory Match — Server Game

**Files:**
- Create: `server/games/memory.js`

**Step 1: Implement server-side memory game**

Turn-based 4x4 memory grid with 8 emoji pairs.

```js
const EMOJIS = ['🐶','🐱','🐸','🦊','🐼','🐨','🦁','🐯','🐮','🐷','🐵','🦄','🐙','🦋','🐢','🦀'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init(room) {
  // Pick 8 random emojis, duplicate for pairs
  const picked = shuffle(EMOJIS).slice(0, 8);
  const board = shuffle([...picked, ...picked]);

  room.gameState = {
    board,             // 16 cells with emojis
    revealed: Array(16).fill(false),  // permanently revealed (matched)
    flipped: [],       // currently flipped indices (0-2)
    scores: [0, 0],    // pairs found per player
    turn: 1,           // seat of current player
    locked: false,     // during reveal delay
  };
}

function getState(room) {
  return {
    revealed: room.gameState.revealed,
    scores: room.gameState.scores,
    turn: room.gameState.turn,
    boardSize: 16,
  };
}

function start(room, broadcast) {
  broadcast({
    type: 'game_state',
    revealed: room.gameState.revealed,
    scores: room.gameState.scores,
    turn: room.gameState.turn,
  });
}

function handleMessage(room, seat, msg, broadcast) {
  const gs = room.gameState;
  if (msg.type !== 'flip') return;
  if (gs.locked) return;
  if (seat !== gs.turn) return;

  const idx = msg.index;
  if (idx < 0 || idx >= 16) return;
  if (gs.revealed[idx]) return;
  if (gs.flipped.includes(idx)) return;

  gs.flipped.push(idx);

  // Broadcast the flip (show emoji to both players)
  broadcast({ type: 'card_flipped', index: idx, emoji: gs.board[idx], seat });

  if (gs.flipped.length === 2) {
    gs.locked = true;
    const [a, b] = gs.flipped;

    if (gs.board[a] === gs.board[b]) {
      // Match!
      gs.revealed[a] = true;
      gs.revealed[b] = true;
      gs.scores[seat - 1]++;
      gs.flipped = [];
      gs.locked = false;

      broadcast({ type: 'match', indices: [a, b], seat, scores: gs.scores });

      // Check win
      const totalMatched = gs.scores[0] + gs.scores[1];
      if (totalMatched >= 8) {
        room.phase = 'ended';
        const winner = gs.scores[0] > gs.scores[1] ? 1 : gs.scores[1] > gs.scores[0] ? 2 : 0;
        broadcast({ type: 'gameover', winner });
      }
    } else {
      // No match — flip back after delay
      room.timers.flipBack = setTimeout(() => {
        gs.flipped = [];
        gs.locked = false;
        gs.turn = seat === 1 ? 2 : 1;
        broadcast({ type: 'no_match', indices: [a, b], turn: gs.turn });
      }, 1000);
    }
  }
}

function dispose(room) {
  if (room.timers.flipBack) {
    clearTimeout(room.timers.flipBack);
    room.timers.flipBack = null;
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
```

**Step 2: Verify syntax**

Run: `node --check server/games/memory.js`

**Step 3: Commit**

```bash
git add server/games/memory.js
git commit -m "feat: memory match server game — 4x4 grid, turn-based pair matching"
```

---

### Task 7: Memory Match — Client Game

**Files:**
- Create: `public/js/games/memory.js`

**Step 1: Create client-side memory game**

4x4 card grid with flip animations, turn indicators, score tracking.

The module exports `{ init, destroy }` matching the interface in game.js.

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/games/memory.js`

**Step 3: Commit**

```bash
git add public/js/games/memory.js
git commit -m "feat: memory match client — card flip animations, turn-based UI"
```

---

### Task 8: Emoji Quiz — Server Game

**Files:**
- Create: `server/games/emojiquiz.js`

**Step 1: Implement server-side emoji quiz**

5 rounds alternating roles. Clue-giver picks 3 emojis, guesser picks from 4 options.

Word bank of ~50 Hebrew words with 4 options each (1 correct + 3 distractors).

**Step 2: Verify syntax**

Run: `node --check server/games/emojiquiz.js`

**Step 3: Commit**

```bash
git add server/games/emojiquiz.js
git commit -m "feat: emoji quiz server — 5 rounds, alternating roles, word bank"
```

---

### Task 9: Emoji Quiz — Client Game

**Files:**
- Create: `public/js/games/emojiquiz.js`

**Step 1: Create client-side emoji quiz**

Clue-giver sees word + emoji grid to pick from. Guesser sees 3 emoji clues + 4 word options.

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/games/emojiquiz.js`

**Step 3: Commit**

```bash
git add public/js/games/emojiquiz.js
git commit -m "feat: emoji quiz client — clue giving and guessing UI"
```

---

### Task 10: Register New Games in Server

**Files:**
- Modify: `server/rooms.js:1-17` — add memory and emojiquiz imports and registration

**Step 1: Add imports and register games**

Add to top:
```js
const memoryGame = require('./games/memory');
const emojiquizGame = require('./games/emojiquiz');
```

Add to GAMES object:
```js
memory: memoryGame,
emojiquiz: emojiquizGame,
```

**Step 2: Verify**

Run: `node --check server/rooms.js`

**Step 3: Commit**

```bash
git add server/rooms.js
git commit -m "feat: register memory and emojiquiz games in server"
```

---

### Task 11: Refactor Home Screen — Categories, Avatar, Stats

**Files:**
- Modify: `public/js/screens/home.js` — complete rewrite using game-registry

**Step 1: Rewrite home screen**

- Import from `game-registry.js` instead of inline CATEGORIES
- Add avatar display + edit in header
- Add stats bar (games played, wins, streak)
- Render games by category with difficulty/duration badges
- Stagger-in animation on cards

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/screens/home.js`

**Step 3: Commit**

```bash
git add public/js/screens/home.js
git commit -m "feat: redesigned home screen with categories, avatar, stats"
```

---

### Task 12: Refactor Game Setup Screen — Instructions Button

**Files:**
- Modify: `public/js/screens/game-setup.js`

**Step 1: Add how-to-play button and auto-show for first time**

- Import from game-registry.js for game metadata
- Add "?" instructions button
- Auto-show instructions on first play
- Show difficulty + duration badges

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/screens/game-setup.js`

**Step 3: Commit**

```bash
git add public/js/screens/game-setup.js
git commit -m "feat: game setup with how-to-play button and first-time auto instructions"
```

---

### Task 13: Refactor Game Screen — Sideline Sponsors, Avatar in HUD

**Files:**
- Modify: `public/js/screens/game.js`

**Step 1: Update game screen**

- Import game-registry for GAME_COLORS
- Add avatar emoji next to player names in HUD
- Add sideline sponsor banner at bottom of game area
- Import and use createSidelineBanner()

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/screens/game.js`

**Step 3: Commit**

```bash
git add public/js/screens/game.js
git commit -m "feat: game screen with avatar HUD and sideline sponsor banner"
```

---

### Task 14: Refactor Result Screen — Sponsor Card, Stats, All Games

**Files:**
- Modify: `public/js/screens/result.js`

**Step 1: Update result screen**

- Import from game-registry for full game list
- Add sponsor card between result and buttons
- Call recordGame() to update stats
- Show updated stats summary
- Use GAME_REGISTRY for game-switch grid

**Step 2: Verify syntax**

Run: `node --input-type=module --check < public/js/screens/result.js`

**Step 3: Commit**

```bash
git add public/js/screens/result.js
git commit -m "feat: result screen with sponsor card and stats tracking"
```

---

### Task 15: Refactor Waiting Screen — Use Game Registry

**Files:**
- Modify: `public/js/screens/waiting.js`

**Step 1: Import from game-registry instead of inline GAME_INFO**

**Step 2: Verify**

**Step 3: Commit**

```bash
git add public/js/screens/waiting.js
git commit -m "refactor: waiting screen uses centralized game registry"
```

---

### Task 16: Update App.js — Load Sponsors on Init

**Files:**
- Modify: `public/js/app.js`

**Step 1: Add sponsor loading on startup**

Import `loadSponsors` and call it before showing HomeScreen.

**Step 2: Verify**

**Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: load sponsors on app init"
```

---

### Task 17: CSS — Complete Styling Overhaul

**Files:**
- Modify: `public/css/style.css`

**Step 1: Add all new styles**

New CSS sections to add:
- **Category headers** — emoji + title with accent line
- **Game card badges** — difficulty stars + duration pill
- **Avatar picker** — grid of emoji buttons in modal
- **Stats bar** — compact row with numbers
- **How-to-play overlay** — card with step animations
- **Sponsor sideline** — scrolling banner with LED effect
- **Sponsor card** — result screen promotion card
- **Card stagger-in animation** — sequential entrance
- **Screen enter animation** — slide up + fade

**Step 2: Verify CSS loads**

Run: `node server.js` and check no 404s for style.css

**Step 3: Commit**

```bash
git add public/css/style.css
git commit -m "feat: complete CSS overhaul — categories, badges, sponsors, animations"
```

---

### Task 18: Update index.html — Meta Tags, OG, Favicon

**Files:**
- Modify: `public/index.html`

**Step 1: Add proper meta tags**

- OG tags for sharing (title, description, image)
- Theme color
- Apple touch icon
- Description meta

**Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: meta tags, OG sharing, theme color"
```

---

### Task 19: Integration Test — Full Flow

**Step 1: Start server and verify**

Run: `cd /workspaces/game/hex-duel && node server.js`

Verify:
- Home screen loads with categories
- All 9 games visible
- Avatar picker works
- Stats display shows
- Game setup shows instructions
- Sponsor sideline appears in game
- Sponsor card appears in result

**Step 2: Fix any issues**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for full platform"
```

---

### Task 20: Deploy to DigitalOcean

**Step 1: Push to GitHub**

```bash
cd /workspaces/game/hex-duel
git push origin main
```

**Step 2: Trigger DO deployment**

The app auto-deploys from GitHub pushes.

**Step 3: Verify live**

Check https://hex-duel-k9y6j.ondigitalocean.app loads correctly.
