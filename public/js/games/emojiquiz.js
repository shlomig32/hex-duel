import { el } from '../lib/dom.js';
import { moveClick } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

let _area, _ws, _seat, _unsubs = [];
let _destroyed = false;

function init({ area, ws, seat, names, state, timerEl, turnText, p1Tag, p2Tag }) {
  _area = area;
  _ws = ws;
  _seat = seat;
  _unsubs = [];
  _destroyed = false;

  _updateScoreDisplay(timerEl, state.scores, state.round, state.totalRounds);

  // Clue phase — clue giver picks emojis
  _unsubs.push(ws.on('eq_clue_phase', (msg) => {
    if (_destroyed) return;
    area.innerHTML = '';
    _updateScoreDisplay(timerEl, msg.scores, msg.round, 5);

    if (msg.role === 'clue_giver') {
      _showClueGiverUI(area, msg, turnText, names);
    } else {
      _showWaitingForClue(area, turnText, names, msg);
    }
  }));

  // Guess phase — guesser picks word
  _unsubs.push(ws.on('eq_guess_phase', (msg) => {
    if (_destroyed) return;
    area.innerHTML = '';
    _updateScoreDisplay(timerEl, msg.scores, msg.round, 5);

    const guesser = msg.clueGiver === 1 ? 2 : 1;

    if (_seat === guesser) {
      _showGuesserUI(area, msg, turnText, names);
    } else {
      _showWaitingForGuess(area, msg, turnText, names);
    }
  }));

  // Reveal phase
  _unsubs.push(ws.on('eq_reveal', (msg) => {
    if (_destroyed) return;
    area.innerHTML = '';
    _updateScoreDisplay(timerEl, msg.scores, msg.round, 5);
    _showReveal(area, msg, turnText);
  }));
}

function _updateScoreDisplay(timerEl, scores, round, total) {
  if (timerEl) timerEl.textContent = `${round}/${total}`;
}

function _showClueGiverUI(area, msg, turnText, names) {
  turnText.textContent = 'בחר 3 אימוג\'ים כרמז!';
  turnText.style.color = '#F59E0B';

  const wordEl = el('div', { className: 'eq-word' }, [msg.word]);
  const selected = [];
  const selectedDisplay = el('div', { className: 'eq-selected-emojis' });

  const sendBtn = el('button', {
    className: 'btn eq-send-btn',
    disabled: true,
    onClick: () => {
      if (selected.length === 3) {
        _ws.send({ type: 'eq_select_emojis', emojis: selected });
        sendBtn.disabled = true;
        sendBtn.textContent = '...שולח';
      }
    }
  }, ['שלח רמז']);

  const grid = el('div', { className: 'eq-emoji-grid' });
  for (const emoji of msg.emojiOptions) {
    const btn = el('button', {
      className: 'eq-emoji-btn',
      onClick: () => {
        const idx = selected.indexOf(emoji);
        if (idx >= 0) {
          selected.splice(idx, 1);
          btn.classList.remove('selected');
        } else if (selected.length < 3) {
          selected.push(emoji);
          btn.classList.add('selected');
          moveClick();
          vibrate('tap');
        }
        selectedDisplay.innerHTML = '';
        for (const s of selected) {
          selectedDisplay.appendChild(el('span', { className: 'eq-selected-emoji' }, [s]));
        }
        sendBtn.disabled = selected.length !== 3;
      }
    }, [emoji]);
    grid.appendChild(btn);
  }

  area.appendChild(el('div', { className: 'eq-clue-container' }, [
    el('div', { className: 'eq-label' }, ['המילה שלך:']),
    wordEl,
    el('div', { className: 'eq-label' }, ['בחר 3 אימוג\'ים:']),
    selectedDisplay,
    grid,
    sendBtn,
  ]));
}

function _showWaitingForClue(area, turnText, names, msg) {
  const clueGiverName = names[msg.role === 'guesser' ? (_seat === 1 ? 1 : 0) : (_seat === 1 ? 0 : 1)];
  turnText.textContent = 'היריב בוחר רמז...';
  turnText.style.color = '#9CA3AF';

  area.appendChild(el('div', { className: 'eq-waiting' }, [
    el('div', { className: 'eq-waiting-emoji' }, ['🤔']),
    el('div', { className: 'eq-waiting-text' }, ['...ממתין לרמז']),
  ]));
}

function _showGuesserUI(area, msg, turnText, names) {
  turnText.textContent = 'נחש את המילה!';
  turnText.style.color = '#10B981';

  const emojisEl = el('div', { className: 'eq-clue-display' },
    msg.emojis.map(e => el('span', { className: 'eq-clue-emoji' }, [e]))
  );

  const optionsEl = el('div', { className: 'eq-options' });
  for (const word of msg.options) {
    const btn = el('button', {
      className: 'btn eq-option-btn',
      onClick: () => {
        _ws.send({ type: 'eq_guess', word });
        moveClick();
        vibrate('tap');
        // Disable all
        for (const b of optionsEl.querySelectorAll('.eq-option-btn')) {
          b.disabled = true;
        }
        btn.classList.add('chosen');
      },
    }, [word]);
    optionsEl.appendChild(btn);
  }

  area.appendChild(el('div', { className: 'eq-guess-container' }, [
    el('div', { className: 'eq-label' }, ['הרמז:']),
    emojisEl,
    el('div', { className: 'eq-label' }, ['מה המילה?']),
    optionsEl,
  ]));
}

function _showWaitingForGuess(area, msg, turnText, names) {
  turnText.textContent = 'היריב מנחש...';
  turnText.style.color = '#9CA3AF';

  const emojisEl = el('div', { className: 'eq-clue-display' },
    msg.emojis.map(e => el('span', { className: 'eq-clue-emoji' }, [e]))
  );

  area.appendChild(el('div', { className: 'eq-waiting' }, [
    el('div', { className: 'eq-label' }, ['הרמז שלך:']),
    emojisEl,
    el('div', { className: 'eq-waiting-text' }, ['...ממתין לניחוש']),
  ]));
}

function _showReveal(area, msg, turnText) {
  const correct = msg.correct;
  turnText.textContent = correct ? '✅ ניחוש נכון!' : '❌ לא נכון';
  turnText.style.color = correct ? '#10B981' : '#EF4444';

  if (correct) vibrate('win');
  else vibrate('lose');

  area.appendChild(el('div', { className: 'eq-reveal' }, [
    el('div', { className: 'eq-clue-display' },
      msg.emojis.map(e => el('span', { className: 'eq-clue-emoji' }, [e]))
    ),
    el('div', { className: `eq-reveal-result ${correct ? 'correct' : 'wrong'}` }, [
      correct ? '🎉 נכון!' : '😅 לא...',
    ]),
    el('div', { className: 'eq-reveal-answer' }, [
      `התשובה: ${msg.correctWord}`,
    ]),
    el('div', { className: 'eq-reveal-guess' }, [
      `הניחוש: ${msg.guess}`,
    ]),
  ]));
}

function destroy() {
  _destroyed = true;
  for (const unsub of _unsubs) unsub();
  _unsubs = [];
}

export default { init, destroy };
