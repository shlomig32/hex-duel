# Game Arena Platform Design

**Date:** 2026-02-18
**Status:** Approved

## Overview
Transform hex-duel from a 7-game 1v1 platform into a full Game Arena with categories, player identity, instructions, sponsor system, and 2 new games.

## 1. Game Categories & Registry

| Category | Emoji | Games |
|----------|-------|-------|
| Strategy | `🧠` | Hex, Connect4, Memory Match (new) |
| Speed | `⚡` | Reaction, Tap Sprint, Scream Battle |
| Party | `🎉` | Bomb Pass, Pong, Emoji Quiz (new) |

Each game: difficulty badge (1-3 stars), duration estimate, how-to-play instructions.

## 2. Player Identity

- Avatar picker: 20 emoji avatars, localStorage
- Shown in: home header, game HUD, result screen
- Session stats (localStorage): games played, wins, win streak

## 3. How-To-Play Instructions

- Rules overlay per game with bullet points
- Auto-shown first time, "?" button on setup screen
- Quick animated presentation

## 4. Sponsor/Ad System

**Sideline Banners:** Horizontal strip at bottom of game area, rotates every 15s, LED-scroll animation.

**Mid-Game Flash Banner:** Full-width card on result screen + during countdown, "Sponsored by X" format.

**Data model:** `sponsors.json` file with `{ id, name, logo_url, message, color, link }`.

## 5. New Games

**Memory Match (זיכרון):** 4x4 grid, turn-based pair flipping, most pairs wins.

**Emoji Quiz (ניחוש אימוג'י):** One player picks 3 emojis as clues for a word, other guesses from 4 options, best of 5.

## 6. Visual Polish

- Stagger-in card animations on home
- Game card hover/tap lift + glow
- Enhanced screen transitions
- Streak fire effect on avatar
- Loading skeleton shimmers

## 7. Architecture

Zero new dependencies. Vanilla JS + raw WebSocket.

**New files (9):**
- `public/js/lib/sponsors.js`, `stats.js`, `avatars.js`
- `public/js/screens/how-to-play.js`
- `public/js/games/memory.js`, `emojiquiz.js`
- `server/games/memory.js`, `emojiquiz.js`
- `public/sponsors.json`

**Modified files (8):**
- `home.js`, `game-setup.js`, `game.js`, `result.js`, `app.js`
- `server/rooms.js`, `style.css`, `index.html`
