// Checks the word score rules (lib/scores.js) and the word list (lib/words.js). Plain node, no test framework:
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
r = flash(r, { correct: false, errorType: 'Artikel' });
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
eq('due words keep lowest-score-first priority inside the mixed sequence', picked.filter((w) => [ids[0], ids[1], ids[2]].includes(w.id)).map((w) => w.id), [ids[2], ids[0], ids[1]]);
check('a word with 10 is used as a check', picked.some((w) => w.id === ids[4]));
check('an almost-learnt word is deliberately reinforced before it is due', picked.some((w) => w.id === ids[3]));
const newOnes = picked.filter((w) => !scores[w.id]);
check('the rest are new words (about 30 %+)', newOnes.length >= 4, `${newOnes.length}`);
const tensIn = picked.filter((w) => scores[w.id]?.v.s === 10).length;
check('due mastered words can be checked', tensIn >= 1 && tensIn <= 2);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);

