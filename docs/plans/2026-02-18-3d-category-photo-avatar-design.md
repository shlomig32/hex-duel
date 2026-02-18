# 3D Category, Photo Avatar, Category Menu — Design

**Date:** 2026-02-18
**Status:** Approved

## 1. Category Navigation
Home screen shows 4 category cards (Strategy, Speed, Party, 3D). Tap → CategoryScreen with games. Join bar stays on home.

## 2. Photo Avatar
Camera capture via getUserMedia, stores 50x50 JPEG base64 in localStorage. Sent to opponent via WS. Falls back to emoji.

## 3. 3D Racing Games (Three.js via CDN)
- Sprint Race: straight track with obstacles, 15s
- Drift Arena: circular arena, collect coins, 30s
- Demolition Derby: small arena, 3 hits = out

## New Files
- `public/js/screens/category.js`
- `public/js/lib/photo-avatar.js`
- `public/js/lib/three-setup.js`
- `public/js/games/sprint.js`, `drift.js`, `derby.js`
- `server/games/sprint.js`, `drift.js`, `derby.js`

## Modified Files
- `home.js`, `game-registry.js`, `game.js`, `app.js`, `index.html`, `style.css`, `rooms.js`
