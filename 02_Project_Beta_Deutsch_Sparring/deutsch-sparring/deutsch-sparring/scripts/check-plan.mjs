// Checks review R9 "a topic on every answer": which topic an answer belongs to, the per-topic counts (grammarStats),
// the browser log wort_rulelog, and the database migration text (backfill of old answers). Plain node:
//   node scripts/check-plan.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const R = await import('../lib/rules.js');
const S = await import('../lib/grammar-stats.js');
const { SCHEMA } = await import('../lib/schema.mjs');
const { CURRICULUM } = await import('../lib/curriculum.js');
const { readFileSync, readdirSync } = await import('node:fs');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---- which topic does an answer belong to? ----
eq('grammar session on a curriculum topic → that topic', R.topicForRule('Modalverben', 'g-a1-modalverben', 'grammar'), 'g-a1-modalverben');
eq('grammar session: a correct answer without a rule still has the topic', R.topicForRule(null, 'g-a2-perfekt-partizip', 'grammar'), 'g-a2-perfekt-partizip');
eq('situation lesson (grammar session) is a topic too', R.topicForRule(null, 'lektion-a1-01-vorstellen', 'grammar'), 'lektion-a1-01-vorstellen');
eq('a lesson id is NOT accepted outside a grammar session', R.topicForRule(null, 'lektion-a1-01-vorstellen', 'vocab'), null);
eq('"free" practice is no topic', R.topicForRule(null, 'free', 'grammar'), null);
eq('vocab session, rule → lowest-level topic with that rule', R.topicForRule('Perfekt mit sein', 'a1-familie', 'vocab'), 'g-a1-perfekt');
eq('vocab session, no rule → no topic', R.topicForRule(null, 'a1-familie', 'vocab'), null);
eq('a word is no rule → no topic', R.topicForRule('der Schrank', 'a1-familie', 'vocab'), null);
check('every curriculum rule name finds a topic of its own level or lower', CURRICULUM.every((e) => e.ruleNames.every((r) => {
  const id = R.topicForRule(r);
  return id && CURRICULUM.findIndex((x) => x.id === id) <= CURRICULUM.indexOf(e);
})));

// ---- per-topic counts ----
const T0 = 1_000_000;
const ans = (topicId, i, over = {}) => ({ topicId, correct: true, skipped: false, hinted: false, difficulty: 'medium', t: T0 + i, ...over });
const sample = [];
for (let i = 0; i < 50; i += 1) sample.push(ans('g-a1-perfekt', i, { correct: i >= 30 })); // first 30 wrong, last 20 right
let st = S.grammarStatsFromAnswers(sample);
eq('only the last 40 answers count', st['g-a1-perfekt'].n, 40);
eq('of the last 40 answers 20 were right (answers 10–29 wrong, 30–49 right)', st['g-a1-perfekt'].points, 20);
eq('percent', st['g-a1-perfekt'].pct, 50);

st = S.grammarStatsFromAnswers([
  ans('t1', 1), ans('t1', 2, { hinted: true }), ans('t1', 3, { correct: false }), ans('t1', 4, { skipped: true, correct: false }),
  ans('t1', 5, { skipped: true, correct: true }), // a skip is always wrong
  ans('t1', 6, { difficulty: 'easy', hinted: true }), // Leicht: left out
  ans('t1', 7, { difficulty: null }), // an old answer without difficulty counts
  ans('t2', 1, { hinted: true, correct: false }),
  { ...ans('x', 1), topicId: null }, // no topic: left out
]);
eq('t1: 6 counted answers (Leicht and no-topic left out)', st.t1.n, 6);
eq('t1: right 1 + hinted 0.5 + wrong 0 + skip 0 + skip 0 + old right 1 = 2.5', st.t1.points, 2.5);
eq('t2: a wrong hinted answer is 0', [st.t2.n, st.t2.points], [1, 0]);
check('no entry for answers without a topic', !('x' in st) && !('null' in st));
eq('answers come back oldest → newest', st.t1.recent.map((r) => r[2]), [T0 + 1, T0 + 2, T0 + 3, T0 + 4, T0 + 5, T0 + 7]);

// ---- accounts off: wort_rulelog ----
let log = {};
for (let i = 0; i < 45; i += 1) log = S.addToRuleLog(log, 'g-a1-perfekt', { ok: i % 2 === 0, hinted: false, difficulty: 'medium', t: T0 + i });
eq('the log keeps the last 40 per topic', log['g-a1-perfekt'].length, 40);
log = S.addToRuleLog(log, 'g-a1-perfekt', { ok: true, hinted: true, difficulty: 'easy', t: T0 + 99 });
eq('a Leicht answer is not logged', log['g-a1-perfekt'].length, 40);
log = S.addToRuleLog(log, '', { ok: true, t: T0 });
eq('an answer without a topic is not logged', Object.keys(log), ['g-a1-perfekt']);
log = S.addToRuleLog(log, 'g-a1-modalverben', { ok: false, hinted: false, difficulty: 'hard', t: T0 + 100 });
st = S.grammarStatsFromLog(JSON.parse(JSON.stringify(log))); // what POST /api/stats does with the body
eq('log → stats: n and points (answers 5..44, the even ones are right = 20)', [st['g-a1-perfekt'].n, st['g-a1-perfekt'].points], [40, 20]);
eq('log → stats: second topic', [st['g-a1-modalverben'].n, st['g-a1-modalverben'].points], [1, 0]);
eq('log and database give the same numbers for the same answers',
  S.grammarStatsFromAnswers(log['g-a1-perfekt'].map(([ok, h, t]) => ({ topicId: 'g-a1-perfekt', correct: ok, hinted: h, t }))),
  { 'g-a1-perfekt': st['g-a1-perfekt'] });
eq('a broken log gives an empty result', S.grammarStatsFromLog({ 'bad id;--': [[true, false, 1]], ok: 'x', 'g-a1-x': [5, 'y', null] }), {});
eq('no log at all', S.grammarStatsFromLog(undefined), {});
eq('slim stats have no answer list', Object.keys(S.slimStats(st)['g-a1-perfekt']), ['n', 'points', 'pct']);

// ---- the database migration ----
const sql = SCHEMA.join('\n');
check('topic_id column is added idempotently', /ALTER TABLE answers ADD COLUMN IF NOT EXISTS topic_id text/.test(sql));
check('index (user_id, topic_id, created_at DESC) exists, idempotently', /CREATE INDEX IF NOT EXISTS \w+ ON answers \(user_id, topic_id, created_at DESC\)/.test(sql));
const backfill = SCHEMA.filter((s) => /^UPDATE answers/.test(s));
eq('two backfill statements (session topic, then rule)', backfill.length, 2);
check('the backfills only touch rows without a topic (safe to run again)', backfill.every((s) => /a\.topic_id IS NULL/.test(s)));
check('nothing is deleted by the migration', !/DELETE|DROP|TRUNCATE/i.test(sql.replace(/ON DELETE CASCADE/g, '')));
const rows = [...backfill[1].matchAll(/\('([^']*)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
eq('rule backfill list = topicForRule for every rule name', rows, R.ruleTopicPairs());
check('rule backfill agrees with topicForRule', rows.every(([k, id]) => CURRICULUM.find((e) => e.ruleNames.some((r) => R.ruleKey(r) === k)).id === id));
check('"Perfekt mit sein" backfills to the A1 topic', rows.some(([k, id]) => k === 'perfekt mit sein' && id === 'g-a1-perfekt'));
// situation lessons: the session-topic backfill takes any id of a grammar session, so lesson ids are covered
const lessons = readdirSync(new URL('../content', import.meta.url)).filter((f) => /^lektion-(a1|a2|b1)-/.test(f));
check('situation lessons exist and have valid topic ids', lessons.length >= 40 && lessons.every((f) => R.topicForRule(null, f.replace(/\.md$/, ''), 'grammar') === f.replace(/\.md$/, '')));

// ---- the code actually writes the column ----
const progress = readFileSync(new URL('../lib/progress.js', import.meta.url), 'utf8');
check('the answers INSERT stores topic_id', /difficulty, topic_id\)/.test(progress) && /a\.difficulty, a\.topicId\]/.test(progress));
check('grammarStats takes the last 40 per topic with row_number(), Leicht left out',
  /row_number\(\) OVER \(PARTITION BY topic_id ORDER BY created_at DESC/.test(progress) && /<> 'easy'/.test(progress));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll plan checks passed.');
process.exit(failed ? 1 : 0);
