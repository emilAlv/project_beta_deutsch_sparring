// Checks the coach (lib/coach.js, lib/coach-goal.js, lib/coach-mock.js): cleaning the model's answer, goals made through
// the Coach (proposeGoal → preview, names always from the templates), plan changes (rename / end date / time per day),
// converting an old goal, saved messages. Plain node:
//   node scripts/check-coach.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const C = await import('../lib/coach.js');
const G = await import('../lib/coach-goal.js');
const M = await import('../lib/coach-mock.js');
const P = await import('../lib/coach-prompt.js');
const T = await import('../lib/plan-templates.js');
const W = await import('../lib/words.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}

const today = '2026-10-19';
const ctx = { words: W.getWords(), sections: W.listSections(), today, scores: {}, grammarStats: {} };
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

// ---- a new goal through the Coach: proposeGoal → preview made by the app ----
const act = (proposeGoal, extra = {}) => G.goalActions({ message: 'x', proposeGoal }, { goals: [], ctx, today, lastUser: '', ...extra });
const exam = act({ template: 'exam', level: 'B1', endDate: '2027-04-30', minutesPerDay: 30, startLevel: 'A1' });
check('goal: a known template gives a preview', exam.goalProposal && exam.goalProposal.status === 'open' && exam.goalProposal.request.template === 'exam');
check('goal: the title comes from the template', exam.goalProposal?.preview.title === 'Pass the Goethe B1 exam');
check('goal: parts and first milestones are named by the app', exam.goalProposal.preview.parts.length >= 3 && exam.goalProposal.preview.parts.every((p) => p.title && p.first.length <= 3)
  && exam.goalProposal.preview.parts.some((p) => /vocabulary/.test(p.title)) && exam.goalProposal.preview.parts.some((p) => p.title === 'Exam practice'));
check('goal: an exam goal says how long before the exam it ends', exam.goalProposal.preview.bufferDays === 14);
check('goal: unknown template is refused (no card, a note)', (() => { const r = act({ template: 'build-my-own', level: 'B1' }); return r.goalProposal === null && !!r.note; })());
check('goal: "manual" / free text templates are refused too', act({ template: 'manual', level: 'B1' }).goalProposal === null && act({ template: 'Pass the exam', level: 'B1' }).goalProposal === null);
check('goal: unknown level is refused', act({ template: 'vocab', level: 'C2' }).goalProposal === null);
check('goal: an impossible end date is refused with a date note', (() => { const r = act({ template: 'exam', level: 'B1', endDate: '2026-10-25' }); return r.goalProposal === null && /end date/.test(r.note); })());
check('goal: a word list that does not exist is refused', act({ template: 'wordtopic', level: 'A1', options: { section: 'No such section' } }).goalProposal === null);
check('goal: an unknown grammar topic is refused', act({ template: 'topic', level: 'A2', options: { topicIds: ['g-nope'] } }).goalProposal === null);

// the model can send a title, a name, an id, a start date, parts or milestones: none of it is used
const sneaky = act({
  template: 'vocab', level: 'A2', endDate: '2027-01-31', title: 'HACKED GOAL', name: 'HACKED', id: 'evil', startDate: '2020-01-01',
  subPlans: [{ id: 'p', kind: 'vocab', milestones: [{ id: 'm', title: 'HACKED MILESTONE' }] }], milestones: [{ title: 'HACKED' }],
  options: { section: null, topicIds: [], title: 'HACKED' },
});
const sneakyJson = JSON.stringify(sneaky.goalProposal);
check('goal: a title, name, id, start date, part or milestone from the model is ignored', sneaky.goalProposal?.preview.title === 'A2 vocabulary' && !/HACKED/.test(sneakyJson)
  && sneaky.goalProposal.request.id !== 'evil' && sneaky.goalProposal.request.startDate !== '2020-01-01');
check('goal: the preview has no percent figures', !/ %|\d%/.test(sneakyJson.replace(/"[a-z]+":/g, '')));
check('goal: 12 goals is the limit', G.goalActions({ message: 'x', proposeGoal: { template: 'vocab', level: 'A1' } }, { goals: Array.from({ length: 12 }, (_, i) => ({ id: `g${i}` })), ctx, today, lastUser: '' }).goalProposal === null);

// "doesn't fit": the generator's fixes become buttons, each one re-runs the preview
const tight = act({ template: 'exam', level: 'B1', endDate: '2026-12-31', minutesPerDay: 15 });
const tp = tight.goalProposal;
check('doesn\'t fit: the preview says so, with fixes from the generator', tp && tp.preview.fits === false && tp.preview.tight && tp.preview.tight.fixes.length > 0 && tp.preview.tight.needsUntil > tp.request.endDate);
check('doesn\'t fit: an exam goal never offers to move the exam date', tp.preview.tight.fixes.every((f) => !f.lever.endDate));
const fixChoice = tp.preview.tight.fixes.find((f) => f.lever.minutesPerDay) || tp.preview.tight.fixes[0];
const again = G.applyFix(tp.request, fixChoice.lever, ctx);
check('doesn\'t fit: picking a fix previews the same goal again with that fix', again.ok && again.proposal.request.id === tp.request.id
  && (fixChoice.lever.minutesPerDay ? again.proposal.request.minutesPerDay === fixChoice.lever.minutesPerDay : true)
  && again.proposal.preview.title === tp.preview.title);
const cutFix = tp.preview.tight.fixes.find((f) => f.lever.cut);
check('doesn\'t fit: a fix that leaves something out is kept in the request', !cutFix || G.applyFix(tp.request, cutFix.lever, ctx).proposal.request.options.cut.length > 0);
check('doesn\'t fit: a made-up fix is cleaned (unknown minutes and cuts are dropped)', (() => {
  const r = G.applyFix(tp.request, { minutesPerDay: 999, cut: ['everything'], title: 'HACKED' }, ctx);
  return r.ok && r.proposal.request.minutesPerDay === tp.request.minutesPerDay && r.proposal.request.options.cut.length === 0;
})());
check('doesn\'t fit: a non-exam goal may offer a later end date', (() => {
  const v = act({ template: 'vocab', level: 'B1', endDate: '2026-11-30', minutesPerDay: 15 }).goalProposal;
  return v && !v.preview.fits && v.preview.tight.fixes.some((f) => f.lever.endDate);
})());

// Accept = the same request built again (this is what /api/plan does for { draft }) and saved after cleanPlan
const built = T.previewPlan(exam.goalProposal.request, ctx);
const savedGoal = built.ok && T.cleanPlan(built.goal);
check('accept: the request builds the goal, and it is clean', savedGoal && savedGoal.id === exam.goalProposal.request.id && savedGoal.title === 'Pass the Goethe B1 exam' && savedGoal.version === 2);
check('accept: titles can never be changed by what is sent', T.cleanPlan({ ...savedGoal, title: 'HACKED' }).title === 'Pass the Goethe B1 exam');

// ---- changes to a goal the student has: rename, end date, time per day ----
const vocab = T.previewPlan({ template: 'vocab', level: 'A2', endDate: '2027-03-31', minutesPerDay: 20 }, ctx);
const myGoal = T.cleanPlan(vocab.goal);
const examGoal = savedGoal;
const goals = [{ ...myGoal }, { ...examGoal }];
const change = (planChanges, lastUser = '') => G.goalActions({ message: 'x', planChanges }, { goals, ctx, today, lastUser });
const r1 = change({ goalId: myGoal.id, minutesPerDay: 30, endDate: '2027-05-31' });
check('change: a new daily time and end date show before → after', r1.planChanges && r1.planChanges.changes.some((c) => c.type === 'pace' && c.from === '20' && c.to === '30')
  && r1.planChanges.changes.some((c) => c.type === 'endDate' && c.from === '2027-03-31' && c.to === '2027-05-31'));
check('change: the new dates of milestones are listed (as many as fit)', r1.planChanges.changes.length <= C.MAX_CHANGES && (r1.planChanges.changes.some((c) => c.type === 'move') || r1.planChanges.more >= 0));
const typed = 'please call it My A2 plan';
const r2 = change({ goalId: myGoal.id, label: 'My A2 plan' }, typed);
check('rename: a name the student typed is accepted', r2.planChanges?.label === 'My A2 plan' && r2.planChanges.changes[0].type === 'rename' && r2.planChanges.changes[0].to === 'My A2 plan');
check('rename: a name the model made up is refused', change({ goalId: myGoal.id, label: 'Super Champion Plan' }, typed).planChanges === null);
check('rename: the renamed goal is a clean goal with that title (and the dates stay as they were)', (() => {
  const out = G.applyPlanChange(myGoal, ctx, today, { label: 'My A2 plan' });
  return out.ok && out.goal.title === 'My A2 plan' && out.goal.label === 'My A2 plan'
    && JSON.stringify(out.goal.subPlans) === JSON.stringify(myGoal.subPlans) && T.cleanPlan(out.goal).title === 'My A2 plan';
})());
check('rename: a name is cut at 40 characters', G.applyPlanChange(myGoal, ctx, today, { label: 'x'.repeat(80) }).goal.title.length === 40);
check('change: the exam date does not move', (() => { const r = change({ goalId: examGoal.id, endDate: '2027-06-30' }); return r.planChanges === null && /exam date/.test(r.note); })());
check('change: an unknown goal is refused', change({ goalId: 'nope', minutesPerDay: 30 }).planChanges === null);
check('change: an end date in the past is refused', change({ goalId: myGoal.id, endDate: '2026-01-01' }).planChanges === null);
check('change: nothing to change = no card', change({ goalId: myGoal.id }).planChanges === null);
check('change: an old-style goal is not changed this way', G.goalActions({ message: 'x', planChanges: { goalId: 'old', minutesPerDay: 30 } }, { goals: [{ id: 'old', type: 'exam', level: 'B1' }], ctx, today, lastUser: '' }).planChanges === null);
check('change: a reached milestone keeps its tick and date', (() => {
  const g = structuredClone(myGoal);
  const m = g.subPlans[0].milestones[0];
  m.reachedAt = '2026-10-10';
  m.date = '2026-10-12';
  const out = G.applyPlanChange(g, ctx, today, { levers: { minutesPerDay: 45 } });
  const m2 = out.goal.subPlans[0].milestones.find((x) => x.id === m.id);
  return out.ok && m2.reachedAt === '2026-10-10' && m2.date === '2026-10-12';
})());

// ---- converting an old goal ----
const old = {
  id: 'old1', type: 'exam', level: 'B1', title: 'Goethe B1', startDate: '2026-10-01', endDate: '2027-03-31',
  scope: { section: null, list: null, rules: [] },
  milestones: [
    { id: 'm1', date: '2026-10-15', title: 'Exam readiness 25 %', target: 25, status: 'done' },
    { id: 'm2', date: '2026-11-15', title: 'Half done, 50 %', target: 50, status: 'open' },
    { id: 'm3', date: '2027-03-31', title: 'My own step', target: 100, status: 'open' },
  ],
};
const up = T.upgradeGoal(old, ctx);
check('convert: an old exam goal becomes a new plan with the same id', up && up.goal.version === 2 && up.goal.id === 'old1' && up.goal.template === 'exam' && up.goal.level === 'B1');
check('convert: the title comes from the template, not from the old goal', up.goal.title === 'Pass the Goethe B1 exam');
check('convert: the old "% ready" milestones (and custom ones) are gone', !/%|readiness|Half done|My own step/.test(JSON.stringify(up.goal))
  && up.goal.subPlans.every((p) => p.milestones.every((m) => ['words', 'grammar', 'lessons', 'exam', 'placement', 'verbs'].includes(m.criterion.kind))));
check('convert: the converted goal passes the same cleaning as any saved plan', (() => { const c = T.cleanPlan(up.goal); return c && c.subPlans.length === up.goal.subPlans.length; })());
check('convert: the old end date is kept when it still works', up.goal.endDate === '2027-03-31');
const oldVocab = T.upgradeGoal({ id: 'o2', type: 'vocab', level: 'A2', title: 'Words', startDate: '2026-10-01', endDate: '2026-10-22', scope: { section: null, list: null, rules: [] }, milestones: [] }, ctx);
check('convert: an end date that is too close falls back to the template\'s own length', oldVocab && oldVocab.goal.title === 'A2 vocabulary' && oldVocab.goal.endDate > '2026-11-20');
const oldList = T.upgradeGoal({ id: 'o3', type: 'vocab', level: 'B1', title: 'x', startDate: '2026-10-01', endDate: '2027-02-01', scope: { section: ctx.sections[0].name, list: null, rules: [] }, milestones: [] }, ctx);
check('convert: a vocabulary goal with a word section becomes a word-list plan', oldList && oldList.goal.template === 'wordtopic' && oldList.goal.options.section === ctx.sections[0].name);
const oldGrammar = T.upgradeGoal({ id: 'o4', type: 'grammar', level: 'A2', title: 'x', startDate: '2026-10-01', endDate: '2027-02-01', scope: { section: null, list: null, rules: [] }, milestones: [] }, ctx);
check('convert: a grammar goal becomes a grammar plan', oldGrammar && oldGrammar.goal.template === 'grammar');
check('convert: nothing to convert for a goal that is a plan already, or for junk', T.upgradeGoal(up.goal, ctx) === null && T.upgradeGoal(null, ctx) === null && T.upgradeGoal({ type: 'exam', level: 'C2' }, ctx) === null);

// ---- the whole answer ----
const ok = C.normalizeCoach({ message: '  Hello  ', suggestedSession: { topicId: 'w:essen', questions: 20 }, quickReplies: ['a', 'a', 'b', 'c', 'd'] }, { topics, actions: exam });
check('answer: cleaned', ok && ok.message === 'Hello' && ok.suggestedSession && ok.goalProposal && ok.quickReplies.length === 3);
check('answer: no message = no answer', C.normalizeCoach({ message: '  ' }, { topics }) === null);
check('answer: not an object', C.normalizeCoach('hi', { topics }) === null);
check('answer: a note from a refused proposal is added to the message', C.normalizeCoach({ message: 'Ok' }, { topics, actions: { note: G.NOTES.default } }).message.includes(G.NOTES.default));
check('answer: bad suggestion becomes null, no card', (() => {
  const r = C.normalizeCoach({ message: 'x', suggestedSession: { topicId: 'q' }, planChanges: 'x', quickReplies: 'x' }, { topics });
  return r.suggestedSession === null && r.goalProposal === null && r.planChanges === null && r.quickReplies.length === 0;
})());

// ---- saved messages ----
const msgs = C.cleanStoredMessages([
  { id: 'a1', role: 'student', text: 'hi', at: 1 },
  { id: 'a2', role: 'coach', text: 'yo', at: 2, plan: r1.planChanges, proposal: { ...exam.goalProposal, status: 'accepted' }, suggestion: { topicId: 'w:essen' }, quick: ['x'] },
  { id: 'a2', role: 'coach', text: 'dup', at: 3 },
  { id: 'bad id!', role: 'coach', text: 'x' },
  { id: 'a3', role: 'robot', text: 'x' },
  { id: 'a4', role: 'coach', text: '' },
  { id: 'a5', role: 'coach', text: 'old', plan: { goalId: 'g1', status: 'open', changes: [{ action: 'add', title: 'Half', date: '2026-11-15', target: 50 }] } },
  { id: 'a6', role: 'coach', text: 'bad', proposal: { request: { template: 'hack', level: 'B1' }, preview: {}, status: 'open' } },
  'junk', null,
]);
check('stored: keeps the good ones, drops duplicates, bad ids, roles and empty texts', msgs.length === 4);
check('stored: card status survives', msgs[1].proposal.status === 'accepted' && msgs[1].plan.changes.length === r1.planChanges.changes.length);
check('stored: a proposal with an unknown template is dropped', !msgs[3].proposal);
check('stored: an old-format plan change is shown as replaced', msgs[2].plan?.legacy === true && msgs[2].plan.status === 'replaced');
check('stored: a title in a saved proposal is cut and cleaned', C.cleanProposal({ ...exam.goalProposal, preview: { ...exam.goalProposal.preview, title: 'x'.repeat(300) } }).preview.title.length === 80);
const lots = C.cleanStoredMessages(Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, role: 'student', text: 'x', at: i + 1 })));
check('stored: only the last 30', lots.length === 30 && lots[0].id === 'm50');
check('model turns: coach = model, student = user', JSON.stringify(C.turnsForModel(msgs).map((m) => m.role)) === '["user","model","model","model"]');
check('model turns: the coach sees what it proposed', /proposed goal: template exam, B1/.test(C.turnsForModel(msgs)[1].text) && /proposed for goal/.test(C.turnsForModel(msgs)[1].text));

// ---- mock coach (MOCK=1) ----
const mock = (text, home, history = []) => M.mockCoach({ text, kind: 'chat', name: 'Anna', home, topics, today, history });
const noGoals = { goals: [], progress: {}, tiles: { sessions: 0, answered: 0, correct: 0, pctRight: 0, learnt: 0, wordsTotal: 800 }, strengths: [], gaps: [], plans: {} };
const m1 = mock('Goethe B1 by December', noGoals);
check('mock: "Goethe B1 by December" proposes the exam template with the date', m1.proposeGoal?.template === 'exam' && m1.proposeGoal.level === 'B1' && m1.proposeGoal.endDate === '2026-12-31');
check('mock: "A1 vocabulary" proposes vocabulary', mock('A1 vocabulary', noGoals).proposeGoal?.template === 'vocab' && mock('A1 vocabulary', noGoals).proposeGoal.level === 'A1');
check('mock: "A2 grammar" proposes grammar', mock('A2 grammar', noGoals).proposeGoal?.template === 'grammar');
check('mock: "I want to set a new goal" asks what the goal is', (() => { const r = mock('I want to set a new goal.', noGoals); return !r.proposeGoal && /Goethe B1 by March/.test(r.message); })());
check('mock: a proposal through the real chain gives a preview', (() => {
  const r = G.goalActions(m1, { goals: [], ctx, today, lastUser: 'Goethe B1 by December' });
  return r.goalProposal && r.goalProposal.preview.title === 'Pass the Goethe B1 exam' && r.goalProposal.preview.fits === false;
})());
const followHistory = [{ role: 'user', text: 'Goethe B1 by December' }, { role: 'model', text: `ok\n[proposed goal: template exam, B1, until 2026-12-31, 20 min a day – waiting for the student]` }];
check('mock: "30 minutes a day" after a proposal changes that proposal', (() => { const r = mock('30 minutes a day instead', noGoals, followHistory); return r.proposeGoal?.minutesPerDay === 30 && r.proposeGoal.template === 'exam'; })());
const withGoals = { ...noGoals, goals: [{ ...myGoal }], progress: {}, plans: {} };
const mr = mock('rename my goal to My A2 plan', withGoals);
check('mock: rename → planChanges with the typed name', mr.planChanges?.goalId === myGoal.id && mr.planChanges.label === 'My A2 plan');
check('mock: rename goes through the real chain', G.goalActions(mr, { goals: [myGoal], ctx, today, lastUser: 'rename my goal to My A2 plan' }).planChanges?.label === 'My A2 plan');
const md = mock('move the end date to June', withGoals);
check('mock: a new end date → planChanges', md.planChanges?.endDate === '2027-06-30');
check('mock: without a goal, "change my plan" asks for a goal first', !mock('I only have 30 minutes a day', noGoals).planChanges);
const g = M.mockCoach({ text: '', kind: 'greeting', name: 'Anna', home: { ...noGoals, gaps: [{ kind: 'rule', label: 'Genitiv nach wegen', n: 6, pct: 33, goalId: null }], tiles: { ...noGoals.tiles, answered: 40, pctRight: 63 } }, topics, today });
const gn = C.normalizeCoach(g, { topics });
check('mock greeting: names the real gap and suggests a session', gn && gn.message.includes('Genitiv nach wegen') && gn.suggestedSession && gn.suggestedSession.grammar.includes('genitiv'));
check('mock greeting without a goal says how to make one', /Goethe B1 by March/.test(gn.message));
const empty = M.mockCoach({ text: '', kind: 'greeting', name: 'A', home: noGoals, topics, today });
check('mock greeting without data still suggests a session', C.normalizeCoach(empty, { topics }).suggestedSession !== null);

// ---- prompt ----
const home = { ...noGoals, goals: [myGoal, old], plans: {}, vocab: null, rules: [] };
const text = P.coachContext({ home, topics, today });
check('context: today, goal id, title and next milestones of a plan', text.includes('TODAY: 2026-10-19 (Monday)') && text.includes(`id ${myGoal.id}`) && text.includes('A2 vocabulary') && /next: "/.test(text));
check('context: an old goal is marked, and no percentage line about readiness', text.includes('old-style goal') && !/Exam readiness|% of the time used|progress \d+ %/.test(text));
check('context: no free-practice topic in the catalog', !text.includes('\nfree |'));
check('schema: proposeGoal and planChanges with fixed templates, no title field', ['message', 'suggestedSession', 'proposeGoal', 'planChanges', 'quickReplies'].every((k) => P.COACH_SCHEMA.properties[k])
  && !JSON.stringify(P.COACH_SCHEMA).includes('"title"') && P.COACH_SCHEMA.properties.proposeGoal.properties.template.enum.includes('exam') && !P.COACH_SCHEMA.properties.proposeGoal.properties.template.enum.includes('manual'));
check('today: a date far from the server day is ignored', P.pickToday('2020-01-01', '2026-10-19') === '2026-10-19' && P.pickToday('2026-10-20', '2026-10-19') === '2026-10-20');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll coach checks passed.');
process.exit(failed ? 1 : 0);
