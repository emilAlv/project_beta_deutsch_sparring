// Checks the goals (lib/goals.js) and the Home numbers (lib/home-stats.js). Plain node:
//   node scripts/check-goals.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const G = await import('../lib/goals.js');
const H = await import('../lib/home-stats.js');
const W = await import('../lib/words.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const base = { id: 'g1', type: 'exam', level: 'B1', title: 'Goethe B1', startDate: '2026-10-01', endDate: '2026-12-31' };

// ---- validation ----
const ms = G.defaultMilestones(base, (p) => `M ${p}`);
eq('default plan: 4 milestones, targets 25/50/75/100', ms.map((m) => m.target), [25, 50, 75, 100]);
check('default plan: last milestone is on the end date', ms[3].date === '2026-12-31');
check('default plan: dates rise', ms.every((m, i) => i === 0 || m.date > ms[i - 1].date));
const ok = G.cleanGoal({ ...base, milestones: ms });
check('a good goal is accepted', ok && ok.milestones.length === 4 && ok.scope.rules.length === 0);
check('end before start is refused', G.cleanGoal({ ...base, endDate: '2026-09-01' }) === null);
check('more than three years is refused', G.cleanGoal({ ...base, endDate: '2031-01-01' }) === null);
check('bad date is refused', G.cleanGoal({ ...base, startDate: '2026-02-31' }) === null);
check('bad type is refused', G.cleanGoal({ ...base, type: 'x' }) === null);
check('empty title is refused', G.cleanGoal({ ...base, title: '   ' }) === null);
check('bad id is refused', G.cleanGoal({ ...base, id: 'a b;--' }) === null);
const dirty = G.cleanGoal({ ...base, milestones: [...ms, { id: 'x', date: '2027-05-01', title: 't', target: 50 }, { id: ms[0].id, date: '2026-11-01', title: 'dup', target: 5 }] });
check('milestones outside the time frame and duplicates are dropped', dirty.milestones.length === 4);
eq('targets are clamped to 0–100', G.cleanGoal({ ...base, milestones: [{ id: 'a', date: '2026-11-01', title: 't', target: 900 }] }).milestones[0].target, 100);
check('list without section is dropped', G.cleanGoal({ ...base, scope: { list: 'x' } }).scope.list === null);

// ---- state ----
const goal = G.cleanGoal({ ...base, milestones: ms });
const mid = G.goalState(goal, 10, '2026-11-15');
eq('behind: 10 % done at 45 % of the time', mid.tag, 'behind');
eq('on track: 50 % done at 45 % of the time', G.goalState(goal, 50, '2026-11-15').tag, 'onTrack');
eq('upcoming before the start', G.goalState(goal, 0, '2026-09-01').tag, 'upcoming');
eq('weeks left', G.goalState(goal, 0, '2026-12-17').weeksLeft, 2);
eq('milestone states', G.milestoneStates(goal, 30, '2026-12-01'), ['reached', 'missed', 'next', 'coming']);

// ---- timeline ----
const whole = G.buildTimeline([goal], () => 30, '2026-12-01', 'whole');
check('whole plan starts at the goal start', whole.from === '2026-10-01' && whole.rows[0].dots.length === 4);
const still = G.buildTimeline([goal], () => 30, '2026-12-01', 'still');
check('still to do starts today', still.from === '2026-12-01');
eq('still to do folds reached / missed milestones', still.rows[0].folded, { reached: 1, missed: 1 });
check('still to do keeps the coming ones', still.rows[0].dots.length === 2);
check('ended goals are left out of still to do', G.buildTimeline([goal], () => 0, '2027-02-01', 'still').rows.length === 0);
check('month ticks are inside the range', G.monthTicks('2026-10-01', '2026-12-31').length === 2);

// ---- numbers ----
const words = W.getWords();
const lvl = words.find((w) => w.level === 'B1');
const scores = Object.fromEntries(words.filter((w) => w.level === 'B1').slice(0, 10).map((w) => [w.id, { v: { s: 10 } }]));
const agg = H.aggregateAnswers([
  { sessionId: 'a', rule: 'Genitiv nach wegen', correct: true, skipped: false, wordId: lvl.id },
  { sessionId: 'a', rule: 'Genitiv nach wegen', correct: true, skipped: false, wordId: '' },
  { sessionId: 'a', rule: 'Genitiv nach wegen', correct: true, skipped: false, wordId: '' },
  { sessionId: 'b', rule: 'Dativ nach mit', correct: false, skipped: false, wordId: '' },
  { sessionId: 'b', rule: 'Dativ nach mit', correct: false, skipped: false, wordId: '' },
  { sessionId: 'b', rule: '', correct: false, skipped: true, wordId: '' },
]);
eq('aggregate: sessions, total, correct, skipped', [agg.sessions, agg.total, agg.correct, agg.skipped], [2, 6, 3, 1]);
const vocabGoal = G.cleanGoal({ ...base, id: 'v', type: 'vocab', milestones: [] });
const gramGoal = G.cleanGoal({ ...base, id: 'r', type: 'grammar', scope: { rules: ['Genitiv nach wegen'] }, milestones: [] });
const home = H.computeHome({ goals: [vocabGoal, gramGoal], scores, agg });
eq('tiles: answered = total - skipped, % right', [home.tiles.answered, home.tiles.pctRight], [5, 60]);
eq('tiles: words learnt = V score 8–10', home.tiles.learnt, 10);
check('vocabulary goal progress counts only its level', home.progress.v > 0 && home.progress.v < 100);
eq('grammar goal progress: 100 % right but only 3 of 20 answers', home.progress.r, 15);
eq('strengths: only rules with 3+ answers', home.strengths.map((x) => x.label), ['Genitiv nach wegen']);
eq('gaps: weak rules', home.gaps.map((x) => x.label), ['Dativ nach mit']);
eq('a strength knows its goal', home.strengths[0].goalId, 'r');
eq('log: old entries are dropped', H.answersFromLog([{ i: 's', r: 'x', o: true, t: 1 }, { i: 's', r: 'x', o: true, t: Date.now() }]).length, 1);

if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
