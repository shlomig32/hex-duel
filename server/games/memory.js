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
  const picked = shuffle(EMOJIS).slice(0, 8);
  const board = shuffle([...picked, ...picked]);

  room.gameState = {
    board,
    revealed: Array(16).fill(false),
    flipped: [],
    scores: [0, 0],
    turn: 1,
    locked: false,
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
  broadcast({ type: 'card_flipped', index: idx, emoji: gs.board[idx], seat });

  if (gs.flipped.length === 2) {
    gs.locked = true;
    const [a, b] = gs.flipped;

    if (gs.board[a] === gs.board[b]) {
      gs.revealed[a] = true;
      gs.revealed[b] = true;
      gs.scores[seat - 1]++;
      gs.flipped = [];
      gs.locked = false;

      broadcast({ type: 'match', indices: [a, b], seat, scores: gs.scores });

      const totalMatched = gs.scores[0] + gs.scores[1];
      if (totalMatched >= 8) {
        room.phase = 'ended';
        const winner = gs.scores[0] > gs.scores[1] ? 1 : gs.scores[1] > gs.scores[0] ? 2 : 0;
        broadcast({ type: 'gameover', winner });
      }
    } else {
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
