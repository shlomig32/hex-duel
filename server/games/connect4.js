const COLS = 7;
const ROWS = 6;
const TURN_TIME = 15;

function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// Find the lowest empty row in a column (-1 if full)
function dropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

// Check 4-in-a-row from last placed piece
function checkWin(board, row, col, player) {
  const directions = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal ↘
    [1, -1], // diagonal ↙
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
    // Forward
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
      count++;
    }
    // Backward
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

function isBoardFull(board) {
  return board[0].every(c => c !== 0);
}

function randomValidCol(board) {
  const valid = [];
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] === 0) valid.push(c);
  }
  if (valid.length === 0) return -1;
  return valid[Math.floor(Math.random() * valid.length)];
}

module.exports = {
  init(room) {
    room.gameState = {
      board: emptyBoard(),
      turn: 1,
      winner: null,
      timeLeft: TURN_TIME,
      lastMove: null, // { row, col } for animation
    };
  },

  start(room, broadcast) {
    const gs = room.gameState;
    gs.timeLeft = TURN_TIME;

    room.timers.turnTimer = setInterval(() => {
      gs.timeLeft--;
      if (gs.timeLeft <= 0) {
        // Timeout: drop in random column
        const col = randomValidCol(gs.board);
        if (col >= 0) {
          this._placePiece(room, gs.turn, col, broadcast);
        }
      }
    }, 1000);
  },

  handleMessage(room, seat, msg, broadcast) {
    if (msg.type !== 'drop') return;
    const gs = room.gameState;
    if (gs.winner !== null) return;
    if (gs.turn !== seat) return;

    const col = msg.col;
    if (col < 0 || col >= COLS) return;
    if (gs.board[0][col] !== 0) return; // column full

    this._placePiece(room, seat, col, broadcast);
  },

  _placePiece(room, seat, col, broadcast) {
    const gs = room.gameState;
    const row = dropRow(gs.board, col);
    if (row < 0) return;

    gs.board[row][col] = seat;
    gs.lastMove = { row, col };

    if (checkWin(gs.board, row, col, seat)) {
      gs.winner = seat;
      room.phase = 'ended';
      clearInterval(room.timers.turnTimer);
      broadcast({ type: 'state', ...this.getState(room) });
      broadcast({ type: 'gameover', winner: seat });
      return;
    }

    if (isBoardFull(gs.board)) {
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
      lastMove: gs.lastMove,
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
