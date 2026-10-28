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
  if (w.level === 'A1' && hash(w.id) < 85) scores[w.id] = { v: { s: 9, k: 3, due: T1 }, a: { s: 9, k: 3, due: T1 }, last: T1 };
  if (w.level === 'A2' && hash(w.id) < 60) scores[w.id] = { v: { s: 8, k: 2, due: T1 }, a: { s: 8, k: 2, due: T1 }, last: T1 };
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
check('vocabulary: A2 starts after A1 ends (lower levels stay in order)', openDates('vocab-a1').at(-1) <= openDates('vocab-a2')[0]);
// Emilio's decision "B1 words start early": B1 words share the weekly word time with the lower gaps (about 60/40)
check('B1 words start before all A1/A2 word milestones are done', openDates('vocab-b1')[0] < openDates('vocab-a2').at(-1), `${openDates('vocab-b1')[0]} vs ${openDates('vocab-a2').at(-1)}`);
check('lower-level gaps keep priority: A1/A2 words finish before B1 words do', openDates('vocab-a2').at(-1) <= openDates('vocab-b1').at(-1));
for (const [label, c, mins] of [['start level B1 (gaps in A1/A2)', ctx, 20], ['a fresh student (everything new)', ctxFresh, 45]]) {
  const call = { template: 'exam', endDate: c === ctx ? '2027-10-23' : '2028-10-20', minutesPerDay: mins, startLevel: c === ctx ? 'B1' : 'A1', options: { level: 'B1', cut: ['kursWords', 'receptiveIntroduced'] } };
  const pv = PT.previewPlan(call, c);
  if (c === ctxFresh) check('the fresh-student plan fits, so its weekly dates are real (not squeezed)', pv.ok && !pv.tight);
  const wk = PT.milestoneWork(pv.goal, c);
  const vms = PL.allMilestones(pv.goal).filter(({ m }) => m.criterion.kind === 'words' && m.date && !m.reachedAt && m.status === 'open').sort((a, b) => a.m.date.localeCompare(b.m.date));
  const lastLow = vms.filter(({ m }) => m.criterion.level !== 'B1').at(-1)?.m.date;
  const firstB1 = vms.find(({ m }) => m.criterion.level === 'B1')?.m.date;
  check(`${label}: B1 word milestones start before the last A1/A2 one`, !lastLow || (firstB1 && firstB1 < lastLow), `${firstB1} vs ${lastLow}`);
  const capW = PT.NEW_WORDS_PER_WEEK[mins] ?? mins;
  let sum = 0;
  check(`${label}: never more than ${capW} new words a week`, vms.every(({ m }) => {
    sum += wk.get(m.id).newWords || 0;
    return sum <= capW * Math.ceil((dn(m.date) - dn(TODAY)) / 7) + 1e-6;
  }));
}
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
// §2.7: "about 300–450 of the 550 Goethe B1 words fit" – at 30 min, Goethe words only. Lower bound 270 since the two class grammar topics (welcher/dieser, hin/her) took plan time (28 Oct 2026).
const goetheOnly = PT.previewPlan(coachCall(30, { cut: ['kursWords'] }), ctx);
const b1Words = goetheOnly.tight?.byPlanEnd.find((x) => x.partId === 'vocab-b1');
check('30 min, Goethe words only: about 270–450 of the B1 Goethe words fit before the exam (as §2.7 estimates)',
  b1Words && b1Words.words >= 270 && b1Words.words <= 450, JSON.stringify(b1Words));
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
check('no AI call anywhere in the generator (no Gemini / coach import, no fetch)', imports.length > 0 && !imports.some((i) => /gemini|reply|coach(?!-goal)/.test(i)) && !/\bfetch\(/.test(gen), imports.join(' '));

// ======================================================================================================
// R11: measuring and latching (lib/plan-progress.js)
// ======================================================================================================
{
const PP = await import('../lib/plan-progress.js');
const hasTpl = readFileSync(new URL('../lib/plan-templates.js', import.meta.url), 'utf8');
check('R11: the measuring rules live only in plan-progress.js (the generator imports them)',
  !/const (SOLID_ANSWERS|CHUNK_REACHED|LEARNT_FROM|INTRODUCED_PCT)\b/.test(hasTpl) && /from '\.\/plan-progress\.js'/.test(hasTpl) && PT.LEARNT_FROM === PP.LEARNT_FROM);

const NOW0 = Date.parse('2026-11-10T12:00:00Z');
const T_DAY = '2026-11-10';
const run = (goals, over = {}) => PP.computePlans({ goals, words, scores: {}, grammarStats: {}, today: T_DAY, lastPractice: NOW0, ...over });
const freshWord = PT.previewPlan({ template: 'wordtopic', level: 'A1', endDate: '2027-03-01', minutesPerDay: 20, options: { section: 'Home & living' } }, { words, sections, today: T_DAY }).goal;
const vpart = freshWord.subPlans[0];
const wm1 = vpart.milestones[0];
const ids1 = PT.chunkWords(vpart, words).get(wm1.id);
const learntScores = (n, from = ids1) => Object.fromEntries(from.slice(0, n).map((id) => [id, { v: { s: 8, k: 2, due: NOW0 + 3 * DAY }, a: { s: 8, k: 2, due: NOW0 + 3 * DAY }, last: NOW0 }]));
const need90 = Math.ceil(0.9 * ids1.length);

// ---- words: reached at 90 % learnt ----
let r = run([freshWord], { scores: learntScores(need90 - 1) });
let ms = r.plans[freshWord.id].milestones[wm1.id];
eq(`words: ${need90 - 1} of ${ids1.length} learnt is not enough`, [ms.state, ms.have, ms.need, ms.total, ms.unit], ['open', need90 - 1, need90, ids1.length, 'words']);
check('words: not-learnt word ids are listed for the Coach', ms.missingIds.length > 0 && ms.missingIds.every((id) => ids1.includes(id)));
r = run([freshWord], { scores: learntScores(need90) });
ms = r.plans[freshWord.id].milestones[wm1.id];
eq(`words: ${need90} of ${ids1.length} (90 %) is reached`, [ms.state, ms.have, ms.reachedAt], ['reached', need90, T_DAY]);
eq('words: newlyReached names it once', r.newlyReached, { [freshWord.id]: [wm1.id] });
check('words: V = 7 is not learnt, V = 8 is', !PP.isLearnt({ v: { s: 7 } }) && PP.isLearnt({ v: { s: 8 } }));
check('words: an unscored word counts as not learnt', !PP.isLearnt(undefined));

// ---- latching: a reached milestone stays reached ----
const latched = PP.applyReached(freshWord, [wm1.id], '2026-11-10');
check('latching: reachedAt is set only where it was empty', PP.applyReached(latched, [wm1.id], '2026-12-24').subPlans[0].milestones[0].reachedAt === '2026-11-10');
same('latching: applying twice changes nothing', PP.applyReached(PP.applyReached(freshWord, [wm1.id], T_DAY), [wm1.id], T_DAY), latched);
check('latching: applyReached leaves the original untouched', !freshWord.subPlans[0].milestones[0].reachedAt);
r = run([latched], { scores: {}, today: '2026-12-01' }); // every score gone: it must stay reached
ms = r.plans[latched.id].milestones[wm1.id];
eq('latching: scores fall to nothing → still reached (with a refresh), reachedAt kept', [ms.state, ms.reachedAt], ['refresh', '2026-11-10']);
eq('latching: no newlyReached for a milestone that is reached already', r.newlyReached, {});
eq('latching: all words learnt → plain "reached", no refresh', run([latched], { scores: learntScores(ids1.length) }).plans[latched.id].milestones[wm1.id].state, 'reached');

// ---- "needs a refresh" (words): more than 20 % due or below 8 ----
const dueN = Math.floor(0.2 * ids1.length);
const dueScores = (n) => Object.fromEntries(ids1.map((id, i) => [id, { v: { s: 9, k: 3, due: i < n ? NOW0 - DAY : NOW0 + 9 * DAY }, a: { s: 9, k: 3, due: i < n ? NOW0 - DAY : NOW0 + 9 * DAY }, last: NOW0 }]));
eq(`refresh: ${dueN} of ${ids1.length} due (20 %) is still fine`, run([latched], { scores: dueScores(dueN) }).plans[latched.id].milestones[wm1.id].state, 'reached');
ms = run([latched], { scores: dueScores(dueN + 1) }).plans[latched.id].milestones[wm1.id];
eq(`refresh: ${dueN + 1} due (more than 20 %) → needs a refresh, tick stays`, [ms.state, ms.refresh?.due, ms.reachedAt], ['refresh', dueN + 1, '2026-11-10']);

// ---- grammar: solid ----
const tpF = PT.previewPlan({ template: 'topic', endDate: '2027-03-01', minutesPerDay: 20, options: { topicIds: ['g-a2-wechselpraepositionen'] } }, { words, sections, today: T_DAY }).goal;
const gm1 = PL.allMilestones(tpF)[0].m;
const rows = (n, rightCount, { days = 3, hinted = 0 } = {}) => Array.from({ length: n }, (_, i) => [i >= n - rightCount, i >= n - rightCount && i < n - rightCount + hinted, NOW0 - (days - 1 - (i % days)) * DAY]);
const pts = (recent) => recent.reduce((a, [ok, h]) => a + (ok ? (h ? 0.5 : 1) : 0), 0);
const stats = (recent) => ({ n: recent.length, points: pts(recent), pct: Math.round((pts(recent) / recent.length) * 100), recent });
const gState = (recent) => run([tpF], { grammarStats: { 'g-a2-wechselpraepositionen': stats(recent) } }).plans[tpF.id].milestones[gm1.id];
eq('grammar: threshold of a productive topic is 80 %', C.topicThreshold(C.curriculumEntry('g-a2-wechselpraepositionen')), 80);
ms = gState(rows(20, 16));
eq('grammar solid: 20 answers, 3 days, 16 of last 20 right', [ms.state, ms.have, ms.need, ms.total, ms.unit], ['reached', 16, 16, 20, 'answers']);
const need16 = ms.need;
eq('grammar: 15 of last 20 is not enough for solid (it is "introduced")', gState(rows(20, 15)).state, 'introduced');
eq('grammar: 19 answers (all right) is not enough for solid', gState(rows(19, 19)).state, 'introduced');
eq('grammar: all answers on ONE day is not enough', [gState(rows(20, 20, { days: 1 })).state, gState(rows(20, 20, { days: 1 })).detail.days], ['introduced', 1]);
eq('grammar: exactly 2 days is enough', gState(rows(20, 20, { days: 2 })).state, 'reached');
eq('grammar: only the LAST 20 count (40 answers, early ones wrong)', gState([...rows(20, 0), ...rows(20, 20)]).state, 'reached');
eq('grammar: old mastery does not count when the last 20 are bad', gState([...rows(20, 20), ...rows(20, 10)]).state, 'introduced');
eq('grammar: a hinted right answer counts half (8 hinted + 8 right = 12 points → not enough; 16 right incl. 0 hinted ok)', [gState(rows(20, 16, { hinted: 8 })).have, gState(rows(20, 16, { hinted: 8 })).state], [12, 'introduced']);
eq('grammar: 18 right with 4 hinted = 16 points → solid', gState(rows(20, 18, { hinted: 4 })).state, 'reached');
ms = gState(rows(12, 8));
eq('grammar introduced: 12 answers, 67 % → "introduced", not reached', [ms.state, ms.detail.n, ms.detail.pct, ms.reachedAt], ['introduced', 12, 67, null]);
eq('grammar: 9 answers is not yet introduced', gState(rows(9, 9)).state, 'open');
eq('grammar: 10 answers at 50 % is not introduced', gState(rows(10, 5)).state, 'open');
// receptive topic: 70 %
const passiv = PT.previewPlan({ template: 'topic', endDate: '2027-03-01', minutesPerDay: 20, options: { topicIds: ['g-b1-passiv'] } }, { words, sections, today: T_DAY }).goal;
const pm = PL.allMilestones(passiv)[0].m;
const pState = (recent) => run([passiv], { grammarStats: { 'g-b1-passiv': stats(recent) } }).plans[passiv.id].milestones[pm.id];
eq('grammar receptive: 14 of last 20 (70 %) is solid, 13 is not', [pState(rows(20, 14)).state, pState(rows(20, 13)).state], ['reached', 'introduced']);
eq('grammar receptive: needs 14, productive needs 16', [pState(rows(20, 14)).need, need16], [14, 16]);
eq('grammar: adjektivendungen uses 70 %', C.topicThreshold(C.curriculumEntry('g-a2-adjektivendungen')), 70);
const introG = structuredClone(tpF);
introG.subPlans[0].milestones[0].criterion.target = 'introduced';
ms = run([introG], { grammarStats: { 'g-a2-wechselpraepositionen': stats(rows(10, 7)) } }).plans[introG.id].milestones[gm1.id];
eq('grammar target "introduced": 10 answers at 70 % reaches it', [ms.state, ms.unit], ['reached', 'answers']);

// ---- grammar: needs a refresh, and never goes back ----
const gLatched = PP.applyReached(tpF, [gm1.id], '2026-11-01');
const gRun = (recent) => run([gLatched], { grammarStats: recent ? { 'g-a2-wechselpraepositionen': stats(recent) } : {} }).plans[gLatched.id].milestones[gm1.id];
ms = gRun([...rows(20, 20), ...rows(10, 6)]);
eq('refresh (grammar): last 10 answers at 60 % → needs a refresh, tick and date stay', [ms.state, ms.reachedAt, ms.refresh?.pct], ['refresh', '2026-11-01', 60]);
eq('refresh (grammar): last 10 at 70 % is fine', gRun([...rows(20, 20), ...rows(10, 7)]).state, 'reached');
eq('latching (grammar): no answers at all → still reached', gRun(null).state, 'reached');
eq('newlyReached (grammar): listed when solid for the first time, per goal',
  run([tpF, freshWord], { grammarStats: { 'g-a2-wechselpraepositionen': stats(rows(20, 18)) } }).newlyReached, { [tpF.id]: [gm1.id] });

// ---- skipped milestones are not measured and not counted ----
const skipG = structuredClone(freshWord);
skipG.subPlans[0].milestones[0].status = 'skipped';
r = run([skipG], { scores: learntScores(ids1.length) });
eq('skipped: not measured, not counted in the part', [r.plans[skipG.id].milestones[wm1.id].state, r.plans[skipG.id].parts[vpart.id].total, Object.keys(r.newlyReached).length],
  ['skipped', vpart.milestones.length - 1, 0]);

// ---- situation lessons and exam milestones ----
const openGoal = structuredClone(goal);
PL.allMilestones(openGoal).forEach(({ m }) => { m.reachedAt = null; m.alreadySolid = false; });
const lessonM = PL.allMilestones(openGoal).find(({ m }) => m.criterion.kind === 'lessons' && m.criterion.lessonIds.length > 1).m;
const lessonStats = (ids, n, pct) => Object.fromEntries(ids.map((id) => [id, { n, points: (n * pct) / 100, pct, recent: [] }]));
const lm = (gs) => run([openGoal], { grammarStats: gs }).plans[openGoal.id].milestones[lessonM.id];
const lids = lessonM.criterion.lessonIds;
eq('lessons: all lessons of the milestone with 10 answers at 60 % → reached', [lm(lessonStats(lids, 10, 60)).state, lm(lessonStats(lids, 10, 60)).unit], ['reached', 'lessons']);
eq('lessons: 9 answers → open; 10 answers at 50 % → open', [lm(lessonStats(lids, 9, 100)).state, lm(lessonStats(lids, 10, 50)).state], ['open', 'open']);
eq('lessons: only one of the lessons done → open, "1 of N"', [lm(lessonStats(lids.slice(0, 1), 10, 90)).state, lm(lessonStats(lids.slice(0, 1), 10, 90)).have, lm({}).need], ['open', 1, lids.length]);
const examM = PL.allMilestones(openGoal).find(({ m }) => m.criterion.kind === 'exam' && m.criterion.part === 'mock').m;
const allGood = {
  scores: Object.fromEntries(words.map((w) => [w.id, { v: { s: 10, k: 4, due: NOW0 + 99 * DAY }, a: { s: 10, k: 4, due: NOW0 + 99 * DAY }, last: NOW0 }])),
  grammarStats: Object.fromEntries([...C.CURRICULUM.map((e) => e.id), ...Object.keys(PT.LESSONS)].map((id) => [id, stats(rows(40, 40))])),
};
let big = run([openGoal], allGood);
eq('exam: never reached by the app, whatever the scores', big.plans[openGoal.id].milestones[examM.id].state, 'open');
const bp = big.plans[openGoal.id].parts;
check('exam: with perfect scores every word and grammar milestone is reached, the exam ones are not',
  bp.exam.reached === 0 && bp['vocab-b1'].reached === bp['vocab-b1'].total && bp['grammar-b1'].reached === bp['grammar-b1'].total && big.plans[openGoal.id].status === 'ontrack',
  JSON.stringify([bp.exam, bp['vocab-b1'], bp['grammar-b1']]));
const ticked = PP.applyReached(openGoal, [examM.id], '2026-11-05');
big = run([ticked]);
eq('exam: ticked by the student → reached, stays reached', [big.plans[ticked.id].milestones[examM.id].state, big.plans[ticked.id].milestones[examM.id].reachedAt, big.plans[ticked.id].parts.exam.reached], ['reached', '2026-11-05', 1]);
eq('exam: a tick is not "newly reached" (the student did it)', big.newlyReached, {});

// ---- parts, goal status (behind / ahead / done / ended) ----
const pace = structuredClone(PT.previewPlan({ template: 'vocab', level: 'A1', endDate: '2027-06-01', minutesPerDay: 20 }, { words, sections, today: T_DAY }).goal);
pace.id = 'pace1';
pace.subPlans = [pace.subPlans[0]];
pace.startDate = '2026-11-10';
pace.endDate = '2027-06-01';
pace.subPlans[0].milestones = pace.subPlans[0].milestones.slice(0, 4);
pace.subPlans[0].milestones.forEach((m, i) => { m.date = GO.addDays('2026-11-10', 21 * (i + 1)); m.order = i; });
const pid = pace.subPlans[0].id;
const dated = pace.subPlans[0].milestones;
const noon = (d) => Date.parse(`${d}T10:00:00Z`);
const st0 = (over = {}, g = pace) => run([g], over).plans[g.id];
let pl = st0();
eq('status: a new plan with nothing due is on track', [pl.status, pl.parts[pid].behindDays, pl.nextMilestoneId], ['ontrack', 0, dated[0].id]);
pl = st0({ today: GO.addDays(dated[0].date, 3), lastPractice: noon(GO.addDays(dated[0].date, 2)) });
eq('behind: an open milestone whose date has passed (3 days)', [pl.status, pl.parts[pid].behindDays], ['behind', 3]);
pl = st0({ today: GO.addDays(dated[0].date, 9), lastPractice: noon(GO.addDays(dated[0].date, 8)) });
eq('behind: more than a week behind the pace', [pl.status, pl.parts[pid].behindDays], ['behind', 9]);
eq('behind: 8 days without practice', st0({ today: '2026-11-18', lastPractice: noon('2026-11-10') }).status, 'behind');
eq('not behind: 6 days without practice', st0({ today: '2026-11-16', lastPractice: noon('2026-11-10') }).status, 'ontrack');
eq('behind: a plan that never saw practice for 7 days after its start', st0({ today: '2026-11-17', lastPractice: 0 }).status, 'behind');
// ahead: the first two milestones reached long before their dates (due on day 21 and day 42)
const ahead2 = PP.applyReached(pace, [dated[0].id, dated[1].id], '2026-11-10');
pl = st0({}, ahead2);
eq('ahead: two milestones reached, the second planned for day 42 (more than 2 weeks ahead)', [pl.status, pl.parts[pid].aheadDays], ['ahead', 42]);
const ahead1 = PP.applyReached(pace, [dated[0].id], '2026-11-10');
eq('ahead: one milestone reached, planned 21 days from now', [st0({}, ahead1).status, st0({}, ahead1).parts[pid].aheadDays], ['ahead', 21]);
eq('not ahead: planned for 14 days from now or less is on track', st0({ today: '2026-11-17', lastPractice: noon('2026-11-16') }, ahead1).status, 'ontrack');
const doneG = PP.applyReached(pace, dated.map((m) => m.id), '2026-12-01');
pl = st0({ today: '2026-12-02', lastPractice: noon('2026-12-01') }, doneG);
eq('done: every milestone of every part reached', [pl.status, pl.progressShare], ['done', 1]);
eq('ended: the end date has passed and it is not done', st0({ today: '2027-06-02', lastPractice: noon('2027-06-01') }).status, 'ended');
const paceIds = PT.chunkWords(pace.subPlans[0], words).get(dated[0].id);
pl = st0({ scores: learntScores(Math.ceil(0.9 * paceIds.length), paceIds) });
check('progressShare: weighted by work (one chunk of four)', pl.progressShare > 0 && pl.progressShare < 1 && pl.reached === 1 && pl.total === 4, String(pl.progressShare));
eq('nextMilestoneId skips what is reached', pl.nextMilestoneId, dated[1].id);
eq('the part says reached / total / next', [pl.parts[pid].reached, pl.parts[pid].total, pl.parts[pid].nextId], [1, 4, dated[1].id]);
const twoParts = structuredClone(openGoal);
const gp = twoParts.subPlans.find((p) => p.id === 'grammar-a1');
gp.milestones[0].date = GO.addDays(twoParts.startDate, 5);
pl = run([twoParts], { today: GO.addDays(twoParts.startDate, 15), lastPractice: noon(GO.addDays(twoParts.startDate, 14)) }).plans[twoParts.id];
const worstPart = Object.values(pl.parts).sort((a, b) => b.behindDays - a.behindDays)[0];
check('nextMilestoneId comes from the part that is most behind', worstPart.behindDays > 0 && pl.nextMilestoneId === worstPart.nextId, JSON.stringify(pl.parts));

// ---- old goals and junk are ignored; output is plain JSON ----
eq('old-style goals (no plan) are ignored', run([{ id: 'old', type: 'vocab', milestones: [] }, null, {}]), { plans: {}, newlyReached: {} });
check('plans survive JSON (they go to the browser as JSON)', JSON.stringify(JSON.parse(JSON.stringify(big))) === JSON.stringify(big));
const t0 = Date.now();
run([goal, goal, goal], allGood);
check('speed: three full B1 plans measured in under 1 s', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);

// ---- latching in the database and the routes ----
const mark = (store.match(/const MARK_REACHED = `([\s\S]*?)`;/) || [])[1] || '';
check('markReached is ONE UPDATE that sets reachedAt only where it is empty, for one student\'s goal',
  /^UPDATE goals SET plan = jsonb_set/.test(mark) && /reachedAt'\) IS NULL/.test(mark) && /user_id = \$1/.test(mark) && /id = \$2/.test(mark) && !/DELETE|DROP/.test(mark));
check('markReached leaves old goals (no plan) alone', /jsonb_typeof\(plan->'subPlans'\) = 'array'/.test(mark));
const homeData = readFileSync(new URL('../lib/home-data.js', import.meta.url), 'utf8');
check('/api/stats (homeData) returns plans and newlyReached, and saves them with an account', /plans, newlyReached/.test(homeData) && /markReached\(user\.id/.test(homeData));
const homeClient = readFileSync(new URL('../lib/home-client.js', import.meta.url), 'utf8');
check('without an account the browser saves newlyReached itself (home-client → markReachedLocal)', /markReachedLocal\(data\.newlyReached/.test(homeClient));
const statsRoute = readFileSync(new URL('../app/api/stats/route.js', import.meta.url), 'utf8');
check('/api/stats goes through homeData (GET with an account, POST without)', /homeData/.test(statsRoute));

// ---- R12: converting old goals, goals through the Coach ----
check('homeData offers the new plan for each old goal (upgrades), and saves nothing itself', /upgradesFor\(goals/.test(homeData) && /upgradeGoal\(g, ctx\)/.test(homeData) && !/save\(/.test(homeData));
check('saving a plan deletes the old "% ready" milestone rows of that goal (in the same transaction)', /DELETE FROM milestones WHERE user_id = \$1::uuid AND goal_id = \$2::text/.test(store) && store.indexOf('UPSERT_PLAN, [') < store.indexOf('DELETE_MILESTONES, [') && /transaction/.test(store));
check('browser-only storage accepts new plans (cleaned like the server does)', /cleanPlanGoal\(goal\)/.test(readFileSync(new URL('../lib/storage.js', import.meta.url), 'utf8')));
check('there is no goal form any more', !readdirSync(new URL('../components/', import.meta.url)).includes('GoalForm.js'));
{
  const ctx12 = { words: W.getWords(), sections: W.listSections(), today: '2026-10-20', scores: {}, grammarStats: {} };
  const oldGoal = { id: 'old9', type: 'grammar', level: 'A2', title: 'Grammar', startDate: '2026-10-01', endDate: '2027-02-01', scope: { section: null, list: null, rules: [] }, milestones: [{ id: 'm1', date: '2026-11-01', title: '50 %', target: 50, status: 'open' }] };
  const conv = PT.upgradeGoal(oldGoal, ctx12);
  const clean = conv && PT.cleanPlan(conv.goal);
  check('converting an old goal gives a clean plan with the same id and no "%" step', clean && clean.id === 'old9' && clean.title === 'A2 grammar' && clean.version === 2 && !/%/.test(JSON.stringify(clean.subPlans)));
  check('a label (the student\'s own name) is the only way to change a title, and it is cut at 40 characters',
    PT.cleanPlan({ ...clean, label: 'x'.repeat(90) }).title.length === 40 && PT.cleanPlan({ ...clean, title: 'HACK' }).title === 'A2 grammar');
}

}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll plan checks passed.');
process.exit(failed ? 1 : 0);
