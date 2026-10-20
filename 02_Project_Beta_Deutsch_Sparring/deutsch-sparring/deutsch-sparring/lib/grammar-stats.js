// How well a student does on each grammar topic (review R9, redesign §4.3 "grammarStats"). Pure functions, no React,
// no fs: used by the database store, the in-memory store, /api/stats (accounts off) and the checks.
//
// The window is the last 40 COUNTED answers per topic (no 30-day cut). Counted means:
//   - "Leicht" (multiple choice) answers are left out,
//   - a skipped answer counts as wrong,
//   - a right answer with a hint counts 0.5, a wrong one 0, a right one without a hint 1.
// Result per topic: { n, points, pct, recent: [[ok, hinted, t], …] (oldest → newest) }.
export const STATS_WINDOW = 40;
const MAX_TOPICS = 400;
const TOPIC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export const pointsOf = (ok, hinted) => (ok ? (hinted ? 0.5 : 1) : 0);

// answers: [{ topicId, correct, skipped, hinted, difficulty, t }] in any order → { [topicId]: stats }
export function grammarStatsFromAnswers(answers) {
  const byTopic = new Map();
  for (const a of answers) {
    if (!a?.topicId || a.difficulty === 'easy') continue;
    if (!byTopic.has(a.topicId)) byTopic.set(a.topicId, []);
    byTopic.get(a.topicId).push([a.correct === true && a.skipped !== true, a.hinted === true, Number(a.t) || 0]);
  }
  return summarize(byTopic);
}

// log: { [topicId]: [[ok, hinted, t], …] } as kept in the browser (wort_rulelog) → { [topicId]: stats }
export function grammarStatsFromLog(log) {
  const byTopic = new Map();
  if (log && typeof log === 'object' && !Array.isArray(log)) {
    for (const [id, rows] of Object.entries(log).slice(0, MAX_TOPICS)) {
      if (!TOPIC_ID.test(id) || !Array.isArray(rows)) continue;
      byTopic.set(id, rows.filter(Array.isArray).slice(-STATS_WINDOW).map((r) => [r[0] === true, r[1] === true, Number(r[2]) || 0]));
    }
  }
  return summarize(byTopic);
}

function summarize(byTopic) {
  const out = {};
  for (const [id, rows] of byTopic) {
    const recent = rows.sort((x, y) => x[2] - y[2]).slice(-STATS_WINDOW);
    if (!recent.length) continue;
    const points = recent.reduce((sum, [ok, h]) => sum + pointsOf(ok, h), 0);
    out[id] = { n: recent.length, points, pct: Math.round((points / recent.length) * 100), recent };
  }
  return out;
}

// the small version that goes to the screen (no answer lists)
export const slimStats = (stats) => Object.fromEntries(Object.entries(stats || {}).map(([id, s]) => [id, { n: s.n, points: s.points, pct: s.pct }]));

// browser: add one answer to wort_rulelog, keeping the last 40 per topic → the new log. "Leicht" answers are not kept.
export function addToRuleLog(log, topicId, { ok, hinted, difficulty, t }) {
  if (!topicId || difficulty === 'easy') return log || {};
  const base = log && typeof log === 'object' && !Array.isArray(log) ? log : {};
  return { ...base, [topicId]: [...(Array.isArray(base[topicId]) ? base[topicId] : []), [ok === true, hinted === true, t]].slice(-STATS_WINDOW) };
}
