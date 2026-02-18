import { el } from '../lib/dom.js';
import { GAME_REGISTRY } from '../lib/game-registry.js';

export function showHowToPlay(gameId) {
  return new Promise((resolve) => {
    const game = GAME_REGISTRY[gameId];
    if (!game) { resolve(); return; }

    const steps = game.instructions.map((text, i) =>
      el('li', { className: 'htp-step', style: { animationDelay: `${i * 0.12}s` } }, [text])
    );

    const overlay = el('div', { className: 'htp-overlay' }, [
      el('div', { className: 'htp-card' }, [
        el('div', { className: 'htp-emoji' }, [game.emoji]),
        el('div', { className: 'htp-title' }, [game.name]),
        el('div', { className: 'htp-meta' }, [
          el('span', { className: 'htp-difficulty' }, ['⭐'.repeat(game.difficulty)]),
          el('span', { className: 'htp-duration' }, [`⏱ ${game.duration}`]),
        ]),
        el('ol', { className: 'htp-steps' }, steps),
        el('button', {
          className: 'btn htp-close',
          onClick: () => {
            overlay.classList.add('htp-exit');
            setTimeout(() => {
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              resolve();
            }, 200);
          },
        }, ['הבנתי!']),
      ]),
    ]);

    document.body.appendChild(overlay);
  });
}

export function hasSeenInstructions(gameId) {
  return !!localStorage.getItem(`htp_${gameId}`);
}

export function markInstructionsSeen(gameId) {
  localStorage.setItem(`htp_${gameId}`, '1');
}
