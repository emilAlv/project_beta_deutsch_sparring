// Word scores and the word picker. The ONE place for these rules (see "Word scores" in
// docs/revamp-tasks.md). Pure functions: no React, no browser, no files – so the same code can
// run in the browser now and on the server later (Task 8 keeps the scores in a database).
//
// Every student has two scores per word, from 1 to 10:
//   V = the word itself (article + noun, the infinitive, the phrase)
//   G = the word used in grammar (cases + adjective endings, Perfekt, verb + case)
// A word that was never practised is "new" and counts as score 1.
//
// A word's record:  { v: { s, k, due }, g: { s, k, due }, last }
//   s = score 1–10 · k = right answers in a row (the streak) · due = when it comes back (ms) · last = last practised (ms)

// ---------- the numbers (change the rules here, nowhere else) ----------
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const SCORE_NEW = 1; // a word never practised
export const TEN_NEEDS_STREAK = 4; // right answers in a row needed for a 10
export const CAP_WITHOUT_STREAK = 9; // without that streak a score stops here

// score table (points added or taken away)
export const FLASHCARD_RIGHT = { v: +2 };
export const FLASHCARD_WRONG = { v: -3 };
export const GRAMMAR_RIGHT = { v: +1, g: +2 };
export const GRAMMAR_WRONG_WORD = { v: -3, g: -3 }; // mistake in the word or its article
export const GRAMMAR_WRONG_GRAMMAR = { g: -3 }; // mistake in case, ending, Perfekt … (V unchanged)
export const SKIPPED = { v: -1, g: -1 }; // G only if it was a grammar task
export const HINT_RIGHT = { v: +1, g: +1 }; // right, but after a hint or on "Leicht"

// feedback.errorType values (German, as the tutor writes them) that mean "the word itself was wrong"
export const WORD_ERRORS = ['Artikel', 'Wortschatz', 'article', 'vocab']; // …also as the app stores them (lib/reply.js)

// when a word comes back: [highest score of the band, days]
export const DUE_DAYS = [[3, 1], [6, 3], [9, 7], [10, 21]];
export const DAY_MS = 86_400_000;
export const DUE_TEN_WRONG_TO = 7; // a 10 answered wrong drops to 7

// how a session's words are mixed (shares of the session's word count)
export const SHARE_NEW = 0.3;
export const SHARE_CHECKS = 0.1; // words with 10, asked as a check
export const CHECKS_MIN = 1;
export const CHECKS_MAX = 2;
export const CHECKS_FROM_COUNT = 5; // fewer words than this: no checks
export const SPARE_WORDS = 3; // extra words for skips

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ---------- reading a record ----------
const kindOf = (rec, kind) => {
  const x = rec && rec[kind];
  return x && Number.isFinite(x.s) ? { s: clamp(Math.round(x.s), SCORE_MIN, SCORE_MAX), k: Math.max(0, Math.floor(x.k) || 0), due: Number.isFinite(x.due) ? x.due : null } : null;
};

export const isNew = (rec) => !kindOf(rec, 'v') && !kindOf(rec, 'g');
export const vScore = (rec) => kindOf(rec, 'v')?.s ?? SCORE_NEW;
export const gScore = (rec) => kindOf(rec, 'g')?.s ?? SCORE_NEW;

// how well the word is known overall: the weaker of the scores that exist
export function wordScore(rec) {
  const v = kindOf(rec, 'v');
  const g = kindOf(rec, 'g');
  if (!v && !g) return SCORE_NEW;
  return Math.min(v ? v.s : SCORE_MAX, g ? g.s : SCORE_MAX);
}

// days until a word with this score comes back
export function dueDays(score) {
  const s = clamp(Math.round(score), SCORE_MIN, SCORE_MAX);
  return DUE_DAYS.find(([max]) => s <= max)[1];
}

export const dueAt = (score, now) => now + dueDays(score) * DAY_MS;

// the earliest due date of the word's existing scores (null = never practised)
export function wordDue(rec) {
  const dues = ['v', 'g'].map((k) => kindOf(rec, k)?.due).filter((d) => d != null);
  return dues.length ? Math.min(...dues) : null;
}

export const isDue = (rec, now) => {
  const d = wordDue(rec);
  return d != null && d <= now;
};

// ---------- updating a score ----------
// One step for one score (V or G).
//   delta  points to add (negative = taken away)
//   streak 'up' (counts as right in a row) | 'reset' | 'keep' (hint answers)
function step(cur, { delta, streak, now }) {
  const before = cur || { s: SCORE_NEW, k: 0, due: null };
  const k = streak === 'up' ? before.k + 1 : streak === 'reset' ? 0 : before.k;
  let s = before.s + delta;
  if (delta < 0) {
    // a 10 answered wrong drops to 7 (a skip only costs its point)
    if (before.s >= SCORE_MAX && delta <= FLASHCARD_WRONG.v) s = DUE_TEN_WRONG_TO;
  } else if (before.s >= SCORE_MAX) {
    s = SCORE_MAX; // a 10 answered right stays 10
  } else {
    // 10 needs the streak (hint answers never count toward it); otherwise the score stops at 9
    // (the 4th right answer in a row lifts a 9 to 10: 1 -> 3 -> 5 -> 7 -> 10)
    const tenEarned = streak === 'up' && k >= TEN_NEEDS_STREAK && s >= CAP_WITHOUT_STREAK;
    s = tenEarned ? SCORE_MAX : Math.min(s, CAP_WITHOUT_STREAK);
  }
  s = clamp(s, SCORE_MIN, SCORE_MAX);
  return { s, k, due: dueAt(s, now) };
}

// What the app does with ONE answer.
//   rec     the word's record so far (or undefined)
//   answer  { task: 'flashcard' | 'grammar', correct, errorType (German tutor value or null),
//             hinted (hint used or "Leicht"), skipped, hasG (false for phrases) }
// Returns the new record. The model never decides a score.
export function applyAnswer(rec, answer, now = Date.now()) {
  const { correct = false, errorType = null, hinted = false, skipped = false } = answer;
  const grammar = answer.task === 'grammar' && answer.hasG !== false;
  let v = null; // { delta, streak } for V
  let g = null; // … for G

  if (skipped) {
    v = { delta: SKIPPED.v, streak: 'reset' };
    if (grammar) g = { delta: SKIPPED.g, streak: 'reset' };
  } else if (correct && hinted) {
    v = { delta: HINT_RIGHT.v, streak: 'keep' };
    if (grammar) g = { delta: HINT_RIGHT.g, streak: 'keep' };
  } else if (correct) {
    if (grammar) {
      v = { delta: GRAMMAR_RIGHT.v, streak: 'up' };
      g = { delta: GRAMMAR_RIGHT.g, streak: 'up' };
    } else {
      v = { delta: FLASHCARD_RIGHT.v, streak: 'up' };
    }
  } else if (grammar) {
    if (WORD_ERRORS.includes(errorType)) {
      v = { delta: GRAMMAR_WRONG_WORD.v, streak: 'reset' };
      g = { delta: GRAMMAR_WRONG_WORD.g, streak: 'reset' };
    } else {
      g = { delta: GRAMMAR_WRONG_GRAMMAR.g, streak: 'reset' };
    }
  } else {
    v = { delta: FLASHCARD_WRONG.v, streak: 'reset' };
  }

  const out = { ...(rec || {}), last: now };
  if (v) out.v = step(kindOf(rec, 'v'), { ...v, now });
  else if (kindOf(rec, 'v')) out.v = kindOf(rec, 'v');
  if (g) out.g = step(kindOf(rec, 'g'), { ...g, now });
  else if (kindOf(rec, 'g')) out.g = kindOf(rec, 'g');
  return out;
}

// ---------- how many words a session needs ----------
// Vocabulary only: 1 word per question. With grammar: 1 word per 2 questions (flashcard + grammar task).
export function wordsNeeded(questions, withGrammar) {
  const q = Math.max(0, Math.floor(Number(questions) || 0));
  return (withGrammar ? Math.ceil(q / 2) : q) + SPARE_WORDS;
}

// ---------- the word picker ----------
const asList = (x) => (x == null ? null : [].concat(x).filter(Boolean));

// Does the word belong to the chosen level / sources / section / list?
// level: 'A1' | 'A2' | 'B1' or an array · sources: array of 'goethe-a1' … 'kurs' (a word with any of them)
// section, list: English names as in lib/words.js (list only with its section)
export function matchesFilter(word, { level, sources, section, list } = {}) {
  const levels = asList(level);
  const srcs = asList(sources);
  if (levels?.length && !levels.includes(word.level)) return false;
  if (srcs?.length && !(word.sources || []).some((s) => srcs.includes(s))) return false;
  if (section || list) {
    const topics = word.topics || [];
    const ok = topics.some((t) => {
      const [sec, lst] = String(t).split(' › ');
      return (!section || sec === section) && (!list || lst === list);
    });
    if (!ok) return false;
  }
  return true;
}

// Chooses the words of a session, in the order they should be used.
//   words   the word list (objects with id, level, sources, topics …)
//   scores  { [wordId]: record } – missing = new
//   count   how many words (see wordsNeeded); fewer exist → what there is
// Order: due & weak first (lowest score first), then the checks (1–2 words with a 10), then new words.
// Mix: about 60 % due or weak, 30 % new, 10 % checks. If a group runs out, the others fill up:
// first more new words, then words not yet due (lowest score first), then more tens.
export function pickWords({ words, scores = {}, level, sources, section, list, count, now = Date.now() }) {
  const pool = (words || []).filter((w) => matchesFilter(w, { level, sources, section, list }));
  const n = Math.min(Math.max(0, Math.floor(Number(count) || 0)), pool.length);
  if (!n) return [];

  const rec = (w) => scores[w.id];
  const byScore = (a, b) => wordScore(rec(a)) - wordScore(rec(b)) || (wordDue(rec(a)) ?? 0) - (wordDue(rec(b)) ?? 0) || a.id.localeCompare(b.id);
  const fresh = pool.filter((w) => isNew(rec(w)));
  const tens = pool.filter((w) => !isNew(rec(w)) && wordScore(rec(w)) >= SCORE_MAX)
    .sort((a, b) => Number(isDue(rec(b), now)) - Number(isDue(rec(a), now)) || (wordDue(rec(a)) ?? 0) - (wordDue(rec(b)) ?? 0) || a.id.localeCompare(b.id));
  const learning = pool.filter((w) => !isNew(rec(w)) && wordScore(rec(w)) < SCORE_MAX);
  const dueWeak = learning.filter((w) => isDue(rec(w), now)).sort(byScore);
  const notDue = learning.filter((w) => !isDue(rec(w), now)).sort(byScore);
  const nChecks = n >= CHECKS_FROM_COUNT ? clamp(Math.round(n * SHARE_CHECKS), CHECKS_MIN, CHECKS_MAX) : 0;
  const nNew = Math.round(n * SHARE_NEW);

  const takeDue = dueWeak.slice(0, Math.max(0, n - nChecks - nNew));
  const takeChecks = tens.slice(0, nChecks);
  const takeNew = fresh.slice(0, nNew);
  const chosen = new Set([...takeDue, ...takeChecks, ...takeNew].map((w) => w.id));
  const fill = [...fresh, ...dueWeak, ...notDue, ...tens].filter((w) => !chosen.has(w.id));
  const extra = fill.slice(0, n - chosen.size);

  // final order: due & weak (incl. weak fillers), checks, new
  const all = [...takeDue, ...takeChecks, ...takeNew, ...extra];
  const isTenW = (w) => !isNew(rec(w)) && wordScore(rec(w)) >= SCORE_MAX;
  const first = all.filter((w) => !isNew(rec(w)) && !isTenW(w)).sort((a, b) => Number(isDue(rec(b), now)) - Number(isDue(rec(a), now)) || byScore(a, b));
  const checks = all.filter(isTenW);
  const news = all.filter((w) => isNew(rec(w)));
  return [...first, ...checks, ...news];
}
