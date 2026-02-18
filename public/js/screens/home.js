import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { promptModal } from '../lib/modal.js';
import { GAME_REGISTRY, CATEGORIES } from '../lib/game-registry.js';
import { getAvatar, setAvatar, AVATARS } from '../lib/avatars.js';
import { getStats } from '../lib/stats.js';

export class HomeScreen {
  constructor(manager) {
    this.manager = manager;
    this.el = null;
  }

  render() {
    const savedName = this.manager.getPlayerName() || '';
    const avatar = getAvatar();
    const stats = getStats();

    // -- Header --
    const avatarEl = el('span', {
      className: 'header-avatar',
      onClick: () => this._pickAvatar(),
    }, [avatar]);
    this._avatarEl = avatarEl;

    const nameDisplay = el('span', {
      className: 'header-name',
      onClick: () => this._editName(),
    }, [savedName || '\u05D4\u05D2\u05D3\u05E8 \u05E9\u05DD']);
    this._nameDisplay = nameDisplay;

    const header = el('div', { className: 'home-header' }, [
      el('h1', { className: 'home-logo' }, ['\uD83C\uDFAE Game Arena']),
      el('div', { className: 'header-user' }, [
        avatarEl,
        nameDisplay,
        el('span', { className: 'header-edit-icon', onClick: () => this._editName() }, ['\u270F\uFE0F']),
      ]),
    ]);

    // -- Stats bar --
    const streakFire = stats.streak >= 3 ? ' \uD83D\uDD25' : '';
    const statsBar = el('div', { className: 'stats-bar' }, [
      el('div', { className: 'stat-item' }, [
        el('span', { className: 'stat-value' }, [String(stats.played)]),
        el('span', { className: 'stat-label' }, ['\u05DE\u05E9\u05D7\u05E7\u05D9\u05DD']),
      ]),
      el('div', { className: 'stat-item' }, [
        el('span', { className: 'stat-value' }, [String(stats.wins)]),
        el('span', { className: 'stat-label' }, ['\u05E0\u05D9\u05E6\u05D7\u05D5\u05E0\u05D5\u05EA']),
      ]),
      el('div', { className: 'stat-item' }, [
        el('span', { className: 'stat-value' }, [`${stats.streak}${streakFire}`]),
        el('span', { className: 'stat-label' }, ['\u05E8\u05E6\u05E3']),
      ]),
      el('div', { className: 'stat-item' }, [
        el('span', { className: 'stat-value' }, [String(stats.bestStreak)]),
        el('span', { className: 'stat-label' }, ['\u05E9\u05D9\u05D0 \u05E8\u05E6\u05E3']),
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
      const gameIds = cat.games;
      const gameCards = gameIds.map((gameId, cardIdx) => {
        const game = GAME_REGISTRY[gameId];
        if (!game) return null;

        const card = el('div', {
          className: 'game-card',
          'data-game': game.id,
          style: { animationDelay: `${cardIdx * 0.08}s` },
          onClick: () => this._openSetup(game),
        }, [
          el('div', { className: 'game-card__emoji' }, [game.emoji]),
          el('div', { className: 'game-card__info' }, [
            el('div', { className: 'game-card__name' }, [game.name]),
            el('div', { className: 'game-card__tagline' }, [game.tagline]),
          ]),
          el('div', { className: 'game-card__meta' }, [
            el('span', { className: 'game-card__difficulty' }, ['\u2B50'.repeat(game.difficulty)]),
            el('span', { className: 'game-card__duration' }, [`\u23F1 ${game.duration}`]),
          ]),
        ]);
        return card;
      }).filter(Boolean);

      return el('div', { className: 'category-section' }, [
        el('div', { className: 'category-title' }, [cat.title]),
        el('div', { className: 'game-grid' }, gameCards),
      ]);
    });

    const div = el('div', { className: 'home-screen' }, [
      header,
      statsBar,
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

  _pickAvatar() {
    // Create avatar picker overlay
    const overlay = el('div', { className: 'avatar-overlay' });
    const grid = el('div', { className: 'avatar-grid' });

    for (const emoji of AVATARS) {
      const btn = el('button', {
        className: `avatar-btn${emoji === getAvatar() ? ' selected' : ''}`,
        onClick: () => {
          setAvatar(emoji);
          this._avatarEl.textContent = emoji;
          overlay.classList.add('htp-exit');
          setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          }, 200);
        },
      }, [emoji]);
      grid.appendChild(btn);
    }

    overlay.appendChild(el('div', { className: 'avatar-card' }, [
      el('div', { className: 'avatar-title' }, ['\u05D1\u05D7\u05E8 \u05D0\u05D5\u05D5\u05D0\u05D8\u05D0\u05E8']),
      grid,
    ]));

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('htp-exit');
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 200);
      }
    });
  }

  _getName() {
    return this.manager.getPlayerName() || '\u05E9\u05D7\u05E7\u05DF';
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
