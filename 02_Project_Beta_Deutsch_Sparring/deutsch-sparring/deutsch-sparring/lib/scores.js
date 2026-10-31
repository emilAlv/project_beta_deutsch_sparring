// Word scores and the word picker. The ONE place for these rules (see "Word scores" in
// docs/revamp-tasks.md). Pure functions: no React, no browser, no files – so the same code can
// run in the browser now and on the server later (Task 8 keeps the scores in a database).
//
// Every student has up to four scores per word, from 1 to 10:
//   m = Meaning  (the word itself: what it means / the German word; verbs: the infinitive; phrases: the phrase)
//   a = Article  (nouns only: der / die / das)
//   p = Plural   (nouns only: tracked, but NOT needed for "learnt")
//   g = Sentence (the word used in grammar: cases + adjective endings, Perfekt, verb + case)
// A word that was never practised is "new" and counts as score 1.
//
// A word's record:  { v: { s, k, due, iv, up }, a: {…}, p: {…}, g: { s, k, due }, last }
//   v = the MEANING score (the key keeps its old name "v"; it is also the database column `v`)
//   s = score 1–10 · k = right answers in a row (the streak) · due = when it comes back (ms) · last = last practised (ms)
//   iv = the gap in days of a 10 (21, then doubling, see TEN_GAP_*) · up = when Meaning last rose (ms; Meaning only)
// Old records (from before Meaning / Article / Plural) only have v and g. "v" used to mean article + word, so it is
// copied into a once (migrateRecord). Plural starts empty.

// ---------- the numbers (change the rules here, nowhere else) ----------
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const SCORE_NEW = 1; // a word never practised
export const TEN_NEEDS_STREAK = 4; // right answers in a row needed for a 10
export const CAP_WITHOUT_STREAK = 9; // without that streak a score stops here
export const LEARNT_FROM = 8; // "learnt" = Meaning >= 8 and, for a noun, Article >= 8

// score table (points added or taken away). v = Meaning, a = Article, p = Plural, g = Sentence.
// A flashcard only changes the scores it TESTED on its level (see testedChecks); the same numbers apply to each.
export const FLASHCARD_RIGHT = { v: +2, a: +2, p: +2 };
export const KNOWN_AT_FIRST = 6; // a NEW part answered right at the first try (no hint): you already knew it → straight to 6 (one more right = learnt)
export const FLASHCARD_WRONG = { v: -3, a: -3, p: -3 };
export const GRAMMAR_RIGHT = { v: +1, a: +1, g: +2 }; // the word (and its article) was used correctly in the sentence
export const GRAMMAR_WRONG_WORD = { v: -3, a: -3, g: -3 }; // mistake in the word (v) or its article (a); g in both cases
export const GRAMMAR_WRONG_GRAMMAR = { g: -3 }; // mistake in case, ending, Perfekt … (the word scores stay)
export const SKIPPED = { v: -1, a: -1, p: -1, g: -1 }; // a / p only if tested; g only if it was a grammar task
export const HINT_RIGHT = { v: +1, a: +1, p: +1, g: +1 }; // right, but after a hint or on "Leicht"
const BIG_DROP = -3; // a drop this big (a wrong answer, not a skip) sends a 10 down to 7

// feedback.errorType values (German, as the tutor writes them) that mean "the word itself was wrong"
export const ARTICLE_ERRORS = ['Artikel', 'article'];
export const MEANING_ERRORS = ['Wortschatz', 'vocab']; // …also as the app stores them (lib/reply.js)
export const WORD_ERRORS = [...ARTICLE_ERRORS, ...MEANING_ERRORS];

// when a word comes back: [highest score of the band, days]
export const DUE_DAYS = [[3, 1], [6, 3], [9, 7], [10, 21]];
export const DAY_MS = 86_400_000;
export const DUE_TEN_WRONG_TO = 7; // a 10 answered wrong drops to 7
export const DUE_WRONG_DAYS = 1; // ANY wrong answer: that part is due tomorrow, whatever its new score (a skip is not a wrong answer)
// a 10: the first gap is 21 days; each further right check (no hint) doubles it: 21 -> 42 -> 84 -> 168 -> 180 (cap)
export const TEN_GAP_FIRST = 21;
export const TEN_GAP_MAX = 180;

// how a session's words are mixed (shares of the session's word count)
export const SHARE_NEW = 0.3;
export const SHARE_CHECKS = 0.1; // words with 10, asked as a check
export const CHECKS_MIN = 1;
export const CHECKS_MAX = 2;
export const CHECKS_FROM_COUNT = 5; // fewer words than this: no checks
export const SPARE_WORDS = 3; // extra words for skips

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dayOf = (ms) => Math.floor(ms / DAY_MS); // the calendar day (UTC) of a time

// ---------- what a question tests, by level (Easy / Medium / Hard) ----------
// Parts: 'meaning' (score v) · 'article' (a, nouns only) · 'plural' (p, nouns only).
//   Easy    English → German: only the German word. German → English: only the meaning. The article and the
//           plural are shown as information, a mistake there is NOT a mistake.
//   Medium  + the article of a noun (a wrong article = a wrong card)
//   Hard    + the plural of a noun, English → German only (a wrong plural = a wrong card)
// Verbs, adjectives, phrases and the like: just the word, on every level.
// A sentence task (task 'grammar') tests the meaning, and the article of a noun (it stands in the sentence).
export const PARTS = ['meaning', 'article', 'plural'];
export const PART_KIND = { meaning: 'v', article: 'a', plural: 'p' };
export const KINDS = ['v', 'a', 'p', 'g'];
export const asksArticle = (difficulty) => difficulty === 'medium' || difficulty === 'hard';
export const asksPlural = (difficulty) => difficulty === 'hard';

// → the parts one question tests. word = { type, plural } (the word-list entry; unknown word → meaning only)
export function testedChecks({ task = 'flashcard', word = null, difficulty = 'medium', direction = 'en-de' } = {}) {
  const out = ['meaning'];
  if (word?.type !== 'noun') return out;
  if (task === 'grammar') return [...out, 'article'];
  if (asksArticle(difficulty) && direction !== 'de-en') out.push('article'); // German → English asks the meaning only
  if (asksPlural(difficulty) && direction !== 'de-en' && word.plural) out.push('plural');
  return out;
}

// whatever comes from outside → a list of known parts (always with 'meaning')
export function cleanChecks(checks) {
  return ['meaning', ...PARTS.filter((p) => p !== 'meaning' && Array.isArray(checks) && checks.includes(p))];
}

// ---------- reading a record ----------
const kindOf = (rec, kind) => {
  const x = rec && rec[kind];
  if (!x || !Number.isFinite(x.s)) return null;
  const out = { s: clamp(Math.round(x.s), SCORE_MIN, SCORE_MAX), k: Math.max(0, Math.floor(x.k) || 0), due: Number.isFinite(x.due) ? x.due : null };
  if (Number.isFinite(x.iv) && x.iv > 0) out.iv = clamp(Math.round(x.iv), 1, TEN_GAP_MAX);
  if (Number.isFinite(x.up)) out.up = x.up;
  return out;
};

export const isNew = (rec) => !KINDS.some((k) => kindOf(rec, k));
export const mScore = (rec) => kindOf(rec, 'v')?.s ?? SCORE_NEW; // Meaning
export const vScore = mScore; // the old name
export const aScore = (rec) => kindOf(rec, 'a')?.s ?? SCORE_NEW; // Article
export const pScore = (rec) => kindOf(rec, 'p')?.s ?? SCORE_NEW; // Plural
export const gScore = (rec) => kindOf(rec, 'g')?.s ?? SCORE_NEW; // Sentence
export const hasScore = (rec, kind) => Boolean(kindOf(rec, kind));

// how well the word is known overall: the weakest of the scores that exist
export function wordScore(rec) {
  const have = KINDS.map((k) => kindOf(rec, k)).filter(Boolean);
  return have.length ? Math.min(...have.map((x) => x.s)) : SCORE_NEW;
}

// "Learnt": Meaning >= 8 and, for a noun, Article >= 8. Plural is tracked but not required (it may become its own
// grammar section later). noun: is the word a noun? Unknown (undefined) → a record that has an Article score counts as a noun.
export function isLearnt(rec, noun) {
  if (!rec || !kindOf(rec, 'v') || mScore(rec) < LEARNT_FROM) return false;
  const needsArticle = noun === undefined ? hasScore(rec, 'a') : Boolean(noun);
  return !needsArticle || aScore(rec) >= LEARNT_FROM;
}

// The scores that matter when a session is on this level: Easy m · Medium m + a · Hard m + a + p
// (a and p for nouns only; p only for a noun that has a plural).
export function levelKinds(word, difficulty = 'easy') {
  const noun = word?.type === 'noun';
  const out = ['v'];
  if (noun && asksArticle(difficulty)) out.push('a');
  if (noun && asksPlural(difficulty) && word.plural) out.push('p');
  return out;
}

// ---------- reading old data ----------
// An old record has v (= article + word) and g. Copy v into a (once); p stays empty.
export function migrateRecord(rec) {
  if (!rec || typeof rec !== 'object' || rec.a || !kindOf(rec, 'v')) return rec;
  return { ...rec, a: { ...kindOf(rec, 'v') } };
}
export function migrateRecords(all) {
  const out = {};
  for (const [id, rec] of Object.entries(all && typeof all === 'object' ? all : {})) out[id] = migrateRecord(rec);
  return out;
}

// The compact form the browser sends for the numbers on Home: { id: [m, g, a, p] } (null = none).
// The old form was { id: [v, g] } – then v is copied into a (v used to be article + word).
export function compactOf(rec) {
  const s = (k) => kindOf(rec, k)?.s ?? null;
  return [s('v') ?? SCORE_NEW, s('g'), s('a'), s('p')];
}
export function recordFromCompact(arr) {
  const [m, g, a, p] = Array.isArray(arr) ? arr : [];
  const num = (x) => (x != null && x !== '' && Number.isFinite(Number(x)) ? clamp(Math.round(Number(x)), SCORE_MIN, SCORE_MAX) : null);
  if (num(m) == null) return null;
  const rec = { v: { s: num(m) } };
  if (num(g) != null) rec.g = { s: num(g) };
  const old = arr.length < 3; // [v, g]: the old form
  const aa = old ? num(m) : num(a);
  if (aa != null) rec.a = { s: aa };
  if (num(p) != null) rec.p = { s: num(p) };
  return rec;
}

// days until a word with this score comes back
export function dueDays(score) {
  const s = clamp(Math.round(score), SCORE_MIN, SCORE_MAX);
  return DUE_DAYS.find(([max]) => s <= max)[1];
}

export const dueAt = (score, now) => now + dueDays(score) * DAY_MS;

// the earliest due date of the word's existing scores (null = never practised)
export function wordDue(rec) {
  const dues = KINDS.map((k) => kindOf(rec, k)?.due).filter((d) => d != null);
  return dues.length ? Math.min(...dues) : null;
}

export const isDue = (rec, now) => {
  const d = wordDue(rec);
  return d != null && d <= now;
};

// ---------- grammar topics: the same score and due date (review R24) ----------
// A topic has no streak, so its score is simple: the per-topic percentage of grammarStats (lib/grammar-stats.js) on the
// 1–10 scale (80 % = 8). With fewer than TOPIC_FEW answers it stops at 6 (back after 3 days), because two lucky answers
// prove little. The due date is the LAST answer + dueDays(score), the same 1 / 3 / 7 / 21 days as for words.
// A topic never practised is not "due": there is nothing to review yet. stats = { n, pct, recent: [[ok, hinted, t], …] }.
export const TOPIC_FEW = 5;
export const TOPIC_FEW_CAP = 6;
export function topicReview(stats, now = Date.now()) {
  if (!stats || !(stats.n > 0) || !Array.isArray(stats.recent) || !stats.recent.length) return null;
  const raw = clamp(Math.round((Number(stats.pct) || 0) / 10), SCORE_MIN, SCORE_MAX);
  const score = stats.n < TOPIC_FEW ? Math.min(raw, TOPIC_FEW_CAP) : raw;
  const last = Math.max(...stats.recent.map((r) => Number(r[2]) || 0));
  const due = last + dueDays(score) * DAY_MS;
  return { score, last, due, isDue: due <= now };
}

// ---------- updating a score ----------
// One step for one score (v, a, p or g).
//   delta  points to add (negative = taken away)
//   streak 'up' (counts as right in a row) | 'reset' | 'keep' (hint answers)
//   wrong  a wrong answer (not a skip): the part is due tomorrow
//   daily  Meaning only: it can rise at most once per calendar day (a second right answer the same day changes nothing)
function step(cur, { delta, streak, now, wrong = false, daily = false }) {
  const before = cur || { s: SCORE_NEW, k: 0, due: null };
  if (daily && delta > 0 && before.up != null && dayOf(before.up) === dayOf(now)) return { ...before };
  const k = streak === 'up' ? before.k + 1 : streak === 'reset' ? 0 : before.k;
  let s = before.s + delta;
  if (delta < 0) {
    // a 10 answered wrong drops to 7 (a skip only costs its point)
    if (before.s >= SCORE_MAX && delta <= BIG_DROP) s = DUE_TEN_WRONG_TO;
  } else if (before.s >= SCORE_MAX) {
    s = SCORE_MAX; // a 10 answered right stays 10
  } else {
    // 10 needs the streak (hint answers never count toward it); otherwise the score stops at 9
    // (the 4th right answer in a row lifts a 9 to 10: 1 -> 3 -> 5 -> 7 -> 10)
    const tenEarned = streak === 'up' && k >= TEN_NEEDS_STREAK && s >= CAP_WITHOUT_STREAK;
    s = tenEarned ? SCORE_MAX : Math.min(s, CAP_WITHOUT_STREAK);
  }
  s = clamp(s, SCORE_MIN, SCORE_MAX);
  const out = { s, k, due: dueAt(s, now) };
  if (s >= SCORE_MAX) {
    // a 10: the gap grows with each further right check; a hint answer keeps it; a fresh 10 starts at 21 days
    const kept = before.s >= SCORE_MAX && delta > 0;
    const gap = kept ? (before.iv ?? TEN_GAP_FIRST) : TEN_GAP_FIRST;
    out.iv = kept && streak === 'up' ? Math.min(TEN_GAP_MAX, gap * 2) : gap;
    out.due = now + out.iv * DAY_MS;
  }
  if (wrong) out.due = now + DUE_WRONG_DAYS * DAY_MS;
  if (before.up != null) out.up = before.up;
  if (daily && delta > 0) out.up = now;
  return out;
}

// Which parts of a flashcard were right? → { meaning, article, plural } with true | false | null (null = not known, not touched)
//   parts     what the tutor reported (feedback.parts) – may be missing or incomplete
//   fallback  { correct, errorType, rule } – used when the tutor gave no parts: errorType Artikel = the article was
//             wrong (the noun was right), rule "Plural" = only the plural was wrong, any other mistake = the word.
export function resolveParts(parts, { correct = false, errorType = null, rule = '' } = {}) {
  if (correct) return { meaning: true, article: true, plural: true };
  const b = (x) => (x === true || x === false ? x : null);
  const raw = parts && typeof parts === 'object' ? { meaning: b(parts.meaning), article: b(parts.article), plural: b(parts.plural) } : null;
  if (raw && (raw.meaning === false || raw.article === false || raw.plural === false)) {
    // the part that is wrong is named; an unnamed meaning of a card with only an article / plural mistake was right
    return { ...raw, meaning: raw.meaning ?? true };
  }
  if (ARTICLE_ERRORS.includes(errorType)) return { meaning: true, article: false, plural: null };
  if (rule === 'Plural') return { meaning: true, article: true, plural: false };
  return { meaning: false, article: null, plural: null };
}

// What the app does with ONE answer.
//   rec     the word's record so far (or undefined)
//   answer  { task: 'flashcard' | 'grammar', correct, errorType (German tutor value or null), rule,
//             hinted (hint used or "Leicht"), skipped, hasG (false for phrases),
//             checks (the parts this question tests, testedChecks – default: meaning only),
//             parts (feedback.parts of a flashcard: which part was right / wrong) }
// Returns the new record. The model never decides a score.
//
// Flashcard: every TESTED part is scored on its own. A part that was right goes up (+2, +1 after a hint), a part
// that was wrong goes down (−3); a part the answer says nothing about stays. So a wrong article on Medium takes
// the Article score down and still lifts Meaning (the word itself was right).
export function applyAnswer(rec, answer, now = Date.now()) {
  const { correct = false, errorType = null, hinted = false, skipped = false } = answer;
  const checks = cleanChecks(answer.checks);
  const has = (kind) => checks.some((p) => PART_KIND[p] === kind);
  const grammar = answer.task === 'grammar' && answer.hasG !== false;
  const plan = {}; // kind → { delta, streak }
  const up = (kind, table) => { plan[kind] = hinted ? { delta: HINT_RIGHT[kind], streak: 'keep' } : { delta: table[kind], streak: 'up' }; };
  const down = (kind, table, wrong = true) => { plan[kind] = { delta: table[kind], streak: 'reset', wrong }; };

  if (skipped) {
    for (const k of ['v', 'a', 'p']) if (k === 'v' || has(k)) down(k, SKIPPED, false);
    if (grammar) down('g', SKIPPED, false);
  } else if (answer.task === 'grammar') {
    if (correct) {
      for (const k of ['v', 'a']) if (k === 'v' || has(k)) up(k, GRAMMAR_RIGHT);
      if (grammar) up('g', GRAMMAR_RIGHT);
    } else if (ARTICLE_ERRORS.includes(errorType) && has('a')) {
      down('a', GRAMMAR_WRONG_WORD);
      if (grammar) down('g', GRAMMAR_WRONG_WORD);
    } else if (WORD_ERRORS.includes(errorType)) {
      down('v', GRAMMAR_WRONG_WORD);
      if (grammar) down('g', GRAMMAR_WRONG_WORD);
    } else if (grammar) {
      down('g', GRAMMAR_WRONG_GRAMMAR);
    }
  } else {
    const parts = resolveParts(answer.parts, answer);
    for (const part of checks) {
      const kind = PART_KIND[part];
      if (parts[part] === true) {
        up(kind, FLASHCARD_RIGHT);
        if (!hinted && !kindOf(rec, kind)) plan[kind].delta = KNOWN_AT_FIRST - SCORE_NEW;
      }
      else if (parts[part] === false) down(kind, FLASHCARD_WRONG);
    }
  }

  const out = { ...(rec || {}), last: now };
  for (const kind of KINDS) {
    if (plan[kind]) out[kind] = step(kindOf(rec, kind), { ...plan[kind], now, daily: kind === 'v' });
    else if (kindOf(rec, kind)) out[kind] = kindOf(rec, kind);
  }
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
//   words       the word list (objects with id, type, plural, level, sources, topics …)
//   scores      { [wordId]: record } – missing = new
//   count       how many words (see wordsNeeded); fewer exist → what there is
//   difficulty  'easy' | 'medium' | 'hard' (default easy): which scores count for "weak" and "due"
//               Easy: Meaning · Medium: the weaker of Meaning and Article · Hard: Meaning, Article and Plural
//               (Article / Plural only for nouns). A score the word does not have yet counts as 1 and as due.
//               The Sentence score counts too, once the word has one.
//   grammar     true in "Vocabulary + grammar" sessions: then a word without a Sentence score counts as weak (score 1,
//               due now) – except phrases, which have no Sentence score.
// Order: due & weak first (lowest score first), then the checks (1–2 words with a 10), then new words.
// Mix: about 60 % due or weak, 30 % new, 10 % checks. If a group runs out, the others fill up:
// first more new words, then words not yet due (lowest score first), then more tens.
// Fisher–Yates shuffle (a copy; rand returns 0 ≤ x < 1)
function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// rand: random function (a parameter so the checks can be exact). Words that are equally urgent (e.g. all new words)
// come in a new random order each session – otherwise the first word of the list would always open the session.
export function pickWords({ words, scores = {}, level, sources, section, list, count, difficulty = 'easy', grammar = false, now = Date.now(), rand = Math.random }) {
  const pool = shuffled((words || []).filter((w) => matchesFilter(w, { level, sources, section, list })), rand);
  const place = new Map(pool.map((w, i) => [w.id, i]));
  const tie = (a, b) => place.get(a.id) - place.get(b.id); // equal priority: the shuffled order decides
  const n = Math.min(Math.max(0, Math.floor(Number(count) || 0)), pool.length);
  if (!n) return [];

  const rec = (w) => scores[w.id];
  // the scores of this word that matter at this level (+ Sentence if it has one)
  const kindsOf = (w) => [...levelKinds(w, difficulty), ...(kindOf(rec(w), 'g') || (grammar && w.type !== 'phrase') ? ['g'] : [])];
  const score = (w) => Math.min(...kindsOf(w).map((k) => kindOf(rec(w), k)?.s ?? SCORE_NEW));
  // when it comes back: a score it still lacks is due now; otherwise the earliest due date of the scores that matter
  const dueOf = (w) => {
    const ks = kindsOf(w);
    if (ks.some((k) => !kindOf(rec(w), k))) return 0;
    return Math.min(...ks.map((k) => kindOf(rec(w), k).due ?? 0));
  };
  const due = (w) => dueOf(w) <= now;
  const byScore = (a, b) => score(a) - score(b) || dueOf(a) - dueOf(b) || tie(a, b);
  const fresh = pool.filter((w) => isNew(rec(w)));
  const isTenW = (w) => !isNew(rec(w)) && score(w) >= SCORE_MAX;
  const tens = pool.filter(isTenW)
    .sort((a, b) => Number(due(b)) - Number(due(a)) || dueOf(a) - dueOf(b) || tie(a, b));
  const learning = pool.filter((w) => !isNew(rec(w)) && score(w) < SCORE_MAX);
  const dueWeak = learning.filter(due).sort(byScore);
  const notDue = learning.filter((w) => !due(w)).sort(byScore);
  const nChecks = n >= CHECKS_FROM_COUNT ? clamp(Math.round(n * SHARE_CHECKS), CHECKS_MIN, CHECKS_MAX) : 0;
  const nNew = Math.round(n * SHARE_NEW);

  // Overdue 10s are always in (they are due like any other word); they are not limited by CHECKS_MAX and they use up the
  // check places first. Only when there are more of them than the session has words, the rest wait for the next one.
  const overdueTens = tens.filter(due).slice(0, n);
  const room = n - overdueTens.length;
  const moreChecks = Math.max(0, nChecks - overdueTens.length);
  const takeChecks = [...overdueTens, ...tens.filter((w) => !due(w)).slice(0, moreChecks)];
  const takeNew = fresh.slice(0, Math.min(nNew, room));
  const takeDue = dueWeak.slice(0, Math.max(0, room - moreChecks - takeNew.length));
  const chosen = new Set([...takeDue, ...takeChecks, ...takeNew].map((w) => w.id));
  const fill = [...fresh, ...dueWeak, ...notDue, ...tens].filter((w) => !chosen.has(w.id));
  const extra = fill.slice(0, n - chosen.size);

  // final order: due & weak (incl. weak fillers), with the new words in the middle, checks last
  const all = [...takeDue, ...takeChecks, ...takeNew, ...extra];
  // the ORDER inside the session: weakest score first, but words with the same score in a new random order every session
  // (the exact due time only decides which words are picked, not their order – otherwise every session feels the same)
  const first = all.filter((w) => !isNew(rec(w)) && !isTenW(w)).sort((a, b) => Number(due(b)) - Number(due(a)) || score(a) - score(b) || tie(a, b));
  const checks = all.filter(isTenW).sort(tie);
  const news = all.filter((w) => isNew(rec(w)));
  // new words go in the MIDDLE: stopping early must not drop them all, and they are not the very first question
  const half = Math.ceil(first.length / 2);
  return [...first.slice(0, half), ...news, ...first.slice(half), ...checks];
}
