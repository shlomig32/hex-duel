const BOARD_SIZE = 11;
const TURN_TIME = 15;

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(0));
}

// BFS win check: player 1 connects top→bottom, player 2 connects left→right
function checkWin(board, player) {
  const visited = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(false));
  const queue = [];

  for (let i = 0; i < BOARD_SIZE; i++) {
    if (player === 1 && board[0][i] === player) {
      queue.push([0, i]);
      visited[0][i] = true;
    }
    if (player === 2 && board[i][0] === player) {
      queue.push([i, 0]);
      visited[i][0] = true;
    }
  }

  const dirs = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    if (player === 1 && r === BOARD_SIZE - 1) return true;
    if (player === 2 && c === BOARD_SIZE - 1) return true;

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
          !visited[nr][nc] && board[nr][nc] === player) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
  return false;
}

function randomEmptyCell(board) {
  const empty = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return null;
  return empty[Math.floor(Math.random() * empty.length)];
}

module.exports = {
  init(room) {
    room.gameState = {
      board: emptyBoard(),
      turn: 1,
      winner: null,
      timeLeft: TURN_TIME,
    };
  },

  start(room, broadcast) {
    const gs = room.gameState;
    gs.timeLeft = TURN_TIME;

    room.timers.turnTimer = setInterval(() => {
      gs.timeLeft--;
      if (gs.timeLeft <= 0) {
        // Place random piece on timeout
        const cell = randomEmptyCell(gs.board);
        if (cell) {
          gs.board[cell[0]][cell[1]] = gs.turn;
          if (checkWin(gs.board, gs.turn)) {
            gs.winner = gs.turn;
            room.phase = 'ended';
            clearInterval(room.timers.turnTimer);
            broadcast({ type: 'state', ...this.getState(room) });
            broadcast({ type: 'gameover', winner: gs.winner });
            return;
          }
        }
        gs.turn = gs.turn === 1 ? 2 : 1;
        gs.timeLeft = TURN_TIME;
        broadcast({ type: 'state', ...this.getState(room) });
      }
    }, 1000);
  },

  handleMessage(room, seat, msg, broadcast) {
    if (msg.type !== 'move') return;
    const gs = room.gameState;
    if (gs.winner) return;
    if (gs.turn !== seat) return;

    const { row, col } = msg;
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
    if (gs.board[row][col] !== 0) return;

    gs.board[row][col] = seat;

    if (checkWin(gs.board, seat)) {
      gs.winner = seat;
      room.phase = 'ended';
      clearInterval(room.timers.turnTimer);
      broadcast({ type: 'state', ...this.getState(room) });
      broadcast({ type: 'gameover', winner: seat });
      return;
    }

    // Check draw (board full)
    const isFull = gs.board.every(row => row.every(c => c !== 0));
    if (isFull) {
      gs.winner = 0; // draw
      room.phase = 'ended';
      clearInterval(room.timers.turnTimer);
      broadcast({ type: 'state', ...this.getState(room) });
      broadcast({ type: 'gameover', winner: 0 });
      return;
    }

    gs.turn = seat === 1 ? 2 : 1;
    gs.timeLeft = TURN_TIME;
    clearInterval(room.timers.turnTimer);
    this.start(room, broadcast);
    broadcast({ type: 'state', ...this.getState(room) });
  },

  getState(room) {
    const gs = room.gameState;
    return {
      board: gs.board,
      turn: gs.turn,
      timeLeft: gs.timeLeft,
      winner: gs.winner,
    };
  },

  reset(room) {
    this.dispose(room);
    this.init(room);
  },

  dispose(room) {
    if (room.timers.turnTimer) {
      clearInterval(room.timers.turnTimer);
      room.timers.turnTimer = null;
    }
  },
};
