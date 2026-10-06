// Everything the app remembers lives in the browser (localStorage), never on the server.
// Every access is wrapped in try/catch: private mode or blocked storage must not break the app.

const KEYS = {
  profile: 'wort_profile', // { name, classCode }
  prefs: 'wort_prefs', // { level, difficulty, view, optionsHidden }
  history: 'wort_history', // { sessions: [...last 5], streak: { count, lastDay } }
  chat: 'wort_chat', // the current conversation, so a reload doesn't lose it
};

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[key]) || 'null');
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(KEYS[key]);
    else localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch {}
}

export const loadProfile = () => read('profile', {});
export const saveProfile = (p) => write('profile', p);
export const loadPrefs = () => read('prefs', {});
export const savePrefs = (p) => write('prefs', p);
export const loadChat = () => read('chat', null);
export const saveChat = (c) => write('chat', c);
export const loadHistory = () => {
  const h = read('history', {});
  return { sessions: Array.isArray(h.sessions) ? h.sessions : [], streak: h.streak || { count: 0, lastDay: null } };
};

// Local calendar day, e.g. "2026-10-05"
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Streak shown in the header: today counts once the student answered something.
export function currentStreak(streak) {
  if (!streak?.lastDay) return 0;
  const yesterday = dayKey(Date.now() - 86_400_000);
  return streak.lastDay === dayKey() || streak.lastDay === yesterday ? streak.count : 0;
}

function bumpStreak(streak) {
  const today = dayKey();
  if (streak?.lastDay === today) return streak;
  const yesterday = dayKey(Date.now() - 86_400_000);
  return { count: streak?.lastDay === yesterday ? (streak.count || 0) + 1 : 1, lastDay: today };
}

// Called after every answer: keeps the last 5 sessions up to date and the streak going.
export function recordSession(entry) {
  const h = loadHistory();
  const sessions = [entry, ...h.sessions.filter((s) => s.id !== entry.id)]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);
  const next = { sessions, streak: bumpStreak(h.streak) };
  write('history', next);
  return next;
}

// Mistakes for "Repeat my mistakes": the current session first, then older ones.
export function recentMistakes(currentAnswers, sessions) {
  const now = currentAnswers.filter((a) => !a.correct && !a.skipped);
  const older = sessions.flatMap((s) => s.mistakes || []);
  const seen = new Set();
  return [...now.reverse(), ...older]
    .filter((m) => {
      const k = m.corrected;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8)
    .map(({ studentAnswer, corrected, rule }) => ({ studentAnswer, corrected, rule }));
}
