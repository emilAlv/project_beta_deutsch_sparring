// Checks review R13 "Home": the zoom data (overview → part → milestone), Next up, "Practise this" (sessionForMilestone →
// setup form), ticking exam milestones, the zoom state kept across a reload. Plain node:
//   node scripts/check-home-plan.mjs
process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const PT = await import('../lib/plan-templates.js');
const PP = await import('../lib/plan-progress.js');
const HP = await import('../lib/home-plan.js');
const W = await import('../lib/words.js');
const SS = await import('../lib/session-settings.js');
const { readFileSync } = await import('node:fs');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const DAY = 86_400_000;
const TODAY = '2026-10-20';
const words = W.getWords();
const sections = W.listSections();
const ctx0 = { words, sections, today: TODAY, scores: {}, grammarStats: {} };
const built = PT.previewPlan({ template: 'exam', endDate: '2027-04-24', minutesPerDay: 20, startLevel: 'A1', options: { level: 'B1' } }, ctx0);
check('a plan to test with', built.ok && built.goal.subPlans.length > 3);
const goal = built.goal;
const compute = (g, over = {}) => PP.computePlans({ goals: [g], words, scores: {}, grammarStats: {}, today: TODAY, lastPractice: Date.parse(TODAY), ...over });
const { plans } = compute(goal);
const plan = plans[goal.id];

// ---- level 1: overview ----
const rows = HP.overviewRows([goal], plans, TODAY);
eq('overview: one row for the goal', rows.length, 1);
check('overview: every part is a segment with its milestone count', rows[0].parts.length === goal.subPlans.length
  && rows[0].parts.every((p, i) => p.total === goal.subPlans[i].milestones.filter((m) => m.status !== 'skipped').length));
check('overview: the Today marker counts the milestones planned by today, never more than the part has', rows[0].parts.every((p) => p.planned >= 0 && p.planned <= p.total));
check('overview: a fresh plan has nothing reached', rows[0].parts.every((p) => p.reached === 0));
check('old-style goals are not in the zoom', HP.overviewRows([{ id: 'x', version: 1, type: 'vocab' }], {}, TODAY).length === 0);

// ---- level 2: one part ----
const partId = goal.subPlans.find((p) => p.kind === 'grammar').id;
const pv = HP.partView(goal, partId, plan, TODAY);
check('part: lists its milestones in plan order with titles from the templates', pv.items.length === goal.subPlans.find((p) => p.id === partId).milestones.length
  && pv.items.every((i, k) => i.title === PT.milestoneTitle(i.m.criterion) && (k === 0 || pv.items[k - 1].m.order <= i.m.order)));
check('part: the first open milestone is "next", the ones after it "coming" with what they wait for', pv.items[0].state === 'next' && pv.items[1].state === 'coming' && pv.items[1].startsAfter === pv.items[0].title);
check('part: every milestone with a date shows it', pv.items.every((i) => i.date === i.m.date));

// ---- states (redesign §3.3) ----
const m0 = goal.subPlans.find((p) => p.id === partId).milestones[0];
const lateGoal = { ...goal, subPlans: goal.subPlans.map((p) => (p.id === partId ? { ...p, milestones: p.milestones.map((m, k) => (k === 0 ? { ...m, date: '2026-10-15' } : m)) } : p)) };
const lateView = HP.milestoneView(lateGoal, lateGoal.subPlans.find((p) => p.id === partId), lateGoal.subPlans.find((p) => p.id === partId).milestones[0], compute(lateGoal).plans[goal.id], TODAY);
eq('late: 5 days after its date', [lateView.state, lateView.daysLate], ['late', 5]);
const reachedGoal = PP.applyReached(goal, [m0.id], '2026-10-19');
const rView = HP.milestoneView(reachedGoal, reachedGoal.subPlans.find((p) => p.id === partId), reachedGoal.subPlans.find((p) => p.id === partId).milestones[0], compute(reachedGoal).plans[goal.id], TODAY);
eq('reached: keeps its date', [rView.state, rView.reachedAt], ['reached', '2026-10-19']);
const solidGoal = { ...goal, subPlans: goal.subPlans.map((p) => (p.id === partId ? { ...p, milestones: p.milestones.map((m, k) => (k === 0 ? { ...m, alreadySolid: true, reachedAt: '2026-10-20' } : m)) } : p)) };
eq('already solid', HP.partView(solidGoal, partId, compute(solidGoal).plans[goal.id], TODAY).items[0].state, 'solid');

// ---- level 3: one milestone ----
const wordPart = goal.subPlans.find((p) => p.kind === 'vocab' && p.milestones.some((m) => m.criterion.kind === 'words'));
const wm = wordPart.milestones.find((m) => m.criterion.kind === 'words');
const wInfo = plan.milestones[wm.id];
check('milestone: the missing words are ids that exist', wInfo.missingIds.length > 0 && wInfo.missingIds.every((id) => W.getWord(id)));
const gMs = goal.subPlans.find((p) => p.id === partId).milestones.find((m) => m.criterion.kind === 'grammar');
const topicId = gMs.criterion.topicId;
const T1 = Date.parse('2026-10-01');
const grammarStats = { [topicId]: { n: 25, points: 20, pct: 80, recent: Array.from({ length: 25 }, (_, i) => [i % 5 !== 0, false, T1 + i * 3_600_000]) } };
const extras = HP.homeExtras([goal], compute(goal, { grammarStats }).plans, TODAY, { grammarStats, wordLabel: (id) => W.getWord(id)?.de || id });
eq('milestone: the last 20 answers on the topic (not more)', extras.recent[topicId].length, 20);
check('milestone: missing words come with a readable label', Object.keys(extras.missing).length > 0 && Object.values(extras.missing).every((l) => typeof l === 'string' && l.length));
check('every open milestone you can practise has a session; mock exams do not', extras.sessions[wm.id] && !extras.sessions[wm.id].pool
  && !Object.keys(extras.sessions).some((id) => goal.subPlans.flatMap((p) => p.milestones).find((m) => m.id === id)?.criterion.part === 'mock'));

// ---- Practise this → sessionForMilestone → the setup form ----
const topics = W.wordTopics().concat([{ id: topicId, type: 'Grammatik' }, { id: 'lektion-a1-01-vorstellen', type: 'Grammatik' }]);
const spec = PT.sessionForMilestone(wm, goal, { words, grammarStats: {} });
const patch = HP.setupFromSession(spec, topics);
check('Practise this (words): kind, level, source and the word list fill the setup form', patch.kind === 'vocab' && patch.level === wm.criterion.level && patch.source === spec.source
  && (patch.section || patch.list || spec.topicId === null));
const form = SS.sanitizeSetup({ ...SS.DEFAULT_SETUP, ...patch });
eq('Practise this (words): the setup form is valid and stays free to change', [form.kind, form.level, form.questions], ['vocab', wm.criterion.level, 20]);
const gSpec = PT.sessionForMilestone(gMs, goal, { grammarStats: {} });
const gPatch = HP.setupFromSession(gSpec, topics);
eq('Practise this (grammar): the topic, Leicht for a topic with no answers yet', [gPatch.kind, gPatch.grammarTopic, gPatch.difficulty], ['grammar', topicId, 'easy']);
eq('Practise this (grammar, 16 of the last 20 right): Hard', PT.sessionForMilestone(gMs, goal, { grammarStats }).difficulty, 'hard');
check('a mock exam has no setup (done outside the app)', HP.setupFromSession(PT.sessionForMilestone(goal.subPlans.find((p) => p.kind === 'exam').milestones.find((m) => m.criterion.part === 'mock'), goal, {}), topics) === null);
check('a topic the app does not know gives no grammar prefill', HP.setupFromSession({ kind: 'grammar', topicId: 'nope', level: 'A1', questions: 20, difficulty: 'easy' }, topics) === null);

// ---- Next up ----
const nu = HP.nextUp([goal], plans, TODAY, { grammarStats: {} });
eq('Next up = the goal\'s next milestone (the Coach\'s recommendation)', nu.milestoneId, plan.nextMilestoneId);
check('Next up lists up to 3 other open milestones that can be practised, none twice', nu.others.length === 3 && new Set([nu.milestoneId, ...nu.others]).size === 4);
check('Next up skips mock exams (they cannot be practised in the app)', ![nu.milestoneId, ...nu.others].some((id) => goal.subPlans.flatMap((p) => p.milestones).find((m) => m.id === id)?.criterion.part === 'mock'));
eq('Next up: nothing when every goal is finished', HP.nextUp([goal], { [goal.id]: { ...plan, status: 'done' } }, TODAY), null);
const behindPlans = { [goal.id]: { ...plan, status: 'behind' } };
eq('Next up with a goal that is behind still gives the plan\'s next milestone', HP.nextUp([goal], behindPlans, TODAY, {}).milestoneId, plan.nextMilestoneId);

// ---- ticking exam milestones ----
const mock = goal.subPlans.find((p) => p.kind === 'exam').milestones.find((m) => m.criterion.part === 'mock');
const ticked = HP.tickExam(goal, mock.id, TODAY, { lesen: '72', hoeren: '', schreiben: 'abc', sprechen: 150 });
const tm = ticked.subPlans.flatMap((p) => p.milestones).find((m) => m.id === mock.id);
eq('ticking a mock exam sets the day and keeps only valid points', [tm.reachedAt, tm.result], [TODAY, { lesen: 72 }]);
eq('ticking is the only change', ticked.subPlans.flatMap((p) => p.milestones).filter((m) => m.reachedAt).length, 1);
eq('the student cannot tick a word milestone', HP.tickExam(goal, wm.id, TODAY), null);
eq('the student cannot tick a grammar milestone', HP.tickExam(goal, gMs.id, TODAY), null);
check('a ticked mock exam is stored cleanly by the server and shows as done with its points', (() => {
  const clean = PT.cleanPlan(ticked);
  const v = HP.milestoneView(clean, clean.subPlans.find((p) => p.kind === 'exam'), clean.subPlans.find((p) => p.kind === 'exam').milestones.find((m) => m.id === mock.id), compute(clean).plans[goal.id], TODAY);
  return v.state === 'done' && v.result.lesen === 72;
})());

// ---- the zoom state survives a reload ----
eq('zoom: overview stays overview', HP.cleanZoom({ level: 'overview' }, [goal]), { level: 'overview', goalId: null, partId: null, milestoneId: null });
eq('zoom: a part is kept', HP.cleanZoom({ level: 'part', goalId: goal.id, partId }, [goal]), { level: 'part', goalId: goal.id, partId, milestoneId: null });
eq('zoom: a milestone is kept', HP.cleanZoom({ level: 'milestone', goalId: goal.id, partId, milestoneId: gMs.id }, [goal]).milestoneId, gMs.id);
eq('zoom: a milestone that is gone falls back to its part', HP.cleanZoom({ level: 'milestone', goalId: goal.id, partId, milestoneId: 'zzz' }, [goal]).level, 'part');
eq('zoom: a goal that is gone (deleted) falls back to the overview', HP.cleanZoom({ level: 'part', goalId: 'gone', partId }, [goal]).level, 'overview');
eq('zoom: rubbish falls back to the overview', HP.cleanZoom('part', [goal]).level, 'overview');

// ---- strengths & gaps → milestones ----
const sec = wm.criterion.section;
const hitList = HP.milestoneForItem({ kind: 'list', label: `${sec}${PP.SEP}${(wm.criterion.lists || ['x'])[0]}` }, [goal]);
check('a word list in the plan is linked to its milestone', hitList && hitList.m.criterion.kind === 'words' && hitList.m.criterion.section === sec);
eq('a word list that is not in the plan', HP.milestoneForItem({ kind: 'list', label: `Nowhere${PP.SEP}Nothing` }, [goal]), null);
const rule = (await import('../lib/curriculum.js')).curriculumEntry(topicId).ruleNames[0];
check('a grammar rule in the plan is linked to its topic milestone', HP.milestoneForItem({ kind: 'rule', label: rule }, [goal])?.m.criterion.kind === 'grammar');

// ---- wiring (what the files must contain) ----
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const home = read('../components/Home.js');
const plan2 = read('../components/HomePlan.js');
const css = read('../app/globals.css');
check('Home keeps the zoom level in the browser and reads it back', /saveZoom/.test(home) && /loadZoom/.test(home) && /cleanZoom/.test(home));
check('zoom is keyboard friendly: buttons, breadcrumb nav, Escape, live announcement, focus on the heading',
  /<nav aria-label/.test(plan2) && /Escape/.test(plan2) && /aria-live="polite"/.test(plan2) && /headRef/.test(plan2) && !/<div[^>]*onClick/.test(plan2));
check('the Today marker is not amber any more', !/\.plan-today \{[^}]*amber/.test(css) && !/\.zoom-today \{[^}]*amber/.test(css));
check('no percentage is written on the new Home parts', !/ %/.test(plan2.replace(/\{[^}]*\}/g, '')) && !/pct\b/.test(plan2));
check('/api/goals can tick an exam milestone (PATCH)', /export const PATCH/.test(read('../app/api/goals/route.js')) && /tickExam/.test(read('../app/api/goals/route.js')));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll Home plan checks passed.');
process.exit(failed ? 1 : 0);
