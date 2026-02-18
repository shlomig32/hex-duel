const WORD_BANK = [
  { word: 'חתול', options: ['כלב', 'ציפור', 'דג'] },
  { word: 'פיצה', options: ['המבורגר', 'סושי', 'סלט'] },
  { word: 'כדורגל', options: ['כדורסל', 'טניס', 'שחייה'] },
  { word: 'חוף ים', options: ['הר', 'יער', 'מדבר'] },
  { word: 'יום הולדת', options: ['חתונה', 'חג', 'סיום'] },
  { word: 'בית ספר', options: ['משרד', 'חנות', 'מסעדה'] },
  { word: 'גשם', options: ['שלג', 'שמש', 'רוח'] },
  { word: 'מוזיקה', options: ['ציור', 'ריקוד', 'שירה'] },
  { word: 'רופא', options: ['מורה', 'שוטר', 'טבח'] },
  { word: 'טיסה', options: ['נסיעה', 'שייט', 'טיול'] },
  { word: 'קפה', options: ['תה', 'מיץ', 'בירה'] },
  { word: 'סרט', options: ['ספר', 'שיר', 'משחק'] },
  { word: 'חלום', options: ['סיוט', 'מחשבה', 'זיכרון'] },
  { word: 'ילד', options: ['תינוק', 'מבוגר', 'זקן'] },
  { word: 'כסף', options: ['זהב', 'יהלום', 'מטבע'] },
  { word: 'אהבה', options: ['שנאה', 'חברות', 'קנאה'] },
  { word: 'שמש', options: ['ירח', 'כוכב', 'ענן'] },
  { word: 'מסיבה', options: ['ישיבה', 'שיעור', 'טקס'] },
  { word: 'נסיכה', options: ['מלכה', 'גיבור', 'מכשפה'] },
  { word: 'גלידה', options: ['עוגה', 'שוקולד', 'סוכריה'] },
  { word: 'כלב', options: ['חתול', 'ארנב', 'דג'] },
  { word: 'ספורט', options: ['אוכל', 'מוזיקה', 'אמנות'] },
  { word: 'חורף', options: ['קיץ', 'אביב', 'סתיו'] },
  { word: 'לילה', options: ['בוקר', 'צהריים', 'ערב'] },
  { word: 'אוקיינוס', options: ['נהר', 'אגם', 'בריכה'] },
];

const EMOJI_POOL = [
  '😀','😂','😍','🤔','😱','🤮','😴','🥳','😎','🤯','🥺','😈',
  '🐶','🐱','🐸','🦊','🐼','🦁','🐷','🐵','🦄','🐙','🦋','🐢',
  '🍕','🍔','🍣','🥗','🍦','🎂','☕','🍺','🥤','🍎','🌽','🧀',
  '⚽','🏀','🎾','🏊','✈️','🚗','🚀','🎸','🎬','📚','💰','💎',
  '❤️','⭐','🔥','💧','🌈','🎯','🏠','🌙','☀️','🌊','🏔️','🌲',
  '👶','👧','👨','👴','👸','🧙','🦸','💀','👻','🤖','👽','🎅',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRounds() {
  return shuffle(WORD_BANK).slice(0, 5);
}

function pickEmojiOptions() {
  return shuffle(EMOJI_POOL).slice(0, 12);
}

function init(room) {
  const rounds = pickRounds();
  room.gameState = {
    rounds,
    currentRound: 0,
    phase: 'clue',
    clueGiver: 1,
    selectedEmojis: [],
    scores: [0, 0],
    emojiOptions: [],
    guessResult: null,
  };
}

function getState(room) {
  return {
    round: room.gameState.currentRound,
    totalRounds: 5,
    scores: room.gameState.scores,
    phase: room.gameState.phase,
    clueGiver: room.gameState.clueGiver,
  };
}

function start(room, broadcast) {
  const gs = room.gameState;
  gs.emojiOptions = pickEmojiOptions();

  _sendRoundStart(room, broadcast);
}

function _sendRoundStart(room, broadcast) {
  const gs = room.gameState;
  const round = gs.rounds[gs.currentRound];

  for (const p of room.players) {
    if (p.seat === gs.clueGiver) {
      _send(p.ws, {
        type: 'eq_clue_phase',
        word: round.word,
        emojiOptions: gs.emojiOptions,
        round: gs.currentRound + 1,
        totalRounds: 5,
        scores: gs.scores,
        role: 'clue_giver',
      });
    } else {
      _send(p.ws, {
        type: 'eq_clue_phase',
        round: gs.currentRound + 1,
        totalRounds: 5,
        scores: gs.scores,
        role: 'guesser',
        waiting: true,
      });
    }
  }

  room.timers.phaseTimer = setTimeout(() => {
    if (gs.phase === 'clue' && gs.selectedEmojis.length < 3) {
      gs.selectedEmojis = shuffle(gs.emojiOptions).slice(0, 3);
      _startGuessPhase(room, broadcast);
    }
  }, 15000);
}

function _startGuessPhase(room, broadcast) {
  const gs = room.gameState;
  gs.phase = 'guess';
  const round = gs.rounds[gs.currentRound];

  const options = shuffle([round.word, ...round.options]);

  if (room.timers.phaseTimer) {
    clearTimeout(room.timers.phaseTimer);
    room.timers.phaseTimer = null;
  }

  broadcast({
    type: 'eq_guess_phase',
    emojis: gs.selectedEmojis,
    options,
    round: gs.currentRound + 1,
    scores: gs.scores,
    clueGiver: gs.clueGiver,
  });

  room.timers.phaseTimer = setTimeout(() => {
    if (gs.phase === 'guess') {
      _resolveGuess(room, broadcast, null);
    }
  }, 15000);
}

function _resolveGuess(room, broadcast, guess) {
  const gs = room.gameState;
  const round = gs.rounds[gs.currentRound];
  const correct = guess === round.word;

  if (correct) {
    const guesserIdx = gs.clueGiver === 1 ? 1 : 0;
    gs.scores[guesserIdx]++;
  }

  gs.phase = 'reveal';

  if (room.timers.phaseTimer) {
    clearTimeout(room.timers.phaseTimer);
    room.timers.phaseTimer = null;
  }

  broadcast({
    type: 'eq_reveal',
    correct,
    correctWord: round.word,
    guess: guess || '(לא ענה)',
    emojis: gs.selectedEmojis,
    scores: gs.scores,
    round: gs.currentRound + 1,
  });

  room.timers.nextRound = setTimeout(() => {
    gs.currentRound++;
    if (gs.currentRound >= 5) {
      room.phase = 'ended';
      const winner = gs.scores[0] > gs.scores[1] ? 1 : gs.scores[1] > gs.scores[0] ? 2 : 0;
      broadcast({ type: 'gameover', winner });
    } else {
      gs.clueGiver = gs.clueGiver === 1 ? 2 : 1;
      gs.phase = 'clue';
      gs.selectedEmojis = [];
      gs.emojiOptions = pickEmojiOptions();
      _sendRoundStart(room, broadcast);
    }
  }, 2500);
}

function handleMessage(room, seat, msg, broadcast) {
  const gs = room.gameState;

  if (msg.type === 'eq_select_emojis') {
    if (seat !== gs.clueGiver) return;
    if (gs.phase !== 'clue') return;
    if (!Array.isArray(msg.emojis) || msg.emojis.length !== 3) return;
    gs.selectedEmojis = msg.emojis;
    _startGuessPhase(room, broadcast);
  }

  if (msg.type === 'eq_guess') {
    const guesser = gs.clueGiver === 1 ? 2 : 1;
    if (seat !== guesser) return;
    if (gs.phase !== 'guess') return;
    _resolveGuess(room, broadcast, msg.word);
  }
}

function _send(ws, data) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function dispose(room) {
  if (room.timers.phaseTimer) {
    clearTimeout(room.timers.phaseTimer);
    room.timers.phaseTimer = null;
  }
  if (room.timers.nextRound) {
    clearTimeout(room.timers.nextRound);
    room.timers.nextRound = null;
  }
}

module.exports = { init, getState, start, handleMessage, dispose };
