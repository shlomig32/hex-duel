import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { promptModal } from '../lib/modal.js';
import { GAME_REGISTRY, CATEGORIES } from '../lib/game-registry.js';
import { getAvatar, setAvatar, AVATARS } from '../lib/avatars.js';
import { getPhotoAvatar, capturePhoto, setPhotoAvatar, clearPhotoAvatar, createAvatarEl } from '../lib/photo-avatar.js';
import { getStats } from '../lib/stats.js';

export class HomeScreen {
  constructor(manager) {
    this.manager = manager;
    this.el = null;
  }

  render() {
    const savedName = this.manager.getPlayerName() || '';
    const emoji = getAvatar();
    const photo = getPhotoAvatar();
    const stats = getStats();

    // -- Header --
    const avatarEl = el('div', {
      className: 'header-avatar-wrap',
      onClick: () => this._pickAvatar(),
    });
    const avatarInner = createAvatarEl(emoji, photo, 36);
    avatarEl.appendChild(avatarInner);
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

    // -- Category Cards --
    const CATEGORY_STYLES = {
      strategy: { bg: 'linear-gradient(135deg, #1a1a3e, #2a1a4e)', border: '#8B5CF6' },
      speed: { bg: 'linear-gradient(135deg, #1a2a1a, #1a3a2a)', border: '#10B981' },
      party: { bg: 'linear-gradient(135deg, #2a1a1a, #3a1a2a)', border: '#EC4899' },
      '3d': { bg: 'linear-gradient(135deg, #1a2a3e, #0a1a2e)', border: '#06B6D4' },
      arcade: { bg: 'linear-gradient(135deg, #1a1a2e, #2e1a3e)', border: '#A855F7' },
    };

    const categoryCards = CATEGORIES.map((cat, idx) => {
      const style = CATEGORY_STYLES[cat.id] || CATEGORY_STYLES.strategy;
      const gameCount = cat.games.length;
      const gameEmojis = cat.games.map(id => GAME_REGISTRY[id]?.emoji || '').join(' ');

      return el('div', {
        className: 'home-category-card stagger-in',
        style: {
          background: style.bg,
          borderColor: style.border,
          animationDelay: `${idx * 0.1}s`,
        },
        onClick: () => this._openCategory(cat.id),
      }, [
        el('div', { className: 'home-category-card__title' }, [cat.title]),
        el('div', { className: 'home-category-card__games' }, [gameEmojis]),
        el('div', { className: 'home-category-card__count' }, [`${gameCount} \u05DE\u05E9\u05D7\u05E7\u05D9\u05DD`]),
      ]);
    });

    const categoriesGrid = el('div', { className: 'home-categories-grid' }, categoryCards);

    const div = el('div', { className: 'home-screen' }, [
      header,
      statsBar,
      joinBar,
      el('div', { className: 'home-section-label' }, ['\u05D1\u05D7\u05E8 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4']),
      categoriesGrid,
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
    const overlay = el('div', { className: 'avatar-overlay' });

    // Photo option
    const photoBtn = el('button', {
      className: 'btn btn--photo-capture',
      onClick: async () => {
        const base64 = await capturePhoto();
        if (base64) {
          setPhotoAvatar(base64);
          this._refreshAvatar();
          closeOverlay();
        }
      },
    }, ['\uD83D\uDCF7 \u05E6\u05DC\u05DD \u05EA\u05DE\u05D5\u05E0\u05D4']);

    const clearPhotoBtn = getPhotoAvatar() ? el('button', {
      className: 'btn btn--ghost btn--small',
      onClick: () => {
        clearPhotoAvatar();
        this._refreshAvatar();
        closeOverlay();
      },
    }, ['\u05DE\u05D7\u05E7 \u05EA\u05DE\u05D5\u05E0\u05D4']) : null;

    // Emoji grid
    const grid = el('div', { className: 'avatar-grid' });
    for (const emoji of AVATARS) {
      const btn = el('button', {
        className: `avatar-btn${emoji === getAvatar() ? ' selected' : ''}`,
        onClick: () => {
          setAvatar(emoji);
          clearPhotoAvatar();
          this._refreshAvatar();
          closeOverlay();
        },
      }, [emoji]);
      grid.appendChild(btn);
    }

    const card = el('div', { className: 'avatar-card' }, [
      el('div', { className: 'avatar-title' }, ['\u05D1\u05D7\u05E8 \u05D0\u05D5\u05D5\u05D0\u05D8\u05D0\u05E8']),
      photoBtn,
      clearPhotoBtn,
      el('div', { className: 'avatar-divider' }, ['\u05D0\u05D5 \u05D1\u05D7\u05E8 \u05D0\u05D9\u05DE\u05D5\u05D2\u05D9']),
      grid,
    ].filter(Boolean));

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function closeOverlay() {
      overlay.classList.add('htp-exit');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
  }

  _refreshAvatar() {
    const emoji = getAvatar();
    const photo = getPhotoAvatar();
    while (this._avatarEl.firstChild) {
      this._avatarEl.removeChild(this._avatarEl.firstChild);
    }
    this._avatarEl.appendChild(createAvatarEl(emoji, photo, 36));
  }

  _getName() {
    return this.manager.getPlayerName() || '\u05E9\u05D7\u05E7\u05DF';
  }

  async _openCategory(categoryId) {
    const { CategoryScreen } = await import('./category.js');
    this.manager.show(CategoryScreen, { categoryId });
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
