const hexGame = require('./games/hex');
const connect4Game = require('./games/connect4');
const pongGame = require('./games/pong');
const reactionGame = require('./games/reaction');
const bombGame = require('./games/bomb');
const tapsprintGame = require('./games/tapsprint');
const screamGame = require('./games/scream');
const memoryGame = require('./games/memory');
const emojiquizGame = require('./games/emojiquiz');
const sprintGame = require('./games/sprint');
const driftGame = require('./games/drift');
const derbyGame = require('./games/derby');
const skyduelGame = require('./games/skyduel');
const mazeGame = require('./games/maze');
const snakeclashGame = require('./games/snakeclash');

const GAMES = {
  hex: hexGame,
  connect4: connect4Game,
  pong: pongGame,
  reaction: reactionGame,
  bomb: bombGame,
  tapsprint: tapsprintGame,
  scream: screamGame,
  memory: memoryGame,
  emojiquiz: emojiquizGame,
  sprint: sprintGame,
  drift: driftGame,
  derby: derbyGame,
  skyduel: skyduelGame,
  maze: mazeGame,
  snakeclash: snakeclashGame,
};

const COUNTDOWN_SEC = 3;

function makeCode(rooms) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(room, data) {
  for (const p of room.players) {
    if (p.ws) send(p.ws, data);
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> room
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'create':
        this._create(ws, msg);
        break;
      case 'join':
        this._join(ws, msg);
        break;
      case 'restart':
        this._restart(ws);
        break;
      case 'change_game':
        this._changeGame(ws, msg);
        break;
      case 'accept_game':
        this._acceptGame(ws);
        break;
      default:
        // Route game-specific messages
        this._gameMessage(ws, msg);
        break;
    }
  }

  handleDisconnect(ws) {
    const room = this.rooms.get(ws._room);
    if (!room) return;

    // Cleanup game timers
    const game = GAMES[room.gameType];
    if (game && game.dispose) game.dispose(room);

    // Clear countdown
    if (room._countdownTimer) {
      clearInterval(room._countdownTimer);
      room._countdownTimer = null;
    }

    // Notify opponent
    for (const p of room.players) {
      if (p.ws !== ws && p.ws) {
        send(p.ws, { type: 'opponent_left' });
      }
    }

    this.rooms.delete(room.code);
  }

  _create(ws, msg) {
    const code = makeCode(this.rooms);
    const gameType = msg.gameType || 'hex';
    if (!GAMES[gameType]) {
      send(ws, { type: 'error', msg: 'Unknown game type' });
      return;
    }

    const bet = (msg.bet || '').trim().slice(0, 50);

    const room = {
      code,
      gameType,
      bet: bet || null,
      players: [{ ws, name: msg.name || 'שחקן 1', seat: 1 }],
      phase: 'waiting', // waiting -> countdown -> playing -> ended
      gameState: {},
      timers: {},
      _countdownTimer: null,
      _createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    ws._room = code;
    ws._seat = 1;

    send(ws, { type: 'created', code, seat: 1, gameType, bet: room.bet });
  }

  _join(ws, msg) {
    const code = (msg.code || '').toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      send(ws, { type: 'error', msg: 'חדר לא נמצא' });
      return;
    }
    if (room.players.length >= 2) {
      send(ws, { type: 'error', msg: 'החדר מלא' });
      return;
    }

    room.players.push({ ws, name: msg.name || 'שחקן 2', seat: 2 });
    ws._room = code;
    ws._seat = 2;

    const creatorName = room.players[0] ? room.players[0].name : '';
    send(ws, { type: 'joined', code, seat: 2, gameType: room.gameType, bet: room.bet, creatorName });

    // Start countdown
    this._startCountdown(room);
  }

  _startCountdown(room) {
    room.phase = 'countdown';
    let count = COUNTDOWN_SEC;

    broadcast(room, {
      type: 'countdown',
      count,
      names: room.players.map(p => p.name),
      gameType: room.gameType,
      bet: room.bet,
    });

    room._countdownTimer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(room._countdownTimer);
        room._countdownTimer = null;
        this._startGame(room);
      } else {
        broadcast(room, { type: 'countdown', count });
      }
    }, 1000);
  }

  _startGame(room) {
    room.phase = 'playing';
    const game = GAMES[room.gameType];
    if (!game) return;

    game.init(room);

    broadcast(room, {
      type: 'game_start',
      gameType: room.gameType,
      names: room.players.map(p => p.name),
      state: game.getState(room),
    });

    game.start(room, (data) => broadcast(room, data));
  }

  _gameMessage(ws, msg) {
    const room = this.rooms.get(ws._room);
    if (!room) return;
    if (room.phase !== 'playing') return;

    const game = GAMES[room.gameType];
    if (!game) return;

    game.handleMessage(room, ws._seat, msg, (data) => broadcast(room, data));
  }

  _restart(ws) {
    const room = this.rooms.get(ws._room);
    if (!room) return;
    if (room.players.length < 2) return;

    // Track restart requests
    if (!room._restartRequests) room._restartRequests = new Set();
    room._restartRequests.add(ws._seat);

    // Need both players to request restart
    if (room._restartRequests.size < 2) {
      broadcast(room, { type: 'restart_requested', seat: ws._seat });
      return;
    }

    // Both agreed - reset
    room._restartRequests = null;

    const game = GAMES[room.gameType];
    if (game && game.dispose) game.dispose(room);

    room.phase = 'countdown';
    this._startCountdown(room);
  }

  _changeGame(ws, msg) {
    const room = this.rooms.get(ws._room);
    if (!room) return;
    if (room.phase !== 'ended') return;
    if (!GAMES[msg.gameType]) return;

    // Store the proposal
    room._gameProposal = { gameType: msg.gameType, seat: ws._seat };

    // Notify the other player
    for (const p of room.players) {
      if (p.ws !== ws && p.ws) {
        send(p.ws, { type: 'game_proposed', gameType: msg.gameType, seat: ws._seat });
      }
    }
    // Confirm to proposer
    send(ws, { type: 'game_propose_sent', gameType: msg.gameType });
  }

  _acceptGame(ws) {
    const room = this.rooms.get(ws._room);
    if (!room) return;
    if (!room._gameProposal) return;
    // Only the OTHER player can accept
    if (room._gameProposal.seat === ws._seat) return;

    const newGameType = room._gameProposal.gameType;
    room._gameProposal = null;
    room._restartRequests = null;

    // Dispose old game
    const oldGame = GAMES[room.gameType];
    if (oldGame && oldGame.dispose) oldGame.dispose(room);

    // Switch game type
    room.gameType = newGameType;
    room.gameState = {};

    // Start countdown
    this._startCountdown(room);
  }

  cleanup() {
    const now = Date.now();
    const staleMs = 30 * 60 * 1000; // 30 minutes
    for (const [code, room] of this.rooms) {
      if (now - room._createdAt > staleMs) {
        const game = GAMES[room.gameType];
        if (game && game.dispose) game.dispose(room);
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager };
