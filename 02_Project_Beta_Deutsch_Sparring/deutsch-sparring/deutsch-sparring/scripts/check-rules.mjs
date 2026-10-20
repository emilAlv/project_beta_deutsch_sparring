// Checks review R8 "clean grammar data": words are never counted as grammar rules, the Home gaps and the coach
// context hold only real rules and real word counts, exam goals count every lower level. Plain node:
//   node scripts/check-rules.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const R = await import('../lib/rules.js');
const Rep = await import('../lib/reply.js');
const H = await import('../lib/home-stats.js');
const W = await import('../lib/words.js');
const P = await import('../lib/coach-prompt.js');
const T = await import('../lib/word-tasks.js');
const { readFileSync } = await import('node:fs');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---- cleanRule ----
eq('"der Schrank" is no rule', R.cleanRule('der Schrank'), null);
eq('"Dativ nach mit" is a rule', R.cleanRule('Dativ nach mit'), 'Dativ nach mit');
eq('case and spaces are ignored', R.cleanRule('  dativ   NACH mit '), 'Dativ nach mit');
eq('a curriculum rule name counts', R.cleanRule('Modalverben'), 'Modalverben');
eq('"<Kasus> nach <Präposition>" counts', R.cleanRule('Akkusativ nach auf'), 'Akkusativ nach auf');
eq('empty is no rule', R.cleanRule(''), null);
eq('unknown wording is no rule', R.cleanRule('Irgendwas mit Wörtern'), null);
eq('topic first: its own spelling is returned', R.cleanRule('perfekt mit sein', 'g-a1-perfekt'), 'Perfekt mit sein');
eq('rule shared by two topics → the lower level', R.topicForRule('Perfekt mit sein'), 'g-a1-perfekt');
eq('the session topic wins', R.topicForRule('Perfekt mit sein', 'g-a2-perfekt-partizip'), 'g-a2-perfekt-partizip');
eq('a word has no topic', R.topicForRule('der Schrank'), null);

// ---- normalizeReply ----
const ctx = { level: 'A2', difficulty: 'medium', topicIds: new Set(['g-a1-perfekt', 'free']), topicId: 'g-a1-perfekt' };
const fb = (rule) => Rep.normalizeReply({
  message: 'x', feedback: { forNumber: 1, correct: false, studentAnswer: 'a', corrected: 'b', changedWords: [], explanation: '', rule, errorType: 'Artikel' },
}, ctx).feedback.rule;
eq('normalizeReply: a word becomes null', fb('der Schrank'), null);
eq('normalizeReply: a real rule stays (cleaned)', fb('PERFEKT mit  haben'), 'Perfekt mit haben');

// ---- the deterministic word tasks never give the word as a rule ----
let wordRules = 0;
let wordTasks = 0;
for (const w of W.getWords().filter((x) => x.type === 'noun' && x.noun).slice(0, 40)) {
  for (const t of T.taskList(w)) {
    wordTasks += 1;
    for (const wrong of ['xyz', 'Haus', 'das Auto']) {
      const r = t.check(wrong);
      if (!r.correct && r.rule && !R.isRuleName(r.rule)) wordRules += 1;
    }
  }
}
check('word tasks: a wrong answer never gives a word as rule', wordTasks > 0 && wordRules === 0, `${wordRules} bad of ${wordTasks} tasks`);

// ---- Home gaps and rules hold only real rules ----
const answers = [];
const add = (rule, n, okN) => { for (let i = 0; i < n; i += 1) answers.push({ sessionId: 's', rule, correct: i < okN, skipped: false, wordId: '' }); };
add('der Schrank', 5, 0);
add('die Lampe', 3, 0);
add('Dativ nach mit', 4, 1);
add('genitiv nach WEGEN', 2, 0);
const agg = H.aggregateAnswers(answers);
eq('aggregate: only rules, same spelling summed', agg.rules.map((r) => [r.rule, r.n, r.ok]).sort(), [['Dativ nach mit', 4, 1], ['Genitiv nach wegen', 2, 0]]);
const home = H.computeHome({ goals: [], scores: {}, agg });
check('Home gaps show only rules', home.gaps.length === 2 && home.gaps.every((g) => g.kind === 'rule' && R.isRuleName(g.label)), JSON.stringify(home.gaps.map((g) => g.label)));
const rows = H.cleanRuleRows([{ rule: 'der Schrank', n: 9, ok: 0 }, { rule: 'dativ nach mit', n: 2, ok: 1 }, { rule: 'Dativ nach mit', n: 3, ok: 3 }]);
eq('database rows: words dropped, spellings merged', rows, [{ rule: 'Dativ nach mit', n: 5, ok: 4 }]);
const fromLog = H.answersFromLog([{ i: 's', r: 'der Schrank', o: false, s: false, w: '', t: Date.now(), g: '', h: false, d: 'easy' }, { i: 's', r: 'Dativ nach mit', o: true, s: false, w: '', t: Date.now(), g: 'g-a1-dativ', h: true, d: 'hard' }]);
eq('browser log: word rule dropped, real rule kept', fromLog.map((a) => a.rule), ['', 'Dativ nach mit']);

// ---- real word counts ----
const counts = W.wordCountsByLevel();
const all = W.getWords();
check('word counts match words.json', ['A1', 'A2', 'B1'].every((lv) => counts[lv] === all.filter((w) => w.level === lv).length) && counts.A1 > 0);
const prompt = P.buildCoachPrompt({ name: 'Emilio', context: '' });
check('coach prompt carries the real counts', ['A1', 'A2', 'B1'].every((lv) => prompt.includes(`${lv} (${counts[lv]} words in the app's word list`)), '');
check('coach prompt has no Goethe estimate any more', !/about (650|1300|2400) words/.test(prompt));

// ---- exam goals count every lower level ----
const scores = {};
for (const w of all.filter((x) => x.level === 'A1').slice(0, 50)) scores[w.id] = { v: { s: 10, k: 5, due: null } };
const mk = (type) => ({ id: 'g', type, level: 'B1', title: 't', startDate: '2026-10-01', endDate: '2026-12-31', scope: { section: null, list: null, rules: [] }, milestones: [] });
const exam = H.goalProgress(mk('exam'), scores, agg);
const vocabB1 = H.goalProgress(mk('vocab'), scores, agg);
check('exam goal counts A1 words, a B1 vocab goal does not', H.goalProgress({ ...mk('vocab'), level: 'B1' }, scores, agg) === 0 && exam > 0, `exam ${exam}, vocab ${vocabB1}`);

// ---- the database change is the safe kind ----
const schema = readFileSync(new URL('../lib/schema.mjs', import.meta.url), 'utf8');
check('new answer columns use ADD COLUMN IF NOT EXISTS', /ALTER TABLE answers ADD COLUMN IF NOT EXISTS hinted boolean/.test(schema) && /ALTER TABLE answers ADD COLUMN IF NOT EXISTS difficulty text/.test(schema));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
