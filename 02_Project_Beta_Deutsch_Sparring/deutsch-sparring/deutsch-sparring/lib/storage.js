import { cleanRule, topicForRule } from './rules';
import { applyAnswer } from './scores';
import { queuePost, whenSaved, getJson, postNow } from './progress-client';

// What the app remembers. Without accounts (or MOCK=1 / no database) everything lives in the
// browser (localStorage). With a logged-in account the history, the streak and the word scores are
// kept on the SERVER (lib/progress.js; initProgress below switches to that) and localStorage only
// caches the current conversation. Same functions for the app either way.
// Every localStorage access is wrapped in try/catch: private mode or blocked storage must not break the app.

const KEYS = {
  profile: 'wort_profile', // { name, classCode }
  prefs: 'wort_prefs', // { view, setup } – setup = the last setup screen choices (prefill)
  history: 'wort_history', // { sessions: [...last 5], streak: { count, lastDay } }
  chat: 'wort_chat', // the current conversation, so a reload doesn't lose it
  goals: 'wort_goals', // [goal, …] – the goals with their milestones (lib/goals.js); with an account they live on the server
  alog: 'wort_answerlog', // the last answers (compact) for the Home page's 30-day stats; with an account the server has them
  coach: 'wort_coach', // [message, …] – the last 30 coach messages (lib/coach.js); with an account they live on the server
  coachTry: 'wort_coachtry', // { day } – the day the coach was last asked to greet by itself (at most one automatic call a day)
  scores: 'wort_scores', // { [wordId]: { v, g, last } } – the word scores (lib/scores.js); with an account they live on the server
};

// With accounts, the conversation and the session history are kept per username, so two
// students sharing a computer never see each other's work ("wort_history@anna"); the word scores too.
const PER_ACCOUNT = new Set(['history', 'chat', 'scores', 'goals', 'alog', 'coach', 'coachTry']);
let account = '';
const storageKey = (key) => (account && PER_ACCOUNT.has(key) ? `${KEYS[key]}@${account}` : KEYS[key]);

export function setStorageAccount(username) {
  account = String(username || '').toLowerCase();
  if (!account) return;
  // the first account used in this browser takes over the history from before accounts existed
  try {
    if (!localStorage.getItem('wort_adopted')) {
      const old = localStorage.getItem(KEYS.history);
      if (old && !localStorage.getItem(storageKey('history'))) localStorage.setItem(storageKey('history'), old);
      const oldScores = localStorage.getItem(KEYS.scores);
      if (oldScores && !localStorage.getItem(storageKey('scores'))) localStorage.setItem(storageKey('scores'), oldScores);
      localStorage.setItem('wort_adopted', account);
    }
  } catch {}
}

// logged in: history + scores live on the server; this is only the copy the page works with
let server = false;
const copy = { history: null, scores: null };
const onServer = (key) => server && key in copy;

function read(key, fallback) {
  if (onServer(key)) return copy[key] && typeof copy[key] === 'object' ? copy[key] : fallback;
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(key)) || 'null');
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (onServer(key)) {
    copy[key] = value;
    return;
  }
  try {
    if (value == null) localStorage.removeItem(storageKey(key));
    else localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {}
}

// ---------- progress on the server (only when logged in) ----------
const readLocal = (key) => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(key)) || 'null');
  } catch {
    return null;
  }
};

const laterStreak = (a, b) => {
  if (!a?.lastDay) return b;
  if (!b?.lastDay) return a;
  return a.lastDay !== b.lastDay ? (a.lastDay > b.lastDay ? a : b) : a.count >= b.count ? a : b;
};

// Call once after login (after setStorageAccount). Switches history + scores to the server at once;
// the returned promise is done when the server's history is loaded (and the browser's old history
// and scores were handed over, once per account and browser).
export function initProgress() {
  const oldHistory = readLocal('history');
  const oldScores = readLocal('scores');
  const flag = `wort_imported@${account}`;
  server = true;
  copy.history = { sessions: [], streak: { count: 0, lastDay: null } };
  copy.scores = {};
  return (async () => {
    let imported = false;
    try {
      imported = Boolean(localStorage.getItem(flag));
    } catch {}
    if (!imported) {
      const hasOld = (oldHistory?.sessions?.length || 0) > 0 || Object.keys(oldScores || {}).length > 0;
      const answer = hasOld ? await postNow('/api/progress/import', { history: oldHistory || {}, scores: oldScores || {} }) : { ok: true };
      if (answer) {
        try {
          localStorage.setItem(flag, '1');
        } catch {}
      }
    }
    const data = await getJson(`/api/progress/history?tz=${new Date().getTimezoneOffset()}`);
    if (!data) return;
    // answers given while this loaded stay on top
    const mine = copy.history;
    const sessions = [...mine.sessions, ...(data.sessions || []).filter((s) => !mine.sessions.some((m) => m.id === s.id))]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5);
    copy.history = { sessions, streak: laterStreak(mine.streak?.lastDay ? mine.streak : null, data.streak) || data.streak };
  })();
}

// resolves when everything queued for the server was sent
export const progressSaved = () => server ? Promise.race([whenSaved(), new Promise((r) => setTimeout(r, 4000))]) : Promise.resolve();

// a new session starts (server only): the session row exists from the first question on
export function startSessionRecord(s) {
  if (server) queuePost('/api/progress/session', { id: s.id, settings: s.settings || {}, total: s.total });
}

// logged in: goals, history and scores are on the server (lib/home-client.js talks to it)
export const usesServer = () => server;

// ---------- goals (without accounts; with an account see lib/home-client.js) ----------
export const loadGoalsLocal = () => {
  const g = read('goals', []);
  return Array.isArray(g) ? g : [];
};
export const saveGoalLocal = (goal) => {
  const all = loadGoalsLocal();
  write('goals', all.some((x) => x.id === goal.id) ? all.map((x) => (x.id === goal.id ? goal : x)) : [...all, goal]);
};
export const deleteGoalLocal = (id) => write('goals', loadGoalsLocal().filter((x) => x.id !== id));

// the last answers, kept small: { i: session, r: rule, o: right, s: skipped, w: word id, t: time }
const LOG_MAX = 1500;
const LOG_DAYS = 30;
export const loadAnswerLog = () => {
  const l = read('alog', []);
  return Array.isArray(l) ? l : [];
};
function logAnswer(entry) {
  const since = entry.t - LOG_DAYS * 86_400_000;
  write('alog', [...loadAnswerLog(), entry].filter((x) => x && x.t >= since).slice(-LOG_MAX));
}

// ---------- coach messages (without accounts; with an account see lib/coach-client.js) ----------
export const loadCoachLocal = () => {
  try {
    const m = JSON.parse(localStorage.getItem(storageKey('coach')) || 'null');
    return Array.isArray(m) ? m : [];
  } catch {
    return [];
  }
};
export const saveCoachLocal = (messages) => {
  try {
    localStorage.setItem(storageKey('coach'), JSON.stringify(messages));
  } catch {}
};
// the day of the last automatic greeting (a convenience of this browser: the worst case is one more greeting)
export const coachTriedDay = () => read('coachTry', {}).day || null;
export const setCoachTriedDay = (day) => write('coachTry', { day });

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
  if (server) {
    queuePost('/api/progress/session', { id: entry.id, settings: entry.settings || {}, total: entry.total, entry, finished: Boolean(entry.finished) });
  }
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

// ---------- word scores (the rules are in lib/scores.js; this is the only place that stores them) ----------
export const loadScores = () => read('scores', {});

// One answer about one word → the stored record is updated. Returns the new record.
// With an account the SERVER saves the answer and works out the score (extra = the answer's details:
// sessionId, n, question, studentAnswer, corrected, rule). Answers without a word are saved too.
export function recordWordAnswer(wordId, answer, extra = null, now = Date.now()) {
  if (server) {
    if (extra?.sessionId) {
      queuePost('/api/progress/answer', {
        ...extra, wordId: wordId || '', task: answer.task, correct: answer.correct, skipped: answer.skipped,
        errorType: answer.errorType, hinted: answer.hinted, hasG: answer.hasG,
      });
    }
    return null;
  }
  if (extra) {
    // g = grammar topic id, h = a hint was used, d = difficulty (review R8; the rule is cleaned the same way as on the server)
    const rule = cleanRule(extra.rule) || '';
    logAnswer({
      i: extra.sessionId || '', r: rule, o: answer.correct === true, s: answer.skipped === true, w: wordId || '', t: now,
      g: (rule && topicForRule(rule, extra.topicId)) || '', h: answer.hinted === true, d: extra.difficulty || '',
    });
  }
  if (!wordId) return null;
  const all = loadScores();
  const rec = applyAnswer(all[wordId], answer, now);
  write('scores', { ...all, [wordId]: rec });
  return rec;
}
