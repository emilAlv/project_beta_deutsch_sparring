// Word sessions: the card always follows the session's settings, whatever the AI wrote (lib/reply.js fixWordCard):
// English → German never shows the German word; words only = flashcards only. node scripts/check-card-direction.mjs
process.removeAllListeners('warning');
const { normalizeReply } = await import('../lib/reply.js');
let failed = 0;
const check = (name, ok, d = '') => { if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` – ${d}`}`); };
const lampe = { id: 'die lampe', de: 'die Lampe, -n', type: 'noun', en: 'the lamp', article: 'die', noun: 'Lampe', plural: 'die Lampen' };
const ctx = (extra) => ({ level: 'A1', difficulty: 'medium', topicIds: new Set(['x']), topicId: 'x', wordIds: new Set([lampe.id]), wordById: new Map([[lampe.id, lampe]]), ...extra });
const reply = (exercise) => ({ message: 'Weiter.', exercise: { number: 2, answer: 'die Lampe', ...exercise } });
const run = (exercise, extra) => normalizeReply(reply(exercise), ctx(extra))?.exercise;

let ex = run({ type: 'Karteikarte', direction: 'de-en', line: 'Lampe', hint: 'der, die oder das?', answer: 'die', wordId: lampe.id }, { direction: 'en-de', wordsOnly: true });
check('EN→DE session: a German "article only" card becomes the English card', ex.direction === 'en-de' && ex.line === 'the lamp' && ex.hint === null, JSON.stringify(ex));
check('…and still tests meaning + article on Medium', JSON.stringify(ex.checks) === '["meaning","article"]', JSON.stringify(ex.checks));

ex = run({ type: 'Lückentext', line: '___ Lampe', answer: 'die' }, { direction: 'en-de', wordsOnly: true });
check('words only: an article drill without wordId becomes the English flashcard', ex.type === 'flashcard' && ex.line === 'the lamp' && ex.wordId === lampe.id, JSON.stringify(ex));

ex = run({ type: 'Karteikarte', direction: 'en-de', line: 'the lamp', wordId: lampe.id }, { direction: 'en-de', wordsOnly: true });
check('a correct English card stays as written', ex.line === 'the lamp');

ex = run({ type: 'Karteikarte', direction: 'en-de', line: 'the lamp', wordId: lampe.id }, { direction: 'de-en', wordsOnly: true });
check('DE→EN session: the card shows the German noun with article', ex.direction === 'de-en' && ex.line === 'die Lampe', JSON.stringify(ex));

ex = run({ type: 'Lückentext', line: 'Ich kaufe ___ Lampe.', answer: 'eine', wordId: lampe.id }, { direction: 'en-de', wordsOnly: false });
check('with sentence tasks: grammar tasks stay grammar tasks', ex.type === 'gapfill' && ex.task === 'grammar', JSON.stringify(ex));

ex = run({ type: 'Lückentext', line: 'Ich kaufe ___ Lampe.', answer: 'eine' }, {});
check('grammar sessions are not touched', ex.type === 'gapfill' && ex.line === 'Ich kaufe ___ Lampe.');
const { noGermanExample } = await import('../lib/reply.js');
check('word-list examples lose their German part', noGermanExample('dark- (prefix for colours, e.g. dunkelblau = dark blue)') === 'dark- (prefix for colours, e.g. dark blue)'
  && noGermanExample('to act, to trade; es handelt sich um = it is about') === 'to act, to trade' && noGermanExample('the (male) cousin') === 'the (male) cousin');
const dunkel = { id: 'dunkel-', de: 'dunkel-', type: 'other', en: 'dark- (prefix for colours, e.g. dunkelblau = dark blue)', article: '', noun: '' };
const r = normalizeReply({ message: 'Was ist das deutsche Wort für dark- (prefix for colours, e.g. dunkelblau = dark blue)?', exercise: { number: 3, type: 'Karteikarte', direction: 'en-de', line: 'dark- (prefix for colours, e.g. dunkelblau = dark blue)', answer: 'dunkel-', wordId: 'dunkel-' } },
  { ...ctx({ direction: 'en-de', wordsOnly: true }), wordIds: new Set(['dunkel-']), wordById: new Map([['dunkel-', dunkel]]) });
check('EN→DE card and message never show «dunkelblau»', !/dunkel/i.test(r.exercise.line) && !/dunkel/i.test(r.message), `${r.exercise.line} | ${r.message}`);
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll card direction checks passed.');
process.exit(failed ? 1 : 0);
