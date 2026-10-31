// Checks review R24: the Mixed review – topic score and due date (1/3/7/21 days), the error log (whole log, one helper),
// and the plan: due topics, the student's own past mistakes and due words from ALL lists are picked, in mixed order.
//   node scripts/check-mixed-review.mjs
process.removeAllListeners('warning');
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (s.startsWith('.')) { try { return await next(s + '.js', c); } catch {} } throw e; }
}`));
process.env.WORT_CHECK = '1';
delete process.env.DATABASE_URL; // the in-memory store is used (no database)
delete process.env.POSTGRES_URL;
const SC = await import('../lib/scores.js');
const GS = await import('../lib/grammar-stats.js');
const EL = await import('../lib/error-log.js');
const MR = await import('../lib/mixed-review.js');
const SS = await import('../lib/session-settings.js');
const W = await import('../lib/words.js');
const { curriculumEntry } = await import('../lib/curriculum.js');
const { progress } = await import('../lib/progress.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-31T10:00:00Z');
const ago = (days) => NOW - days * DAY;

// ---- topic score and due date ----
const mkStats = (rows) => GS.grammarStatsFromAnswers(rows.map(([topicId, correct, d]) => ({ topicId, correct, skipped: false, hinted: false, difficulty: 'medium', t: ago(d) })));
const rowsFor = (id, rights, wrongs, daysAgo) => [...Array(rights).fill(0).map(() => [id, true, daysAgo]), ...Array(wrongs).fill(0).map(() => [id, false, daysAgo])];
const answers = [
  ...rowsFor('weak-old', 1, 5, 4), // 17 % → score 2 → back after 1 day: last answer 4 days ago → DUE
  ...rowsFor('mid-old', 4, 1, 4), // 80 % → score 8 → back after 7 days: 4 days ago → NOT due
  ...rowsFor('mid-late', 4, 1, 8), // 80 % → score 8 → 7 days: 8 days ago → DUE
  ...rowsFor('strong', 10, 0, 10), // 100 % → 10 → 21 days: NOT due
  ...rowsFor('weak-fresh', 0, 6, 0.2), // 0 % but answered today → NOT due yet
  ...rowsFor('few', 2, 0, 5), // 2 right answers only → capped at 6 → 3 days: 5 days ago → DUE
];
const stats = mkStats(answers);
const rev = (id) => SC.topicReview(stats[id], NOW);
check('weak topic: score 2, due', rev('weak-old').score === 2 && rev('weak-old').isDue);
check('80 % topic: score 8, 7 days', rev('mid-old').score === 8 && !rev('mid-old').isDue && rev('mid-late').isDue);
check('100 % topic: 10, back in 21 days', rev('strong').score === 10 && !rev('strong').isDue);
check('answered today: not due', !rev('weak-fresh').isDue);
check('two lucky answers: capped at 6, due after 3 days', rev('few').score === 6 && rev('few').isDue);
check('no answers: no review entry', SC.topicReview(undefined, NOW) === null);

// ---- the error log: whole log, newest first, once each ----
const raw = [
  { studentAnswer: 'ich habe gegangen', corrected: 'ich bin gegangen', rule: 'Perfekt mit sein', topicId: 'perfekt', t: ago(1), correct: false },
  { studentAnswer: 'ich habe gegangen', corrected: 'Ich bin gegangen', rule: 'Perfekt mit sein', t: ago(5), correct: false }, // same mistake again
  { studentAnswer: 'mit der Mann', corrected: 'mit dem Mann', rule: 'Dativ nach mit', t: ago(2), correct: false },
  { studentAnswer: 'x', corrected: 'right', rule: 'Akkusativ', t: ago(3), correct: true }, // right answer: not a mistake
  { studentAnswer: 'x', corrected: 'skipped', rule: 'Akkusativ', t: ago(3), skipped: true, correct: false }, // skipped: not a mistake
  { studentAnswer: '', corrected: '', rule: '', t: ago(3), correct: false }, // says nothing
  ...Array.from({ length: 30 }, (_, i) => ({ studentAnswer: `a${i}`, corrected: `Satz ${i}`, rule: 'Genitiv', t: ago(10 + i), correct: false })),
];
const log = EL.errorLogFromAnswers(raw);
check('error log: only wrong, no skipped, no empty, no duplicates', log.length === 2 + 30 && log[0].corrected === 'ich bin gegangen' && log[1].corrected === 'mit dem Mann');
check('error log holds more than the last 8', log.length > 8 && EL.mistakesForTutor(log, 8).length === 8);
const added = EL.addToErrorLog(log, { studentAnswer: 'neu', corrected: 'neue Antwort', rule: 'Dativ', t: NOW });
check('browser log: a new mistake goes on top', added[0].corrected === 'neue Antwort' && added.length === log.length + 1);
check('browser log: stays at 100', EL.cleanErrorLog(Array.from({ length: 300 }, (_, i) => ({ corrected: `s${i}`, rule: 'r', t: i }))).length === EL.ERROR_LOG_MAX);
check('merge: the first list wins and keeps its order', EL.mergeErrorLogs([[{ corrected: 'a', rule: 'r' }], [{ corrected: 'A', rule: 'r' }, { corrected: 'b', rule: 'r' }]]).map((e) => e.corrected).join() === 'a,b');

// the in-memory store gives the same log from saved answers (accounts)
const store = progress();
await store.addAnswer('u1', { sessionId: 's1', n: 1, studentAnswer: 'der Haus', corrected: 'das Haus', rule: 'Artikel und Genus', question: 'Q', correct: false, skipped: false, topicId: 'a1-articles' }, {});
await store.addAnswer('u1', { sessionId: 's1', n: 2, studentAnswer: 'ok', corrected: 'ok', rule: 'Dativ', correct: true, skipped: false }, {});
const stored = await store.errorLog('u1');
check('store.errorLog reads the wrong answer only', stored.length === 1 && stored[0].corrected === 'das Haus');

// ---- the plan ----
const topics = [
  { id: 'weak-old', levels: ['A1', 'A2', 'B1'] }, { id: 'mid-old', levels: ['B1'] }, { id: 'mid-late', levels: ['B1'] },
  { id: 'strong', levels: ['B1'] }, { id: 'weak-fresh', levels: ['B1'] }, { id: 'few', levels: ['B1'] }, { id: 'a1-only', levels: ['A1'] },
];
const due = MR.dueTopics({ grammarStats: stats, topics, level: 'B1', now: NOW }).map((x) => x.topicId);
check('due topics: the weak one first, then the others that are due', due.join() === 'weak-old,few,mid-late' || due.join() === 'weak-old,mid-late,few', due.join());
check('due topics: not-due and other-level topics are left out', !due.includes('mid-old') && !due.includes('strong') && !due.includes('weak-fresh') && !due.includes('a1-only'));

// words from two different lists, some due, some not, some new
const allWords = W.getWords();
const sections = [...new Set(allWords.flatMap((w) => (w.topics || []).map((x) => x.split(' › ')[0])))];
const inSection = (sec) => allWords.filter((w) => w.level === 'B1' && (w.topics || []).some((x) => x.startsWith(`${sec} ›`) || x === sec));
const wA = inSection(sections[0]).slice(0, 4);
const wB = inSection(sections[1]).filter((w) => !wA.includes(w)).slice(0, 4);
const rec = (s, dueDays) => ({ v: { s, k: 1, due: NOW + dueDays * DAY }, last: ago(3) });
const scores = {};
for (const w of [...wA.slice(0, 2), ...wB.slice(0, 2)]) scores[w.id] = rec(3, -1); // due
for (const w of [...wA.slice(2), ...wB.slice(2)]) scores[w.id] = rec(8, 5); // practised but not due
const dueIds = new Set([...wA.slice(0, 2), ...wB.slice(0, 2)].map((w) => w.id));
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const plan = MR.buildReviewPlan({ grammarStats: stats, errors: log, words: allWords, scores, topics, level: 'B1', sources: W.sourcesFor('both'), total: 10, difficulty: 'medium', now: NOW, rand });
const kinds = (k) => plan.filter((x) => x.kind === k);
check('plan has the asked number of questions', plan.length === 10, String(plan.length));
check('plan has due topics', kinds('grammar').length >= 1 && kinds('grammar').every((x) => due.includes(x.topicId)));
check('plan has past mistakes from the error log', kinds('mistake').length >= 1 && kinds('mistake').every((x) => log.some((e) => e.corrected === x.corrected)));
check('plan has due words only, from both lists', kinds('word').length >= 3 && kinds('word').every((x) => dueIds.has(x.wordId)) && new Set(kinds('word').map((x) => (W.getWord(x.wordId).topics || [])[0]?.split(' › ')[0])).size >= 2, JSON.stringify(kinds('word').map((x) => x.wordId)));
check('plan is mixed (not one block per kind)', plan.map((x) => x.kind).join('') !== [...plan].sort((a, b) => a.kind.localeCompare(b.kind)).map((x) => x.kind).join(''));
check('never three of a kind in a row while others are left', !plan.some((x, i) => i >= 2 && x.kind === plan[i - 1].kind && x.kind === plan[i - 2].kind && plan.slice(i + 1).some((y) => y.kind !== x.kind)));
check('20 questions are possible, 25 are cut to 20', MR.buildReviewPlan({ grammarStats: stats, errors: log, words: allWords, scores, topics, level: 'B1', total: 20, now: NOW, rand }).length === 20
  && MR.buildReviewPlan({ grammarStats: stats, errors: log, words: allWords, scores, topics, level: 'B1', total: 25, now: NOW, rand }).length === 20);
check('answers are scored for the question\'s topic', MR.topicOfItem([{ kind: 'word', wordId: 'x' }, { kind: 'grammar', topicId: 'few' }], 2) === 'few' && MR.topicOfItem([{ kind: 'word', wordId: 'x' }], 1) === '');

// nothing to review yet → a warm-up, never an empty session
const warm = MR.buildReviewPlan({ grammarStats: {}, errors: [], words: allWords, scores: {}, topics, level: 'B1', total: 10, now: NOW, rand });
check('nothing due: warm-up on the level topics', warm.length === 10 && warm.every((x) => x.kind === 'grammar' && x.warmup));
// only mistakes: the places go to them
const onlyErr = MR.buildReviewPlan({ grammarStats: {}, errors: log, words: [], scores: {}, topics, level: 'B1', total: 10, now: NOW, rand });
check('only mistakes exist: all 10 are mistakes', onlyErr.length === 10 && onlyErr.every((x) => x.kind === 'mistake'));

// a plan from the browser is cleaned
const cleaned = MR.cleanReviewPlan([{ kind: 'word', wordId: 'w1' }, { kind: 'mistake', topicId: 't', rule: 'r', corrected: 'c', evil: 1 }, { kind: 'bogus' }, null]);
check('plan from the browser: cleaned', cleaned.length === 4 && cleaned[1].evil === undefined && cleaned[2].kind === 'grammar');

// settings
const f = SS.sanitizeSetup({ kind: 'mixed', questions: 40 });
check('setup: mixed review keeps 10–20 questions', f.kind === 'mixed' && f.questions === 10 && SS.sanitizeSetup({ kind: 'mixed', questions: 20 }).questions === 20);
const settings = SS.sessionSettings(f, 'Mixed review');
check('settings: mixed review has the pseudo topic and no word grammar', settings.topicId === 'mixed-review' && settings.kind === 'mixed' && settings.grammar.length === 0 && SS.modeOf(settings) === 'mixed');
check('setup: a mixed session fills the setup form again', SS.setupFrom(settings, [], SS.DEFAULT_SETUP).kind === 'mixed');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll mixed-review checks passed.');
process.exit(failed ? 1 : 0);
