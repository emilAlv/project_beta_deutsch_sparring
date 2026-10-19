// The numbers on the Home page, worked out by the APP (never by the model). Server only (needs the word list).
//
//   agg      what the student answered in the last 30 days, already summed up:
//            { sessions, total, correct, skipped,
//              rules: [{ rule, n, ok }]   – answers per grammar rule (feedback.rule), skipped ones left out
//              words: [{ id, n, ok }] }   – answers per word
//   scores   { [wordId]: record } as in lib/scores.js (missing = a new word, score 1)
//   goals    clean goals (lib/goals.js)
//
// Goal progress (percent):
//   vocabulary  how far the goal's words are on their way to a 10 (average of (V − 1) / 9)
//   grammar     share of right answers on the goal's rules (all rules if none are named) in the last 30 days,
//               counted fully once there are 20 answers
//   exam        the average of the two
import { getWords, getWord } from './words.js';
import { matchesFilter, vScore, gScore } from './scores.js';

export const WINDOW_DAYS = 30;
export const LEARNT_FROM = 8; // a word counts as "learnt" with a V score of 8–10
export const GRAMMAR_FULL_AT = 20; // answers needed before the accuracy counts fully
export const STRONG_FROM = 75; // % right: a strength from here, a gap below
export const SHOWN = 5; // rows per column

const SEP = ' › ';
const pct = (ok, n) => (n ? Math.round((ok / n) * 100) : 0);

// ---------- summing up ----------
// answers: [{ sessionId, rule, correct, skipped, wordId }] → agg
export function aggregateAnswers(answers) {
  const rules = new Map();
  const words = new Map();
  const sessions = new Set();
  let correct = 0;
  let skipped = 0;
  for (const a of answers) {
    sessions.add(a.sessionId);
    if (a.skipped) {
      skipped += 1;
      continue;
    }
    if (a.correct) correct += 1;
    if (a.rule) {
      const r = rules.get(a.rule) || { rule: a.rule, n: 0, ok: 0 };
      r.n += 1;
      r.ok += a.correct ? 1 : 0;
      rules.set(a.rule, r);
    }
    if (a.wordId) {
      const w = words.get(a.wordId) || { id: a.wordId, n: 0, ok: 0 };
      w.n += 1;
      w.ok += a.correct ? 1 : 0;
      words.set(a.wordId, w);
    }
  }
  return { sessions: sessions.size, total: answers.length, correct, skipped, rules: [...rules.values()], words: [...words.values()] };
}

// The browser's own log (no accounts): [{ i: session id, r: rule, o: right?, s: skipped?, w: word id, t: time }]
const MAX_LOG = 1500;
export function answersFromLog(log, now = Date.now()) {
  const since = now - WINDOW_DAYS * 86_400_000;
  return (Array.isArray(log) ? log : []).slice(-MAX_LOG)
    .filter((x) => x && typeof x === 'object' && Number(x.t) >= since)
    .map((x) => ({
      sessionId: String(x.i || '').slice(0, 40),
      rule: typeof x.r === 'string' ? x.r.slice(0, 200) : '',
      correct: x.o === true,
      skipped: x.s === true,
      wordId: typeof x.w === 'string' && getWord(x.w) ? x.w : '',
    }));
}

// The browser's compact scores { id: [v, g] } → records
export function scoresFromCompact(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(raw).slice(0, 8000)) {
    const [v, g] = Array.isArray(raw[id]) ? raw[id] : [];
    if (!getWord(id) || !Number.isFinite(Number(v))) continue;
    out[id] = { v: { s: Number(v) } };
    if (Number.isFinite(Number(g))) out[id].g = { s: Number(g) };
  }
  return out;
}

// ---------- goals ----------
function vocabProgress(goal, scores) {
  const words = getWords().filter((w) => matchesFilter(w, { level: goal.level, section: goal.scope.section, list: goal.scope.list }));
  if (!words.length) return 0;
  const sum = words.reduce((s, w) => s + (Math.min(10, vScore(scores[w.id])) - 1) / 9, 0);
  return Math.round((sum / words.length) * 100);
}

function grammarProgress(goal, agg) {
  const wanted = goal.scope.rules;
  const rows = agg.rules.filter((r) => !wanted.length || wanted.includes(r.rule));
  const n = rows.reduce((s, r) => s + r.n, 0);
  const ok = rows.reduce((s, r) => s + r.ok, 0);
  return Math.round(pct(ok, n) * Math.min(1, n / GRAMMAR_FULL_AT));
}

export function goalProgress(goal, scores, agg) {
  if (goal.type === 'vocab') return vocabProgress(goal, scores);
  if (goal.type === 'grammar') return grammarProgress(goal, agg);
  return Math.round((vocabProgress(goal, scores) + grammarProgress(goal, agg)) / 2);
}

// the goal a grammar rule / a word list belongs to (or null)
const ruleGoal = (goals, rule) => (goals.find((g) => g.type !== 'vocab' && g.scope.rules.includes(rule))
  || goals.find((g) => g.type === 'grammar' && !g.scope.rules.length)
  || goals.find((g) => g.type === 'exam' && !g.scope.rules.length) || null);
const listGoal = (goals, section, list) => (goals.find((g) => g.type !== 'grammar' && g.scope.section === section && (!g.scope.list || g.scope.list === list))
  || goals.find((g) => g.type !== 'grammar' && !g.scope.section) || null);

// ---------- everything for the Home page ----------
export function computeHome({ goals, scores, agg }) {
  const words = getWords();
  const learnt = words.filter((w) => vScore(scores[w.id]) >= LEARNT_FROM && scores[w.id]).length;
  const answered = agg.total - agg.skipped;

  // word lists: right answers per list, plus the average V and G score of the practised words in it
  const lists = new Map();
  for (const a of agg.words) {
    const w = getWord(a.id);
    for (const topic of w?.topics || []) {
      const l = lists.get(topic) || { topic, n: 0, ok: 0 };
      l.n += a.n;
      l.ok += a.ok;
      lists.set(topic, l);
    }
  }
  const avg = (topic, f) => {
    const rec = words.filter((w) => scores[w.id] && w.topics.includes(topic));
    const vals = rec.map((w) => f(scores[w.id])).filter((x) => x != null);
    return vals.length ? Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10 : null;
  };

  const items = [
    ...agg.rules.map((r) => ({ kind: 'rule', label: r.rule, n: r.n, pct: pct(r.ok, r.n), goalId: ruleGoal(goals, r.rule)?.id || null })),
    ...[...lists.values()].map((l) => {
      const [section, list] = l.topic.split(SEP);
      return {
        kind: 'list', label: l.topic, n: l.n, pct: pct(l.ok, l.n), goalId: listGoal(goals, section, list)?.id || null,
        v: avg(l.topic, vScore), g: avg(l.topic, (r) => (r.g ? gScore(r) : null)),
      };
    }),
  ];
  const strengths = items.filter((x) => x.n >= 3 && x.pct >= STRONG_FROM).sort((a, b) => b.pct - a.pct || b.n - a.n).slice(0, SHOWN);
  const gaps = items.filter((x) => x.n >= 2 && x.pct < STRONG_FROM).sort((a, b) => a.pct - b.pct || b.n - a.n).slice(0, SHOWN);

  return {
    tiles: { sessions: agg.sessions, answered, correct: agg.correct, pctRight: pct(agg.correct, answered), learnt, wordsTotal: words.length },
    progress: Object.fromEntries(goals.map((g) => [g.id, goalProgress(g, scores, agg)])),
    strengths,
    gaps,
    rules: items.filter((x) => x.kind === 'rule').sort((a, b) => b.n - a.n),
    vocab: vocabProgress2(words, scores),
  };
}

// Where the student stands with the words, per level and per list – so the coach can plan with real content
// ("Home & living › Furniture: 12 of 45 learnt") instead of percentages.
//   byLevel: { A1: { total, practised, learnt } … }
//   byList:  [{ topic, total, practised, learnt, levels: { A1: n … } }] in the order of the word list
function vocabProgress2(words, scores) {
  const byLevel = {};
  const lists = new Map();
  for (const w of words) {
    const rec = scores[w.id];
    const practised = rec ? 1 : 0;
    const learnt = rec && vScore(rec) >= LEARNT_FROM ? 1 : 0;
    const lv = (byLevel[w.level] ||= { total: 0, practised: 0, learnt: 0 });
    lv.total += 1; lv.practised += practised; lv.learnt += learnt;
    for (const topic of w.topics || []) {
      const l = lists.get(topic) || { topic, total: 0, practised: 0, learnt: 0, levels: {} };
      l.total += 1; l.practised += practised; l.learnt += learnt;
      l.levels[w.level] = (l.levels[w.level] || 0) + 1;
      lists.set(topic, l);
    }
  }
  return { byLevel, byList: [...lists.values()] };
}
