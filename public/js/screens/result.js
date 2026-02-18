import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { winFanfare, loseTone } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';

const GAMES = [
  { id: 'hex', emoji: '\u2B21', name: '\u05D4\u05E7\u05E1 \u05D3\u05D5\u05D0\u05DC' },
  { id: 'connect4', emoji: '\uD83D\uDD34', name: '\u05D0\u05E8\u05D1\u05E2 \u05D1\u05E9\u05D5\u05E8\u05D4' },
  { id: 'pong', emoji: '\uD83C\uDFD3', name: '\u05E4\u05D5\u05E0\u05D2' },
  { id: 'reaction', emoji: '\u26A1', name: '\u05EA\u05D2\u05D5\u05D1\u05D4 \u05DE\u05D4\u05D9\u05E8\u05D4' },
  { id: 'bomb', emoji: '\uD83D\uDCA3', name: '\u05E4\u05E6\u05E6\u05D4 \u05D7\u05DE\u05D4' },
  { id: 'tapsprint', emoji: '\uD83D\uDC46', name: '\u05E7\u05DC\u05D9\u05E7 \u05DE\u05D8\u05D5\u05E8\u05E3' },
];

function spawnConfetti() {
  const container = el('div', { className: 'confetti-container' });
  document.body.appendChild(container);

  const colors = ['#FBBF24', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6', '#F97316', '#06B6D4'];

  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = 1.5 + Math.random() * 2;
    const delay = Math.random() * 0.8;
    const size = 6 + Math.random() * 8;

    Object.assign(piece.style, {
      left: left + '%',
      width: size + 'px',
      height: size + 'px',
      background: color,
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      animationDuration: duration + 's',
      animationDelay: delay + 's',
    });
    piece.style.setProperty('--duration', duration + 's');
    container.appendChild(piece);
  }

  setTimeout(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  }, 4000);
}

export class ResultScreen {
  constructor(manager, props) {
    this.manager = manager;
    this.props = props;
    this.el = null;
    this.destroyed = false;
    this._unsubs = [];
    this._restartSent = false;
    this._proposeSent = false;
    this._pendingProposal = null;
  }

  render() {
    const winner = this.props.winner;
    const mySeat = this.props.mySeat;
    const iWon = winner === mySeat;
    const isDraw = winner === 0;

    let emoji, text, textClass;
    if (isDraw) {
      emoji = '\uD83E\uDD1D';
      text = '!\u05EA\u05D9\u05E7\u05D5';
      textClass = 'result-text draw';
    } else if (iWon) {
      emoji = '\uD83D\uDC51';
      text = '!\u05E0\u05D9\u05E6\u05D7\u05EA';
      textClass = 'result-text win';
    } else {
      emoji = '\uD83D\uDE24';
      text = '\u05D4\u05E4\u05E1\u05D3\u05EA';
      textClass = 'result-text lose';
    }

    // Sound + haptic on result
    if (iWon) {
      winFanfare();
      vibrate('win');
    } else if (!isDraw) {
      loseTone();
      vibrate('lose');
    }

    // Bet result
    let betEl = null;
    const bet = this.props.bet;
    if (bet && !isDraw) {
      const loserName = iWon
        ? (this.props.names?.[mySeat === 1 ? 1 : 0] || '\u05D4\u05D9\u05E8\u05D9\u05D1')
        : '\u05D0\u05EA\u05D4';
      betEl = el('div', { className: 'bet-result' }, [
        el('div', { className: 'bet-result__label' }, ['\uD83C\uDFB2 \u05D4\u05D4\u05EA\u05E2\u05E8\u05D1\u05D5\u05EA:']),
        el('div', { className: 'bet-result__text' }, [bet]),
        el('div', { className: 'bet-result__who' }, [`${loserName} ${iWon ? '\u05D7\u05D9\u05D9\u05D1 \u05DC\u05E7\u05D9\u05D9\u05DD!' : '\u05D7\u05D9\u05D9\u05D1 \u05DC\u05E7\u05D9\u05D9\u05DD...'}`]),
      ]);
    }

    const restartBtn = el('button', {
      className: 'btn',
      onClick: () => this._restart(),
    }, ['\u05E9\u05D7\u05E7 \u05E9\u05D5\u05D1']);

    const homeBtn = el('button', {
      className: 'btn btn--ghost',
      onClick: () => this._goHome(),
    }, ['\u05D7\u05D6\u05E8\u05D4 \u05D4\u05D1\u05D9\u05EA\u05D4']);

    this._restartBtn = restartBtn;

    // Game switch grid -- show all games except current
    const currentGame = this.props.gameType;
    const otherGames = GAMES.filter(g => g.id !== currentGame);

    const gameCards = otherGames.map(game => {
      const card = el('button', {
        className: 'btn btn--game-pick',
        'data-game': game.id,
        onClick: () => this._proposeGame(game.id, card),
      }, [
        el('span', { className: 'game-pick-emoji' }, [game.emoji]),
        el('span', {}, [game.name]),
      ]);
      return card;
    });

    this._statusEl = el('div', { className: 'switch-status' });

    const switchSection = el('div', { className: 'switch-section' }, [
      el('div', { className: 'divider' }, ['\u05D0\u05D5 \u05D4\u05D7\u05DC\u05D9\u05E4\u05D5 \u05DE\u05E9\u05D7\u05E7']),
      el('div', { className: 'game-pick-grid' }, gameCards),
      this._statusEl,
    ]);

    const mainChildren = [
      el('div', { className: 'result-emoji' }, [emoji]),
      el('div', { className: textClass }, [text]),
    ];
    if (betEl) mainChildren.push(betEl);
    mainChildren.push(
      el('div', { className: 'result-buttons' }, [restartBtn, homeBtn]),
      switchSection,
    );

    const div = el('div', { style: { gap: '16px', justifyContent: 'center' } }, mainChildren);

    this.el = div;
    this._gameCards = gameCards;

    // Show confetti for winner
    if (iWon) {
      setTimeout(() => spawnConfetti(), 200);
    }

    // Listen for restart (same game)
    this._unsubs.push(this.manager.ws.on('restart_requested', (msg) => {
      if (this.destroyed) return;
      if (msg.seat !== mySeat) {
        const waitEl = el('p', { className: 'restart-waiting' }, ['!\u05D4\u05D9\u05E8\u05D9\u05D1 \u05E8\u05D5\u05E6\u05D4 \u05DE\u05E9\u05D7\u05E7 \u05D7\u05D5\u05D6\u05E8']);
        this._restartBtn.parentNode.insertBefore(waitEl, this._restartBtn);
      }
    }));

    // Opponent proposed a different game
    this._unsubs.push(this.manager.ws.on('game_proposed', (msg) => {
      if (this.destroyed) return;
      this._pendingProposal = msg.gameType;
      const gameInfo = GAMES.find(g => g.id === msg.gameType);
      const name = gameInfo ? gameInfo.name : msg.gameType;

      this._statusEl.textContent = '';
      this._statusEl.appendChild(
        el('span', { className: 'proposal-incoming' }, [`\u05D4\u05D9\u05E8\u05D9\u05D1 \u05E8\u05D5\u05E6\u05D4 \u05DC\u05E9\u05D7\u05E7 ${name} \u2014 \u05DC\u05D7\u05E5 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E1\u05DB\u05D9\u05DD`])
      );

      // Highlight the proposed game card
      for (const card of this._gameCards) {
        if (card.getAttribute('data-game') === msg.gameType) {
          card.classList.add('proposed-by-opponent');
        }
      }
    }));

    // My proposal was sent
    this._unsubs.push(this.manager.ws.on('game_propose_sent', (msg) => {
      if (this.destroyed) return;
      this._statusEl.textContent = '...\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D9\u05E8\u05D9\u05D1';
    }));

    // Countdown = game starting (works for both restart and change_game)
    this._unsubs.push(this.manager.ws.on('countdown', async (msg) => {
      if (this.destroyed) return;
      const { GameScreen } = await import('./game.js');
      this.manager.show(GameScreen, {
        ...this.props,
        gameType: msg.gameType || this.props.gameType,
        countdown: msg.count,
        names: msg.names || this.props.names,
        bet: msg.bet || this.props.bet,
      });
    }));

    this._unsubs.push(this.manager.ws.on('opponent_left', () => {
      if (this.destroyed) return;
      this._goHome('\u05D4\u05D9\u05E8\u05D9\u05D1 \u05E2\u05D6\u05D1');
    }));

    return div;
  }

  _proposeGame(gameType, card) {
    // If opponent already proposed this game -- accept it
    if (this._pendingProposal === gameType) {
      this.manager.ws.send({ type: 'accept_game' });
      this._statusEl.textContent = '...\u05DE\u05EA\u05D7\u05D9\u05DC';
      return;
    }

    // Otherwise propose this game
    if (this._proposeSent) return;
    this._proposeSent = true;

    // Visual feedback
    for (const c of this._gameCards) {
      c.classList.remove('selected');
    }
    card.classList.add('selected');

    this.manager.ws.send({ type: 'change_game', gameType });
  }

  _restart() {
    if (this._restartSent) return;
    this._restartSent = true;
    this.manager.ws.send({ type: 'restart' });
    this._restartBtn.textContent = '...\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D9\u05E8\u05D9\u05D1';
    this._restartBtn.disabled = true;
    this._restartBtn.style.opacity = '0.6';
  }

  async _goHome(msg) {
    if (msg) showToast(msg, 'info');
    const { HomeScreen } = await import('./home.js');
    this.manager.ws.close();
    this.manager.show(HomeScreen);
  }

  destroy() {
    this.destroyed = true;
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
