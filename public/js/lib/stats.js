// localStorage-backed session stats
const STORAGE_KEY = 'ga_stats';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaults();
  } catch { return defaults(); }
}

function defaults() {
  return { played: 0, wins: 0, streak: 0, bestStreak: 0 };
}

function save(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function getStats() {
  return load();
}

export function recordGame(won) {
  const s = load();
  s.played++;
  if (won) {
    s.wins++;
    s.streak++;
    if (s.streak > s.bestStreak) s.bestStreak = s.streak;
  } else {
    s.streak = 0;
  }
  save(s);
  return s;
}

export function resetStats() {
  localStorage.removeItem(STORAGE_KEY);
}
