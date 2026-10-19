// Checks the coach (lib/coach.js, lib/coach-mock.js): cleaning the model's answer, validating and applying
// plan changes, saved messages. Plain node:
//   node scripts/check-coach.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const C = await import('../lib/coach.js');
const M = await import('../lib/coach-mock.js');
const P = await import('../lib/coach-prompt.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

const today = '2026-10-19';
const goal = {
  id: 'g1', type: 'exam', level: 'B1', title: 'Goethe B1', startDate: '2026-10-01', endDate: '2026-12-31',
  scope: { section: null, list: null, rules: [] },
  milestones: [
    { id: 'm1', date: '2026-10-15', title: 'Quarter', target: 25, status: 'done' },
    { id: 'm2', date: '2026-11-15', title: 'Half', target: 50, status: 'open' },
    { id: 'm3', date: '2026-12-01', title: 'Most', target: 75, status: 'open' },
    { id: 'm4', date: '2026-12-31', title: 'All', target: 100, status: 'open' },
  ],
};
const topics = [
  { id: 'lektion-01-dativ-akkusativ', short: 'Dativ & Akkusativ', title: 'Dativ & Akkusativ', type: 'Grammatik' },
  { id: 'w:essen', short: 'Food', title: 'Food (all lists)', type: 'Wortschatz' },
  { id: 'w:essen:obst', short: 'Fruit', title: 'Food › Fruit', type: 'Wortschatz', parent: 'w:essen' },
  { id: 'free', short: 'Free', title: 'Free', type: 'Gemischt' },
];

// ---- suggested session ----
const s1 = C.cleanSuggestion({ kind: 'grammar', topicId: 'w:essen:obst', level: 'A2', difficulty: 'hard', questions: 27, grammar: ['genitiv', 'nonsense'] }, topics);
check('suggestion: kind follows the topic, questions snap to a step, unknown grammar dropped',
  s1 && s1.kind === 'vocab' && s1.questions === 30 && JSON.stringify(s1.grammar) === '["genitiv"]' && s1.level === 'A2');
check('suggestion: unknown topic is refused', C.cleanSuggestion({ topicId: 'nope' }, topics) === null);
check('suggestion: free practice is refused', C.cleanSuggestion({ topicId: 'free' }, topics) === null);
check('suggestion: bad values fall back', C.cleanSuggestion({ topicId: 'w:essen', level: 'C2', difficulty: 'x' }, topics)?.level === 'B1');
const patch = C.suggestionToSetup(s1, topics);
check('setup prefill: list of a section', patch.section === 'w:essen' && patch.list === 'w:essen:obst' && patch.kind === 'vocab' && patch.grammar[0] === 'genitiv');
const patch2 = C.suggestionToSetup(C.cleanSuggestion({ topicId: 'lektion-01-dativ-akkusativ' }, topics), topics);
check('setup prefill: grammar lesson', patch2.kind === 'grammar' && patch2.grammarTopic === 'lektion-01-dativ-akkusativ');

// ---- plan changes ----
const raw = (changes, goalId = 'g1') => ({ goalId, changes });
const move = { action: 'move', milestoneId: 'm2', date: '2026-11-29' };
const add = { action: 'add', title: 'Check-in', date: '2026-11-01', target: 40 };
const p1 = C.cleanPlan(raw([move, add, { action: 'remove', milestoneId: 'm3' }]), [goal], today);
check('plan: good changes are kept (move, add, remove)', p1 && p1.changes.length === 3 && p1.changes[0].title === 'Half');
check('plan: unknown goal id is refused', C.cleanPlan(raw([move], 'zzz'), [goal], today) === null);
check('plan: unknown milestone is dropped', C.cleanPlan(raw([{ action: 'move', milestoneId: 'x', date: '2026-11-29' }]), [goal], today) === null);
check('plan: date after the end is dropped', C.cleanPlan(raw([{ ...move, date: '2027-01-05' }]), [goal], today) === null);
check('plan: date in the past is dropped', C.cleanPlan(raw([{ ...move, date: '2026-10-05' }]), [goal], today) === null);
check('plan: date before the start is dropped', C.cleanPlan(raw([{ ...add, date: '2026-09-01' }]), [goal], today) === null);
check('plan: impossible date is dropped', C.cleanPlan(raw([{ ...add, date: '2026-02-31' }]), [goal], today) === null);
check('plan: a milestone already done is not touched', C.cleanPlan(raw([{ action: 'remove', milestoneId: 'm1' }]), [goal], today) === null);
check('plan: only the valid changes remain', C.cleanPlan(raw([move, { ...add, date: '2030-01-01' }]), [goal], today)?.changes.length === 1);
check('plan: unknown action is dropped', C.cleanPlan(raw([{ action: 'delete-all', milestoneId: 'm2' }]), [goal], today) === null);

const next = C.applyPlan(goal, p1.changes, today);
check('apply: result is a clean goal', next && next.milestones.length === 4); // 4 - 1 removed + 1 added
check('apply: moved date is saved', next.milestones.find((m) => m.id === 'm2').date === '2026-11-29');
check('apply: removed milestone is gone', !next.milestones.some((m) => m.id === 'm3'));
check('apply: added milestone is inside the time frame', next.milestones.some((m) => m.title === 'Check-in' && m.date === '2026-11-01'));
check('apply: milestones stay sorted by date', next.milestones.every((m, i) => i === 0 || next.milestones[i - 1].date <= m.date));
check('apply: the goal itself is unchanged', goal.milestones.length === 4 && goal.milestones[1].date === '2026-11-15');
check('apply: refused when the goal changed meanwhile (milestone missing)', C.applyPlan({ ...goal, milestones: goal.milestones.filter((m) => m.id !== 'm2') }, p1.changes, today) === null);
check('apply: refused when the end date moved before the new date', C.applyPlan({ ...goal, endDate: '2026-11-20' }, [{ action: 'move', milestoneId: 'm2', date: '2026-11-29' }], today) === null);
check('apply: refused for an empty list', C.applyPlan(goal, [], today) === null);
const many = { ...goal, milestones: Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, date: '2026-11-20', title: `t${i}`, target: 10 + i, status: 'open' })) };
check('apply: more than 12 milestones is refused', C.applyPlan(many, [add], today) === null);
check('plan: additions beyond 12 are dropped', C.cleanPlan(raw([add, { ...add, title: 'b' }]), [many], today) === null);

// ---- the whole answer ----
const ok = C.normalizeCoach({ message: '  Hello  ', suggestedSession: { topicId: 'w:essen', questions: 20 }, planChanges: raw([move]), quickReplies: ['a', 'a', 'b', 'c', 'd'] }, { topics, goals: [goal], today });
check('answer: cleaned', ok && ok.message === 'Hello' && ok.suggestedSession && ok.planChanges && ok.quickReplies.length === 3);
check('answer: no message = no answer', C.normalizeCoach({ message: '  ' }, { topics, goals: [goal], today }) === null);
check('answer: not an object', C.normalizeCoach('hi', { topics, goals: [goal], today }) === null);
check('answer: bad suggestion and plan become null', (() => {
  const r = C.normalizeCoach({ message: 'x', suggestedSession: { topicId: 'q' }, planChanges: 'x', quickReplies: 'x' }, { topics, goals: [goal], today });
  return r.suggestedSession === null && r.planChanges === null && r.quickReplies.length === 0;
})());

// ---- saved messages ----
const msgs = C.cleanStoredMessages([
  { id: 'a1', role: 'student', text: 'hi', at: 1 },
  { id: 'a2', role: 'coach', text: 'yo', at: 2, plan: { goalId: 'g1', changes: p1.changes, status: 'applied' }, suggestion: { topicId: 'w:essen' }, quick: ['x'] },
  { id: 'a2', role: 'coach', text: 'dup', at: 3 },
  { id: 'bad id!', role: 'coach', text: 'x' },
  { id: 'a3', role: 'robot', text: 'x' },
  { id: 'a4', role: 'coach', text: '' },
  'junk', null,
]);
check('stored: keeps the good ones, drops duplicates, bad ids, roles and empty texts', msgs.length === 2);
check('stored: plan status survives', msgs[1].plan.status === 'applied' && msgs[1].plan.changes.length === 3);
const lots = C.cleanStoredMessages(Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, role: 'student', text: 'x', at: i + 1 })));
check('stored: only the last 30', lots.length === 30 && lots[0].id === 'm50');
check('model turns: coach = model, student = user', JSON.stringify(C.turnsForModel(msgs).map((m) => m.role)) === '["user","model"]');

// ---- mock coach ----
const home = {
  goals: [goal],
  progress: { g1: 10 },
  tiles: { sessions: 3, answered: 40, correct: 25, pctRight: 63, learnt: 5, wordsTotal: 800 },
  strengths: [],
  gaps: [{ kind: 'rule', label: 'Genitiv nach wegen', n: 6, pct: 33, goalId: 'g1' }],
};
const g = M.mockCoach({ text: '', kind: 'greeting', name: 'Anna', home, topics, today });
const gn = C.normalizeCoach(g, { topics, goals: [goal], today });
check('mock greeting: names the real gap and suggests a session', gn && gn.message.includes('Genitiv nach wegen') && gn.suggestedSession && gn.suggestedSession.grammar.includes('genitiv'));
const r = M.mockCoach({ text: 'I only have 30 minutes a day, redo my plan', kind: 'chat', name: 'Anna', home, topics, today });
const rn = C.normalizeCoach(r, { topics, goals: [goal], today });
check('mock re-plan: a valid plan change that can be applied', rn?.planChanges && C.applyPlan(goal, rn.planChanges.changes, today));
const none = M.mockCoach({ text: 'redo my plan', kind: 'chat', name: 'A', home: { ...home, goals: [], progress: {}, gaps: [] }, topics, today });
check('mock re-plan without a goal: no plan change', C.normalizeCoach(none, { topics, goals: [], today }).planChanges === null);
const empty = M.mockCoach({ text: '', kind: 'greeting', name: 'A', home: { ...home, goals: [], progress: {}, gaps: [], tiles: { ...home.tiles, answered: 0 } }, topics, today });
check('mock greeting without data still suggests a session', C.normalizeCoach(empty, { topics, goals: [], today }).suggestedSession !== null);

// ---- prompt ----
const ctx = P.coachContext({ home, topics, today });
check('context: today, goal ids, milestone ids and the gap', ctx.includes('TODAY: 2026-10-19 (Monday)') && ctx.includes('id g1') && ctx.includes('milestone id m2') && ctx.includes('Genitiv nach wegen'));
check('context: no free-practice topic in the catalog', !ctx.includes('\nfree |'));
check('schema: the four answer fields', ['message', 'suggestedSession', 'planChanges', 'quickReplies'].every((k) => P.COACH_SCHEMA.properties[k]));
check('today: a date far from the server day is ignored', P.pickToday('2020-01-01', '2026-10-19') === '2026-10-19' && P.pickToday('2026-10-20', '2026-10-19') === '2026-10-20');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll coach checks passed.');
process.exit(failed ? 1 : 0);
