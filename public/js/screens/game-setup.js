import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { promptModal } from '../lib/modal.js';
import { WaitingScreen } from './waiting.js';

export class GameSetupScreen {
  constructor(manager, props) {
    this.manager = manager;
    this.props = props;
    this.el = null;
    this._betOpen = false;
  }

  render() {
    const game = this.props.game;

    // -- Back button --
    const backBtn = el('button', {
      className: 'btn btn--back',
      onClick: () => this._goHome(),
    }, ['\u2192 \u05D7\u05D6\u05E8\u05D4']);

    // -- Game info --
    const gameInfo = el('div', { className: 'setup-game-info' }, [
      el('div', { className: 'setup-emoji' }, [game.emoji]),
      el('div', { className: 'setup-name' }, [game.name]),
      el('div', { className: 'setup-tagline' }, [game.tagline]),
    ]);

    // -- Bet toggle --
    const betInput = el('input', {
      className: 'setup-bet-input',
      type: 'text',
      placeholder: '\u05DC\u05DE\u05E9\u05DC: \u05D4\u05DE\u05E4\u05E1\u05D9\u05D3 \u05E7\u05D5\u05E0\u05D4 \u05E7\u05E4\u05D4 \u2615',
      maxlength: '50',
      dir: 'rtl',
    });
    this._betInput = betInput;

    const betContent = el('div', { className: 'setup-bet-content' }, [betInput]);
    this._betContent = betContent;

    const betToggle = el('button', {
      className: 'btn btn--bet-toggle',
      onClick: () => this._toggleBet(),
    }, ['\uD83C\uDFB2 \u05D4\u05D5\u05E1\u05E3 \u05D4\u05EA\u05E2\u05E8\u05D1\u05D5\u05EA']);
    this._betToggle = betToggle;

    // -- Create button --
    const createBtn = el('button', {
      className: 'btn btn--create',
      onClick: () => this._createGame(),
    }, ['\u05E6\u05D5\u05E8 \u05D7\u05D3\u05E8']);
    this._createBtn = createBtn;

    const div = el('div', { className: 'setup-screen' }, [
      backBtn,
      gameInfo,
      betToggle,
      betContent,
      createBtn,
    ]);

    this.el = div;
    return div;
  }

  _toggleBet() {
    this._betOpen = !this._betOpen;
    this._betContent.classList.toggle('open', this._betOpen);
    this._betToggle.classList.toggle('active', this._betOpen);
    if (this._betOpen) {
      this._betInput.focus();
    }
  }

  async _getName() {
    let name = this.manager.getPlayerName();
    if (!name || name === '\u05E9\u05D7\u05E7\u05DF') {
      const entered = await promptModal('\u05D4\u05E9\u05DD \u05E9\u05DC\u05DA:');
      if (!entered || !entered.trim()) return null;
      name = entered.trim().slice(0, 15);
      this.manager.setPlayerName(name);
    }
    return name;
  }

  async _createGame() {
    const name = await this._getName();
    if (!name) return;

    const game = this.props.game;
    const bet = this._betInput.value.trim();

    this._createBtn.textContent = '...\u05DE\u05EA\u05D7\u05D1\u05E8';
    this._createBtn.disabled = true;

    try {
      await this.manager.ws.connect();
      this.manager.ws.send({ type: 'create', gameType: game.id, name, bet });

      const unsub = this.manager.ws.on('created', (msg) => {
        unsub();
        this.manager.show(WaitingScreen, {
          code: msg.code,
          gameType: msg.gameType,
          seat: msg.seat,
          name,
          bet: msg.bet,
          creatorName: name,
        });
      });
    } catch (e) {
      showToast('\u05E9\u05D2\u05D9\u05D0\u05EA \u05D7\u05D9\u05D1\u05D5\u05E8', 'error');
      this._createBtn.textContent = '\u05E6\u05D5\u05E8 \u05D7\u05D3\u05E8';
      this._createBtn.disabled = false;
    }
  }

  async _goHome() {
    const { HomeScreen } = await import('./home.js');
    this.manager.show(HomeScreen);
  }

  destroy() {}
}
