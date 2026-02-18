import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { countdownBeep, gameStart } from '../lib/sounds.js';
import { vibrate } from '../lib/haptics.js';
import { ResultScreen } from './result.js';

const GAME_COLORS = {
  hex: { p1: '#EF4444', p2: '#3B82F6', p1bg: 'rgba(239,68,68,0.2)', p2bg: 'rgba(59,130,246,0.2)' },
  connect4: { p1: '#FBBF24', p2: '#EF4444', p1bg: 'rgba(251,191,36,0.2)', p2bg: 'rgba(239,68,68,0.2)' },
  pong: { p1: '#06B6D4', p2: '#8B5CF6', p1bg: 'rgba(6,182,212,0.2)', p2bg: 'rgba(139,92,246,0.2)' },
  reaction: { p1: '#10B981', p2: '#F97316', p1bg: 'rgba(16,185,129,0.2)', p2bg: 'rgba(249,115,22,0.2)' },
  bomb: { p1: '#F97316', p2: '#FBBF24', p1bg: 'rgba(249,115,22,0.2)', p2bg: 'rgba(251,191,36,0.2)' },
  tapsprint: { p1: '#EC4899', p2: '#8B5CF6', p1bg: 'rgba(236,72,153,0.2)', p2bg: 'rgba(139,92,246,0.2)' },
};

export class GameScreen {
  constructor(manager, props) {
    this.manager = manager;
    this.props = props;
    this.el = null;
    this.destroyed = false;
    this._unsubs = [];
    this.gameModule = null;
    this._gameoverHandled = false;
  }

  render() {
    const colors = GAME_COLORS[this.props.gameType] || GAME_COLORS.hex;
    const names = this.props.names || ['\u05E9\u05D7\u05E7\u05DF 1', '\u05E9\u05D7\u05E7\u05DF 2'];
    const mySeat = this.props.seat;

    // Player tags
    const p1Tag = el('span', { className: 'player-tag', style: {
      background: colors.p1bg, color: colors.p1,
      border: `2px solid ${colors.p1}`,
    }}, [names[0]]);

    const timerEl = el('span', { className: 'timer' }, ['--']);

    const p2Tag = el('span', { className: 'player-tag', style: {
      background: colors.p2bg, color: colors.p2,
      border: `2px solid ${colors.p2}`,
    }}, [names[1]]);

    const hud = el('div', { className: 'game-hud' }, [p1Tag, timerEl, p2Tag]);
    const turnText = el('div', { className: 'turn-indicator' });
    const gameArea = el('div', { className: 'game-area' });

    const children = [hud];
    if (this.props.bet) {
      children.push(el('div', { className: 'bet-badge bet-badge--small' }, [`\uD83C\uDFB2 ${this.props.bet}`]));
    }
    children.push(turnText, gameArea);

    const div = el('div', { style: { gap: '0', padding: '8px 12px' } }, children);

    this.el = div;
    this._p1Tag = p1Tag;
    this._p2Tag = p2Tag;
    this._timerEl = timerEl;
    this._turnText = turnText;
    this._gameArea = gameArea;

    // Show countdown overlay
    this._showCountdown(this.props.countdown || 3);

    // Listen for more countdown ticks
    this._unsubs.push(this.manager.ws.on('countdown', (msg) => {
      if (this.destroyed) return;
      this._showCountdown(msg.count);
    }));

    // Listen for game start
    this._unsubs.push(this.manager.ws.on('game_start', (msg) => {
      if (this.destroyed) return;
      this._removeCountdown();
      gameStart();
      vibrate('tap');
      this._loadGame(msg);
    }));

    // Listen for gameover
    this._unsubs.push(this.manager.ws.on('gameover', (msg) => {
      if (this.destroyed || this._gameoverHandled) return;
      this._gameoverHandled = true;
      setTimeout(() => {
        if (this.destroyed) return;
        this.manager.show(ResultScreen, {
          ...this.props,
          winner: msg.winner,
          mySeat: this.props.seat,
        });
      }, 1500);
    }));

    // Opponent left
    this._unsubs.push(this.manager.ws.on('opponent_left', () => {
      if (this.destroyed) return;
      this._goHome('\u05D4\u05D9\u05E8\u05D9\u05D1 \u05E2\u05D6\u05D1');
    }));

    return div;
  }

  _showCountdown(count) {
    // Remove existing overlay
    this._removeCountdown();

    countdownBeep();
    vibrate('countdown');

    const overlay = el('div', { className: 'countdown-overlay' }, [
      el('div', { className: 'countdown-number' }, [String(count)]),
    ]);
    this.el.appendChild(overlay);
    this._countdownOverlay = overlay;
  }

  _removeCountdown() {
    if (this._countdownOverlay && this._countdownOverlay.parentNode) {
      this._countdownOverlay.parentNode.removeChild(this._countdownOverlay);
      this._countdownOverlay = null;
    }
  }

  async _loadGame(msg) {
    const gameType = this.props.gameType;
    try {
      const module = await import(`../games/${gameType}.js`);
      if (this.destroyed) return;
      this.gameModule = module.default || module;
      this.gameModule.init({
        area: this._gameArea,
        ws: this.manager.ws,
        seat: this.props.seat,
        names: this.props.names,
        state: msg.state,
        timerEl: this._timerEl,
        turnText: this._turnText,
        p1Tag: this._p1Tag,
        p2Tag: this._p2Tag,
      });
    } catch (e) {
      console.error('Failed to load game module:', e);
    }
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
    if (this.gameModule && this.gameModule.destroy) {
      this.gameModule.destroy();
    }
  }
}
