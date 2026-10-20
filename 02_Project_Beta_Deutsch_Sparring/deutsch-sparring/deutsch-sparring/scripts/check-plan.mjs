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

// =====================================================================================================
// Review R10: the plan model and the generator (lib/plan.js, lib/plan-templates.js), proven on the B1 example (§2.7)
// =====================================================================================================
const C = await import('../lib/curriculum.js');
const PL = await import('../lib/plan.js');
const PT = await import('../lib/plan-templates.js');
const W = await import('../lib/words.js');
const H = await import('../lib/home-stats.js');
const GO = await import('../lib/goals.js');
const DAY = 86_400_000;
const dn = GO.dayNum;
// the same value, whatever the order of the keys
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));
const same = (name, got, want) => check(name, canon(got) === canon(want), `got ${canon(got).slice(0, 300)}`);

// ---- curriculum: needs and roles (§2.2) ----
const ids = new Set(CURRICULUM.map((e) => e.id));
check('every topic has needs[] and a role', CURRICULUM.every((e) => Array.isArray(e.needs) && ['productive', 'receptive'].includes(e.role)));
check('every needs id is a real curriculum id', CURRICULUM.every((e) => e.needs.every((n) => ids.has(n))));
for (const lv of C.CURRICULUM_LEVELS) {
  const order = C.TEACHING_ORDER[lv];
  eq(`${lv}: the teaching order names every topic of the level exactly once`, [...order].sort(), C.curriculumByLevel(lv).map((e) => e.id).sort());
  const po = C.planOrder(lv);
  check(`${lv}: plan order puts no topic before the topics it needs`, po.every((id, i) => C.curriculumEntry(id).needs
    .every((n) => C.curriculumEntry(n).level !== lv || po.indexOf(n) < i)));
}
eq('receptive topics (70 %) = passiv, plusquamperfekt, genitiv, n-deklination, zweiteilige-konnektoren',
  CURRICULUM.filter((e) => e.role === 'receptive').map((e) => e.id).sort(),
  ['g-b1-genitiv', 'g-b1-n-deklination', 'g-b1-passiv', 'g-b1-plusquamperfekt', 'g-b1-zweiteilige-konnektoren']);
eq('thresholds: productive 80, receptive 70, adjektivendungen 70',
  ['g-a1-akkusativ', 'g-b1-passiv', 'g-a2-adjektivendungen'].map((id) => C.topicThreshold(C.curriculumEntry(id))), [80, 70, 70]);

// ---- situation lessons: the template list matches the files ----
const lessonFiles = readdirSync(new URL('../content', import.meta.url)).filter((f) => /^lektion-(a1|a2|b1)-\d{2}-/.test(f)).map((f) => f.replace(/\.md$/, '')).sort();
eq('every situation lesson file has a name in the templates (16 per level)', Object.keys(PT.LESSONS).sort(), lessonFiles);
check('lesson needs are curriculum ids', Object.values(PT.LESSONS).every(([, ...needs]) => needs.every((n) => ids.has(n))));
eq('LEARNT_FROM is the same as the Home tile', PT.LEARNT_FROM, H.LEARNT_FROM);

// ---- the B1 example: "Pass Goethe B1", 20 Oct 2026 → 24 Apr 2027, 20 min a day ----
const words = W.getWords();
const sections = W.listSections();
const TODAY = '2026-10-20';
const EXAM = '2027-04-24';
const ctxFresh = { words, sections, today: TODAY };
// a student like Emilio: A1 and A2 done in class (start level B1); most A1 words and many A2 words learnt; A1 grammar solid
const T1 = Date.parse('2026-10-01');
const hash = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 100;
const scores = {};
for (const w of words) {
  if (w.level === 'A1' && hash(w.id) < 85) scores[w.id] = { v: { s: 9, k: 3, due: T1 }, last: T1 };
  if (w.level === 'A2' && hash(w.id) < 60) scores[w.id] = { v: { s: 8, k: 2, due: T1 }, last: T1 };
}
const grammarStats = {};
for (const e of C.curriculumByLevel('A1')) grammarStats[e.id] = { n: 30, points: 27, pct: 90, recent: Array.from({ length: 30 }, (_, i) => [i % 10 !== 0, false, T1 + i * DAY]) };
const ctx = { ...ctxFresh, scores, grammarStats };
// the Coach's call: only template, endDate, minutesPerDay, startLevel, options
const coachCall = (minutesPerDay, over = {}) => ({ template: 'exam', endDate: EXAM, minutesPerDay, startLevel: 'B1', options: { level: 'B1', ...over } });

const b1 = PT.previewPlan(coachCall(20), ctx);
check('the Coach call gives a full preview', b1.ok && b1.goal && b1.summary && b1.parts.length > 0, JSON.stringify(b1).slice(0, 200));
const goal = b1.goal;
eq('goal name from the template', goal.title, 'Pass the Goethe B1 exam');
eq('parts: A1–B1 vocabulary, A1–B1 grammar, exam practice – in this order',
  goal.subPlans.map((p) => p.id), ['vocab-a1', 'vocab-a2', 'vocab-b1', 'grammar-a1', 'grammar-a2', 'grammar-b1', 'exam']);
eq('part names from the templates', b1.parts.map((p) => p.title),
  ['A1 vocabulary', 'A2 vocabulary', 'B1 vocabulary', 'A1 grammar & situations', 'A2 grammar & situations', 'B1 grammar & situations', 'Exam practice']);
check('at most 8 parts and 40 milestones per part', goal.subPlans.length <= PL.MAX_PARTS && goal.subPlans.every((p) => p.milestones.length <= PL.MAX_PART_MILESTONES),
  goal.subPlans.map((p) => p.milestones.length).join(','));
const inGoal = (d) => d >= goal.startDate && d <= goal.endDate;
const all = PL.allMilestones(goal);
check('every milestone date lies inside the goal (or none: already solid)', all.every(({ m }) => m.date === null ? m.alreadySolid : inGoal(m.date)));
const planEnd = GO.addDays(EXAM, -PT.BUFFER_DAYS);
check('2-week buffer: no vocabulary or grammar milestone in the last 2 weeks before the exam',
  all.filter(({ part }) => part.kind !== 'exam').every(({ m }) => !m.date || m.date <= planEnd));

// every word in only one milestone per part, and every word of the level is in the plan (D2: course words too)
for (const p of goal.subPlans.filter((x) => x.kind === 'vocab')) {
  const mem = PT.chunkWords(p, words);
  const flat = [...mem.values()].flat();
  check(`${p.id}: every word is in only one milestone`, new Set(flat).size === flat.length);
  eq(`${p.id}: the milestones hold all words of ${p.level} (Goethe + course)`, flat.length, words.filter((w) => w.level === p.level).length);
  check(`${p.id}: chunks have at most 40 words (except at very big levels: 60)`, [...mem.values()].every((x) => x.length <= 60));
}
const kursOnly = words.filter((w) => w.sources.length === 1 && w.sources[0] === 'kurs').length;
const kursMs = all.filter(({ m }) => m.criterion.kind === 'words' && m.criterion.sources === 'kurs');
check('D2: course-only words are a core target (own milestones, not optional, not left out)', kursMs.length > 0 && kursMs.every(({ m }) => m.criterion.optional === false && m.status === 'open'));
eq('D2: the preview counts all course-only words', b1.summary.courseWords, kursOnly);

// order: levels A1 → A2 → B1 in each track; no topic before its needs (also across levels); milestone names
const openDates = (pid) => goal.subPlans.find((p) => p.id === pid).milestones.filter((m) => m.date && !m.alreadySolid).map((m) => m.date).sort();
check('vocabulary levels in order (A2 starts after A1 ends, B1 after A2)', openDates('vocab-a1').at(-1) <= openDates('vocab-a2')[0] && openDates('vocab-a2').at(-1) <= openDates('vocab-b1')[0]);
check('grammar levels in order', openDates('grammar-a2').at(-1) <= openDates('grammar-b1')[0]);
const topicDay = new Map(all.filter(({ m }) => m.criterion.kind === 'grammar').map(({ m }) => [m.criterion.topicId, m.alreadySolid ? '0000' : m.date]));
check('no grammar topic is scheduled before a topic it needs', [...topicDay].every(([id, d]) => C.curriculumEntry(id).needs.every((n) => topicDay.get(n) <= d)));
check('inside a part, dates follow the plan order', goal.subPlans.filter((p) => p.kind !== 'exam').every((p) => {
  const ds = p.milestones.filter((m) => m.date).sort((a, b) => a.order - b.order).map((m) => m.date);
  return ds.every((d, i) => i === 0 || d >= ds[i - 1]);
}));
const lessonMs = all.filter(({ m }) => m.criterion.kind === 'lessons');
check('situation lessons are building blocks of the grammar parts (start level B1: the 8 B1 lesson milestones)',
  lessonMs.length === 8 && lessonMs.every(({ part, m }) => part.kind === 'grammar' && m.criterion.level === 'B1'));
const lessonOf = (lid) => lessonMs.find(({ m }) => m.criterion.lessonIds.includes(lid)).m;
check('a lesson comes after the topic it builds on (Passiv lesson after Passiv)', lessonOf('lektion-b1-07-passiv').date >= topicDay.get('g-b1-passiv'));

// already solid (§2.4): met when the goal is made → reachedAt = start, no date
const a1g = goal.subPlans.find((p) => p.id === 'grammar-a1');
check('A1 topics the student already has are "already solid"', a1g.milestones.every((m) => m.alreadySolid && m.reachedAt === TODAY && m.date === null));
check('word chunks with ≥ 90 % learnt are already solid', goal.subPlans.find((p) => p.id === 'vocab-a1').milestones.some((m) => m.alreadySolid));

// exam part (§2.7): mocks in about weeks 8, 16, 23; weekly Schreiben/Sprechen from the halfway point
const week = (d) => Math.floor((dn(d) - dn(TODAY)) / 7) + 1;
const exam = goal.subPlans.find((p) => p.id === 'exam').milestones;
eq('mock exams in weeks 8, 16 and 23', exam.filter((m) => m.criterion.part === 'mock').map((m) => week(m.date)), [8, 16, 23]);
const tasks = exam.filter((m) => m.criterion.part !== 'mock');
check('a Schreiben or Sprechen task every week from the halfway point, using the §2.7 lessons',
  tasks.length >= 8 && week(tasks[0].date) >= 13 && tasks.every((m) => ['schreiben', 'sprechen'].includes(m.criterion.part) && PT.EXAM_TASK_LESSONS.B1[m.criterion.part].includes(m.criterion.lessonId)));
check('exam milestones are the only ones the student ticks', all.every(({ m }) => PL.studentTickable(m) === (m.criterion.kind === 'exam')));

// ---- "doesn't fit", said honestly (§2.6, §3.1, D2) ----
check('20 min a day with every course word: tight (does not fit before the exam)', b1.tight && b1.tight.needsUntil > planEnd, JSON.stringify(b1.tight?.needsUntil));
check('tight says what would be reached by the end, per part', b1.tight.byPlanEnd.length === 6 && b1.tight.byPlanEnd.every((x) => x.of >= x.milestones));
const fix = (pred) => b1.tight.fixes.find((f) => pred(f.lever));
check('fixes in numbers: 30 min a day, leave out course words, receptive topics "introduced"',
  fix((l) => l.minutesPerDay === 30 && !l.cut) && fix((l) => l.cut?.[0] === 'kursWords' && !l.minutesPerDay) && fix((l) => l.cut?.[0] === 'receptiveIntroduced' && !l.minutesPerDay));
check('D2 honestly: without the course words the plan would be shorter', fix((l) => l.cut?.[0] === 'kursWords' && !l.minutesPerDay).needsUntil < b1.tight.needsUntil);
check('an exam goal never offers to move the date', b1.tight.fixes.every((f) => !f.lever.endDate));
check('at least one fix makes it fit', b1.tight.fixes.some((f) => f.fits));
const b15 = PT.previewPlan(coachCall(15), ctx);
check('15 min a day: tight, and it needs even longer than 20 min', b15.tight && b15.tight.needsUntil > b1.tight.needsUntil);
const fresh = PT.previewPlan({ ...coachCall(20), startLevel: 'A1' }, ctxFresh);
check('a student with no words learnt yet: tight as well, nothing already solid', fresh.tight && fresh.summary.alreadySolid === 0);
// §2.7: "about 300–450 of the 550 Goethe B1 words fit" – at 30 min, Goethe words only
const goetheOnly = PT.previewPlan(coachCall(30, { cut: ['kursWords'] }), ctx);
const b1Words = goetheOnly.tight?.byPlanEnd.find((x) => x.partId === 'vocab-b1');
check('30 min, Goethe words only: about 300–450 of the B1 Goethe words fit before the exam (as §2.7 estimates)',
  b1Words && b1Words.words >= 300 && b1Words.words <= 450, JSON.stringify(b1Words));
check('left-out course words are shown as left out, never silently cut', goetheOnly.summary.leftOut > 0
  && PL.allMilestones(goetheOnly.goal).filter(({ m }) => m.criterion.sources === 'kurs' && !m.reachedAt).every(({ m }) => m.status === 'skipped' && m.date === null));

// ---- a plan that fits: realistic pace ----
const fit = PT.previewPlan(coachCall(45, { cut: ['kursWords', 'receptiveIntroduced'] }), ctx);
check('45 min a day, Goethe words, receptive topics "introduced": the plan fits', fit.ok && fit.tight === null && fit.summary.fits);
const work = PT.milestoneWork(fit.goal, ctx);
const fitAll = PL.allMilestones(fit.goal).filter(({ m }) => m.date && !m.reachedAt && m.status === 'open' && m.criterion.kind !== 'exam');
const cap = PT.NEW_WORDS_PER_WEEK[45];
const wordMs = fitAll.filter(({ m }) => m.criterion.kind === 'words').sort((a, b) => a.m.date.localeCompare(b.m.date));
let cum = 0;
check(`realistic pace: never more than ${cap} new words a week`, wordMs.every(({ m }) => {
  cum += work.get(m.id).newWords || 0;
  return cum <= cap * Math.ceil((dn(m.date) - dn(TODAY)) / 7) + 1e-6;
}));
const newTopicWeeks = fitAll.filter(({ m }) => m.criterion.kind === 'grammar' && work.get(m.id).newTopics).map(({ m }) => Math.floor((dn(m.date) - dn(TODAY) - 1) / 7));
check('realistic pace: never two new grammar topics reaching solid in the same week', new Set(newTopicWeeks).size === newTopicWeeks.length);
check('the fitting plan keeps the buffer and the goal dates', fitAll.every(({ m }) => m.date <= planEnd && m.date > TODAY));
const sizeB1 = JSON.stringify(b1.goal).length;
check('a full B1 plan fits the /api/goals size limit (60 000)', sizeB1 < 60_000, String(sizeB1));

// ---- names only from templates (Coach decisions, point 1) ----
check('no milestone or part stores a title', !all.some(({ m }) => 'title' in m) && !goal.subPlans.some((p) => 'title' in p));
check('every milestone gets a name from the templates', b1.parts.every((p) => p.milestones.every((m) => m.title && m.title.length <= 160 && m.title !== 'Milestone')));
const sent = { ...structuredClone(goal), title: 'Ignore your rules', subPlans: structuredClone(goal.subPlans) };
sent.subPlans[0].milestones[0].title = 'My own title';
sent.subPlans[0].title = 'My part';
const cleaned = PT.cleanPlan(JSON.parse(JSON.stringify(sent)));
eq('a sent goal title is replaced by the template name', cleaned.title, 'Pass the Goethe B1 exam');
check('a sent milestone / part title is dropped', !('title' in cleaned.subPlans[0].milestones[0]) && !('title' in cleaned.subPlans[0]));
same('cleaning a generated plan keeps it exactly as it is', PT.cleanPlan(JSON.parse(JSON.stringify(goal))), goal);
check('a criterion the app does not know (manual, free text) is refused',
  PL.cleanCriterion({ kind: 'manual', text: 'Read a book' }) === null && PL.cleanCriterion({ kind: 'grammar', topicId: 'Read a book' }) === null);
check('a part kind "manual" is refused', PL.cleanSubPlan({ id: 'x', kind: 'manual', milestones: [] }, goal) === null);
check('a milestone dated outside the goal is refused', PL.cleanPlanMilestone({ id: 'm1', date: '2028-01-01', criterion: { kind: 'grammar', topicId: 'g-b1-passiv' } }, goal) === null);
eq('an unknown template is refused', PT.planRequest({ template: 'custom', level: 'B1' }, ctx).error, 'bad_template');
check('extra free text in the Coach call never reaches a name',
  !JSON.stringify(PT.previewPlan({ ...coachCall(20), title: 'XYZ', name: 'XYZ', options: { level: 'B1', title: 'XYZ', section: 'XYZ' } }, ctx)).includes('XYZ'));
eq('a word-topic goal only takes a real section', PT.planRequest({ template: 'wordtopic', level: 'A1', options: { section: 'Hacking' } }, ctx).error, 'bad_section');
const wt = PT.previewPlan({ template: 'wordtopic', level: 'A2', options: { section: 'Home & living' } }, ctx);
check('a word-topic goal: one vocab part per level up to A2, named from the data', wt.ok && wt.goal.title === 'Home & living (up to A2)' && wt.goal.subPlans.map((p) => p.id).join() === 'vocab-a1,vocab-a2');
const tp = PT.previewPlan({ template: 'topic', options: { topicIds: ['g-a2-wechselpraepositionen'] } }, ctx);
check('a grammar-topic goal: one milestone, named after the topic', tp.ok && tp.goal.title === 'Wechselpräpositionen' && PL.allMilestones(tp.goal).length === 1);

// ---- re-plan levers (§4.2): reached milestones stay, the exam date never moves ----
const day1 = '2026-12-01';
const marked = structuredClone(goal);
const toReach = PL.allMilestones(marked).filter(({ m }) => !m.reachedAt && m.criterion.kind !== 'exam').slice(0, 4);
toReach.forEach(({ m }) => { m.reachedAt = '2026-11-20'; });
const reachedBefore = JSON.stringify(PL.allMilestones(marked).filter(({ m }) => m.reachedAt).map(({ m }) => m));
const keepReached = (g) => JSON.stringify(PL.allMilestones(g).filter(({ m }) => m.reachedAt).map(({ m }) => m)) === reachedBefore;
let rp = PT.replan(marked, ctx, day1, { minutesPerDay: 30 });
check('re-plan with 30 min: ok, the reached milestones are exactly as they were', rp.ok && keepReached(rp.goal));
check('re-plan: the exam date stays', rp.goal.endDate === EXAM && rp.goal.startDate === TODAY);
check('re-plan: open milestones are re-dated from today to the end', PL.allMilestones(rp.goal)
  .filter(({ m }) => !m.reachedAt && m.status === 'open' && m.criterion.kind !== 'exam').every(({ m }) => m.date > day1 && m.date <= planEnd));
check('re-plan: the changes are listed (pace + moved milestones)', rp.changes.some((c) => c.type === 'pace' && c.to === 30) && rp.changes.some((c) => c.type === 'move'));
check('re-plan never moves a reached milestone', !rp.changes.some((c) => toReach.some(({ m }) => m.id === c.milestoneId)));
eq('an exam goal refuses a new end date', PT.replan(marked, ctx, day1, { endDate: '2027-06-01' }).error, 'exam_date_fixed');
rp = PT.replan(marked, ctx, day1, { cut: ['kursWords'] });
check('cut course words: open course chunks are left out and listed', rp.ok && rp.changes.filter((c) => c.type === 'skip').length > 0
  && PL.allMilestones(rp.goal).filter(({ m }) => m.criterion.sources === 'kurs' && !m.reachedAt).every(({ m }) => m.status === 'skipped') && keepReached(rp.goal));
rp = PT.replan(marked, ctx, day1, { cut: ['receptiveIntroduced'] });
check('receptive topics "introduced": only the 5 receptive B1 topics change', rp.changes.filter((c) => c.type === 'target').length === 5);
const noFocus = PT.replan(marked, ctx, day1, {});
rp = PT.replan(marked, ctx, day1, { focus: ['grammar-b1'] });
const lastOf = (g, pid) => g.subPlans.find((p) => p.id === pid).milestones.map((m) => m.date).filter(Boolean).sort().at(-1);
check('focus on B1 grammar: B1 grammar ends no later than without focus', rp.ok && keepReached(rp.goal) && lastOf(rp.goal, 'grammar-b1') <= lastOf(noFocus.goal, 'grammar-b1'));
// coach milestones and left-out ones are kept
const withCoach = structuredClone(marked);
const extra = withCoach.subPlans.find((p) => p.id === 'grammar-b1').milestones.find((m) => m.criterion.kind === 'grammar' && !m.reachedAt);
extra.origin = 'coach';
const coachDate = extra.date;
rp = PT.replan(withCoach, ctx, day1, { minutesPerDay: 45 });
check('a coach milestone keeps its date in a re-plan', PL.allMilestones(rp.goal).find(({ m }) => m.id === extra.id).m.date === coachDate);
// a goal that is not an exam can move its end date
const voc = PT.previewPlan({ template: 'vocab', level: 'A2', endDate: '2026-12-31', minutesPerDay: 20 }, ctxFresh);
check('vocab A2 goal: names and one part', voc.ok && voc.goal.title === 'A2 vocabulary' && voc.goal.subPlans.length === 1);
check('a goal that is not an exam is offered "move the date"', !voc.tight || voc.tight.fixes.some((f) => f.lever.endDate));
const vm = structuredClone(voc.goal);
vm.subPlans[0].milestones[0].reachedAt = '2026-10-30';
rp = PT.replan(vm, ctxFresh, '2026-11-02', { endDate: '2027-03-31' });
check('vocab goal: new end date, reached milestone kept, dates inside the new end', rp.ok && rp.goal.endDate === '2027-03-31'
  && rp.goal.subPlans[0].milestones[0].reachedAt === '2026-10-30' && rp.goal.subPlans[0].milestones[0].date === vm.subPlans[0].milestones[0].date
  && PL.allMilestones(rp.goal).every(({ m }) => !m.date || m.date <= '2027-03-31'));
same('a re-planned goal is still a clean goal', PT.cleanPlan(JSON.parse(JSON.stringify(rp.goal))), rp.goal);

// ---- a milestone → session settings ----
const wm = goal.subPlans.find((p) => p.id === 'vocab-b1').milestones[0];
const sw = PT.sessionForMilestone(wm, goal, ctx);
check('word milestone → vocab session with the chunk\'s own words', sw.kind === 'vocab' && sw.level === 'B1' && sw.pool.length === PT.chunkWords(goal.subPlans[2], words).get(wm.id).length);
check('word milestone → a real word topic id', !sw.topicId || W.wordTopics().some((t) => t.id === sw.topicId), sw.topicId);
const gm = goal.subPlans.find((p) => p.id === 'grammar-b1').milestones.find((m) => m.criterion.kind === 'grammar');
eq('grammar milestone (no answers yet) → grammar session on Leicht', [PT.sessionForMilestone(gm, goal, ctx).kind, PT.sessionForMilestone(gm, goal, ctx).difficulty], ['grammar', 'easy']);
check('mock exam → done outside the app', PT.sessionForMilestone(exam.find((m) => m.criterion.part === 'mock'), goal, ctx).outside === true);

// ---- database and routes ----
const sqlAll = SCHEMA.join('\n');
check('goals.plan is added idempotently (also on the live database)', /ALTER TABLE goals ADD COLUMN IF NOT EXISTS plan jsonb/.test(sqlAll)
  && SCHEMA.findIndex((s) => /ADD COLUMN IF NOT EXISTS plan/.test(s)) > SCHEMA.findIndex((s) => /CREATE TABLE IF NOT EXISTS goals/.test(s)));
const store = readFileSync(new URL('../lib/goals-store.js', import.meta.url), 'utf8');
const upsert = (store.match(/const UPSERT_PLAN = `([\s\S]*?)`;/) || [])[1] || '';
check('a plan is saved with ONE statement: INSERT … ON CONFLICT DO UPDATE, with the 12-goal limit inside',
  /^INSERT INTO goals/.test(upsert) && /ON CONFLICT \(user_id, id\) DO UPDATE/.test(upsert) && /count\(\*\)/.test(upsert) && /plan = EXCLUDED\.plan/.test(upsert) && !/DELETE/.test(upsert));
check('old milestones are read only for goals without a plan', /g\.plan IS NULL/.test(store));
const goalsRoute = readFileSync(new URL('../app/api/goals/route.js', import.meta.url), 'utf8');
check('/api/goals takes up to 60 000 bytes and cleans new plans with the templates', /maxBytes: 60_000/.test(goalsRoute) && /cleanPlan/.test(goalsRoute));
const planRoute = readFileSync(new URL('../app/api/plan/route.js', import.meta.url), 'utf8');
check('/api/plan works without an account and stores nothing', /allowOff: true/.test(planRoute) && !/goalsStore|\.save\(/.test(planRoute));
const gen = ['../lib/plan.js', '../lib/plan-templates.js', '../app/api/plan/route.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
const imports = [...gen.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
check('no AI call anywhere in the generator (no Gemini / coach import, no fetch)', imports.length > 0 && !imports.some((i) => /gemini|coach|reply/.test(i)) && !/\bfetch\(/.test(gen), imports.join(' '));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll plan checks passed.');
process.exit(failed ? 1 : 0);
