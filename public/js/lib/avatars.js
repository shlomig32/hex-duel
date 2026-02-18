export const AVATARS = [
  '😎', '🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦈', '🐙', '🎯',
  '🔥', '⚡', '💎', '🎮', '👾', '🤖', '🥷', '🧙', '🦸', '💀',
];

const STORAGE_KEY = 'ga_avatar';

export function getAvatar() {
  return localStorage.getItem(STORAGE_KEY) || AVATARS[0];
}

export function setAvatar(emoji) {
  localStorage.setItem(STORAGE_KEY, emoji);
}
