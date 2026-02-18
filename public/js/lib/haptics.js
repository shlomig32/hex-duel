const CAN_VIBRATE = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const PATTERNS = {
  tap: [15],
  move: [10],
  countdown: [30],
  win: [50, 30, 50, 30, 100],
  lose: [100],
  error: [80, 40, 80],
};

/**
 * Trigger haptic feedback.
 * @param {'tap'|'move'|'countdown'|'win'|'lose'|'error'} preset
 */
export function vibrate(preset = 'tap') {
  if (!CAN_VIBRATE) return;
  const pattern = PATTERNS[preset] || PATTERNS.tap;
  try { navigator.vibrate(pattern); } catch {}
}
