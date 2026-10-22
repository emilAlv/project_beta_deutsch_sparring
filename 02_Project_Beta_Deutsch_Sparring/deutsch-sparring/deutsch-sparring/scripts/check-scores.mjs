// Checks the word score rules (lib/scores.js: Meaning / Article / Plural / Sentence), the word list (lib/words.js), the
// tutor reply parts, the demo tutor's levels, the old-data migration and the database step. Plain node, no test framework:
//   node scripts/check-scores.mjs
// Exits with an error if any rule is broken.

process.removeAllListeners('warning'); // lib/*.js are ES modules without "type": "module" – the warning is harmless
const S = await import('../lib/scores.js');
const W = await import('../lib/words.js');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` – ${detail}`}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T0 = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;
const flash = (rec, extra = {}, now = T0) => S.applyAnswer(rec, { task: 'flashcard', correct: true, ...extra }, now);
const gram = (rec, extra = {}, now = T0) => S.applyAnswer(rec, { task: 'grammar', correct: true, ...extra }, now);

// ---- score table ----
let r = undefined;
const path = [];
for (let i = 0; i < 4; i += 1) {
  r = flash(r);
  path.push(r.v.s);
}
eq('new word: 4 right in a row = 3, 5, 7, 10', path, [3, 5, 7, 10]);
eq('streak after 4 right', r.v.k, 4);

r = flash(flash(flash(undefined)));
r = flash(r); // 4th
r = flash(r, {}, T0 + DAY); // 5th: a 10 answered right stays 10
eq('a 10 answered right stays 10', r.v.s, 10);

r = flash(flash(flash(flash(undefined))));
r = flash(r, { correct: false, errorType: 'Wortschatz' });
eq('mistake at 10 -> 7', r.v.s, 7);
eq('mistake resets the streak', r.v.k, 0);

// score 9 without the streak stays at 9
r = { v: { s: 8, k: 0, due: null } };
r = flash(r);
eq('8 + 2 without a streak of 4 stops at 9', r.v.s, 9);
r = flash(r);
eq('still 9 with a streak of 2', r.v.s, 9);
r = flash(flash(r));
eq('the 4th right in a row gives 10', r.v.s, 10);

// hint / Leicht answers: +1, never 10, no streak
r = undefined;
for (let i = 0; i < 12; i += 1) r = flash(r, { hinted: true });
eq('12 hint answers in a row never reach 10', r.v.s, 9);
eq('hint answers do not count toward the streak', r.v.k, 0);
r = flash(flash(flash(undefined)));
r = flash(r, { hinted: true });
eq('hint answer keeps the streak (3) and adds 1', [r.v.s, r.v.k], [8, 3]);

check('score never goes below 1', flash({ v: { s: 1, k: 0, due: null } }, { correct: false }).v.s === 1);
eq('flashcard wrong: -3', flash({ v: { s: 6, k: 2, due: null } }, { correct: false }).v.s, 3);

// grammar tasks
r = gram(undefined);
eq('grammar right: V +1, G +2', [r.v.s, r.g.s], [2, 3]);
r = gram({ v: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } }, { correct: false, errorType: 'Kasus' });
eq('grammar mistake (Kasus): V unchanged, G -3', [r.v.s, r.g.s], [5, 2]);
r = gram({ v: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } }, { correct: false, errorType: 'Adjektivendung' });
eq('grammar mistake keeps the V streak', r.v.k, 2);
for (const errorType of ['Artikel', 'Wortschatz', 'article', 'vocab']) {
  r = gram({ v: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } }, { correct: false, errorType });
  eq(`grammar mistake (${errorType}): V -3 and G -3`, [r.v.s, r.g.s], [2, 2]);
}
r = S.applyAnswer({ v: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } }, { task: 'grammar', skipped: true }, T0);
eq('skipped grammar task: V -1, G -1', [r.v.s, r.g.s], [4, 4]);
r = S.applyAnswer({ v: { s: 5, k: 2, due: null } }, { task: 'flashcard', skipped: true }, T0);
eq('skipped flashcard: V -1, no G', [r.v.s, r.g], [4, undefined]);
eq('skip resets the streak', r.v.k, 0);
r = gram(undefined, { hinted: true });
eq('grammar right after a hint: V +1, G +1', [r.v.s, r.g.s], [2, 2]);
r = gram(undefined, { hasG: false });
eq('a phrase has no G score', r.g, undefined);

// ---- due dates ----
for (const [score, days] of [[1, 1], [3, 1], [4, 3], [6, 3], [7, 7], [9, 7], [10, 21]]) {
  eq(`score ${score} comes back after ${days} day(s)`, S.dueDays(score), days);
}
r = flash(undefined, {}, T0);
eq('due date is set from the new score (3 -> 1 day)', r.v.due, T0 + DAY);
const ten = { v: { s: 10, k: 4, due: T0 } };
eq('a due 10 answered right stays 10 (due in 21 days)', [flash(ten, {}, T0 + DAY).v.s, flash(ten, {}, T0 + DAY).v.due], [10, T0 + DAY + 21 * DAY]);
eq('a due 10 answered wrong drops to 7 (due in 7 days)', [flash(ten, { correct: false }, T0 + DAY).v.s, flash(ten, { correct: false }, T0 + DAY).v.due], [7, T0 + DAY + 7 * DAY]);

// ---- how many words ----
eq('wordsNeeded(20, true) = 13', S.wordsNeeded(20, true), 13);
eq('wordsNeeded(20, false) = 23', S.wordsNeeded(20, false), 23);
eq('wordsNeeded(11, true) = 9', S.wordsNeeded(11, true), 9);

// ---- the word picker on the real word list ----
const words = W.getWords();
check('words.json: words loaded', words.length > 1000, `${words.length}`);
check('words.json: no removed/unenriched words (every word has English)', words.every((w) => w.en && w.level && w.sources.length));
const sections = W.listSections();
check('sections and lists have English names and counts', sections.length >= 10 && sections.every((s) => s.count > 0 && s.lists.every((l) => l.count > 0 && /^[\x20-\x7E&›]+$/.test(l.name))));
check('"From the course" is not a topic', !JSON.stringify([...sections, ...W.wordTopics()]).toLowerCase().match(/aus dem kurs|from the course|palabras/));
check('every word topic has an id and a type', W.wordTopics().every((t) => t.id.startsWith('w:') && t.type === 'Wortschatz'));

const a1 = S.pickWords({ words, level: 'A1', count: 40, now: T0 });
check('level A1 respected', a1.length === 40 && a1.every((w) => w.level === 'A1'));
const kursOnly = S.pickWords({ words, sources: W.sourcesFor('kurs'), count: 50, now: T0 });
check('source "From the course" respected', kursOnly.length === 50 && kursOnly.every((w) => w.sources.includes('kurs')));
const goethe = S.pickWords({ words, sources: W.sourcesFor('goethe'), count: 80, now: T0 });
check('source "Goethe list" respected', goethe.every((w) => w.sources.some((s) => s.startsWith('goethe'))));
const home = S.pickWords({ words, section: 'Home & living', count: 20, now: T0 });
check('section respected', home.length === 20 && home.every((w) => w.topics.some((t) => t.startsWith('Home & living › '))));
const furn = S.pickWords({ words, section: 'Home & living', list: 'Furniture & objects', level: 'A1', count: 100, now: T0 });
check('list + level respected, fewer words than asked -> what exists', furn.length > 0 && furn.length < 100 && furn.every((w) => w.level === 'A1' && w.topics.includes('Home & living › Furniture & objects')), `${furn.length}`);
const cmp = S.pickWords({ words, section: 'Home & living', level: 'A1', count: 13, now: T0 });
eq('13 words requested -> 13 picked, no duplicates', [cmp.length, new Set(cmp.map((w) => w.id)).size], [13, 13]);

// due and weak first
const pool = S.pickWords({ words, section: 'Home & living', count: 100, now: T0 });
const ids = pool.map((w) => w.id);
const rec = (s, due) => ({ v: { s, k: 0, due }, last: T0 - 5 * DAY });
const scores = {
  [ids[0]]: rec(2, T0 - DAY), // due, weak
  [ids[1]]: rec(5, T0 - 2 * DAY), // due
  [ids[2]]: rec(1, T0 - 3 * DAY), // due, weakest
  [ids[3]]: rec(8, T0 + 3 * DAY), // not due yet
  [ids[4]]: { v: { s: 10, k: 4, due: T0 - DAY } }, // a 10 (check)
};
const picked = S.pickWords({ words, scores, section: 'Home & living', count: 13, now: T0 });
eq('due words come first, lowest score first', picked.slice(0, 3).map((w) => w.id), [ids[2], ids[0], ids[1]]);
check('a word with 10 is used as a check', picked.some((w) => w.id === ids[4]));
check('the not-yet-due word is left out while new words exist', !picked.some((w) => w.id === ids[3]));
const newOnes = picked.filter((w) => !scores[w.id]);
check('the rest are new words (about 30 %+)', newOnes.length >= 4, `${newOnes.length}`);
const tensIn = picked.filter((w) => scores[w.id]?.v.s === 10).length;
check('1-2 checks', tensIn >= 1 && tensIn <= 2);


// =====================================================================================================
// Meaning · Article · Plural · Sentence (m / a / p / g): one score per part, each on its own
// =====================================================================================================
const lamp = words.find((w) => w.id === 'die lampe');
const verb = words.find((w) => w.type === 'verb');
check('test words exist (a noun with plural, a verb)', lamp && lamp.plural && verb);
const sc = (rec, k) => rec?.[k]?.s;
const card = (rec, level, extra = {}, w = lamp, dir = 'en-de') => S.applyAnswer(rec, {
  task: 'flashcard', correct: true, checks: S.testedChecks({ task: 'flashcard', word: w, difficulty: level, direction: dir }), ...extra,
}, T0);

// ---- what a card tests, by level ----
eq('Easy noun card tests the word only', S.testedChecks({ word: lamp, difficulty: 'easy' }), ['meaning']);
eq('Medium noun card: + article', S.testedChecks({ word: lamp, difficulty: 'medium' }), ['meaning', 'article']);
eq('Hard noun card: + article + plural', S.testedChecks({ word: lamp, difficulty: 'hard' }), ['meaning', 'article', 'plural']);
eq('Hard noun without a plural: no plural', S.testedChecks({ word: { type: 'noun', plural: '' }, difficulty: 'hard' }), ['meaning', 'article']);
eq('German → English on Hard: meaning + article, never the plural', S.testedChecks({ word: lamp, difficulty: 'hard', direction: 'de-en' }), ['meaning', 'article']);
eq('German → English on Easy: meaning only', S.testedChecks({ word: lamp, difficulty: 'easy', direction: 'de-en' }), ['meaning']);
for (const d of ['easy', 'medium', 'hard']) eq(`verb on ${d}: just the word`, S.testedChecks({ word: verb, difficulty: d }), ['meaning']);
eq('sentence task with a noun: meaning + article (any level)', S.testedChecks({ task: 'grammar', word: lamp, difficulty: 'easy' }), ['meaning', 'article']);
eq('sentence task with a verb: meaning', S.testedChecks({ task: 'grammar', word: verb, difficulty: 'hard' }), ['meaning']);

// ---- each answer changes only the scores it tested ----
let q = card(undefined, 'easy', {});
eq('Easy noun right: m up, a and p untouched', [sc(q, 'v'), q.a, q.p], [3, undefined, undefined]);
q = card(undefined, 'medium');
eq('Medium right: m and a up, p untouched', [sc(q, 'v'), sc(q, 'a'), q.p], [3, 3, undefined]);
q = card(undefined, 'hard');
eq('Hard right: m, a and p up', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [3, 3, 3]);
const base = { v: { s: 5, k: 2, due: null }, a: { s: 5, k: 2, due: null }, p: { s: 5, k: 2, due: null } };
q = card(base, 'medium', { correct: false, errorType: 'Artikel' });
eq('Medium, wrong article (noun right): a down (-3), m UP (+2) because the word was right', [sc(q, 'v'), sc(q, 'a')], [7, 2]);
eq('…the Article streak resets, the Meaning streak goes on', [q.a.k, q.v.k], [0, 3]);
q = card(base, 'medium', { correct: false, errorType: 'Wortschatz' });
eq('Medium, wrong word: m down, a untouched (not judged)', [sc(q, 'v'), sc(q, 'a')], [2, 5]);
q = card(base, 'hard', { correct: false, errorType: 'Wortschatz', rule: 'Plural' });
eq('Hard, wrong plural only: p down, m and a up', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [7, 7, 2]);
q = card(base, 'hard', { correct: false, errorType: 'Artikel' });
eq('Hard, wrong article: a down, m up, p untouched', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [7, 2, 5]);
q = card(base, 'hard', { correct: false, errorType: 'Wortschatz' });
eq('Hard, wrong word: m down, a and p untouched', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [2, 5, 5]);
q = card(base, 'hard', { correct: false, parts: { meaning: true, article: false, plural: false } });
eq('the tutor\'s parts decide: article and plural wrong → both down, m up', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [7, 2, 2]);
q = card(base, 'medium', { correct: false, parts: { meaning: true, article: false, plural: true } });
eq('parts name a part that was not tested (plural on Medium): ignored', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [7, 2, 5]);
q = card(base, 'easy', { correct: false, errorType: 'Artikel' });
eq('Easy: an article mistake is never judged (a untouched; the word was right, so m goes up)', [sc(q, 'v'), sc(q, 'a')], [7, 5]);
q = card(undefined, 'medium', { correct: false, errorType: 'Wortschatz' }, verb);
eq('verb card wrong: m down, no a / p', [sc(q, 'v'), q.a, q.p], [1, undefined, undefined]);
q = card(base, 'hard', { skipped: true });
eq('skipped Hard card: every tested score -1', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [4, 4, 4]);
q = card(base, 'easy', { skipped: true });
eq('skipped Easy card: m -1 only', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p')], [4, 5, 5]);
q = card(undefined, 'hard', { hinted: true });
eq('hinted right on Hard: +1 on each tested score, streaks stay 0', [sc(q, 'v'), sc(q, 'a'), sc(q, 'p'), q.v.k], [2, 2, 2, 0]);
// the 4-in-a-row rule works for each score on its own
let streak = undefined;
for (let i = 0; i < 4; i += 1) streak = card(streak, 'medium');
eq('4 right in a row on Medium: m and a reach 10, p still empty', [sc(streak, 'v'), sc(streak, 'a'), streak.p], [10, 10, undefined]);
streak = card(streak, 'hard', { correct: false, parts: { meaning: true, article: true, plural: false } });
eq('then a wrong plural on Hard: p starts at 1, m and a stay 10', [sc(streak, 'v'), sc(streak, 'a'), sc(streak, 'p')], [10, 10, 1]);
eq('each part has its own due date', [streak.a.due, streak.p.due], [T0 + 21 * DAY, T0 + 1 * DAY]);

// sentence tasks (word mistakes inside a sentence act as V did before)
const gcheck = S.testedChecks({ task: 'grammar', word: lamp, difficulty: 'easy' });
const g0 = { v: { s: 5, k: 2, due: null }, a: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } };
q = S.applyAnswer(g0, { task: 'grammar', correct: true, checks: gcheck }, T0);
eq('sentence right (noun): m +1, a +1, g +2', [sc(q, 'v'), sc(q, 'a'), sc(q, 'g')], [6, 6, 7]);
q = S.applyAnswer(g0, { task: 'grammar', correct: false, errorType: 'Kasus', checks: gcheck }, T0);
eq('sentence grammar mistake: only g -3', [sc(q, 'v'), sc(q, 'a'), sc(q, 'g')], [5, 5, 2]);
q = S.applyAnswer(g0, { task: 'grammar', correct: false, errorType: 'Artikel', checks: gcheck }, T0);
eq('sentence article mistake: a -3 and g -3, m unchanged', [sc(q, 'v'), sc(q, 'a'), sc(q, 'g')], [5, 2, 2]);
q = S.applyAnswer(g0, { task: 'grammar', correct: false, errorType: 'Wortschatz', checks: gcheck }, T0);
eq('sentence word mistake: m -3 and g -3, a unchanged', [sc(q, 'v'), sc(q, 'a'), sc(q, 'g')], [2, 5, 2]);
q = S.applyAnswer(g0, { task: 'grammar', skipped: true, checks: gcheck }, T0);
eq('sentence skipped: m -1, a -1, g -1', [sc(q, 'v'), sc(q, 'a'), sc(q, 'g')], [4, 4, 4]);
q = S.applyAnswer({ v: { s: 5, k: 2, due: null }, g: { s: 5, k: 2, due: null } }, { task: 'grammar', correct: true, checks: ['meaning'] }, T0);
eq('sentence with a verb: m and g only', [sc(q, 'v'), q.a, sc(q, 'g')], [6, undefined, 7]);

// ---- resolving the parts (tutor's booleans, with a safe fallback) ----
eq('parts: right card = everything right', S.resolveParts(null, { correct: true }), { meaning: true, article: true, plural: true });
eq('fallback: errorType Artikel → article wrong, noun right', S.resolveParts(null, { correct: false, errorType: 'Artikel' }), { meaning: true, article: false, plural: null });
eq('fallback: rule Plural → plural wrong only', S.resolveParts(null, { correct: false, errorType: 'Wortschatz', rule: 'Plural' }), { meaning: true, article: true, plural: false });
eq('fallback: any other mistake → the word', S.resolveParts(null, { correct: false, errorType: 'Wortschatz' }), { meaning: false, article: null, plural: null });
eq('parts all true but the card is wrong → the fallback decides', S.resolveParts({ meaning: true, article: true, plural: true }, { correct: false, errorType: 'Artikel' }), { meaning: true, article: false, plural: null });
eq('parts with only the article false: meaning counts as right', S.resolveParts({ article: false }, { correct: false }), { meaning: true, article: false, plural: null });

// ---- "learnt": Meaning >= 8 and, for a noun, Article >= 8; Plural is not needed ----
const rc = (m, a, p) => ({ v: { s: m }, ...(a != null ? { a: { s: a } } : {}), ...(p != null ? { p: { s: p } } : {}) });
check('learnt: noun m 8 + a 8 (no plural)', S.isLearnt(rc(8, 8), true));
check('not learnt: noun m 9, a 7', !S.isLearnt(rc(9, 7), true));
check('not learnt: noun m 9, no article score yet', !S.isLearnt(rc(9, null), true));
check('not learnt: noun m 7, a 10', !S.isLearnt(rc(7, 10), true));
check('learnt: noun with a low plural (plural is tracked, not required)', S.isLearnt(rc(10, 10, 1), true));
check('learnt: verb with m 8 (no article needed, even if an a score was copied in)', S.isLearnt(rc(8, 2), false));
check('unknown word type: an article score makes it count as a noun', !S.isLearnt(rc(9, 3)) && S.isLearnt(rc(9)));
check('learnt: nothing practised → false', !S.isLearnt(undefined, true));

// ---- old data: [v, g] → m = a = v, p empty ----
const mig = S.migrateRecord({ v: { s: 7, k: 2, due: 123 }, g: { s: 4, k: 0, due: 5 }, last: 9 });
eq('old record: v is copied into a (score, streak, due), p stays empty', [mig.v, mig.a, mig.p, mig.g.s, mig.last], [{ s: 7, k: 2, due: 123 }, { s: 7, k: 2, due: 123 }, undefined, 4, 9]);
check('migrating twice changes nothing', JSON.stringify(S.migrateRecord(mig)) === JSON.stringify(mig));
check('a record that already has an Article score is not touched', S.migrateRecord({ v: { s: 9 }, a: { s: 3 } }).a.s === 3);
eq('migrateRecords handles a whole store', Object.keys(S.migrateRecords({ x: { v: { s: 3 } }, y: { g: { s: 3 } } })), ['x', 'y']);
eq('old compact [v, g] → m = a = v', S.recordFromCompact([7, 4]), { v: { s: 7 }, g: { s: 4 }, a: { s: 7 } });
eq('old compact [v, null] → no g', S.recordFromCompact([7, null]), { v: { s: 7 }, a: { s: 7 } });
eq('new compact [m, g, a, p]', S.recordFromCompact([7, null, 3, 2]), { v: { s: 7 }, a: { s: 3 }, p: { s: 2 } });
eq('new compact with no article / plural yet', S.recordFromCompact([7, 4, null, null]), { v: { s: 7 }, g: { s: 4 } });
eq('compactOf → [m, g, a, p]', S.compactOf({ v: { s: 6 }, a: { s: 4 }, p: { s: 2 }, g: { s: 5 } }), [6, 5, 4, 2]);
eq('compact round trip', S.compactOf(S.recordFromCompact([7, 4, 3, 2])), [7, 4, 3, 2]);
check('garbage compact → nothing', S.recordFromCompact(['x', 3]) === null && S.recordFromCompact(null) === null);

// ---- the picker follows the level ----
{
  const noun = (id, plural = 'die X') => ({ id, type: 'noun', plural, level: 'A1', sources: ['goethe-a1'], topics: ['T › L'] });
  const pool = [noun('n1'), noun('n2'), noun('n3'), { id: 'v1', type: 'verb', level: 'A1', sources: ['goethe-a1'], topics: ['T › L'] }];
  const due = T0 - DAY;
  const rec2 = (m, a, p) => ({ v: { s: m, k: 0, due }, ...(a != null ? { a: { s: a, k: 0, due } } : {}), ...(p != null ? { p: { s: p, k: 0, due } } : {}) });
  // n1: meaning weak · n2: article weak · n3: plural weak · v1: meaning middling
  const scores2 = { n1: rec2(2, 9, 9), n2: rec2(9, 3, 9), n3: rec2(9, 9, 4), v1: rec2(5) };
  const order = (difficulty) => S.pickWords({ words: pool, scores: scores2, count: 4, difficulty, now: T0 }).map((w) => w.id);
  eq('Easy picks by Meaning: weakest m first (n1 2, v1 5, then the 9s)', order('easy').slice(0, 2), ['n1', 'v1']);
  eq('Medium picks by min(m, a): n1 (2), n2 (3), v1 (5)', order('medium').slice(0, 3), ['n1', 'n2', 'v1']);
  eq('Hard picks by min(m, a, p): n1 (2), n2 (3), n3 (4), v1 (5)', order('hard'), ['n1', 'n2', 'n3', 'v1']);
  eq('default level = Easy (old behaviour)', S.pickWords({ words: pool, scores: scores2, count: 4, now: T0 }).map((w) => w.id), order('easy'));
  // due: the Article score is due later than Meaning; it only matters from Medium
  const later = { n2: { v: { s: 9, k: 0, due: T0 + 9 * DAY }, a: { s: 9, k: 0, due: T0 - DAY } } };
  const pickOne = (difficulty) => S.pickWords({ words: [noun('n2')], scores: later, count: 1, difficulty, now: T0 })[0].id;
  check('picker works with one word', pickOne('easy') === 'n2' && pickOne('medium') === 'n2');
  // a never-practised plural makes a practised noun "due" on Hard (a missing score counts as 1)
  const hardPool = [noun('x1'), noun('x2')];
  const sc3 = { x1: { v: { s: 9, k: 3, due: T0 + 9 * DAY }, a: { s: 9, k: 3, due: T0 + 9 * DAY } }, x2: { v: { s: 9, k: 3, due: T0 + 9 * DAY }, a: { s: 9, k: 3, due: T0 + 9 * DAY }, p: { s: 9, k: 3, due: T0 + 9 * DAY } } };
  eq('Hard: the noun without a Plural score yet comes before the one that has it', S.pickWords({ words: hardPool, scores: sc3, count: 1, difficulty: 'hard', now: T0 }).map((w) => w.id), ['x1']);
  eq('Easy: both are equal; id order decides', S.pickWords({ words: hardPool, scores: sc3, count: 2, difficulty: 'easy', now: T0 }).length, 2);
}

// =====================================================================================================
// the rest of the chain: tutor reply, mock tutor, Home numbers, settings, database rows
// =====================================================================================================
const R = await import('../lib/reply.js');
const M = await import('../lib/mock.js');
const HS = await import('../lib/home-stats.js');
const SS = await import('../lib/session-settings.js');
const PP = await import('../lib/plan-progress.js');
const SCH = await import('../lib/schema.mjs');
const CP = await import('../lib/card-parts.js');

// ---- the setup form: the chip is gone, old saved setups still load ----
check('article-plural is not a grammar point any more', !SS.GRAMMAR_POINTS.includes('article-plural') && !SS.DEFAULT_SETUP.grammar.includes('article-plural'));
eq('an old saved setup with article-plural loads, the chip is ignored', SS.sanitizeSetup({ kind: 'vocab', grammar: ['article-plural', 'dativ'] }).grammar, ['dativ']);
eq('an old "Vocabulary" setup (only article-plural) → no sentence tasks', [SS.sanitizeSetup({ kind: 'vocab', grammar: ['article-plural'] }).grammar, SS.modeOf(SS.sanitizeSetup({ kind: 'vocab', grammar: ['article-plural'] }))], [[], 'words']);

// ---- the tutor's reply: parts, checks ----
const ctxBase = { level: 'A1', difficulty: 'medium', topicIds: new Set(['w:x']), topicId: 'w:x', wordIds: new Set(['die lampe']), wordById: new Map([['die lampe', lamp]]), openTask: 'flashcard', openChecks: ['meaning', 'article'] };
const reply = (feedback, ctx = {}) => R.normalizeReply({ message: 'x', feedback: { forNumber: 1, studentAnswer: 'Lampe', corrected: 'die Lampe, die Lampen', changedWords: [], explanation: '', rule: '', ...feedback }, exercise: null, options: [], session: { level: 'A1', difficulty: 'Mittel', finished: false } }, { ...ctxBase, ...ctx });
eq('feedback.parts: wrong article → meaning right, article wrong (from the tutor)', reply({ correct: false, errorType: 'Artikel', parts: { meaning: true, article: false } }).feedback.parts, { meaning: true, article: false });
eq('feedback.parts: no parts from the tutor, errorType Artikel → same', reply({ correct: false, errorType: 'Artikel' }).feedback.parts, { meaning: true, article: false });
eq('feedback.parts: right card → all tested parts true', reply({ correct: true }).feedback.parts, { meaning: true, article: true });
eq('feedback.parts: wrong word → article not judged (null)', reply({ correct: false, errorType: 'Wortschatz' }).feedback.parts, { meaning: false, article: null });
eq('feedback.parts: only the tested parts are kept (Hard asks the plural, tutor says plural wrong)', reply({ correct: false, errorType: 'Wortschatz', rule: 'Plural', parts: { meaning: true, article: true, plural: false } }, { openChecks: ['meaning', 'article', 'plural'] }).feedback.parts, { meaning: true, article: true, plural: false });
eq('feedback.parts: Easy → meaning only', reply({ correct: true }, { openChecks: ['meaning'] }).feedback.parts, { meaning: true });
check('feedback.parts: a sentence task has none', reply({ correct: true }, { openTask: 'grammar' }).feedback.parts === undefined);
const ex = (checkCtx) => R.normalizeReply({ message: 'x', feedback: null, exercise: { number: 1, type: 'Karteikarte', direction: 'en-de', line: 'the lamp', answer: 'die Lampe', hint: null, wordId: 'die lampe', task: 'flashcard' }, options: [], session: { level: 'A1', difficulty: 'Mittel', finished: false } }, { ...ctxBase, ...checkCtx }).exercise;
eq('exercise.checks: Easy / Medium / Hard', ['easy', 'medium', 'hard'].map((d) => ex({ difficulty: d }).checks), [['meaning'], ['meaning', 'article'], ['meaning', 'article', 'plural']]);
check('the response schema stays small: parts has 3 booleans', Object.keys(R.RESPONSE_SCHEMA.properties.feedback.properties.parts.properties).join() === 'meaning,article,plural');

// ---- the demo tutor follows the levels ----
async function mockFeedback(difficulty, line, direction, answer, wordId = 'die lampe') {
  const settings = { level: 'A1', difficulty, direction, grammar: [], sentences: false, variant: 'ch' };
  const out = JSON.parse(await M.mockReply({
    text: answer, settings, topics: [], topic: { id: 'w:x', type: 'Wortschatz', title: 'x', short: 'x' }, words: [words.find((w) => w.id === wordId)],
    progress: { done: 0, correct: 0, answered: 0, skipped: 0 },
    session: { topicId: 'w:x', total: 10, openNumber: 1, openLine: line, openDirection: direction, openWordId: wordId, openTask: 'flashcard', finished: false },
  }));
  return out.feedback;
}
{
  let f = await mockFeedback('easy', 'the lamp', 'en-de', 'Lampe');
  check('mock Easy: "Lampe" for "the lamp" is right (no article needed)', f.correct === true && !f.errorType);
  check('…the feedback still shows article and plural as info', /die Lampe, die Lampen/.test(f.corrected));
  f = await mockFeedback('easy', 'the lamp', 'en-de', 'der Lampe');
  check('mock Easy: wrong article is NOT wrong, article shown as info', f.correct === true && /die/.test(f.explanation + f.corrected));
  f = await mockFeedback('easy', 'the lamp', 'en-de', 'Tisch');
  check('mock Easy: a wrong word is wrong', f.correct === false && f.errorType === 'Wortschatz' && f.parts.meaning === false);
  f = await mockFeedback('medium', 'the lamp', 'en-de', 'Lampe');
  check('mock Medium: missing article = wrong, errorType Artikel, parts meaning ✓ article ✗', f.correct === false && f.errorType === 'Artikel' && f.parts.meaning === true && f.parts.article === false);
  f = await mockFeedback('medium', 'the lamp', 'en-de', 'der Lampe');
  check('mock Medium: wrong article = wrong', f.correct === false && f.errorType === 'Artikel');
  f = await mockFeedback('medium', 'the lamp', 'en-de', 'die Lampe');
  check('mock Medium: article + noun is right (no plural asked)', f.correct === true);
  f = await mockFeedback('hard', 'the lamp', 'en-de', 'die Lampe');
  check('mock Hard: missing plural = wrong, rule Plural, parts: meaning ✓ article ✓ plural ✗', f.correct === false && f.rule === 'Plural' && f.parts.plural === false && f.parts.article === true && f.parts.meaning === true);
  f = await mockFeedback('hard', 'the lamp', 'en-de', 'die Lampe, die Lampen');
  check('mock Hard: article + noun + plural is right', f.correct === true);
  f = await mockFeedback('hard', 'the lamp', 'en-de', 'die Lampe, die Lampes');
  check('mock Hard: wrong plural = wrong', f.correct === false && f.parts.plural === false);
  f = await mockFeedback('medium', 'Lampe', 'de-en', 'die – lamp');
  check('mock Medium German → English (bare noun): article + meaning right', f.correct === true);
  f = await mockFeedback('medium', 'Lampe', 'de-en', 'der – lamp');
  check('mock Medium German → English: wrong article = wrong, meaning ✓ article ✗', f.correct === false && f.parts.meaning === true && f.parts.article === false);
  f = await mockFeedback('easy', 'die Lampe', 'de-en', 'lamp');
  check('mock Easy German → English: meaning only', f.correct === true && !f.errorType);
  f = await mockFeedback('hard', 'Lampe', 'de-en', 'die – lamp');
  check('mock Hard German → English: no plural asked', f.correct === true);
  f = await mockFeedback('hard', 'to turn (off), to make a turn', 'en-de', 'abbiegen', 'abbiegen');
  void f;
}

// ---- Home: "learnt" and the compact scores ----
{
  const ids = ['die lampe'];
  const homeFor = (rec) => HS.computeHome({ goals: [], scores: { 'die lampe': rec }, agg: { sessions: 0, total: 0, correct: 0, skipped: 0, rules: [], words: [{ id: 'die lampe', n: 3, ok: 2 }] } });
  eq('Home tile: noun with m 9 and a 9 is learnt', homeFor({ v: { s: 9 }, a: { s: 9 } }).tiles.learnt, 1);
  eq('Home tile: noun with m 9 and a 4 is not learnt', homeFor({ v: { s: 9 }, a: { s: 4 } }).tiles.learnt, 0);
  eq('Home tile: noun with m 9 and a 9 but plural 1 is learnt', homeFor({ v: { s: 9 }, a: { s: 9 }, p: { s: 1 } }).tiles.learnt, 1);
  const list = homeFor({ v: { s: 7 }, a: { s: 4 }, p: { s: 2 }, g: { s: 5 } }).strengths.concat(homeFor({ v: { s: 7 }, a: { s: 4 }, p: { s: 2 }, g: { s: 5 } }).gaps).find((x) => x.kind === 'list');
  eq('Home word list shows Meaning · Article · Plural · Sentence averages', list?.scores, { m: 7, a: 4, p: 2, g: 5 });
  eq('scoresFromCompact: old [v, g]', HS.scoresFromCompact({ [ids[0]]: [7, 4] })[ids[0]], { v: { s: 7 }, g: { s: 4 }, a: { s: 7 } });
  eq('scoresFromCompact: new [m, g, a, p]', HS.scoresFromCompact({ [ids[0]]: [7, null, 3, 2] })[ids[0]], { v: { s: 7 }, a: { s: 3 }, p: { s: 2 } });
  check('scoresFromCompact: unknown word ids are dropped', Object.keys(HS.scoresFromCompact({ nope: [1, 1] })).length === 0);
  check('plan progress: isLearnt follows the same rule', PP.isLearnt({ v: { s: 8 }, a: { s: 8 } }, true) && !PP.isLearnt({ v: { s: 8 }, a: { s: 7 } }, true) && PP.isLearnt({ v: { s: 8 } }, false));
  const wp = PP.wordProgress(['die lampe', 'abbiegen'], { 'die lampe': { v: { s: 9 }, a: { s: 5 } }, abbiegen: { v: { s: 9 } } }, T0, new Set(['die lampe']));
  eq('plan word progress: the noun needs the article too, the verb does not', [wp.have, wp.missingIds], [1, ['die lampe']]);
}

// ---- the line under the feedback card ----
eq('parts line: "Meaning ✓ · Article ✗ (die)"', CP.partsView({ parts: { meaning: true, article: false }, corrected: 'die Lampe, die Lampen' }), [{ part: 'meaning', ok: true, fix: '' }, { part: 'article', ok: false, fix: 'die' }]);
eq('parts line: wrong plural shows the right plural', CP.partsView({ parts: { meaning: true, article: true, plural: false }, corrected: 'die Lampe, die Lampen' }).map((x) => x.fix), ['', '', 'die Lampen']);
eq('parts line: parts that were not judged (null) are left out', CP.partsView({ parts: { meaning: false, article: null }, corrected: 'die Lampe' }).length, 1);
eq('parts line: nothing for sentence tasks', CP.partsView({ corrected: 'x' }), []);

// ---- database side: the migration step (the SQL itself is run on a real Postgres by hand, see README) ----
{
  const last = SCH.MIGRATIONS[SCH.MIGRATIONS.length - 1];
  const stmts = last.statements.join('\n');
  check('migration step 5 adds a, a_streak, a_due, p, p_streak, p_due (IF NOT EXISTS)', last.version === 5 && ['a smallint', 'a_streak int', 'a_due timestamptz', 'p smallint', 'p_streak int', 'p_due timestamptz'].every((c) => stmts.includes(`ADD COLUMN IF NOT EXISTS ${c}`)));
  check('migration step 5 backfills a from v only where a is empty', /UPDATE word_scores SET a = v, a_streak = v_streak, a_due = v_due WHERE a IS NULL AND v IS NOT NULL/.test(stmts));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
