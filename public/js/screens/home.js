import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { promptModal } from '../lib/modal.js';

const CATEGORIES = [
  {
    title: '1v1 \u05D3\u05D5\u05D0\u05DC\u05D9\u05DD',
    games: [
      { id: 'hex', emoji: '\u2B21', name: '\u05D4\u05E7\u05E1 \u05D3\u05D5\u05D0\u05DC', tagline: '\u05D7\u05D1\u05E8 \u05E6\u05D3\u05D3\u05D9\u05DD. \u05D7\u05E1\u05D5\u05DD \u05D9\u05E8\u05D9\u05D1.' },
      { id: 'connect4', emoji: '\uD83D\uDD34', name: '\u05D0\u05E8\u05D1\u05E2 \u05D1\u05E9\u05D5\u05E8\u05D4', tagline: '\u05D4\u05E4\u05DC \u05D0\u05E1\u05D9\u05DE\u05D5\u05E0\u05D9\u05DD. \u05D7\u05D1\u05E8 \u05D0\u05E8\u05D1\u05E2.' },
      { id: 'pong', emoji: '\uD83C\uDFD3', name: '\u05E4\u05D5\u05E0\u05D2', tagline: '\u05D4\u05D6\u05D6 \u05DE\u05D7\u05D1\u05D8. \u05D4\u05D1\u05E7\u05E2 \u05E9\u05E2\u05E8\u05D9\u05DD.' },
      { id: 'reaction', emoji: '\u26A1', name: '\u05EA\u05D2\u05D5\u05D1\u05D4 \u05DE\u05D4\u05D9\u05E8\u05D4', tagline: '\u05D7\u05DB\u05D4 \u05DC\u05D0\u05D5\u05EA. \u05DC\u05D7\u05E5 \u05E8\u05D0\u05E9\u05D5\u05DF.' },
      { id: 'bomb', emoji: '\uD83D\uDCA3', name: '\u05E4\u05E6\u05E6\u05D4 \u05D7\u05DE\u05D4', tagline: '\u05D4\u05E2\u05D1\u05E8 \u05D0\u05EA \u05D4\u05E4\u05E6\u05E6\u05D4. \u05D0\u05DC \u05EA\u05D9\u05EA\u05E4\u05E1.' },
      { id: 'tapsprint', emoji: '\uD83D\uDC46', name: '\u05E7\u05DC\u05D9\u05E7 \u05DE\u05D8\u05D5\u05E8\u05E3', tagline: '\u05DC\u05D7\u05E5 \u05D4\u05DB\u05D9 \u05DE\u05D4\u05E8. 10 \u05E9\u05E0\u05D9\u05D5\u05EA.' },
    ],
  },
];

export class HomeScreen {
  constructor(manager) {
    this.manager = manager;
    this.el = null;
  }

  render() {
    const savedName = this.manager.getPlayerName() || '';

    // -- Header --
    const nameDisplay = el('span', {
      className: 'header-name',
      onClick: () => this._editName(),
    }, [savedName || '\u05D4\u05D2\u05D3\u05E8 \u05E9\u05DD']);
    this._nameDisplay = nameDisplay;

    const header = el('div', { className: 'home-header' }, [
      el('h1', {}, ['\uD83C\uDFAE Game Arena']),
      el('div', { className: 'header-user' }, [
        nameDisplay,
        el('span', { className: 'header-edit-icon', onClick: () => this._editName() }, ['\u270F\uFE0F']),
      ]),
    ]);

    // -- Join bar --
    const codeInput = el('input', {
      className: 'join-code-input',
      type: 'text',
      placeholder: '\u05E7\u05D5\u05D3 \u05D7\u05D3\u05E8',
      maxlength: '4',
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._joinGame();
    });
    this._codeInput = codeInput;

    const joinBar = el('div', { className: 'join-bar' }, [
      el('button', {
        className: 'btn btn--join',
        onClick: () => this._joinGame(),
      }, ['\u05D4\u05E6\u05D8\u05E8\u05E3']),
      codeInput,
    ]);

    // -- Categories --
    const sections = CATEGORIES.map(cat => {
      const gameCards = cat.games.map(game => {
        const card = el('div', {
          className: 'game-card',
          'data-game': game.id,
          onClick: () => this._openSetup(game),
        }, [
          el('div', { className: 'game-card__emoji' }, [game.emoji]),
          el('div', { className: 'game-card__name' }, [game.name]),
          el('div', { className: 'game-card__tagline' }, [game.tagline]),
        ]);
        return card;
      });

      return el('div', { className: 'category-section' }, [
        el('div', { className: 'category-title' }, [cat.title]),
        el('div', { className: 'game-grid' }, gameCards),
      ]);
    });

    const div = el('div', { className: 'home-screen' }, [
      header,
      joinBar,
      ...sections,
    ]);

    this.el = div;
    return div;
  }

  async _editName() {
    const current = this.manager.getPlayerName() || '';
    const name = await promptModal('\u05D4\u05E9\u05DD \u05E9\u05DC\u05DA:', current);
    if (name !== null) {
      const trimmed = name.trim().slice(0, 15) || '\u05E9\u05D7\u05E7\u05DF';
      this.manager.setPlayerName(trimmed);
      this._nameDisplay.textContent = trimmed;
    }
  }

  _getName() {
    const name = this.manager.getPlayerName() || '\u05E9\u05D7\u05E7\u05DF';
    return name;
  }

  async _openSetup(game) {
    const { GameSetupScreen } = await import('./game-setup.js');
    this.manager.show(GameSetupScreen, { game });
  }

  async _joinGame() {
    const name = this._getName();
    const code = this._codeInput.value.trim().toUpperCase();
    if (!code || code.length !== 4) {
      showToast('\u05D4\u05D6\u05DF \u05E7\u05D5\u05D3 \u05D1\u05DF 4 \u05EA\u05D5\u05D5\u05D9\u05DD', 'error');
      return;
    }

    if (!name || name === '\u05E9\u05D7\u05E7\u05DF') {
      const entered = await promptModal('\u05D4\u05E9\u05DD \u05E9\u05DC\u05DA:');
      if (!entered || !entered.trim()) return;
      this.manager.setPlayerName(entered.trim().slice(0, 15));
      this._nameDisplay.textContent = entered.trim().slice(0, 15);
    }

    try {
      await this.manager.ws.connect();

      const unsubErr = this.manager.ws.on('error', (msg) => {
        unsubErr();
        unsubJoin();
        showToast(msg.msg, 'error');
      });

      const { WaitingScreen } = await import('./waiting.js');
      const unsubJoin = this.manager.ws.on('joined', (msg) => {
        unsubErr();
        unsubJoin();
        this.manager.show(WaitingScreen, {
          code: msg.code,
          gameType: msg.gameType,
          seat: msg.seat,
          name: this._getName(),
          joined: true,
          bet: msg.bet,
          creatorName: msg.creatorName,
        });
      });

      this.manager.ws.send({ type: 'join', code, name: this._getName() });
    } catch (e) {
      showToast('\u05E9\u05D2\u05D9\u05D0\u05EA \u05D7\u05D9\u05D1\u05D5\u05E8', 'error');
    }
  }

  destroy() {}
}
