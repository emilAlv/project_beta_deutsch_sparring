// R17: reasonOf, the single score rule, skipped handling, the "Repeat my mistakes" list and the "From your conversation" examples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { score, scoreLine, reasonOf, summaryDetails, hasMistakes, isRepeatRequest, mistakeList, conversationExamples } from '../lib/stats.js';
import { computeHome } from '../lib/home-stats.js';
import { dataBlock } from '../lib/prompt.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok - ${name}`); };
const T = { scoreLine: '{correct} of {answered} answered right', scoreLineNone: 'Nothing answered', scoreSkipped: '{n} skipped' };
const tr = (k, v = {}) => T[k].replace(/\{(\w+)\}/g, (_, x) => v[x]);
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

ok('reasonOf: case only when exactly one case is in the rule', () => {
  assert.equal(reasonOf({ rule: 'Akkusativ', errorType: 'case' }), 'case:Akkusativ');
  assert.equal(reasonOf({ rule: 'Dativ nach mit', errorType: 'case' }), 'case:Dativ');
  assert.equal(reasonOf({ rule: 'Wechselpräpositionen: Akkusativ oder Dativ', errorType: 'preposition' }), 'preposition');
  assert.equal(reasonOf({ rule: 'Nominativ, Akkusativ, Dativ', errorType: 'ending' }), 'ending');
  assert.equal(reasonOf({ rule: 'Perfekt', errorType: 'verb' }), 'verb');
  assert.equal(reasonOf({ rule: 'Perfekt' }), 'other');
});

const answers = [
  { n: 1, correct: true, studentAnswer: 'Ich helfe dem Mann.', corrected: 'Ich helfe dem Mann.', rule: 'Dativ', question: 'Ich helfe ___ Mann.' },
  { n: 2, correct: false, studentAnswer: 'Ich sehe der Frau.', corrected: 'Ich sehe die Frau.', changedWords: ['die'], rule: 'Akkusativ', errorType: 'case', question: 'Ich sehe ___ Frau, die gestern mit ihrem Hund im grossen Park spazieren gegangen ist.' },
  { n: 3, correct: false, studentAnswer: 'Wir gehen in der Schule.', corrected: 'Wir gehen in die Schule.', rule: 'Wechselpräpositionen: Akkusativ oder Dativ', errorType: 'preposition', question: 'Wir gehen in ___ Schule.' },
  { n: 4, skipped: true, correct: false, studentAnswer: '', corrected: '', question: 'Er wartet auf ___ Bus.', skippedLine: 'Er wartet auf ___ Bus.' },
];

ok('the score rule', () => {
  const sc = score(answers);
  assert.deepEqual(sc, { done: 4, answered: 3, correct: 1, skipped: 1 });
  assert.equal(scoreLine(sc, tr), '1 of 3 answered right · 1 skipped');
  assert.equal(scoreLine({ correct: 2, answered: 2, skipped: 0 }, tr), '2 of 2 answered right');
  assert.equal(scoreLine({ correct: 0, answered: 0, skipped: 2 }, tr), 'Nothing answered · 2 skipped');
});

ok('all places that show a score go through scoreLine', () => {
  for (const f of ['components/SessionSummary.js', 'components/SessionPanel.js', 'components/Home.js', 'components/Chat.js', 'components/Coach.js']) {
    assert.match(read(f), /scoreLine\(/, f);
  }
  const text = read('lib/ui-text.js');
  for (const dead of ['scoreCorrect', 'recentScore', 'tileRightOf']) assert.ok(!text.includes(`${dead}:`), `${dead} still in ui-text`);
  for (const f of ['components/SessionSummary.js', 'components/SessionPanel.js', 'components/Home.js', 'components/Chat.js', 'components/Coach.js']) {
    assert.ok(!/\{r\.correct\}\/|correct, answered:|ok: tiles/.test(read(f)), `${f} builds its own score text`);
  }
});

ok('Home tiles carry the skipped count', () => {
  const home = computeHome({ goals: [], scores: {}, agg: { sessions: 1, total: 4, correct: 1, skipped: 1, rules: [], words: [] } });
  assert.equal(home.tiles.answered, 3);
  assert.equal(home.tiles.skipped, 1);
  assert.equal(scoreLine(home.tiles, tr), '1 of 3 answered right · 1 skipped');
});

ok('summary "To repeat": whole question, corrected sentence, skipped question', () => {
  const d = summaryDetails({ answers, words: [] });
  assert.equal(d.questions.right.length, 1);
  assert.equal(d.questions.repeat.length, 3);
  const [long, two, skipped] = d.questions.repeat;
  assert.ok(long.label.length > 38 && long.label.endsWith('ist.'), 'not clipped');
  assert.equal(long.reason, 'case:Akkusativ');
  assert.equal(two.reason, 'preposition'); // two cases in the rule: errorType
  assert.deepEqual(long.fix.filter((s) => s.marked).map((s) => s.text), ['die']);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.solution, ''); // the app has no solution: shown as "Skipped"
  const withSolution = summaryDetails({ answers: [{ ...answers[3], corrected: 'den' }], words: [] });
  assert.equal(withSolution.questions.repeat[0].solution, 'den');
  assert.equal(d.grammar.reduce((s, r) => s + r.total, 0), 3); // skipped questions are not in the rule table
});

ok('vocabulary summary: per-part word scores, skipped words', () => {
  const words = [{ id: 'w1', type: 'noun', label: 'der Pass', plural: 'Pässe' }, { id: 'w2', type: 'noun', label: 'die Lampe' }, { id: 'w3', type: 'verb', label: 'gehen' }];
  const va = [
    { n: 1, correct: true, wordId: 'w1', question: 'passport' },
    { n: 2, correct: false, wordId: 'w2', errorType: 'article', rule: '', question: 'lamp', corrected: 'die Lampe' },
    { n: 3, skipped: true, correct: false, wordId: 'w3', question: 'to go' },
  ];
  const scores = { w1: { v: { s: 7, k: 1 }, a: { s: 4, k: 1 } }, w2: { v: { s: 3, k: 0 }, a: { s: 1, k: 0 } } };
  const d = summaryDetails({ answers: va, words, settings: { difficulty: 'medium' } }, scores);
  assert.deepEqual(d.words.known, [{ label: 'der Pass', parts: [{ part: 'meaning', s: 7 }, { part: 'article', s: 4 }] }]);
  assert.equal(d.words.repeat.length, 2);
  assert.equal(d.words.repeat[0].reason, 'article');
  assert.equal(d.words.repeat[1].reason, 'skipped');
  assert.deepEqual(d.words.repeat[1].parts, []);
  const easy = summaryDetails({ answers: va, words, settings: { difficulty: 'easy' } }, scores);
  assert.deepEqual(easy.words.known[0].parts, [{ part: 'meaning', s: 7 }]); // Easy: no article score
  assert.deepEqual(summaryDetails({ answers: va, words }).words.known[0].parts, []); // no stored scores: no parts
});

ok('"Repeat my mistakes": only with mistakes, and the list goes with the request', () => {
  assert.equal(hasMistakes([]), false);
  assert.equal(hasMistakes([answers[0], answers[3]]), false); // right + skipped: nothing to repeat
  assert.equal(hasMistakes(answers), true);
  assert.equal(isRepeatRequest('Repeat my mistakes'), true);
  assert.equal(isRepeatRequest('Wiederhole meine Fehler'), true);
  assert.equal(isRepeatRequest('Hint'), false);
  const list = mistakeList(answers, []);
  assert.deepEqual(list.map((m) => m.rule), ['Wechselpräpositionen: Akkusativ oder Dativ', 'Akkusativ']);
  assert.equal(list[1].corrected, 'Ich sehe die Frau.');
  const w = mistakeList([{ n: 1, correct: false, wordId: 'w2', corrected: 'die Lampe', studentAnswer: 'der Lampe', rule: '' }], [{ id: 'w2', label: 'die Lampe' }]);
  assert.equal(w[0].word, 'die Lampe');
  // the page sends it, only for that request, and the chip is hidden without mistakes
  const page = read('app/page.js');
  assert.match(page, /isRepeatRequest\(text\) \? \{ repeatMistakes: mistakeList/);
  assert.match(page, /hasMistakes\(session\.answers\) \? \{ text: t\('chipRepeat'\) \}/);
});

ok('the server accepts the repeat list and fences it', () => {
  const withList = dataBlock({ repeat: [{ studentAnswer: 'der Lampe', corrected: 'die Lampe', rule: '', word: 'die Lampe' }] });
  assert.match(withList, /MISTAKES TO REPEAT NOW/);
  assert.match(withList, /die Lampe: "der Lampe"/);
  assert.doesNotMatch(dataBlock({}), /MISTAKES TO REPEAT NOW/);
  assert.match(read('app/api/chat/route.js'), /body\.repeatMistakes/);
});

ok('"From your conversation" hides examples of the open card\'s word', () => {
  const a = [
    { n: 1, correct: false, wordId: 'w1', studentAnswer: 'x', corrected: 'der Pass' },
    { n: 2, correct: true, wordId: 'w2', studentAnswer: 'die Lampe', corrected: 'die Lampe' },
    { n: 3, correct: false, wordId: 'w3', studentAnswer: 'y', corrected: 'das Bett' },
  ];
  assert.deepEqual(conversationExamples({ answers: a, exercise: null }).map((x) => x.n), [3, 2]);
  assert.deepEqual(conversationExamples({ answers: a, exercise: { wordId: 'w3' } }).map((x) => x.n), [1, 2]);
  assert.deepEqual(conversationExamples({ answers: a, exercise: { wordId: 'w2' } }).map((x) => x.n), [3]);
  assert.deepEqual(conversationExamples({ answers: a, exercise: { line: 'no word id' } }).map((x) => x.n), [3, 2]);
});

console.log(`\n${n} checks passed.`);
