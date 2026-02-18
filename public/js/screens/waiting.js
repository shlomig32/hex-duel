import { el } from '../lib/dom.js';
import { showToast } from '../lib/toast.js';
import { GameScreen } from './game.js';
import { GAME_REGISTRY } from '../lib/game-registry.js';

export class WaitingScreen {
  constructor(manager, props) {
    this.manager = manager;
    this.props = props;
    this.el = null;
    this.destroyed = false;
    this._unsubs = [];
    this._gameStarted = false;
  }

  render() {
    const game = GAME_REGISTRY[this.props.gameType];
    const info = game || { emoji: '\uD83C\uDFAE', name: 'Game' };
    const isJoiner = this.props.joined;

    const children = [];

    if (isJoiner && this.props.bet) {
      const creatorName = this.props.creatorName || '\u05D4\u05D9\u05E8\u05D9\u05D1';
      children.push(
        el('div', { className: 'invite-card' }, [
          el('div', { className: 'invite-emoji' }, [info.emoji]),
          el('div', { className: 'invite-title' }, [`${creatorName} \u05D4\u05D6\u05DE\u05D9\u05DF \u05D0\u05D5\u05EA\u05DA!`]),
          el('div', { className: 'invite-bet' }, [
            el('span', { className: 'invite-bet-label' }, ['\uD83C\uDFB2 \u05D4\u05EA\u05E2\u05E8\u05D1\u05D5\u05EA:']),
            el('span', { className: 'invite-bet-text' }, [` ${this.props.bet}`]),
          ]),
          el('div', { className: 'invite-cta' }, ['\u05DB\u05E0\u05E1 \u05DC\u05DE\u05E9\u05D7\u05E7 \u05D5\u05E0\u05E6\u05D7! \uD83D\uDCAA']),
        ]),
        el('p', { className: 'waiting-text' }, ['...\u05DE\u05EA\u05D7\u05D9\u05DC']),
      );
    } else if (isJoiner) {
      children.push(
        el('div', { style: { fontSize: '4rem' } }, [info.emoji]),
        el('h2', {}, [info.name]),
        el('p', { className: 'waiting-text' }, ['...\u05DE\u05EA\u05D7\u05D9\u05DC']),
      );
    } else {
      const codeEl = el('div', { className: 'code-display' }, [this.props.code]);

      const copyBtn = el('button', {
        className: 'btn btn--ghost btn--small',
        onClick: () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(this.props.code).then(() => {
              copyBtn.textContent = '!\u05D4\u05D5\u05E2\u05EA\u05E7';
              setTimeout(() => { copyBtn.textContent = '\u05D4\u05E2\u05EA\u05E7 \u05E7\u05D5\u05D3'; }, 2000);
            });
          }
        },
      }, ['\u05D4\u05E2\u05EA\u05E7 \u05E7\u05D5\u05D3']);

      children.push(
        el('div', { style: { fontSize: '4rem' } }, [info.emoji]),
        el('h2', {}, [info.name]),
      );

      if (this.props.bet) {
        children.push(el('div', { className: 'bet-badge' }, [`\uD83C\uDFB2 ${this.props.bet}`]));
      }

      // WhatsApp share
      const shareUrl = `${location.origin}${location.pathname}?code=${this.props.code}`;
      let waMsg = `\uD83C\uDFAE \u05D1\u05D5\u05D0 \u05E0\u05E9\u05D7\u05E7 ${info.name}!\n`;
      if (this.props.bet) {
        waMsg += `\uD83C\uDFB2 \u05D4\u05EA\u05E2\u05E8\u05D1\u05D5\u05EA: ${this.props.bet}\n`;
      }
      waMsg += `\n\u05DC\u05D7\u05E5 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3:\n${shareUrl}`;

      const waBtn = el('button', {
        className: 'btn btn--whatsapp',
        onClick: () => {
          window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
        },
      }, ['\uD83D\uDCF2 \u05E9\u05DC\u05D7 \u05DC\u05D7\u05D1\u05E8 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4']);

      children.push(
        el('p', { className: 'subtitle' }, ['\u05E9\u05EA\u05E3 \u05E2\u05DD \u05D4\u05D7\u05D1\u05E8 \u05E9\u05DC\u05DA:']),
        codeEl,
        el('div', { className: 'share-buttons' }, [waBtn, copyBtn]),
        el('p', { className: 'waiting-text' }, ['...\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D9\u05E8\u05D9\u05D1']),
      );
    }

    const div = el('div', { style: { gap: '16px', justifyContent: 'center' } }, children);

    this.el = div;

    // Listen for countdown
    this._unsubs.push(this.manager.ws.on('countdown', (msg) => {
      if (this.destroyed || this._gameStarted) return;
      this._gameStarted = true;
      this.manager.show(GameScreen, {
        ...this.props,
        names: msg.names || [this.props.name, '\u05D9\u05E8\u05D9\u05D1'],
        countdown: msg.count,
        bet: msg.bet || this.props.bet,
      });
    }));

    this._unsubs.push(this.manager.ws.on('opponent_left', () => {
      if (this.destroyed) return;
      this._goHome('\u05D4\u05D9\u05E8\u05D9\u05D1 \u05E2\u05D6\u05D1');
    }));

    return div;
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
