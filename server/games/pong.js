// Pong physics constants (0-100 normalized space)
const PADDLE_WIDTH = 20;
const PADDLE_HEIGHT = 2;
const PADDLE_Y_OFFSET = 5;
const BALL_RADIUS = 1.5;
const BALL_INITIAL_SPEED = 30;
const BALL_MAX_SPEED = 60;
const BALL_SPEED_INCREMENT = 2;
const WIN_SCORE = 5;
const TIME_LIMIT = 90; // seconds
const TICK_MS = 16; // ~60fps
const SERVE_DELAY = 1500;

module.exports = {
  init(room) {
    room.gameState = {
      paddles: { 1: 50, 2: 50 }, // seat -> paddleX
      ball: { x: 50, y: 50, vx: 0, vy: 0 },
      scores: { 1: 0, 2: 0 },
      winner: null,
      timeLeft: TIME_LIMIT,
      ballInPlay: false,
      nextServer: 1,
      rallyCount: 0,
      ballSpeed: BALL_INITIAL_SPEED,
    };
  },

  start(room, broadcast) {
    const gs = room.gameState;

    // Game clock (1s ticks for time limit)
    room.timers.gameTimer = setInterval(() => {
      gs.timeLeft--;
      if (gs.timeLeft <= 0) {
        this._timeUp(room, broadcast);
      }
    }, 1000);

    // Physics tick
    room.timers.physicsTimer = setInterval(() => {
      this._tick(room, broadcast);
    }, TICK_MS);

    // Broadcast state at 30fps
    room.timers.syncTimer = setInterval(() => {
      broadcast({ type: 'pong_state', ...this._getPhysicsState(room) });
    }, 33);

    // Initial serve
    this._serve(room, broadcast);
  },

  handleMessage(room, seat, msg, broadcast) {
    if (msg.type === 'paddle_move') {
      const gs = room.gameState;
      const halfPaddle = PADDLE_WIDTH / 2;
      gs.paddles[seat] = Math.max(halfPaddle, Math.min(100 - halfPaddle, msg.x));
    }
  },

  _tick(room, broadcast) {
    const gs = room.gameState;
    if (!gs.ballInPlay) return;

    const dt = TICK_MS / 1000;
    gs.ball.x += gs.ball.vx * dt;
    gs.ball.y += gs.ball.vy * dt;

    // Side wall bounces
    if (gs.ball.x <= BALL_RADIUS) {
      gs.ball.x = BALL_RADIUS;
      gs.ball.vx = Math.abs(gs.ball.vx);
    } else if (gs.ball.x >= 100 - BALL_RADIUS) {
      gs.ball.x = 100 - BALL_RADIUS;
      gs.ball.vx = -Math.abs(gs.ball.vx);
    }

    // Bottom paddle (seat 1) collision
    const bottomY = 100 - PADDLE_Y_OFFSET;
    if (gs.ball.vy > 0 &&
        gs.ball.y + BALL_RADIUS >= bottomY - PADDLE_HEIGHT / 2 &&
        gs.ball.y + BALL_RADIUS <= bottomY + PADDLE_HEIGHT / 2 + 2) {
      if (this._isPaddleHit(gs.paddles[1], gs.ball.x)) {
        this._reflect(gs, gs.paddles[1], -1);
        broadcast({ type: 'paddle_hit', seat: 1 });
      }
    }

    // Top paddle (seat 2) collision
    const topY = PADDLE_Y_OFFSET;
    if (gs.ball.vy < 0 &&
        gs.ball.y - BALL_RADIUS <= topY + PADDLE_HEIGHT / 2 &&
        gs.ball.y - BALL_RADIUS >= topY - PADDLE_HEIGHT / 2 - 2) {
      if (this._isPaddleHit(gs.paddles[2], gs.ball.x)) {
        this._reflect(gs, gs.paddles[2], 1);
        broadcast({ type: 'paddle_hit', seat: 2 });
      }
    }

    // Score detection
    if (gs.ball.y > 100 + BALL_RADIUS * 2) {
      this._score(room, 2, broadcast); // seat 2 scores (ball past seat 1)
    } else if (gs.ball.y < -BALL_RADIUS * 2) {
      this._score(room, 1, broadcast); // seat 1 scores (ball past seat 2)
    }
  },

  _isPaddleHit(paddleX, ballX) {
    const half = PADDLE_WIDTH / 2;
    return ballX >= paddleX - half - BALL_RADIUS &&
           ballX <= paddleX + half + BALL_RADIUS;
  },

  _reflect(gs, paddleX, dirY) {
    const hitOffset = (gs.ball.x - paddleX) / (PADDLE_WIDTH / 2);
    const clamped = Math.max(-1, Math.min(1, hitOffset));

    gs.rallyCount++;
    gs.ballSpeed = Math.min(BALL_MAX_SPEED, BALL_INITIAL_SPEED + gs.rallyCount * BALL_SPEED_INCREMENT);

    const angle = (20 + Math.abs(clamped) * 50) * (Math.PI / 180);
    gs.ball.vx = Math.sin(angle) * gs.ballSpeed * Math.sign(clamped || (Math.random() - 0.5));
    gs.ball.vy = Math.cos(angle) * gs.ballSpeed * dirY;

    // Push ball out of paddle
    if (dirY > 0) {
      gs.ball.y = PADDLE_Y_OFFSET + PADDLE_HEIGHT / 2 + BALL_RADIUS + 0.5;
    } else {
      gs.ball.y = 100 - PADDLE_Y_OFFSET - PADDLE_HEIGHT / 2 - BALL_RADIUS - 0.5;
    }
  },

  _score(room, scoringSeat, broadcast) {
    const gs = room.gameState;
    gs.scores[scoringSeat]++;
    gs.ballInPlay = false;

    broadcast({ type: 'point_scored', seat: scoringSeat, scores: { ...gs.scores } });

    if (gs.scores[scoringSeat] >= WIN_SCORE) {
      gs.winner = scoringSeat;
      room.phase = 'ended';
      this._stopTimers(room);
      broadcast({ type: 'gameover', winner: scoringSeat });
      return;
    }

    // Serve from loser's side after delay
    gs.nextServer = scoringSeat === 1 ? 2 : 1;
    room.timers.serveTimeout = setTimeout(() => {
      if (room.phase === 'playing') {
        this._serve(room, broadcast);
      }
    }, SERVE_DELAY);
  },

  _serve(room, broadcast) {
    const gs = room.gameState;
    gs.ball.x = 50;
    gs.ball.y = 50;
    gs.rallyCount = 0;
    gs.ballSpeed = BALL_INITIAL_SPEED;

    const angle = (30 + Math.random() * 30) * (Math.PI / 180);
    const dirX = Math.random() < 0.5 ? 1 : -1;
    // Serve toward the opponent of the server
    const dirY = gs.nextServer === 1 ? -1 : 1;

    gs.ball.vx = Math.sin(angle) * gs.ballSpeed * dirX;
    gs.ball.vy = Math.cos(angle) * gs.ballSpeed * dirY;
    gs.ballInPlay = true;

    broadcast({ type: 'serve', server: gs.nextServer });
  },

  _timeUp(room, broadcast) {
    const gs = room.gameState;
    this._stopTimers(room);
    room.phase = 'ended';

    // Whoever has more points wins
    const winner = gs.scores[1] > gs.scores[2] ? 1 :
                   gs.scores[2] > gs.scores[1] ? 2 : 1; // tie goes to seat 1
    gs.winner = winner;
    broadcast({ type: 'gameover', winner });
  },

  _stopTimers(room) {
    if (room.timers.gameTimer) clearInterval(room.timers.gameTimer);
    if (room.timers.physicsTimer) clearInterval(room.timers.physicsTimer);
    if (room.timers.syncTimer) clearInterval(room.timers.syncTimer);
    if (room.timers.serveTimeout) clearTimeout(room.timers.serveTimeout);
  },

  _getPhysicsState(room) {
    const gs = room.gameState;
    return {
      paddles: { ...gs.paddles },
      ball: { ...gs.ball },
      scores: { ...gs.scores },
      timeLeft: gs.timeLeft,
    };
  },

  getState(room) {
    return this._getPhysicsState(room);
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  dispose(room) {
    this._stopTimers(room);
    room.timers = {};
  },
};
