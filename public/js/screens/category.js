import { el } from '../lib/dom.js';
import { GAME_REGISTRY, CATEGORIES } from '../lib/game-registry.js';

export class CategoryScreen {
  constructor(manager, props) {
    this.manager = manager;
    this.props = props; // { categoryId }
    this.el = null;
  }

  render() {
    const cat = CATEGORIES.find(c => c.id === this.props.categoryId);
    if (!cat) return el('div', {}, ['קטגוריה לא נמצאה']);

    const backBtn = el('button', {
      className: 'btn btn--ghost category-back-btn',
      onClick: () => this._goHome(),
    }, ['→ חזרה']);

    const header = el('div', { className: 'category-header' }, [
      backBtn,
      el('h2', { className: 'category-screen-title' }, [cat.title]),
    ]);

    const gameCards = cat.games.map((gameId, idx) => {
      const game = GAME_REGISTRY[gameId];
      if (!game) return null;

      return el('div', {
        className: 'category-game-card stagger-in',
        style: { animationDelay: `${idx * 0.1}s` },
        onClick: () => this._openSetup(game),
      }, [
        el('div', { className: 'category-game-card__emoji' }, [game.emoji]),
        el('div', { className: 'category-game-card__body' }, [
          el('div', { className: 'category-game-card__name' }, [game.name]),
          el('div', { className: 'category-game-card__tagline' }, [game.tagline]),
          el('div', { className: 'category-game-card__meta' }, [
            el('span', { className: 'game-card__difficulty' }, ['\u2B50'.repeat(game.difficulty)]),
            el('span', { className: 'game-card__duration' }, [`\u23F1 ${game.duration}`]),
            game.is3d ? el('span', { className: 'badge-3d' }, ['3D']) : null,
          ].filter(Boolean)),
        ]),
        el('div', { className: 'category-game-card__arrow' }, ['\u25C0']),
      ]);
    }).filter(Boolean);

    const div = el('div', { className: 'category-screen' }, [
      header,
      el('div', { className: 'category-game-list' }, gameCards),
    ]);

    this.el = div;
    return div;
  }

  async _openSetup(game) {
    const { GameSetupScreen } = await import('./game-setup.js');
    this.manager.show(GameSetupScreen, { game });
  }

  async _goHome() {
    const { HomeScreen } = await import('./home.js');
    this.manager.show(HomeScreen);
  }

  destroy() {}
}
